---
name: Dependency Upgrader
description: Use when a user asks to update packages, fix dependency warnings, refresh lockfiles, or migrate between library versions.
version: 1.0.0
author: Goldid
license: MIT
tags: [dependencies, upgrade, maintenance]
---

# Dependency Upgrader

## Overview

Upgrade dependencies in any project while managing breaking changes and lockfile consistency.

## When to Use

Use when a user asks to update packages, fix dependency warnings, refresh lockfiles, or migrate between library versions.

## Instructions

1. Identify package manager and lockfile ownership before editing.
2. Read release notes for major upgrades when possible.
3. Update code for breaking changes in the smallest needed area.
4. Avoid unrelated package churn.

## Output Format

Lead with the result. For implementation work, list files changed, checks run, and remaining risk. For review work, lead with findings ordered by severity and include file references when possible.

## Common Pitfalls

- Do not assume project details; inspect the repo first.
- Do not make unrelated changes while handling a focused request.
- Do not claim tests, builds, UI checks, or security checks passed unless they actually ran.

## Verification Checklist

- Run install or lockfile validation.
- Run tests or build for affected packages.
- List packages intentionally upgraded.
