---
name: Release Notes Writer
description: Use when a user asks for release notes, changelog entries, upgrade notes, or summaries of changes between versions.
version: 1.0.0
author: Goldid
license: MIT
tags: [release, changelog, communication]
---

# Release Notes Writer

## Overview

Create release notes, changelogs, migration notes, and upgrade summaries for any project.

## When to Use

Use when a user asks for release notes, changelog entries, upgrade notes, or summaries of changes between versions.

## Instructions

1. Base notes on actual commits, diffs, PRs, or changed files.
2. Group by user-facing features, fixes, breaking changes, docs, and internal maintenance.
3. Keep wording factual and useful to users.
4. Call out migration steps and known issues when present.

## Output Format

Lead with the result. For implementation work, list files changed, checks run, and remaining risk. For review work, lead with findings ordered by severity and include file references when possible.

## Common Pitfalls

- Do not assume project details; inspect the repo first.
- Do not make unrelated changes while handling a focused request.
- Do not claim tests, builds, UI checks, or security checks passed unless they actually ran.

## Verification Checklist

- Check version numbers and dates.
- Confirm breaking changes from code or docs.
- Avoid claiming unreleased work shipped.
