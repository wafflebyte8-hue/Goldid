---
name: GolDid Installer Maintainer
description: Use when a user asks to fix setup.sh, uninstall.sh, install scripts, desktop integration, PATH setup, or cleanup behavior.
version: 1.0.0
author: Goldid
license: MIT
tags: [installer, setup, uninstall]
---

# GolDid Installer Maintainer

## Overview

Maintain GolDid setup, uninstall, desktop entries, PATH shims, permissions, and data-retention behavior.

## When to Use

Use when a user asks to fix setup.sh, uninstall.sh, install scripts, desktop integration, PATH setup, or cleanup behavior.

## Instructions

1. Keep uninstallers conservative: preserve user data by default, require explicit remove-data flags, and refuse dangerous target paths.
2. Handle paths with spaces and quote shell variables.
3. Update Linux desktop entries, chmod behavior, shim creation, and profile blocks together when needed.
4. Make scripts idempotent so repeated setup or uninstall runs do not corrupt the install.

## Output Format

Lead with the result or highest-risk finding. Then list changed files, exact checks run, and any remaining unverified behavior. Keep the final answer concise and actionable.

## Common Pitfalls

- Do not invent GolDid behavior; inspect the repo first.
- Do not make unrelated refactors while fixing a narrow issue.
- Do not overwrite user data, private config, sessions, memory, or ignored local notes without explicit permission.

## Verification Checklist

- Run bash -n on touched shell scripts.
- Check generated desktop entries for quoted Exec and Path values.
- Confirm user-data removal is opt-in.
