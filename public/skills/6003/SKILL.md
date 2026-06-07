---
name: Test Builder
description: Use when a user asks to add tests, improve coverage, protect a bug fix, or design regression checks.
version: 1.0.0
author: Goldid
license: MIT
tags: [testing, qa, coverage]
---

# Test Builder

## Overview

Add focused tests for any project using the existing test framework and local conventions.

## When to Use

Use when a user asks to add tests, improve coverage, protect a bug fix, or design regression checks.

## Instructions

1. Discover the project test framework and copy nearby patterns.
2. Test behavior, not implementation details, unless the project already tests internals.
3. Keep fixtures small and deterministic.
4. Cover success, failure, and edge cases proportional to risk.

## Output Format

Lead with the result. For implementation work, list files changed, checks run, and remaining risk. For review work, lead with findings ordered by severity and include file references when possible.

## Common Pitfalls

- Do not assume project details; inspect the repo first.
- Do not make unrelated changes while handling a focused request.
- Do not claim tests, builds, UI checks, or security checks passed unless they actually ran.

## Verification Checklist

- Run the new tests directly.
- Run the smallest related test suite if practical.
- Mention skipped or unavailable test commands.
