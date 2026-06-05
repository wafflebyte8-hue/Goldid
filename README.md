# GolDid

A chat-first CLI for talking to AI models — local or cloud — from your
terminal. Zero dependencies, Node.js. The look and flow are modeled on the
[Hermes Agent](https://github.com/NousResearch/hermes-agent) CLI: a gold
panel banner, scan-friendly command panels, masked key entry, and setup menus
with arrow-key navigation plus a numeric fallback.
Interactive startup clears the terminal first, expands the welcome panel across
the terminal width, keeps its height to the content it actually needs, and
places the chat prompt on the bottom terminal row between two gold rules.

## Run it

Type `gd` anywhere in your terminal:

```
gd
```

On first run it walks you through setup (provider → key/URL → model), then
drops you into a chat. Just type a message and press Enter:

```
❯ explain async/await in one sentence
◆ async/await lets you write asynchronous code that reads like synchronous code...
```

Replies **stream** in live, token by token.

One-shot mode (send a single prompt and exit):

```
gd "write a haiku about terminals"
```

## Agent & personality

GolDid is a small agent. With tools enabled (the default), the model can act
on your machine — inspect files, search text, list directories, run shell
commands — by emitting tool calls that GolDid runs and feeds back. Dangerous tools
(`shell`, `write_file`) ask for your approval first.

| Tool          | Approval | Description                          |
|---------------|----------|--------------------------------------|
| `time`        | no       | Current date/time                    |
| `cwd`         | no       | Current working directory            |
| `memory`      | no       | Read/update persistent memory/personality |
| `list_dir`    | no       | List a directory                     |
| `read_file`   | no       | Read a text file                     |
| `file_info`   | no       | File/directory metadata              |
| `find_files`  | no       | Recursive file/directory find        |
| `search_text` | no       | Recursive text search                |
| `write_file`  | yes      | Create/overwrite a file              |
| `shell`       | yes      | Run a shell command                  |

Toggle the agent with `/agent on|off`; list tools with `/tools`.

**Tool calling.** OpenAI-compatible providers (Ollama, LM Studio, vLLM, OpenAI,
xAI, DeepSeek, OpenRouter) use **native function calling** — the inference
server enforces the tool schema, so even small local models (e.g. a 4B Nemotron)
call tools reliably and answer from real results instead of hallucinating.
Anthropic and Gemini fall back to a text-based `<tool_call>` protocol.

**SOUL.md** — GolDid's identity/personality lives at `~/.goldid/SOUL.md`
(created on first run). Edit it to change how GolDid talks. View it with
`/soul`.

**Persistent memory** lives in `~/.goldid/memories/`, inspired by Hermes:
`MEMORY.md` for durable project/environment notes, `USER.md` for user
preferences, and `PERSONALITY.md` for GolDid's self-authored personality/style
notes. GolDid injects these small, curated files into future system prompts.
At the start of every conversation, GolDid reads all three files immediately,
including empty files, and passes that snapshot into the first model call.
Memory edits refresh the snapshot for future turns.
The system prompt explicitly tells the model it may update `MEMORY.md`,
`USER.md`, or `PERSONALITY.md` anytime through the `memory` tool, and to update
`PERSONALITY.md` as soon as it decides a durable style or behavior change.
Use `/memory` to inspect it, `/remember [personality|user|memory] <text>` to add
an entry, and `/forget [personality|user|memory] <match>` to remove one.

**System prompts adapt to the model.** Cloud models get a long, detailed
system prompt; local models get a short, natural one (small local models do
better with a brief prompt). Ollama's hosted `:cloud` models (e.g.
`gpt-oss:120b-cloud`) are treated as cloud-class and get the detailed prompt.
Note: how well a model uses tools depends on the model — capable models (cloud,
or Ollama cloud models) follow the tool protocol reliably; very small local
models often won't.

## Slash commands

Inside the chat, commands start with `/`:

| Command                | Description                                   |
|------------------------|-----------------------------------------------|
| `/setup [provider]`    | Pick a provider, add a key/URL, choose a model|
| `/use <provider>`      | Switch provider (then choose a model)         |
| `/model [name]`        | Show or set the active model                  |
| `/models [provider]`   | List available models                         |
| `/providers`           | List all providers and their status          |
| `/key <provider> [k]`  | Set a provider API key                        |
| `/url <provider> [u]`  | Set a provider base URL                       |
| `/agent [on|off]`      | Toggle tool use                               |
| `/tools`               | List the agent tools                          |
| `/soul`                | Show/locate the SOUL.md personality file      |
| `/memory`              | Show or edit persistent memory                |
| `/remember [target]`   | Save memory/user/personality                  |
| `/forget [target]`     | Remove a memory entry                         |
| `/config`              | Show current configuration                    |
| `/reset`               | Start a new conversation                      |
| `/clear`               | Clear the screen                              |
| `/version`             | Show the GolDid version                       |
| `/help`                | Show help                                     |
| `/exit`                | Quit (`/quit` too)                            |

## Providers

Configuration (keys, base URLs, active provider/model) lives in
**`~/.goldid/config.json`**.

| Provider     | Type  | Needs        |
|--------------|-------|--------------|
| `anthropic`  | cloud | API key      |
| `openai`     | cloud | API key      |
| `gemini`     | cloud | API key      |
| `xai`        | cloud | API key      |
| `deepseek`   | cloud | API key      |
| `openrouter` | cloud | API key      |
| `ollama`     | local | base URL (default `http://localhost:11434`) |
| `vllm`       | local | base URL (default `http://localhost:8000`)  |
| `lmstudio`   | local | base URL (default `http://localhost:1234`)  |

For local providers the model list is fetched live from the server, so it
always matches what you actually have loaded. For cloud providers, enter your
API key when prompted (input is masked).

> API keys are encrypted in `~/.goldid/config.json` using AES-256-GCM. The local
> encryption key is generated at `~/.goldid/key.bin` with `0600` permissions
> where the OS supports it. Keep both files private; anyone with both can decrypt
> the stored API keys.

## Project layout

```
GolDid/
  goldid.js        chat REPL, slash-commands, setup wizard, one-shot mode
  lib/config.js    load/save ~/.goldid/config.json
  lib/providers.js provider registry, model fetching, multi-turn chat
  lib/ui.js        gold theme, panels/tables, arrow menus, masked input, spinner
  lib/memory.js    persistent MEMORY.md / USER.md / PERSONALITY.md storage
```

## How `gd` is wired up

A `gd` function was added to your PowerShell profile
(`Microsoft.PowerShell_profile.ps1`) that launches `goldid.js` with Node.
