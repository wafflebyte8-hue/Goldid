---
name: GolDid Skill Publisher
description: Use when a user wants to add, publish, update, validate, or list skills in the GolDid public skill marketplace.
version: 1.0.0
author: Goldid
license: MIT
tags: [skills, marketplace, website]
---

# GolDid Skill Publisher

## Overview

Publish GolDid skills with registry entries, detail pages, install commands, and metadata files.

## When to Use

Use when a user wants to add, publish, update, validate, or list skills in the GolDid public skill marketplace.

## Instructions

1. Every public skill needs a folder containing SKILL.md, Version.js, and index.html.
2. Update public/skills/registry.json with id, name, description, author, version, tags, pageUrl, skillUrl, and versionUrl.
3. Keep Version.js metadata parseable as a metadata object; do not rely on executing arbitrary code.
4. Make install commands match the assigned id on the detail page.
5. Prefer narrow, native GolDid skills over generic filler.

## Output Format

Lead with the result or highest-risk finding. Then list changed files, exact checks run, and any remaining unverified behavior. Keep the final answer concise and actionable.

## Common Pitfalls

- Do not invent GolDid behavior; inspect the repo first.
- Do not make unrelated refactors while fixing a narrow issue.
- Do not overwrite user data, private config, sessions, memory, or ignored local notes without explicit permission.

## Verification Checklist

- Parse public/skills/registry.json as JSON.
- Check every registry pageUrl, skillUrl, and versionUrl exists.
- Route-test /skills/<id>/ when a static server is available.
