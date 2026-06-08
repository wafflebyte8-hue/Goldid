---
name: GolDid Memory And Sessions Fixer
description: Use when a user reports memory, sessions, saved context, resume behavior, or project instruction files behaving incorrectly in GolDid.
version: 1.0.0
author: Goldid
license: MIT
tags: [memory, sessions, state]
---

# GolDid Memory And Sessions Fixer

## Overview

Debug GolDid memory files, saved sessions, context loading, and stale state behavior.

## When to Use

Use when a user reports memory, sessions, saved context, resume behavior, or project instruction files behaving incorrectly in GolDid.

## Instructions

1. Identify whether the issue is memory, session transcript, project context, or prompt assembly.
2. Do not delete user memory or sessions without explicit instruction.
3. Prefer migrations or validation repairs over destructive resets.
4. When context is stale, find where it enters the prompt and whether it should be summarized, replaced, or omitted.

## Output Format

Lead with the result or highest-risk finding. Then list changed files, exact checks run, and any remaining unverified behavior. Keep the final answer concise and actionable.

## Common Pitfalls

- Do not invent GolDid behavior; inspect the repo first.
- Do not make unrelated refactors while fixing a narrow issue.
- Do not overwrite user data, private config, sessions, memory, or ignored local notes without explicit permission.

## Verification Checklist

- Run syntax checks on touched modules.
- Use a temporary fixture when testing state repair.
- Report any user-data file that was read or changed.
