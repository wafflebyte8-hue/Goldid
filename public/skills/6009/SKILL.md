---
name: Refactor Planner
description: Use when a user wants cleanup, decomposition, simplification, architecture improvements, or technical debt reduction.
version: 1.0.0
author: Goldid
license: MIT
tags: [refactor, architecture, maintainability]
---

# Refactor Planner

## Overview

Plan or execute safe refactors in any codebase without changing behavior.

## When to Use

Use when a user wants cleanup, decomposition, simplification, architecture improvements, or technical debt reduction.

## Instructions

1. Define the behavior that must remain unchanged.
2. Find tests or add characterization tests for risky code.
3. Refactor in small reversible steps.
4. Avoid mixing refactors with unrelated feature changes.

## Output Format

Lead with the result. For implementation work, list files changed, checks run, and remaining risk. For review work, lead with findings ordered by severity and include file references when possible.

## Common Pitfalls

- Do not assume project details; inspect the repo first.
- Do not make unrelated changes while handling a focused request.
- Do not claim tests, builds, UI checks, or security checks passed unless they actually ran.

## Verification Checklist

- Run tests covering the touched behavior.
- Search for old API names after renames.
- Summarize any behavior intentionally changed.
