---
name: GolDid CLI Command Builder
description: Use when a user asks to add, rename, debug, or document a GolDid CLI command or slash command.
version: 1.0.0
author: Goldid
license: MIT
tags: [cli, commands, ux]
---

# GolDid CLI Command Builder

## Overview

Add or repair GolDid CLI commands with consistent parsing, help text, docs, and desktop parity.

## When to Use

Use when a user asks to add, rename, debug, or document a GolDid CLI command or slash command.

## Instructions

1. Find the existing command parser and copy its style instead of creating a separate command framework.
2. Update command aliases, help output, slash-command handling, README, documentation, and desktop command menus when applicable.
3. Validate argument handling for missing values, paths with spaces, flags, and interactive prompts.
4. Keep command output short, actionable, and consistent with nearby commands.

## Output Format

Lead with the result or highest-risk finding. Then list changed files, exact checks run, and any remaining unverified behavior. Keep the final answer concise and actionable.

## Common Pitfalls

- Do not invent GolDid behavior; inspect the repo first.
- Do not make unrelated refactors while fixing a narrow issue.
- Do not overwrite user data, private config, sessions, memory, or ignored local notes without explicit permission.

## Verification Checklist

- Run node --check on modified JavaScript.
- Run the command with a harmless example when possible.
- Search docs and UI text for stale command names.
