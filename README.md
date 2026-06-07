# GolDid

GolDid is a small terminal AI assistant inspired by
[Hermes Agent](https://github.com/NousResearch/hermes-agent).

I built it because Hermes agent's system prompt was too large and slowing down my pp "Prompt proccesing" speed.
So i decided to make this lol.
.
This is just a project i made and will probably keep updating it. About 40% of it was vibe coded but who cares? i would love if you guys report issues and do pull requests.

Basically it's one `gd` command for talking to local AND cloud models without opening a browser. it streams replies, remembers stuff, saves your chats, runs skills, has a few tools, and locks your API keys to your machine with the TPM. that's it.

## Install

GolDid runs anywhere Node.js does. the CLI works on **Windows, Linux, and
macOS**. the desktop app works on **Windows and Linux** (sorry mac, no desktop
for you).

you need:

- Node.js 18 or newer
- Windows: Windows PowerShell or PowerShell 7

### Windows

```powershell
irm https://raw.githubusercontent.com/wafflebyte8-hue/Goldid/main/setup.ps1 | iex
```

open a fresh PowerShell window and run:

```powershell
gd
```

the installer drops everything in `C:\goldid`, sets `GOLDID_HOME`, adds the `gd`
command to your PowerShell profile, installs the desktop app, and makes Desktop +
Start Menu shortcuts.

if Windows throws a fit about `C:\goldid`, run PowerShell as admin or pass a
different writable path with `-InstallDir`.

### Linux and macOS

```bash
curl -fsSL https://raw.githubusercontent.com/wafflebyte8-hue/Goldid/main/setup.sh | bash
```

open a fresh terminal and run:

```bash
gd
```

this puts GolDid in `~/.local/share/goldid`, sets `GOLDID_HOME`, and adds `gd`
and `goldid` to `~/.local/bin` (on your `PATH`). on **Linux** it also installs
the desktop app + an app-menu entry. on **macOS** you only get the CLI.

want it somewhere else? grab the script and pass `--install-dir`:

```bash
curl -fsSL https://raw.githubusercontent.com/wafflebyte8-hue/Goldid/main/setup.sh -o setup.sh
bash setup.sh --install-dir "$HOME/apps/goldid"
```

update from inside GolDid:

```powershell
gd update check
gd update
```

`gd update` checks GitHub, reruns the installer only when a newer version exists,
and leaves your settings, keys, memories, skills, and sessions under `~/.goldid`
alone. If the local install does not have `setup.ps1` or `setup.sh`, the updater
downloads a fresh installer script to a temporary file and runs it. If an old
install gets confused by cached GitHub metadata, run `gd update --force` once.
Running the installer manually still works too.

the desktop app shares the same encrypted config, memories, skills, and sessions
as the CLI.

### What's new in 0.15.9

- refreshed the CLI, desktop app, and website with the same cleaner dark UI
- refreshed the CLI startup banner with a cleaner gold/amber ASCII panel
- changed the CLI prompt to `gd ❯`
- fixed `npm run desktop` when `ELECTRON_RUN_AS_NODE` is set
- fixed Linux desktop startup by launching Electron with `--no-sandbox` by default
- rebuilt `goldid-logo.ico` from the original logo as a multi-size 32-bit ICO

### Uninstall

run the uninstaller:

```powershell
& C:\goldid\uninstall.ps1
```

it hunts down the `gd` command, the profile blocks, `GOLDID_HOME`, and the
install path to find GolDid. your stuff under `~/.goldid` (settings, keys,
memories, sessions, skills) is kept by default.

want it ALL gone, data included:

```powershell
& C:\goldid\uninstall.ps1 -RemoveData
```

add `-Yes` if you don't want to be asked.

## First run

first time you run `gd` it asks you to:

1. pick an AI provider.
2. drop in an API key or local server URL if it needs one.
3. pick a model.

after that just type:

```text
gd ? explain async/await in one sentence
? async/await lets you write asynchronous code that reads like synchronous code.
```

or fire a one-off prompt without sitting in the chat:

```powershell
gd "write a haiku about terminals"
```

## Desktop app

there's a desktop app too (Windows + Linux, not macOS). the Windows installer
makes a **GolDid** shortcut on your Desktop + Start Menu; Linux gets an app-menu
entry. it does basically everything the CLI does:

- streaming replies with Markdown
- browse your saved chats
- provider / endpoint / API key / model settings
- live model-list fetching
- skill browsing
- peek at persistent memory
- jump straight to your GolDid data folder
- full agent tools (files, web search, memory, skills, shell, images)
- approval popups before `shell`, `write_file`, or `generate_image` run
- update checks and installs through `/update check` and `/update`

it follows the same `/agent` setting as the CLI. if you turned tools off with
`/agent off`, turn them back on with `/agent on`. read-only tools just run;
anything that touches your machine asks first.

type `/` in the composer to open the command menu — arrow keys to pick, `Tab` to
complete, `Enter` to run. desktop commands include `/new`, `/settings`,
`/sessions`, `/skills`, `/memory`, `/agent on`, `/agent off`, `/sandbox`,
`/image`, `/update`, `/tools`, `/clear`, and `/help`.

dev it locally (Windows or Linux):

```bash
npm install
npm run desktop
```

`npm run desktop` uses `desktop/launch.js`, which strips `ELECTRON_RUN_AS_NODE`
before starting Electron. On Linux, the launcher passes `--no-sandbox`, forces
GTK 3, disables GPU acceleration by default, and writes failures to
`~/.goldid/desktop.log`.
Per-user installs usually cannot provide Electron's setuid Chromium sandbox. If
you have configured the sandbox yourself, launch with `GOLDID_ELECTRON_SANDBOX=1`.
If you want to force GPU acceleration, launch with `GOLDID_ELECTRON_GPU=1`.

## What it can do

- stream replies as they're generated, formatted as Markdown
- talk to local AND cloud models
- remember small durable stuff between chats
- save, search, and resume old conversations
- load per-project instructions from `GOLDID.md` or `AGENTS.md`
- load portable Hermes / OpenClaw / AgentSkills skills
- import your stuff from Hermes and OpenClaw
- read and search files
- search the web
- run shell commands (after you approve them)
- write files (after you approve them)
- generate images
- keep its personality in an editable `SOUL.md`

## Providers

| Provider      | Type  | Configuration                       |
| ------------- | ----- | ----------------------------------- |
| Anthropic     | Cloud | API key                             |
| OpenAI        | Cloud | API key                             |
| Google Gemini | Cloud | API key                             |
| xAI           | Cloud | API key                             |
| DeepSeek      | Cloud | API key                             |
| OpenRouter    | Cloud | API key                             |
| Ollama        | Local | `http://localhost:11434` by default |
| vLLM          | Local | `http://localhost:8000` by default  |
| LM Studio     | Local | `http://localhost:1234` by default  |

local model lists come straight from the running server, so GolDid shows the
models you actually have, not some hardcoded list.

<sub>your API keys get encrypted the moment you type them.</sub>

## The prompt thing (why this exists)

quick nerd note since it's the whole reason i made this: GolDid sizes the system
prompt to the model. cloud models get the long, detailed prompt because they can
handle it. small **local** models get a short, plain one — because a giant prompt
tanks your prompt-processing speed and confuses small models. skills are
catalog-only in the base prompt (just names + descriptions) and the full
instructions load on demand. keeps the prompt small so your tok/s doesn't die.

## Tools and approval

GolDid can hand the model a small set of tools:

| Tool             | Needs approval | Purpose                          |
| ---------------- | -------------: | -------------------------------- |
| `time`           |             No | Get the current date and time    |
| `cwd`            |             No | Show the working directory       |
| `memory`         |             No | Read or update persistent memory |
| `list_dir`       |             No | List directory contents          |
| `read_file`      |             No | Read a text file                 |
| `file_info`      |             No | Inspect file metadata            |
| `find_files`     |             No | Find files recursively           |
| `search_text`    |             No | Search inside text files         |
| `web_search`     |             No | Search the web                   |
| `skills_list`    |             No | List installed skills            |
| `skill_view`     |             No | Load a skill's full instructions |
| `generate_image` |            Yes | Generate an image and save it    |
| `write_file`     |            Yes | Create or overwrite a file       |
| `shell`          |            Yes | Run a shell command              |

`generate_image`, `write_file`, and `shell` never run silently — GolDid shows you
exactly what it wants to do and waits for a yes. don't want any of it? kill all
tools:

```text
/agent off
```

heads up: tool use quality depends HARD on the model. big cloud models follow
tool instructions great. tiny local models might ignore them or spit out
malformed calls. that's a model problem, not a GolDid problem.

### Sandbox

if you don't trust what the model might do with `shell`/files, sandbox it:

```text
/sandbox jail     # lock file + shell tools to the folder you launched gd in
/sandbox docker   # run shell inside a throwaway Docker container (real isolation)
/sandbox off      # back to normal
```

`jail` is pure Node, no deps — it's a guardrail, not a prison (a determined shell
command can still wriggle out). `docker` is the real isolation but needs Docker
installed.

