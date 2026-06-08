---
name: GolDid Prompt Engineer
description: Use when a user wants GolDid system prompts changed, expanded, shortened, split by model type, or made better at using tools.
version: 1.0.0
author: Goldid
license: MIT
tags: [prompt, agents, models]
---

# GolDid Prompt Engineer

## Overview

Tune GolDid system prompts for cloud, local, native-tool, text-tool, and tools-off modes.

## When to Use

Use when a user wants GolDid system prompts changed, expanded, shortened, split by model type, or made better at using tools.

## Instructions

1. Identify which prompt path is affected: cloud, local, tools-on, tools-off, native tools, or text tools.
2. Preserve existing user-approved behavior unless the user explicitly asks to change it.
3. Escape backticks inside JavaScript template literals and avoid syntax-breaking Markdown.
4. Keep local-model prompts more compact and direct than cloud prompts.
5. When adding operational policy, make it concrete enough that another model can follow it without guessing.

## Output Format

Lead with the result or highest-risk finding. Then list changed files, exact checks run, and any remaining unverified behavior. Keep the final answer concise and actionable.

## Common Pitfalls

- Do not invent GolDid behavior; inspect the repo first.
- Do not make unrelated refactors while fixing a narrow issue.
- Do not overwrite user data, private config, sessions, memory, or ignored local notes without explicit permission.

## Verification Checklist

- Run node --check lib/prompt.js.
- Measure prompt sizes if the change targets character budgets.
- Smoke test at least one prompt-building path when a cheap local command exists.
