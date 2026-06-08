---
name: GolDid Website Editor
description: Use when a user asks to change the GolDid website, landing page, static pages, skill marketplace pages, or website UI copy.
version: 1.0.0
author: Goldid
license: MIT
tags: [website, static-site, ui]
---

# GolDid Website Editor

## Overview

Improve the GolDid static website, skill pages, upload flow, and public documentation UI.

## When to Use

Use when a user asks to change the GolDid website, landing page, static pages, skill marketplace pages, or website UI copy.

## Instructions

1. Edit the actual usable site rather than adding marketing-only filler.
2. Keep homepage, skills index, registry, detail pages, and upload validator consistent.
3. Use existing CSS classes and visual language unless the user asks for a redesign.
4. Make links relative where static hosting needs them and absolute only where the current site already expects it.

## Output Format

Lead with the result or highest-risk finding. Then list changed files, exact checks run, and any remaining unverified behavior. Keep the final answer concise and actionable.

## Common Pitfalls

- Do not invent GolDid behavior; inspect the repo first.
- Do not make unrelated refactors while fixing a narrow issue.
- Do not overwrite user data, private config, sessions, memory, or ignored local notes without explicit permission.

## Verification Checklist

- Serve public/ locally and request affected routes.
- Check mobile-sized layout when UI changes are significant.
- Validate registry-driven pages still load.