## Image generation

GolDid can make images too. it uses its OWN provider + model (separate from your
chat model) so you can chat on local Ollama and still generate on OpenAI or
whatever. set it up with a wizard:

```text
/image
```

pick a provider (it shows which ones already have a key so you can reuse it),
reuse/enter the key, pick the model. then just ask the model to make an image and
approve it. works on OpenAI, Gemini, xAI, and OpenRouter. `/image clear` resets
it.

## Memory and personality

GolDid keeps your personal stuff out of the repo, in `~/.goldid`:

```text
~/.goldid/
  config.json          provider config + encrypted API keys
  key.tpm              TPM-wrapped master key (when sealed)
  key.bin              legacy plaintext master key (fallback)
  SOUL.md
  memories/
    MEMORY.md
    USER.md
    PERSONALITY.md
  sessions/
    <session-id>.json
  skills/
    goldid/            your own skills
    _Template/         starter template (skipped by the loader)
```

- `SOUL.md` is GolDid's voice / identity.
- `USER.md` is durable stuff about you.
- `MEMORY.md` is useful project / environment notes.
- `PERSONALITY.md` is behavior / style tweaks.

poke at memory with `/memory`, `/remember`, and `/forget`. these files are local
and not in the git repo.

## Saved sessions

your chats auto-save under `~/.goldid/sessions/` after each turn, so you can bail
and come back later:

