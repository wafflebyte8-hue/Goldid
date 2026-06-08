---
name: GolDid Tooling Hardener
description: Use when a user asks to change GolDid tools, permissions, sandbox handling, command execution, file writing, web access, or approval behavior.
version: 1.0.0
author: Goldid
license: MIT
tags: [tools, sandbox, security]
---

# GolDid Tooling Hardener

## Overview

Audit and harden GolDid file, shell, web, image, and memory tool behavior.

## When to Use

Use when a user asks to change GolDid tools, permissions, sandbox handling, command execution, file writing, web access, or approval behavior.

## Instructions

1. Map the exact tool surface before editing: file reads, file writes, shell commands, web calls, image generation, memory, or approvals.
2. Preserve user control around destructive actions and machine-affecting commands.
3. Avoid broad regex parsing where structured parsing is available.
4. Keep error messages useful without leaking secrets or dumping huge logs.

## Output Format

Lead with the result or highest-risk finding. Then list changed files, exact checks run, and any remaining unverified behavior. Keep the final answer concise and actionable.

## Common Pitfalls

- Do not invent GolDid behavior; inspect the repo first.
- Do not make unrelated refactors while fixing a narrow issue.
- Do not overwrite user data, private config, sessions, memory, or ignored local notes without explicit permission.

## Verification Checklist

- Run targeted tests or smoke commands for the touched tool path.
- Check that denial, failure, and timeout paths are still handled.
- Document any safety tradeoff introduced by the change.
