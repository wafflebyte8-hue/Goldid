---
name: GolDid Release Captain
description: Use when a user asks to bump GolDid version numbers, prepare a release, update release documentation, or align visible version text.
version: 1.0.0
author: Goldid
license: MIT
tags: [release, versioning, docs]
---

# GolDid Release Captain

## Overview

Perform GolDid version bumps, release notes, package metadata, docs, and visible UI version updates.

## When to Use

Use when a user asks to bump GolDid version numbers, prepare a release, update release documentation, or align visible version text.

## Instructions

1. Search the whole repo for the old version before editing.
2. Update package.json, package-lock.json, runtime constants, docs, website text, desktop text, and installer metadata where applicable.
3. Follow any local versioning notes if present and intentionally ignored by git.
4. Keep release notes factual and tied to actual changes.

## Output Format

Lead with the result or highest-risk finding. Then list changed files, exact checks run, and any remaining unverified behavior. Keep the final answer concise and actionable.

## Common Pitfalls

- Do not invent GolDid behavior; inspect the repo first.
- Do not make unrelated refactors while fixing a narrow issue.
- Do not overwrite user data, private config, sessions, memory, or ignored local notes without explicit permission.

## Verification Checklist

- Search for the previous version after editing.
- Run syntax checks for touched JavaScript.
- Confirm package-lock remains valid JSON.