```text
/sessions
/sessions authentication
/resume <session-id>
```

`/session my-project` gives the current chat a memorable id. `/reset` starts
fresh with a new id.

session files have your messages + tool results in them, so keep
`~/.goldid/sessions` private and skim it before sharing logs.

## Project instructions

before each turn GolDid looks for a project context file:

1. `GOLDID.md`
2. `AGENTS.md`

it starts in the current folder and walks up until it finds one. use it for repo
conventions, handy commands, architecture notes — whatever should apply whenever
GolDid works in that project.

example `GOLDID.md`:

```markdown
# Project instructions

- Run `npm test` before reporting that a change is complete.
- Keep public APIs backward compatible.
- Do not edit generated files under `dist/`.
```

## Skills

GolDid runs portable skill folders from Hermes Agent, OpenClaw, and the
AgentSkills standard. a skill is just a folder with a `SKILL.md` (lowercase
`skill.md` works too):

```text
my-skill/
  SKILL.md
  Version.js     GolDid normalized metadata
  scripts/       optional
  references/    optional
  templates/     optional
  assets/        optional
```

example:

```markdown
---
name: release-check
description: Verify a project before publishing a release.
version: 1.0.0
platforms: [windows, linux, macos]
---

# Release Check

1. Run the test suite.
2. Check the Git working tree.
3. Review the package version.
```

GolDid finds skills in these spots, highest priority first:

1. `<project>/skills`
2. `<project>/.agents/skills`
3. `<project>/.goldid/skills`
4. `~/.goldid/skills`
5. `~/.agents/skills`
6. `%HERMES_HOME%/skills` or `~/.hermes/skills`
7. `%HERMES_HOME%/hermes-agent/skills` for bundled Hermes skills
8. `~/.openclaw/skills`

grouped layouts like `skills/software-development/release-check/SKILL.md` work
fine. folders starting with `_` or `.` get skipped (that's how the `_Template`
stays a reference instead of showing up as a real skill). skills locked to
another OS via `platforms` are hidden.

only skill names + descriptions go in the prompt up front. the model has to use
`skill_view` to load the full thing when a task matches — keeps the prompt small.
`${HERMES_SKILL_DIR}`, `${GOLDID_SKILL_DIR}`, and `${HERMES_SESSION_ID}`
placeholders are supported.

use:

```text
/skills
/skill release-check
/skill install 1929
gd skill install 1929
```

third-party skills are instructions, NOT trusted code. read them before you use
them. GolDid won't auto-run Hermes inline-shell expressions — any command a skill
wants still goes through normal `shell` approval.

when you first run GolDid it scaffolds `~/.goldid/skills/goldid/` (where your own
skills go) and `~/.goldid/skills/_Template/your-skill-name/` (a starter you can
copy). just copy the template, rename the folder to your slug, and fill it in.

