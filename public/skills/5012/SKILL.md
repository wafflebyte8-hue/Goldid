---
name: GolDid Docs Writer
description: Use when a user asks to update GolDid documentation, README content, command examples, feature lists, or website docs text.
version: 1.0.0
author: Goldid
license: MIT
tags: [docs, readme, documentation]
---

# GolDid Docs Writer

## Overview

Update GolDid README, complete documentation, commands, changelog-style notes, and user-facing examples.

## When to Use

Use when a user asks to update GolDid documentation, README content, command examples, feature lists, or website docs text.

## Instructions

1. Match docs to real code behavior by checking implementation before writing.
2. Use exact command names, file paths, default values, timeouts, and version numbers.
3. Remove stale claims instead of layering new text on top.
4. Keep README concise and put deeper operational detail in documentation.md.

## Output Format

Lead with the result or highest-risk finding. Then list changed files, exact checks run, and any remaining unverified behavior. Keep the final answer concise and actionable.

## Common Pitfalls

- Do not invent GolDid behavior; inspect the repo first.
- Do not make unrelated refactors while fixing a narrow issue.
- Do not overwrite user data, private config, sessions, memory, or ignored local notes without explicit permission.

## Verification Checklist

- Search for outdated feature names or version numbers.
- Run link/path checks where possible.
- Mention implementation areas that could not be verified.
