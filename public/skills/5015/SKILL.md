---
name: GolDid Web Search Integrator
description: Use when a user asks to add, debug, or refine GolDid web search, browsing, source attribution, or freshness-sensitive answers.
version: 1.0.0
author: Goldid
license: MIT
tags: [web, search, sources]
---

# GolDid Web Search Integrator

## Overview

Improve GolDid web-search behavior, source handling, freshness checks, and citation discipline.

## When to Use

Use when a user asks to add, debug, or refine GolDid web search, browsing, source attribution, or freshness-sensitive answers.

## Instructions

1. Browse when information may have changed, when the user asks for latest/current, or when source links are needed.
2. Prefer primary sources for technical, legal, financial, medical, or product-specific facts.
3. Keep quotes short and summarize instead of copying long passages.
4. Make source use visible in final answers when web results informed the response.

## Output Format

Lead with the result or highest-risk finding. Then list changed files, exact checks run, and any remaining unverified behavior. Keep the final answer concise and actionable.

## Common Pitfalls

- Do not invent GolDid behavior; inspect the repo first.
- Do not make unrelated refactors while fixing a narrow issue.
- Do not overwrite user data, private config, sessions, memory, or ignored local notes without explicit permission.

## Verification Checklist

- Run provider/tool syntax checks after code changes.
- Smoke test a harmless search path when possible.
- Check failure behavior for offline or no-results cases.