### GolDid skill metadata

every GolDid skill is two files:

```text
SKILL.md
Version.js
```

for a native GolDid skill, `Version.js` has normalized metadata:

```javascript
"use strict";

module.exports = {
  Author: "Skill author",
  Name: "release-check",
  Description: "Verify a project before publishing a release.",
  Usage: "Use before creating or publishing a release.",
  Model_tested: ["gpt-5", "claude-sonnet"],
};
```

**important:** GolDid parses `Version.js` as JSON, so the keys MUST be
double-quoted. unquoted keys are valid JavaScript but invalid JSON, so they get
silently ignored and GolDid falls back to the `SKILL.md` frontmatter. don't get
caught by that one.

the fields:

- `Author`: original frontmatter author, or the import source if missing
- `Name`: normalized skill name
- `Description`: short catalog description
- `Usage`: from `usage`, `## Usage`, or `## When to Use`
- `Model_tested`: models the author declared; empty if unknown

for migrated Hermes/OpenClaw skills, GolDid doesn't make up metadata it doesn't
have:

```javascript
"use strict";

module.exports = {
  Author: "Unknown",
  Name: "Unknown",
  Description: "Unknown",
  Usage: "Unknown",
  Model_tested: "Unknown",
};
```

the original `SKILL.md` is untouched and still used to find + run the imported
skill. GolDid parses `Version.js` as JSON data and never executes it.

## Migrating from Hermes and OpenClaw

GolDid can look at both installs at once and import what it understands:

```powershell
gd migrate --dry-run
gd migrate --secrets
```

default source is `both`. pick one if you want:

```powershell
gd migrate hermes --dry-run
gd migrate openclaw --dry-run
```

what it imports:

- skills + their support files
- `SOUL.md`
- `MEMORY.md`, `USER.md`, and `PERSONALITY.md`
- OpenClaw workspace instructions (for you to review)
- supported provider names, model selection, base URLs
- API keys for providers GolDid supports

API keys are skipped unless you pass `--secrets`. imported keys go through the
encrypted config store and never get printed in the preview.

it's conflict-safe by default:

- memory entries get merged + deduped
- existing files / skills get skipped
- imported skills land under `~/.goldid/skills/hermes-imports/` and
  `~/.goldid/skills/openclaw-imports/`
- add `--overwrite` only if you actually want imported stuff to replace what you
  have

skip the confirm with `--yes`:

```powershell
gd migrate both --secrets --yes
```

custom source locations work too:

```powershell
gd migrate both --hermes-dir D:\HermesData --openclaw-dir D:\OpenClawData --dry-run
```

OAuth sessions, messaging accounts, cron jobs, plugins, browser state, and
providers GolDid doesn't support are NOT imported. the report lists unsupported
providers so you can set them up by hand.

## API key security

this is the part i'm actually proud of. your provider API keys are encrypted in
`~/.goldid/config.json` with AES-256-GCM. the 32-byte key that encrypts them (the
_master key_) is itself protected, and how depends on your machine:

- **TPM 2.0 sealed (best).** on Windows the master key gets wrapped by a key in
  the Microsoft Platform Crypto Provider; on Linux it's sealed by the TPM via
  `tpm2-tools` (auto-installed when you run `/keystore migrate`). the wrapping key
  lives INSIDE the TPM and can't be exported, so the master key is bound to that
  machine. someone copies `config.json` + `key.tpm` to their machine? useless to
  them.
- **Machine-bound fallback (no TPM).** if your CPU has no usable TPM, the master
  key gets double-encrypted with keys derived from stable machine identifiers and
  hidden outside `~/.goldid`. still won't decrypt on another machine.
- **Plaintext fallback.** a legacy `~/.goldid/key.bin` only when nothing better
  is around.

check or change it:

```text
/keystore            # status
/keystore migrate    # seal it the best way your machine can
/keystore revert     # back to a plaintext key
```

tested working on Windows and Linux. macOS just uses the machine-bound/plaintext
fallback (no TPM path yet).

honest caveats so i'm not lying to you: the TPM protects against someone
**copying your files**, NOT against code already running as **you** (any process
in your session can use the same TPM key — every local keystore has this limit).
and if you wipe / reset the TPM the sealed key is gone and you just re-enter your
keys. never upload `config.json`, `key.bin`, or `key.tpm`.

## Commands

