---
name: Repo Onboarding
description: Use when a user asks to understand a new codebase, summarize project structure, find entry points, or get setup instructions.
version: 1.0.0
author: Goldid
license: MIT
tags: [onboarding, analysis, setup]
---

# Repo Onboarding

## Overview

Map any unfamiliar repository and explain how to build, test, run, and safely change it.

## When to Use

Use when a user asks to understand a new codebase, summarize project structure, find entry points, or get setup instructions.

## Instructions

1. Inspect file tree, package manifests, scripts, docs, and obvious entry points.
2. Summarize architecture by ownership and runtime path, not by listing every file.
3. Identify build, test, lint, and run commands.
4. Call out risks, missing docs, and likely next files to read.

## Output Format

Lead with the result. For implementation work, list files changed, checks run, and remaining risk. For review work, lead with findings ordered by severity and include file references when possible.

## Common Pitfalls

- Do not assume project details; inspect the repo first.
- Do not make unrelated changes while handling a focused request.
- Do not claim tests, builds, UI checks, or security checks passed unless they actually ran.

## Verification Checklist

- Run non-destructive discovery commands.
- Check that referenced scripts exist.
- Avoid guessing framework behavior when manifests can be read.
