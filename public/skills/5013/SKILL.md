---
name: GolDid Packaging Inspector
description: Use when a user asks about packaging, app icons, npm metadata, Electron build output, package-lock drift, or release artifacts.
version: 1.0.0
author: Goldid
license: MIT
tags: [packaging, electron, npm]
---

# GolDid Packaging Inspector

## Overview

Check GolDid npm, Electron, assets, icons, package files, and generated distributables.

## When to Use

Use when a user asks about packaging, app icons, npm metadata, Electron build output, package-lock drift, or release artifacts.

## Instructions

1. Inspect package.json scripts, package-lock, desktop assets, icons, and platform-specific resources.
2. For icon problems, preserve the intended logo and fix resolution, alpha, color accuracy, and multi-size container formats.
3. Avoid redesigning branding when the user reports packaging or color fidelity issues.
4. Keep generated artifacts out of git unless the repo already tracks them.

## Output Format

Lead with the result or highest-risk finding. Then list changed files, exact checks run, and any remaining unverified behavior. Keep the final answer concise and actionable.

## Common Pitfalls

- Do not invent GolDid behavior; inspect the repo first.
- Do not make unrelated refactors while fixing a narrow issue.
- Do not overwrite user data, private config, sessions, memory, or ignored local notes without explicit permission.

## Verification Checklist

- Run node/package syntax checks.
- Inspect image dimensions or icon entries when changing assets.
- Build only when dependencies and time make it practical; otherwise say what was not built.
