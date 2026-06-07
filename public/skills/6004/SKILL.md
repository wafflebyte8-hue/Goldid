---
name: Documentation Writer
description: Use when a user wants README updates, setup instructions, API docs, usage guides, troubleshooting docs, or changelog text.
version: 1.0.0
author: Goldid
license: MIT
tags: [docs, readme, guides]
---

# Documentation Writer

## Overview

Write or update documentation for any project based on actual behavior and commands.

## When to Use

Use when a user wants README updates, setup instructions, API docs, usage guides, troubleshooting docs, or changelog text.

## Instructions

1. Read the implementation or scripts before documenting behavior.
2. Use exact commands, paths, defaults, environment variables, and version names.
3. Prefer concise examples over long prose.
4. Remove stale documentation instead of adding contradictory text.

## Output Format

Lead with the result. For implementation work, list files changed, checks run, and remaining risk. For review work, lead with findings ordered by severity and include file references when possible.

## Common Pitfalls

- Do not assume project details; inspect the repo first.
- Do not make unrelated changes while handling a focused request.
- Do not claim tests, builds, UI checks, or security checks passed unless they actually ran.

## Verification Checklist

- Search for old terms or stale commands.
- Check referenced paths exist.
- Run doc examples when they are cheap and safe.
