---
name: GolDid Project Maintainer
description: Use when a user wants a repository reviewed, maintained, cleaned up, released, or checked for practical engineering risks.
version: 1.0.0
author: Goldid
license: MIT
tags: [code-review, maintenance, release-notes]
---

# GolDid Project Maintainer

## Overview

Use this skill to inspect a software project, find practical problems, propose or implement narrow fixes, and leave the repository easier to maintain.

## When to Use

- The user asks for a project review.
- The user asks to fix project errors without naming a specific file.
- The user asks for release notes, version checks, documentation cleanup, or packaging checks.
- The project has CLI, desktop, website, installer, or deployment behavior that must stay consistent.

Do not use when the request is only a tiny one-line code explanation.

## Inputs

- Repository root.
- The user's exact request.
- Any failing command output or reproduction steps, if available.

## Instructions

1. Inspect project structure before editing.
2. Identify the smallest set of files that controls the requested behavior.
3. Reproduce failures with existing commands when possible.
4. Make focused edits only.
5. Keep version numbers, docs, installer packaging, and runtime constants consistent.
6. Verify with syntax checks, command checks, or static validation.
7. Report what changed and what could not be verified.

## Tools

- `list_dir`, `find_files`, and `search_text` for discovery.
- `read_file` for source inspection.
- `write_file` or local file edits for implementation.
- `shell` for checks and packaging commands when approved.

## Output Format

Summarize:

- Files changed.
- Behavior fixed or added.
- Verification commands and results.
- Any remaining manual step.

## Common Pitfalls

- Do not update package version without updating runtime constants.
- Do not document behavior that is not implemented.
- Do not assume installers copy a file unless the install scripts actually include it.
- Do not break desktop and CLI parity when adding shared behavior.

## Verification Checklist

- [ ] Runtime version matches package version.
- [ ] Docs match actual behavior.
- [ ] Installer includes new runtime/static files.
- [ ] CLI and desktop paths both work for shared features.
