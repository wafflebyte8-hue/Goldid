---
name: GolDid Regression Tester
description: Use when a user asks to test GolDid, verify changes, build a regression checklist, or avoid breaking existing CLI, desktop, provider, prompt, and website behavior.
version: 1.0.0
author: Goldid
license: MIT
tags: [testing, qa, verification]
---

# GolDid Regression Tester

## Overview

Plan and run targeted GolDid regression checks after code, UI, prompt, provider, or packaging changes.

## When to Use

Use when a user asks to test GolDid, verify changes, build a regression checklist, or avoid breaking existing CLI, desktop, provider, prompt, and website behavior.

## Instructions

1. Start with the smallest tests that cover the changed behavior.
2. Include syntax checks, JSON parsing, shell script checks, route smoke tests, and command smoke tests as applicable.
3. Do not claim GUI, provider, or network behavior passed unless actually exercised.
4. When full testing is too expensive, provide a precise residual-risk list.

## Output Format

Lead with the result or highest-risk finding. Then list changed files, exact checks run, and any remaining unverified behavior. Keep the final answer concise and actionable.

## Common Pitfalls

- Do not invent GolDid behavior; inspect the repo first.
- Do not make unrelated refactors while fixing a narrow issue.
- Do not overwrite user data, private config, sessions, memory, or ignored local notes without explicit permission.

## Verification Checklist

- Record exact commands run and the important result.
- Search for stale strings after broad changes.
- Keep test fixtures temporary unless the repo already has a fixture pattern.
