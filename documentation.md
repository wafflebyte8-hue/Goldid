# GolDid — Complete Documentation

This is written 100% by Claude.

GolDid is a chat-first, agentic AI assistant that runs in your terminal and as a
desktop app. It talks to local and cloud models through one interface, with
streaming replies, persistent memory, saved sessions, portable skills, a small
set of agent tools (files, search, web, shell, image generation), tool
sandboxing, and TPM-backed protection of your API keys.

This document describes **everything** about GolDid in detail: architecture,
every module, every command, every tool, the prompt system, the security model,
the on-disk layout, and the desktop app. It reflects the current code
(version `0.13.1`).

---

## Table of contents

1. [What GolDid is](#1-what-goldid-is)
2. [Installation & updating](#2-installation--updating)
3. [Running GolDid (CLI)](#3-running-goldid-cli)
4. [Project layout & architecture](#4-project-layout--architecture)
5. [The data directory (`~/.goldid`)](#5-the-data-directory-goldid)
6. [Configuration & providers](#6-configuration--providers)
7. [The system prompt](#7-the-system-prompt)
8. [Agent tools](#8-agent-tools)
9. [The tool-call protocol & agent loop](#9-the-tool-call-protocol--agent-loop)
10. [Sandboxing](#10-sandboxing)
11. [Image generation](#11-image-generation)
12. [Keystore — API-key protection (TPM)](#12-keystore--api-key-protection-tpm)
13. [Persistent memory](#13-persistent-memory)
14. [Saved sessions](#14-saved-sessions)
15. [Project context files](#15-project-context-files)
16. [Skills](#16-skills)
17. [Migration from Hermes & OpenClaw](#17-migration-from-hermes--openclaw)
18. [Slash command reference](#18-slash-command-reference)
19. [The desktop app](#19-the-desktop-app)
20. [Security model](#20-security-model)
21. [Glossary](#21-glossary)

---

## 1. What GolDid is

GolDid is a single Node.js program (`goldid.js`) plus a library of focused
modules under `lib/`, and an optional Electron desktop app under `desktop/`. It:

- Streams responses from local and cloud models, rendered as Markdown.
- Keeps small, durable memory between conversations.
- Saves, searches, and resumes past conversations.
- Loads per-project instructions from `GOLDID.md` / `AGENTS.md`.
- Loads portable skills (Hermes / OpenClaw / AgentSkills format).
- Gives the model tools: read files, search files, search the web, run shell
  commands, write files, generate images, and read/update memory.
- Confines those tools with an optional sandbox.
- Encrypts API keys at rest, optionally sealed by the machine's TPM 2.0.

It deliberately depends only on Node built-ins and `fetch` for the CLI core; the
desktop app adds Electron, and Markdown rendering in the desktop uses `marked`
plus `dompurify`. The terminal renders Markdown itself via `lib/markdown.js`.

**Supported platforms.** The CLI runs on Windows, Linux, and macOS. The desktop
app runs on Windows and Linux (not macOS).

**Requirements.** Node.js 18+ (the CLI relies on global `fetch` and modern APIs).

---

## 2. Installation & updating

GolDid ships installer scripts that copy the app into a per-user location, set
`GOLDID_HOME`, and add a `gd` command.

### Windows

```powershell
irm https://raw.githubusercontent.com/wafflebyte8-hue/Goldid/main/setup.ps1 | iex
```

Installs to `C:\goldid`, sets the user-level `GOLDID_HOME`, adds `gd` to your
PowerShell profile, installs the desktop app, and creates Desktop + Start Menu
shortcuts. Use `-InstallDir <path>` to install elsewhere; run as Administrator
if `C:\goldid` is blocked.

### Linux / macOS

```bash
curl -fsSL https://raw.githubusercontent.com/wafflebyte8-hue/Goldid/main/setup.sh | bash
```

Installs to `~/.local/share/goldid`, sets `GOLDID_HOME`, and adds `gd` and
`goldid` to `~/.local/bin`. On Linux it also installs the desktop app and adds a
menu entry; on macOS only the CLI is installed. Use `--install-dir <path>` to
change the location.

### Updating

Re-run the same installer. Your `~/.goldid` data (config, keys, memories,
sessions, skills) is left untouched.

### Uninstalling (Windows)

```powershell
& C:\goldid\uninstall.ps1            # keeps personal data
& C:\goldid\uninstall.ps1 -RemoveData # also removes ~/.goldid
& C:\goldid\uninstall.ps1 -Yes        # non-interactive
```

### Local development

```bash
npm install
npm start          # run the CLI (node goldid.js)
npm run desktop    # run the Electron desktop app
```

---

## 3. Running GolDid (CLI)

The entry point is `goldid.js`. Its `main()` function:

1. Ensures `SOUL.md` exists (`prompt.ensureSoul()`).
2. Ensures the memory files exist (`memory.ensureFiles()`).
3. Ensures the skills scaffold exists (`skills.ensureScaffold()`).
4. Creates a readline interface and a context object `ctx` with `rl`, an `ask()`
   helper, and a fresh `sessionId`.
5. If no CLI args → starts the interactive REPL (`repl()`).
   If args are present → runs `oneShot()`.

### Interactive mode

```bash
gd
```

Shows a gold welcome banner (session status, agent tools, providers, quick
commands), then a prompt. Type a message to chat, or a `/command` to run a slash
command. The REPL guards against re-entrancy (it ignores new input while a turn
is in progress).

### One-shot mode

```bash
gd "write a haiku about terminals"   # send a single prompt, print the reply
gd setup                              # run a utility command non-interactively
gd migrate hermes --dry-run           # any slash command, without the slash
```

`oneShot()` checks the first argument against the `UTILITY` set (all the slash
command names). If it matches, the whole argument string is dispatched as a
slash command. Otherwise the arguments are joined and sent to the active model
as a prompt.

---

## 4. Project layout & architecture

```text
GolDid/
  goldid.js          CLI entry: REPL, chat loop, slash commands, setup wizard
  desktop/           Electron desktop application
    main.js          Electron main process: window, IPC handlers, agent loop
    preload.js       contextBridge: the window.goldid API surface
    renderer.js      UI logic: rendering, commands, dialogs, streaming
    index.html       Desktop markup (dialogs, composer, sidebar)
    styles.css       Desktop styling
    assets/          App logo
    icons/           UI icons
  lib/
    config.js        Encrypted configuration storage
    keystore.js      Master-key protection (TPM 2.0 / machine-bound / plaintext)
    providers.js     Provider registry, model listing, chat, streaming, images
    prompt.js        System-prompt assembly (cloud vs local variants)
    tools.js         Agent tools + tool-call parsing
    sandbox.js       Tool sandboxing (jail / docker)
    memory.js        Persistent memory (MEMORY/USER/PERSONALITY)
    sessions.js      Saved conversation storage and search
    context.js       Project instruction discovery (GOLDID.md / AGENTS.md)
    skills.js        Skill discovery, parsing, rendering, scaffolding
    migrate.js       Hermes/OpenClaw migration
    ui.js            Terminal UI primitives (color, panels, menus, spinner)
    markdown.js      Markdown → ANSI rendering for the terminal
  setup.ps1/.sh      Installers/updaters
  uninstall.ps1      Windows uninstaller
  desktop-launch.*   Desktop runtime launchers
  package.json
```

### High-level flow of a chat turn (CLI)

1. User input arrives in the REPL; non-slash text goes to `handleChat()`.
2. `handleChat()` loads config, determines the active provider/model, whether
   tools are enabled, and which **tool mode** to use (`native`, `text`, or
   `off`).
3. It builds the system prompt via `prompt.buildSystemPrompt()` (cloud or local
   variant), injecting persistent memory, project context, and the skills
   catalog.
4. It enters the **agent loop**: stream the assistant reply, detect tool calls,
   run them via `runTool()` (applying sandbox + approval), feed results back,
   and repeat until the model produces a final answer with no tool call.
5. The conversation is saved to the session store after the turn.

---

## 5. The data directory (`~/.goldid`)

All personal data lives outside the repository, under `~/.goldid`:

```text
~/.goldid/
  config.json            Active provider/model, per-provider config, agent settings
  key.bin                Legacy plaintext master key (fallback)
  key.tpm                TPM-wrapped master key (when sealed)
  tpm-helper.ps1         Windows CNG helper script (written on demand)
  SOUL.md                The agent's voice/identity (editable)
  memories/
    MEMORY.md            Durable project/environment notes
    USER.md              Durable user profile/preferences
    PERSONALITY.md       Model's self-authored style notes
  sessions/
    <session-id>.json    One file per saved conversation
  skills/
    goldid/              Your own native skills (one per subfolder)
    _Template/           Starter skill template (skipped by the loader)
    hermes-imports/      Skills imported from Hermes
    openclaw-imports/    Skills imported from OpenClaw
~/.cache/
  .gd-syscache.bin       Machine-bound double-encrypted master key (no-TPM fallback)
```

`config.json` and the key material must never be shared. See
[Security model](#20-security-model).

---

## 6. Configuration & providers

### Config storage (`lib/config.js`)

Config is JSON saved at `~/.goldid/config.json`. Shape:

```json
{
  "active": { "provider": "openai", "model": "gpt-4o" },
  "providers": {
    "openai": {
      "apiKeyEnc": {
        "v": 1,
        "alg": "aes-256-gcm",
        "iv": "...",
        "tag": "...",
        "data": "..."
      }
    },
    "ollama": { "baseUrl": "http://localhost:11434" }
  },
  "agent": {
    "tools": true,
    "sandbox": "off",
    "imageProvider": "openai",
    "imageModel": "gpt-image-1"
  }
}
```

- **API keys are encrypted at rest** with AES-256-GCM. On disk a key is stored as
  `apiKeyEnc` (an object with version, algorithm, IV, auth tag, ciphertext). In
  memory (after `load()`) it is decrypted to `apiKey`.
- `load()` reads and decrypts; `save()` re-encrypts and writes atomically with
  `mode 0o600`. If an old plaintext `apiKey` is found on disk it is migrated to
  the encrypted form on next save.
- `encryptSecret()` / `decryptSecret()` use the **master key** supplied by
  `keystore.getMasterKey()` (see [Keystore](#12-keystore--api-key-protection-tpm)).

### Providers (`lib/providers.js`)

GolDid supports nine providers. Most speak the OpenAI-compatible HTTP API;
Anthropic and Gemini use their own request shapes.

| Provider      | Key          | Type  | Default base URL                            | Chat style |
| ------------- | ------------ | ----- | ------------------------------------------- | ---------- |
| Anthropic     | `anthropic`  | cloud | `https://api.anthropic.com`                 | anthropic  |
| OpenAI        | `openai`     | cloud | `https://api.openai.com`                    | openai     |
| Google Gemini | `gemini`     | cloud | `https://generativelanguage.googleapis.com` | gemini     |
| xAI (Grok)    | `xai`        | cloud | `https://api.x.ai`                          | openai     |
| DeepSeek      | `deepseek`   | cloud | `https://api.deepseek.com`                  | openai     |
| OpenRouter    | `openrouter` | cloud | `https://openrouter.ai/api`                 | openai     |
| Ollama        | `ollama`     | local | `http://localhost:11434`                    | openai     |
| vLLM          | `vllm`       | local | `http://localhost:8000`                     | openai     |
| LM Studio     | `lmstudio`   | local | `http://localhost:1234`                     | openai     |

Per-provider config can override the base URL (`baseUrl`) and hold an API key
(`apiKey`). Local providers need no key; vLLM accepts an optional token.

Key functions:

- `fetchModels(key, conf)` — lists available model IDs. Uses the provider's
  models endpoint; Ollama falls back to `/api/tags`. Returns a sorted unique
  list. Local model lists come straight from the running server.
- `chat(key, conf, model, messages, opts)` — non-streaming completion. Branches
  by chat style (anthropic `/v1/messages`, gemini `:generateContent`, otherwise
  OpenAI `/v1/chat/completions`).
- `chatStream(key, conf, model, messages, { system, onDelta, tools })` —
  streaming. Emits text chunks via `onDelta`, accumulates native tool calls
  (OpenAI style), supports reasoning fields (`reasoning_content`/`reasoning`
  for models like DeepSeek-R1/Nemotron), and returns `{ text, toolCalls }`.
- `generateImage(key, conf, model, prompt, opts)` — see
  [Image generation](#11-image-generation).
- `IMAGE_PROVIDERS` / `DEFAULT_IMAGE_MODEL` — image-capable providers and their
  default image models.

Authentication is handled by `authHeaders()`: Bearer for OpenAI-style, `x-api-key`

- `anthropic-version` for Anthropic, and a query-string `key` for Gemini.

---

## 7. The system prompt

`lib/prompt.js` assembles the system prompt. There are **two variants**, chosen
by model class, which is the central design decision behind GolDid:

- **Cloud** (`cloudLines`) — long, exhaustively detailed. Cloud models and
  Ollama hosted `:cloud` models reward precise, structured instructions and have
  large context windows.
- **Local** (`localLines`) — short, plain, conversational. Small local models do
  better with a brief, human prompt; a long prompt slows prompt-processing and
  can confuse small models.

`modelClass(def, model)` returns `cloud` when the provider is cloud or the model
name matches `:cloud`, otherwise `local`.

### What goes into the prompt

Both variants assemble, in order:

1. **Identity / SOUL** — the contents of `~/.goldid/SOUL.md` (or the built-in
   default soul: "GolDid — a sharp, friendly companion who lives in the user's
   terminal").
2. **Persistent memory** — PERSONALITY, USER, and MEMORY blocks (see
   [Memory](#13-persistent-memory)).
3. **Project context** — from `GOLDID.md`/`AGENTS.md` if present.
4. **Skills catalog** — names + descriptions only (full instructions are loaded
   on demand via `skill_view`).
5. **Operating context** — OS, working directory, model name, terminal output.
6. **Core mandate / how to think** (cloud) or a short behavior note (local).
7. **Tool instructions** — the tool block (see below), when tools are enabled.
8. **Memory behavior** — rules telling the model to save durable facts silently
   and automatically.
9. **Communication, honesty, limits** (cloud) — formatting and safety guidance.

### Tool block variants

The tool instructions also differ by model class **and** tool mode:

- **Native function calling** (`toolNativeDetailed` / `toolNativeShort`) — used
  when the provider supports OpenAI-style function calling. The API enforces the
  call format, so the prompt only describes the tools and the "check before you
  answer" discipline. Allows multiple independent tool calls per turn.
- **Text protocol** (`toolBlockDetailed` / `toolBlockShort`) — used for
  Anthropic/Gemini or models without native tools. Describes the explicit
  `<tool_call>{...}</tool_call>` format, one tool per turn.

---

## 8. Agent tools

Tools live in `lib/tools.js`. There are **14 tools**; 11 run automatically and 3
require user approval. The model invokes a tool, `runTool()` executes it (after
sandbox enforcement and, for dangerous tools, approval), and the result is fed
back.

| Tool             | Approval | Purpose                                                             |
| ---------------- | -------- | ------------------------------------------------------------------- |
| `time`           | No       | Current local date and time.                                        |
| `cwd`            | No       | Current working directory.                                          |
| `memory`         | No       | Read or update persistent memory (`read`/`add`/`replace`/`remove`). |
| `skills_list`    | No       | List installed skills with descriptions.                            |
| `skill_view`     | No       | Load the full instructions for one installed skill.                 |
| `list_dir`       | No       | List directory entries.                                             |
| `read_file`      | No       | Read a UTF-8 text file (clipped to ~4000 chars).                    |
| `file_info`      | No       | File/directory metadata (type, size, mtime, etc.).                  |
| `find_files`     | No       | Recursively find files by name/substring/wildcard.                  |
| `search_text`    | No       | Recursively search text files for a string.                         |
| `web_search`     | No       | Search the web (DuckDuckGo) — titles, URLs, snippets.               |
| `generate_image` | **Yes**  | Generate an image from a prompt and save it to a file.              |
| `write_file`     | **Yes**  | Create or overwrite a text file.                                    |
| `shell`          | **Yes**  | Run a shell command (60s timeout, 1 MB output cap).                 |

Notes:

- **Output is clipped** to `MAX_OUTPUT` (4000 chars) for tool results that can be
  large.
- **Directory walking** skips `.git`, `node_modules`, `.next`, `dist`, `build`,
  `.cache`, caps at 15000 entries, and ignores files over 1 MB for text search.
- **`web_search`** scrapes the DuckDuckGo HTML endpoint and falls back to the
  Instant Answer JSON API. No API key required.
- **`toolSchemas()`** produces OpenAI-format function schemas for native calling;
  **`toolSummaryLines()`** produces the one-line descriptions used in the prompt
  and `/tools`.

The full set of tools can be turned off with `/agent off`.

---

## 9. The tool-call protocol & agent loop

### Two calling modes

- **Native** — OpenAI-compatible providers stream `tool_calls` fragments that
  `chatStream` reassembles into `{ id, function: { name, arguments } }`. Multiple
  independent calls per turn are allowed.
- **Text** — for Anthropic/Gemini or non-native models, the model emits a block:

  ```text
  <tool_call>
  {"name": "read_file", "args": {"path": "package.json"}}
  </tool_call>
  ```

  `parseToolCall()` is deliberately tolerant: it accepts a proper
  `<tool_call>` block, a dangling `</tool_call>`, a fenced `json` object, or a
  bare JSON object that names a known tool. It also tolerates small models that
  mislabel the name key (`name`/`tool`/`function`/`action`/…) or the args key
  (`args`/`arguments`/`parameters`/`input`).

### Unlimited agent loop

The agent loop (in both the CLI `handleChat()` and the desktop `chat:send`
handler) runs **until the model returns a final answer with no tool call** —
there is **no fixed step cap**. The model controls termination. Each iteration:

1. Stream/await the assistant reply.
2. If there are tool calls, run each via `runTool()` / `runDesktopTool()`, append
   results to the conversation, and loop.
3. If there is no tool call, show the answer and stop.

Because there is no hard limit, a model that loops forever must be interrupted
(Ctrl-C in the CLI). Destructive tools remain gated behind approval, so an
unbounded loop still cannot run `shell`/`write_file`/`generate_image` without a
human OK.

### `runTool()` responsibilities (CLI)

1. Look up the tool; print the call.
2. Load config; attach `ctx.generateImage` (image helper) for the image tool.
3. If a sandbox mode is active, enforce path confinement (`sandbox.enforcePaths`)
   and attach `ctx.wrapShell` for the shell tool.
4. For dangerous tools, prompt for approval (`y/N`). Non-TTY → denied.
5. Run the tool, print a short preview, and (for `memory`) refresh the in-prompt
   memory snapshot.

---

## 10. Sandboxing

`lib/sandbox.js` confines the filesystem and shell tools. Mode is stored at
`cfg.agent.sandbox` and changed with `/sandbox`.

- **`off`** (default) — tools touch the host freely (current historical
  behavior).
- **`jail`** — pure-Node path confinement. `read_file`, `write_file`, `list_dir`,
  `file_info`, `find_files`, `search_text`, and `generate_image` have their
  `path` arguments resolved against the **jail root** (the directory GolDid was
  launched in) and rejected if they escape (`..`, absolute paths outside the
  root, traversal). `shell` runs with its working directory pinned to the jail
  root. This is a guardrail, **not** true isolation — a determined shell command
  can still escape (spawn interpreters, follow symlinks, redirect).
- **`docker`** — `shell` commands run inside a throwaway container
  (`docker run --rm -i -w /work -v "<root>:/work" <image> sh -c '...'`), giving
  real filesystem/network isolation. Filesystem tools still run on the host but
  stay path-confined. Requires Docker; the image defaults to `alpine` and is
  configurable via `cfg.agent.sandboxImage`.

Key functions: `mode(cfg)`, `resolveInJail(p, root)`, `enforcePaths(call)`
(mutates path args to confined absolute paths, throws on escape), `wrapShell(cmd,
cfg)` (returns the command + exec options for the active mode),
`dockerAvailable()`.

The jail root is captured **once**, when the module is first required at startup
(i.e. wherever you ran `gd`).

---

## 11. Image generation

The `generate_image` tool turns a text prompt into an image file. It is gated by
approval and its output path is jail-confined when a sandbox is active.

### Provider/model selection

Image generation has its **own** provider and model, separate from the chat
model, so you can chat on a local model and generate images on a cloud one:

- Stored at `cfg.agent.imageProvider` and `cfg.agent.imageModel`.
- Model precedence at call time: explicit tool argument → configured
  `/image` model → provider default.
- Provider precedence: `cfg.agent.imageProvider` → active chat provider.

`providers.generateImage()` dispatches by provider:

- **Gemini** — `:generateContent`, returns inline image data (base64).
- **OpenAI-compatible** (OpenAI, xAI, OpenRouter, compatible local servers) —
  `POST /v1/images/generations`. It deliberately **omits** `response_format`
  because newer models (e.g. `gpt-image-1`) reject it; the tool accepts either a
  returned base64 image or a URL (which it downloads).
- **Anthropic / unsupported** — a clear "does not support image generation"
  error.

Default image models: OpenAI `gpt-image-1`, xAI `grok-2-image`, Gemini
`gemini-2.0-flash-preview-image-generation`, OpenRouter
`google/gemini-2.5-flash-image-preview`.

### Setting it up

`/image` (CLI) launches an interactive wizard like `/setup`: pick an
image-capable provider (it shows which already have a key so you can reuse it),
reuse or enter a key, then pick the model from a fetched menu (with the default
pinned and a manual-entry escape hatch). The desktop has an equivalent **Image**
dialog. `/image clear` resets to provider defaults.

---

## 12. Keystore — API-key protection (TPM)

`lib/keystore.js` manages the **master key** (the 32-byte AES-256-GCM key that
encrypts API keys in `config.json`). It chooses the strongest available
protection, best-first:

1. **`tpm`** — the master key is sealed by the TPM 2.0 and never stored in
   plaintext.
   - **Windows**: an RSA key in the **Microsoft Platform Crypto Provider** (CNG),
     created/used via a generated PowerShell helper (`tpm-helper.ps1`). The
     master key is wrapped with RSA-OAEP-SHA256 using the TPM public key; only
     the non-exportable TPM private key can unwrap it. `key.tpm` stores
     `{"tpm":"win","data":"<base64 ciphertext>"}`.
   - **Linux**: a sealed object held at a persistent TPM handle (`0x81010005`)
     via `tpm2-tools` (`tpm2_createprimary`/`tpm2_create`/`tpm2_load`/
     `tpm2_evictcontrol`, unsealed with `tpm2_unseal`). The key bytes are fed to
     `tpm2_create` over **stdin**, never a temp file. `key.tpm` stores
     `{"tpm":"linux","handle":"0x81010005"}` — no key material, just a handle.
     If the TPM device is present but `tpm2-tools` is missing, `/keystore
migrate` will **install it** (apt/dnf/yum/pacman/zypper/apk, via sudo, with
     visible output). TPM access is verified with `tpm2_getcap` (the device +
     tools existing is not enough; you typically need to be in the `tss` group).
2. **`machine`** — no usable TPM: the master key is **double-encrypted** (two
   AES-256-GCM layers, each key derived via scrypt from stable machine
   identifiers — hostname, platform, arch, username, `/etc/machine-id`) and
   stored **hidden** outside `~/.goldid` at `~/.cache/.gd-syscache.bin`. Copying
   the file to another machine is useless because the derived keys won't match.
   This is machine-binding plus obscurity — it defeats file theft/offline
   attacks, **not** code running as your user.
3. **`plaintext`** — legacy `~/.goldid/key.bin` (32 raw bytes). Still read for
   back-compat; recreated by `/keystore revert`.

### Critical reliability invariant

A key store that **exists** is authoritative. If `key.tpm` (or the machine store,
or `key.bin`) is present but cannot be recovered (e.g. a transient TPM failure),
`getMasterKey()` throws a hard error and changes nothing — it **never** mints a
replacement key, because doing so would orphan the already-encrypted
`config.json`. "No key exists" (safe to create) and "a key exists but couldn't be
recovered" (must not overwrite) are treated as different situations. The master
key is cached in process memory for the process lifetime so the TPM is only hit
once per run.

### The `/keystore` command

- `/keystore` — show status: storage mode, platform, TPM availability, and (on
  Linux) device + tools status.
- `/keystore migrate` — seal the key the best available way (installing
  `tpm2-tools` on Linux if needed). Migration verifies a round-trip before
  removing weaker stores, so keys are never lost.
- `/keystore revert` — go back to a plaintext `key.bin`.

Caveat: clearing/resetting the TPM (BIOS reset, "Clear TPM", motherboard swap)
destroys the wrapping key, making sealed secrets unrecoverable — GolDid then
falls back and you re-enter your API keys.

---

## 13. Persistent memory

`lib/memory.js` keeps three small Markdown files under `~/.goldid/memories`,
injected into future prompts:

- **`MEMORY.md`** — durable notes about projects, tools, environment, lessons.
- **`USER.md`** — durable user profile/preferences.
- **`PERSONALITY.md`** — the model's self-authored style/personality notes.

### Structure & limits

- Entries are separated by `\n---\n`. Each file has a character budget:
  `memory` 2200, `user` 1375, `personality` 1800. Adds/replaces that would
  exceed the limit are rejected.
- Writes are atomic (write to `.tmp`, then rename).

### Tool actions

The `memory` tool (and `/remember` / `/forget`) supports:

- `read` — load entries.
- `add` — append a unique entry (deduplicated).
- `replace` — replace the single entry matching a substring (errors if zero or
  multiple match).
- `remove` — delete the single matching entry.

### Safety filters

Before an entry is stored (or injected into a prompt) it is screened:

- **Secret-like** content (`api_key`, `password`, `secret`, `token` followed by a
  long value) is rejected.
- **Prompt-injection-like** content ("ignore previous instructions", "reveal the
  system prompt", embedded `<tool_call>` tags) is rejected, and any such entry is
  shown as `[blocked memory entry: …]` if it ever reaches the prompt.

### Behavior in prompts

The system prompt instructs the model to save durable facts (preferences, name,
OS/tools, corrections) to memory **automatically and silently** — without asking
and without announcing it. Memory is loaded at conversation start and refreshed
after each `memory` tool call. The prompt also tells the model that memory is
durable context that must **not** override the current system or user
instructions.

---

## 14. Saved sessions

`lib/sessions.js` stores conversations as JSON under `~/.goldid/sessions`, one
file per session, capped at **100** (older ones are pruned).

- Each session file has `version`, `id`, `title` (derived from the first user
  message), `cwd`, `createdAt`, `updatedAt`, and `messages`.
- IDs are sanitized to `[a-z0-9_-]`, max 64 chars. New IDs are timestamp + random
  hex. `/session <name>` gives the current conversation a memorable ID.
- Conversations are saved automatically after each completed turn (CLI).

Commands: `/sessions [query]` (list/search — search scans IDs, titles, cwd, and
message contents), `/session [name]` (show/name current), `/resume <id>`,
`/delete-session <id>`. Session files contain your messages and tool results;
keep the directory private.

---

## 15. Project context files

`lib/context.js` discovers per-project instructions. Before each model turn,
GolDid looks for a context file, starting in the working directory and walking
**upward** until it finds one:

1. `GOLDID.md`
2. `AGENTS.md`

The file's content (capped at 12000 chars) is injected into the system prompt as
"project instructions" — for repo conventions, useful commands, architecture
notes, etc. The prompt marks it as user-provided context that cannot override
safety rules.

Example `GOLDID.md`:

```markdown
# Project instructions

- Run `npm test` before reporting a change complete.
- Keep public APIs backward compatible.
- Do not edit generated files under `dist/`.
```

---

## 16. Skills

`lib/skills.js` discovers and renders portable skills compatible with Hermes
Agent, OpenClaw, and the AgentSkills standard. A skill is a directory containing
`SKILL.md` (lowercase `skill.md` also accepted).

### Anatomy of a native GolDid skill

```text
release-check/            ← folder name = skill slug
  SKILL.md                ← required: instructions + YAML frontmatter
  Version.js              ← GolDid normalized metadata (parsed as JSON)
  scripts/ references/ templates/ assets/   ← optional support folders
```

`SKILL.md` frontmatter carries `name`, `description`, `version`, `author`,
`platforms`, etc. `name` and `description` are the only fields put into the
prompt catalog up front; the body is loaded on demand when the model runs
`skill_view`.

`Version.js` is **parsed as JSON** (never executed) via a regex that extracts the
`module.exports = { … }` object. **Its keys must be double-quoted**, e.g.:

```javascript
"use strict";
module.exports = {
  Author: "Your Name",
  Name: "release-check",
  Description: "Verify a project before publishing a release.",
  Usage: "Use before creating or publishing a release.",
  Model_tested: ["gpt-5", "claude-sonnet"],
};
```

Unquoted keys are valid JavaScript but invalid JSON, so they are silently ignored
and GolDid falls back to the `SKILL.md` frontmatter. The auto-generated template
and scaffold use the correct quoted form.

### Discovery locations (highest precedence first)

1. `<project>/skills`
2. `<project>/.agents/skills`
3. `<project>/.goldid/skills`
4. `~/.goldid/skills`
5. `~/.agents/skills`
6. `%HERMES_HOME%/skills` or `~/.hermes/skills`
7. `%HERMES_HOME%/hermes-agent/skills`
8. `~/.openclaw/skills`

Grouped layouts (`skills/software-development/release-check/SKILL.md`) work — the
parent folder of `SKILL.md` is the slug. **Directories starting with `_` or `.`
are skipped**, which is how the `_Template` folder stays a reference without
appearing as a usable skill. Skills restricted to another OS via `platforms` are
hidden.

### Scaffolding

On startup (`skills.ensureScaffold()`, called by both the CLI and desktop), GolDid
idempotently creates, under `~/.goldid/skills`:

- `goldid/` — where your own skills go, with a `README.md`.
- `_Template/your-skill-name/` — a starter `SKILL.md` (with a structured
  skeleton: Overview, When to Use, Inputs, Instructions, Tools, Output Format,
  Examples, Pitfalls, Verification Checklist) and a correct quoted `Version.js`.

### Using skills

- `/skills` — list compatible installed skills.
- `/skill <name>` — inspect one skill's full instructions.
- The model uses `skills_list` / `skill_view` tools at runtime.

The catalog placed in the prompt contains only names + descriptions to keep the
prompt small. Skills are **instructions, not trusted code** — read them before
use. GolDid does not auto-execute Hermes inline-shell expressions; any commands a
skill wants still go through normal `shell` approval.

---

## 17. Migration from Hermes & OpenClaw

`lib/migrate.js` (via the `/migrate` command) imports data from existing Hermes
Agent and OpenClaw installations.

```powershell
gd migrate --dry-run           # preview (default source: both)
gd migrate hermes --dry-run    # just Hermes
gd migrate openclaw --dry-run  # just OpenClaw
gd migrate both --secrets --yes # import including API keys, no prompt
```

Supported imports: skills and their support files, `SOUL.md`, the memory files
(`MEMORY.md`/`USER.md`/`PERSONALITY.md`), OpenClaw workspace instructions (for
manual review), supported provider names/model/base URLs, and API keys for
supported providers.

Behavior:

- API keys are excluded unless `--secrets` is passed; imported keys go through
  the encrypted config store and are never printed.
- Migration is conflict-safe by default: memory is merged/deduplicated, existing
  files/skills are skipped, imported skills land under
  `~/.goldid/skills/hermes-imports/` and `openclaw-imports/`. `--overwrite`
  forces replacement.
- Custom source dirs: `--hermes-dir`, `--openclaw-dir`.
- Not imported: OAuth sessions, messaging accounts, cron jobs, plugins, browser
  state, and unsupported providers (these are listed in the report).

---

## 18. Slash command reference

Slash commands work in the REPL and (without the slash) as one-shot `gd`
subcommands.

| Command                        | What it does                                       |
| ------------------------------ | -------------------------------------------------- |
| `/setup [provider]`            | Configure a provider, key/URL, and model.          |
| `/use <provider>`              | Switch provider (then choose a model).             |
| `/model [name]`                | Show or set the active model.                      |
| `/models [provider]`           | List available models.                             |
| `/providers` (`/ai`)           | Show all providers and their status.               |
| `/key <provider> [key]`        | Set a provider API key.                            |
| `/url <provider> [url]`        | Set a provider base URL.                           |
| `/agent [on\|off]`             | Enable/disable agent tools.                        |
| `/sandbox [off\|jail\|docker]` | Show or set tool sandboxing.                       |
| `/image [model\|clear]`        | Set up image generation (provider + model wizard). |
| `/keystore [migrate\|revert]`  | Show or change API-key protection (TPM).           |
| `/tools`                       | List the agent tools.                              |
| `/soul`                        | Show/locate the `SOUL.md` personality file.        |
| `/memory`                      | Show or edit persistent memory.                    |
| `/sessions [query]`            | List or search saved conversations.                |
| `/session [name]`              | Show or name the current session.                  |
| `/resume <id>`                 | Resume a saved conversation.                       |
| `/delete-session <id>`         | Delete a saved conversation.                       |
| `/skills`                      | List compatible installed skills.                  |
| `/skill <name>`                | Inspect one skill.                                 |
| `/migrate [source]`            | Import Hermes/OpenClaw data.                       |
| `/remember [target] <text>`    | Save to memory/user/personality.                   |
| `/forget [target] <text>`      | Remove a memory entry.                             |
| `/config`                      | Show current configuration.                        |
| `/reset`                       | Start a new conversation.                          |
| `/clear`                       | Clear the screen.                                  |
| `/version`                     | Show the GolDid version.                           |
| `/help`                        | Show command help.                                 |
| `/exit` (`/quit`)              | Quit.                                              |

---

## 19. The desktop app

The Electron desktop app (Windows and Linux) shares the same `lib/` core and the
same encrypted config, memories, skills, and sessions as the CLI.

### Structure

- **`main.js`** — Electron main process. Creates the window with
  `contextIsolation: true` and `nodeIntegration: false`. Registers IPC handlers:
  `app:snapshot`, `config:save`, `config:agent`, `config:sandbox`,
  `config:imageModel`, `config:imageSetup`, `models:list`, `session:load`,
  `session:delete`, `skill:view`, `path:open`, `chat:send`, and approval
  responses. Runs the same unlimited agent loop as the CLI, applying the sandbox
  and image helper in `runDesktopTool` and prompting for approval on dangerous
  tools via a dialog.
- **`preload.js`** — exposes a fixed, named `window.goldid` API surface via
  `contextBridge` (snapshot, saveConfig, setAgent, setSandbox, setImageModel,
  setImageConfig, listModels, loadSession, deleteSession, viewSkill, openPath,
  sendChat, plus streaming/approval callbacks). Raw `ipcRenderer` is **not**
  exposed.
- **`renderer.js`** — UI logic: status, sidebar (sessions/skills/memory),
  message rendering, the `/` command menu, settings dialog, and the image
  dialog. Assistant content is rendered through `marked` + `DOMPurify.sanitize`;
  all other user/file-sourced strings go through `escapeHtml`.

### Desktop commands

Type `/` in the composer to open the command menu. Commands include `/new`,
`/reset`, `/settings` (`/model`, `/providers`, `/config`), `/sessions`,
`/skills`, `/memory`, `/agent on`, `/agent off`, `/sandbox off|jail|docker`,
`/image`, `/tools`, `/clear`, and `/help`. `/sandbox <mode>` and `/image <model>`
also work as typed commands with arguments; `/image` with no argument opens the
Image dialog (provider dropdown showing which providers already have a key, a
blank-to-reuse key field, and a model field with a "List models" button).

Read-only tools run automatically; `shell`, `write_file`, and `generate_image`
always show an approval dialog (rendering the exact arguments) first. The desktop
follows the same `/agent` setting as the CLI.

---

## 20. Security model

### What is protected

- **API keys at rest.** Encrypted in `config.json` with AES-256-GCM. The master
  key is protected by the TPM when available, otherwise machine-bound
  double-encryption, otherwise a plaintext `key.bin`. With TPM sealing, copying
  `config.json` + `key.tpm` to another machine is useless. See
  [Keystore](#12-keystore--api-key-protection-tpm).
- **Dangerous actions require approval.** `shell`, `write_file`, and
  `generate_image` prompt before running, showing the exact command/arguments.
- **Sandboxing.** `jail` confines file/shell tools to the launch directory;
  `docker` gives real isolation for shell.
- **Renderer hardening (desktop).** `contextIsolation: true`,
  `nodeIntegration: false`, a minimal named-function IPC bridge (no raw
  `ipcRenderer`), assistant Markdown sanitized with DOMPurify, everything else
  `escapeHtml`'d. Approval dialogs use `textContent` (exact arguments).
- **Skills aren't executed.** `Version.js` is parsed as JSON, never `require`'d.
- **Memory hygiene.** Secret-like and prompt-injection-like memory entries are
  rejected.

### Residual risks (be aware)

- **Indirect prompt injection.** Content the model reads (web pages, files,
  skills, tool output) can contain instructions. A capable model resists; small
  models may obey. The backstop is approval on dangerous tools.
- **Silent memory writes.** The `memory` tool needs no approval and the prompt
  tells the model to save silently — so injected "preferences" could persist.
- **Unapproved tools as channels.** `read_file`/`find_files`/`search_text` and
  `web_search` need no approval; in principle a read-then-`web_search` sequence
  could exfiltrate data via the query string.
- **`jail` is a guardrail, not isolation.** Use `docker` for true containment.
- **TPM binds to the machine/user, not to GolDid.** Any process running as your
  user can use the same TPM key. TPM sealing defeats file theft, not local code
  execution.
- **Physical access / a TPM wipe** are outside the threat model (a TPM clear
  makes sealed keys unrecoverable; GolDid then falls back).

### Hygiene

Never share `config.json`, `key.bin`, `key.tpm`, or `~/.cache/.gd-syscache.bin`.
Keep `~/.goldid/sessions` private (it contains chat messages and tool results).

---

## 21. Glossary

- **Active provider/model** — the provider+model GolDid is currently using for
  chat, stored in `config.json`.
- **Agent loop** — the loop that streams a reply, runs tool calls, and repeats
  until a final answer (unlimited steps).
- **Cloud vs local prompt** — the two system-prompt variants; cloud is detailed,
  local is short (to protect small-model prompt-processing speed).
- **Jail root** — the directory GolDid was launched in, used as the sandbox
  boundary.
- **Master key** — the 32-byte AES-256-GCM key that encrypts API keys; protected
  by the keystore.
- **Native vs text tool mode** — function-calling API vs the `<tool_call>` text
  protocol.
- **Skill** — a portable instruction folder (`SKILL.md` + optional `Version.js`)
  loaded on demand.
- **SOUL.md** — the editable file defining GolDid's voice/identity.
- **Tool** — a capability the model can invoke (files, search, web, shell, image,
  memory).

---

_This documentation reflects GolDid `0.13.1`. Behavior described here is taken
from the source under `goldid.js`, `lib/`, and `desktop/`._
