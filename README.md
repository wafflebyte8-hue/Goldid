# GolDid

GolDid is a small terminal AI assistant inspired by
[Hermes Agent](https://github.com/NousResearch/hermes-agent).

I built it because I wanted one simple command for chatting with local and
cloud models without opening a browser. It supports streaming replies,
persistent memory, multiple providers, and a few tools for working with files
and commands on your machine.

This is a personal project and still a work in progress. Roughly 40% of it was
vibe-coded with AI assistance. I reviewed and shaped the result, but there may
still be rough edges. Issues and pull requests are welcome.

## Install on Windows

You need:

- Windows PowerShell or PowerShell 7
- Node.js 18 or newer

Run:

```powershell
irm https://raw.githubusercontent.com/wafflebyte8-hue/Goldid/main/setup.ps1 | iex
```

Open a new PowerShell window, then start GolDid:

```powershell
gd
```

The installer puts the application in `C:\goldid`, sets the user-level
`GOLDID_HOME` environment variable, and adds the `gd` command to your
PowerShell profile. Running it again updates GolDid without deleting your
settings or memories.

It also installs the GolDid desktop app and creates shortcuts on the Windows
Desktop and Start Menu. The desktop app shares the same encrypted provider
configuration, memories, skills, and sessions as the CLI.

If Windows blocks access to `C:\goldid`, run PowerShell as Administrator or
download the script and pass a different writable path with `-InstallDir`.

### Uninstall

Run the installed uninstaller:

```powershell
& C:\goldid\uninstall.ps1
```

It checks the global `gd` command, installer-owned PowerShell profile blocks,
`GOLDID_HOME`, and the default install path to locate GolDid. Personal settings,
API keys, memories, sessions, and skills under `~/.goldid` are kept by default.

To remove the application and all personal GolDid data:

```powershell
& C:\goldid\uninstall.ps1 -RemoveData
```

Use `-Yes` for a non-interactive uninstall.

## First run

The first time you run `gd`, it asks you to:

1. Choose an AI provider.
2. Enter an API key or local server URL when needed.
3. Choose a model.

After that, just type normally:

```text
❯ explain async/await in one sentence
◆ async/await lets you write asynchronous code that reads like synchronous code.
```

You can also send a one-off prompt:

```powershell
gd "write a haiku about terminals"
```

## Desktop app

The Windows installer creates a **GolDid** shortcut. The desktop app includes:

- Streaming model responses
- Saved conversation browsing
- Provider, endpoint, API key, and model settings
- Live model-list fetching
- Skill browsing
- Persistent memory inspection
- Direct access to the local GolDid data directory
- Full agent tools, including files, web search, memory, skills, and shell
- Desktop approval prompts before `shell` or `write_file` runs

The desktop app follows the same `/agent` setting as the CLI. If tools were
disabled with `/agent off`, turn them back on from the CLI with `/agent on`.
Read-only tools run automatically; commands and file writes always show an
approval dialog first.

For local development:

```powershell
npm install
npm run desktop
```

## What it can do

- Stream responses as they are generated
- Talk to local and cloud models
- Remember small, durable details between conversations
- Save, search, and resume previous conversations
- Load project-specific instructions from `GOLDID.md` or `AGENTS.md`
- Load portable Hermes, OpenClaw, and AgentSkills-style skills
- Import usable data from Hermes and OpenClaw together
- Read and search files
- Search the web
- Run approved shell commands
- Create or overwrite files after asking for approval
- Keep its personality in an editable `SOUL.md`

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

Local model lists are fetched directly from the running server, so GolDid
shows the models you actually have available.

<sub>Your API keys are encrypted as soon as you enter them.</sub>

## Tools and approval

GolDid can give the selected model access to a small set of tools:

| Tool          | Needs approval | Purpose                          |
| ------------- | -------------: | -------------------------------- |
| `time`        |             No | Get the current date and time    |
| `cwd`         |             No | Show the working directory       |
| `memory`      |             No | Read or update persistent memory |
| `list_dir`    |             No | List directory contents          |
| `read_file`   |             No | Read a text file                 |
| `file_info`   |             No | Inspect file metadata            |
| `find_files`  |             No | Find files recursively           |
| `search_text` |             No | Search inside text files         |
| `web_search`  |             No | Search the web                   |
| `write_file`  |            Yes | Create or overwrite a file       |
| `shell`       |            Yes | Run a shell command              |

`write_file` and `shell` do not run silently. GolDid shows the request and asks
you to approve it first. You can turn all agent tools off with:

```text
/agent off
```

The quality of tool use depends heavily on the model. Larger cloud models tend
to follow tool instructions reliably. Very small local models may ignore them
or produce malformed calls.

## Memory and personality

GolDid keeps personal data outside the repository:

```text
~/.goldid/
  config.json
  key.bin
  SOUL.md
  memories/
    MEMORY.md
    USER.md
    PERSONALITY.md
  sessions/
    <session-id>.json
```

- `SOUL.md` controls GolDid's general voice and identity.
- `USER.md` stores durable preferences or details about you.
- `MEMORY.md` stores useful project and environment notes.
- `PERSONALITY.md` stores behavior and style adjustments.

You can inspect or edit memory with `/memory`, `/remember`, and `/forget`.
These files are local and are not part of this Git repository.

## Saved sessions

Conversations are automatically saved under `~/.goldid/sessions/` after each
completed turn. This makes it possible to leave a conversation and continue it
later:

```text
/sessions
/sessions authentication
/resume <session-id>
```

Use `/session my-project` to give the current conversation a memorable ID.
`/reset` starts a new conversation with a new session ID.

Session files contain your chat messages and tool results. Keep the
`~/.goldid/sessions` directory private and review it before sharing diagnostics.

## Project instructions

GolDid looks for a project context file before each model turn:

1. `GOLDID.md`
2. `AGENTS.md`

It starts in the current working directory and walks upward until it finds one.
Use this file for repository conventions, useful commands, architecture notes,
or instructions that should apply whenever GolDid works in that project.

Example `GOLDID.md`:

```markdown
# Project instructions

- Run `npm test` before reporting that a change is complete.
- Keep public APIs backward compatible.
- Do not edit generated files under `dist/`.
```

## Skills

GolDid supports portable skill folders used by Hermes Agent, OpenClaw, and the
AgentSkills standard. A skill is a directory containing `SKILL.md` (lowercase
`skill.md` is also accepted):

```text
my-skill/
  SKILL.md
  Version.js     GolDid normalized metadata
  scripts/       optional
  references/    optional
  templates/     optional
  assets/        optional
```

Example:

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

GolDid discovers compatible skills from these locations, highest precedence
first:

1. `<project>/skills`
2. `<project>/.agents/skills`
3. `<project>/.goldid/skills`
4. `~/.goldid/skills`
5. `~/.agents/skills`
6. `%HERMES_HOME%/skills` or `~/.hermes/skills`
7. `%HERMES_HOME%/hermes-agent/skills` for bundled Hermes skills
8. `~/.openclaw/skills`

Grouped layouts such as `skills/software-development/release-check/SKILL.md`
are supported. Skills restricted to another operating system through the
`platforms` field are hidden.

GolDid puts only skill names and descriptions in the initial prompt. The model
must use `skill_view` to load full instructions when a task matches. This keeps
the prompt smaller. `${HERMES_SKILL_DIR}`, `${GOLDID_SKILL_DIR}`, and
`${HERMES_SESSION_ID}` placeholders are supported.

Use:

```text
/skills
/skill release-check
```

Third-party skills are instructions, not trusted code. Read them before use.
GolDid does not execute Hermes inline-shell expressions automatically. Any
commands requested by a skill still go through the normal `shell` approval.

### GolDid skill metadata

Every GolDid skill uses this two-file base:

```text
SKILL.md
Version.js
```

For a native GolDid skill, `Version.js` contains normalized metadata:

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

The native fields are:

- `Author`: original frontmatter author, or the import source when absent
- `Name`: normalized skill name
- `Description`: short catalog description
- `Usage`: imported from `usage`, `## Usage`, or `## When to Use`
- `Model_tested`: models declared by the skill author; empty when unknown

For migrated Hermes and OpenClaw skills, GolDid does not claim metadata that
was not authored specifically for GolDid. Their generated file is:

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

The original `SKILL.md` remains unchanged and is still used to discover and run
the imported skill. GolDid parses `Version.js` as JSON data inside a CommonJS
export and never executes it.

## Migrating from Hermes and OpenClaw

GolDid can inspect both installations at the same time and import the parts it
understands:

```powershell
gd migrate --dry-run
gd migrate --secrets
```

The default source is `both`. You can choose one:

```powershell
gd migrate hermes --dry-run
gd migrate openclaw --dry-run
```

Supported imports:

- Skills and their supporting files
- `SOUL.md`
- `MEMORY.md`, `USER.md`, and `PERSONALITY.md`
- OpenClaw workspace instructions for manual review
- Supported provider names, model selection, and base URLs
- API keys for providers GolDid supports

API keys are excluded unless you explicitly add `--secrets`. Imported keys are
written through GolDid's encrypted configuration store and are not printed in
the preview.

Migration is conflict-safe by default:

- Memory entries are merged and deduplicated.
- Existing files and skills are skipped.
- Imported skills go under `~/.goldid/skills/hermes-imports/` and
  `~/.goldid/skills/openclaw-imports/`.
- Add `--overwrite` only when you intentionally want imported files and
  provider settings to replace existing values.

Use `--yes` to skip the confirmation prompt:

```powershell
gd migrate both --secrets --yes
```

Custom source locations are also supported:

```powershell
gd migrate both --hermes-dir D:\HermesData --openclaw-dir D:\OpenClawData --dry-run
```

OAuth sessions, messaging accounts, cron jobs, plugins, browser state, and
providers GolDid does not support are not imported. The migration report lists
unsupported providers so they can be configured manually.

## API key security

Provider API keys are encrypted in `~/.goldid/config.json` using AES-256-GCM.
The encryption key is stored separately at `~/.goldid/key.bin`.

This mainly protects against accidentally exposing a readable key when sharing
`config.json`. It is not a replacement for an operating-system credential
vault: anyone who gets both `config.json` and `key.bin` can decrypt the keys.
Do not upload either file.

## Commands

| Command                     | What it does                        |
| --------------------------- | ----------------------------------- |
| `/setup [provider]`         | Configure a provider and model      |
| `/use <provider>`           | Switch provider                     |
| `/model [name]`             | Show or change the active model     |
| `/models [provider]`        | Fetch available models              |
| `/providers`                | Show provider status                |
| `/key <provider> [key]`     | Set an API key                      |
| `/url <provider> [url]`     | Set a provider URL                  |
| `/agent [on\|off]`          | Enable or disable tools             |
| `/tools`                    | List available tools                |
| `/soul`                     | Show the personality file           |
| `/memory`                   | Inspect or edit memory              |
| `/sessions [query]`         | List or search saved conversations  |
| `/session [name]`           | Show or name the current session    |
| `/resume <id>`              | Resume a saved conversation         |
| `/delete-session <id>`      | Delete a saved conversation         |
| `/skills`                   | List compatible installed skills    |
| `/skill <name>`             | Inspect a skill's full instructions |
| `/migrate [source]`         | Import Hermes/OpenClaw data         |
| `/remember [target] <text>` | Add a memory                        |
| `/forget [target] <text>`   | Remove a memory                     |
| `/config`                   | Show current configuration          |
| `/reset`                    | Start a fresh conversation          |
| `/clear`                    | Clear the terminal                  |
| `/version`                  | Show the version                    |
| `/help`                     | Show command help                   |
| `/exit`                     | Quit                                |

## Project layout

```text
GolDid/
  setup.ps1        Windows installer and updater
  uninstall.ps1    Windows uninstaller
  desktop-launch.ps1  Desktop runtime launcher
  goldid.js        CLI, chat loop, commands, and setup wizard
  desktop/         Electron desktop application
    assets/        GolDid app logo
  lib/
    config.js      Encrypted configuration storage
    memory.js      Persistent memory
    prompt.js      System prompt construction
    providers.js   Provider APIs and streaming
    sessions.js    Saved conversation storage and search
    context.js     Project instruction discovery
    skills.js      Hermes/OpenClaw-compatible skill discovery
    migrate.js     Combined Hermes/OpenClaw migration
    tools.js       Agent tools
    ui.js          Terminal interface
  package.json
```

GolDid has no npm package dependencies. It uses Node.js built-ins and the
native `fetch` API.

## Updating

Run the installer again:

```powershell
irm https://raw.githubusercontent.com/wafflebyte8-hue/Goldid/main/setup.ps1 | iex
```

Your files under `~/.goldid` are left alone.

## Contributing

This project is experimental, so bug reports are useful. When reporting a
problem, include:

- Your Node.js version
- Your PowerShell version
- The provider and model you used
- The command or action that failed
- The error message, with API keys removed

Please never include `config.json`, `key.bin`, or real API keys in an issue.

## License

MIT
