---
name: GolDid Desktop Launcher Fixer
description: Use when a user reports that the GolDid desktop app does not launch, crashes on startup, or opens differently across operating systems.
version: 1.0.0
author: Goldid
license: MIT
tags: [desktop, electron, linux]
---

# GolDid Desktop Launcher Fixer

## Overview

Fix GolDid desktop launch failures across Linux, Windows, and macOS packaging paths.

## When to Use

Use when a user reports that the GolDid desktop app does not launch, crashes on startup, or opens differently across operating systems.

## Instructions

1. Read desktop logs first, especially ~/.goldid/desktop.log on Linux.
2. Check desktop/main.js, desktop/launch.js, setup scripts, .desktop entries, working directories, Electron flags, and packaged resource paths.
3. For Linux, verify sandbox, GPU, GTK, executable permissions, quoted Exec values, and Path fields.
4. Do not hide launch failures; add logging or diagnostics when the desktop window exits before rendering.

## Output Format

Lead with the result or highest-risk finding. Then list changed files, exact checks run, and any remaining unverified behavior. Keep the final answer concise and actionable.

## Common Pitfalls

- Do not invent GolDid behavior; inspect the repo first.
- Do not make unrelated refactors while fixing a narrow issue.
- Do not overwrite user data, private config, sessions, memory, or ignored local notes without explicit permission.

## Verification Checklist

- Run syntax checks on touched JavaScript files.
- Run bash -n for shell launch/setup/uninstall scripts.
- If a GUI cannot be launched in the current environment, say that directly and provide the exact log path to recheck.
