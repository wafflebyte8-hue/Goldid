---
name: Code Reviewer
description: Use when a user wants a practical code review for any repository, pull request, patch, or changed files.
version: 1.0.0
author: Goldid
license: MIT
tags: [review, quality, bugs]
---

# Code Reviewer

## Overview

Review any software project for bugs, regressions, maintainability risks, and missing tests.

## When to Use

Use when a user wants a practical code review for any repository, pull request, patch, or changed files.

## Instructions

1. Inspect the changed files and surrounding code before forming findings.
2. Prioritize real defects, regressions, security risks, data loss, and missing tests over style opinions.
3. Give file and line references where possible.
4. Keep findings ordered by severity and include concise fixes when clear.

## Output Format

Lead with the result. For implementation work, list files changed, checks run, and remaining risk. For review work, lead with findings ordered by severity and include file references when possible.

## Common Pitfalls

- Do not assume project details; inspect the repo first.
- Do not make unrelated changes while handling a focused request.
- Do not claim tests, builds, UI checks, or security checks passed unless they actually ran.

## Verification Checklist

- Run existing targeted tests when available.
- State any unverified runtime behavior.
- Do not claim a bug exists unless the code path supports it.
