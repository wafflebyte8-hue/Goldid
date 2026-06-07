---
name: CI Debugger
description: Use when a user provides failing CI logs, build errors, workflow files, or asks why automation is failing.
version: 1.0.0
author: Goldid
license: MIT
tags: [ci, devops, automation]
---

# CI Debugger

## Overview

Debug failing CI pipelines, build jobs, tests, and automation in any project.

## When to Use

Use when a user provides failing CI logs, build errors, workflow files, or asks why automation is failing.

## Instructions

1. Read the failing job log and workflow config first.
2. Identify the first meaningful error rather than the final cascade.
3. Separate environment problems from code failures.
4. Patch narrowly and preserve existing pipeline intent.

## Output Format

Lead with the result. For implementation work, list files changed, checks run, and remaining risk. For review work, lead with findings ordered by severity and include file references when possible.

## Common Pitfalls

- Do not assume project details; inspect the repo first.
- Do not make unrelated changes while handling a focused request.
- Do not claim tests, builds, UI checks, or security checks passed unless they actually ran.

## Verification Checklist

- Run equivalent local commands when practical.
- Validate YAML or scripts after editing.
- Mention anything only CI can verify.