| Command                        | What it does                               |
| ------------------------------ | ------------------------------------------ |
| `/setup [provider]`            | Configure a provider and model             |
| `/use <provider>`              | Switch provider                            |
| `/model [name]`                | Show or change the active model            |
| `/models [provider]`           | Fetch available models                     |
| `/providers`                   | Show provider status                       |
| `/key <provider> [key]`        | Set an API key                             |
| `/url <provider> [url]`        | Set a provider URL                         |
| `/agent [on\|off]`             | Enable or disable tools                    |
| `/mode [ask\|auto-edit\|auto\|plan]` | Change edit/command approval behavior      |
| `/sandbox [off\|jail\|docker]` | Confine tools to a directory or container  |
| `/image [model]`               | Set up image generation (provider + model) |
| `/keystore [migrate\|revert]`  | Show/change API-key protection (TPM)       |
| `/update [check\|--force]`     | Check for or install the latest GolDid     |
| `/tools`                       | List available tools                       |
| `/soul`                        | Show the personality file                  |
| `/memory`                      | Inspect or edit memory                     |
| `/sessions [query]`            | List or search saved conversations         |
| `/session [name]`              | Show or name the current session           |
| `/resume <id>`                 | Resume a saved conversation                |
| `/delete-session <id>`         | Delete a saved conversation                |
| `/skills`                      | List compatible installed skills           |
| `/skill <name\|install id>`    | Inspect or install a skill                 |
| `/migrate [source]`            | Import Hermes/OpenClaw data                |
| `/remember [target] <text>`    | Add a memory                               |
| `/forget [target] <text>`      | Remove a memory                            |
| `/config`                      | Show current configuration                 |
| `/reset`                       | Start a fresh conversation                 |
| `/clear`                       | Clear the terminal                         |
| `/version`                     | Show the version                           |
| `/help`                        | Show command help                          |
| `/exit`                        | Quit                                       |

## Project layout

```text
GolDid/
  firebase.json    Firebase Hosting config for the static website
  setup.ps1        Windows installer and updater
  setup.sh         Linux/macOS installer and updater
  uninstall.ps1    Windows uninstaller
  desktop-launch.ps1  Desktop runtime launcher (Windows)
  desktop-launch.sh   Desktop runtime launcher (Linux)
  goldid.js        CLI, chat loop, commands, and setup wizard
  desktop/         Electron desktop application
    launch.js      npm-run launcher for Electron
    assets/        GolDid app logo
  public/          Static website ready for Firebase Hosting
  lib/
    config.js      Encrypted configuration storage
    keystore.js    Master-key protection (TPM 2.0 / machine-bound / plaintext)
    sandbox.js     Tool sandboxing (jail / docker)
    memory.js      Persistent memory
    prompt.js      System prompt construction
    providers.js   Provider APIs and streaming
    sessions.js    Saved conversation storage and search
    context.js     Project instruction discovery
    skills.js      Hermes/OpenClaw-compatible skill discovery
    migrate.js     Combined Hermes/OpenClaw migration
    updater.js     Version checks and installer-backed updates
    tools.js       Agent tools
    ui.js          Terminal interface colors, panels, menus, and spinner
    markdown.js    Markdown to ANSI rendering for the terminal
  package.json
```

## Website deploy

The static site lives in `public/` and is configured for Firebase Hosting.

```bash
firebase login
firebase use <your-project-id>
firebase deploy --only hosting
```

If you have the Blaze plan enabled, Hosting deploy still works the same way; the
plan mainly matters for usage limits and other Firebase services you may add
later.

the CLI core only needs Node.js built-ins + native `fetch`. the desktop app adds
Electron and uses `marked` + `dompurify` to render Markdown (the terminal renders
its own Markdown via `lib/markdown.js`).

want the full deep-dive on every module, the prompt system, the agent loop, and
the security model? read [documentation.md](documentation.md).

## Updating

just run the installer again.

Windows:

```powershell
irm https://raw.githubusercontent.com/wafflebyte8-hue/Goldid/main/setup.ps1 | iex
```

Linux and macOS:

```bash
curl -fsSL https://raw.githubusercontent.com/wafflebyte8-hue/Goldid/main/setup.sh | bash
```

your stuff under `~/.goldid` stays put.

## Contributing

it's experimental so bug reports genuinely help. when something breaks, include:

- your Node.js version
- your PowerShell version
- the provider + model you used
- the command or action that failed
- the error message (scrub your API keys out first)

please never paste real API keys, `config.json`, or `key.bin`/`key.tpm` into an
issue.

## License

MIT
