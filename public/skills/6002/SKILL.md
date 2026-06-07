---
name: Bug Fixer
description: Use when a user reports broken behavior, failing tests, crashes, logs, exceptions, or incorrect output in any project.
version: 1.0.0
author: Goldid
license: MIT
tags: [debugging, fixes, tests]
---

# Bug Fixer

## Overview

Diagnose and fix bugs in any codebase with narrow patches and targeted verification.

## When to Use

Use when a user reports broken behavior, failing tests, crashes, logs, exceptions, or incorrect output in any project.

## Instructions

1. Reproduce or inspect the failure first using logs, tests, or the smallest command available.
2. Trace cause before editing. Avoid speculative rewrites.
3. Patch the narrowest code path that explains the failure.
4. Add or update focused tests when the bug is user-facing or likely to regress.

## Output Format

Lead with the result. For implementation work, list files changed, checks run, and remaining risk. For review work, lead with findings ordered by severity and include file references when possible.

## Common Pitfalls

- Do not assume project details; inspect the repo first.
- Do not make unrelated changes while handling a focused request.
- Do not claim tests, builds, UI checks, or security checks passed unless they actually ran.

## Verification Checklist

- Run the failing test or reproduction again.
- Run a nearby regression check.
- Explain the root cause and the fix in plain terms.
