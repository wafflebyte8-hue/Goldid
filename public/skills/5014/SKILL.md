---
name: GolDid Local Model Tuner
description: Use when a user is configuring or debugging local models, local provider timeouts, small-model prompt behavior, or local endpoint compatibility.
version: 1.0.0
author: Goldid
license: MIT
tags: [local-models, ollama, lmstudio]
---

# GolDid Local Model Tuner

## Overview

Tune GolDid behavior for Ollama, LM Studio, vLLM, llama.cpp, and other local model servers.

## When to Use

Use when a user is configuring or debugging local models, local provider timeouts, small-model prompt behavior, or local endpoint compatibility.

## Instructions

1. Keep local prompts compact and direct.
2. Expect smaller models to over-read, miss tool boundaries, or need more explicit step ordering.
3. Check base URL, model id, model-list endpoint, chat endpoint, stream format, and timeout separately.
4. Prefer robust local defaults over cloud-provider assumptions.

## Output Format

Lead with the result or highest-risk finding. Then list changed files, exact checks run, and any remaining unverified behavior. Keep the final answer concise and actionable.

## Common Pitfalls

- Do not invent GolDid behavior; inspect the repo first.
- Do not make unrelated refactors while fixing a narrow issue.
- Do not overwrite user data, private config, sessions, memory, or ignored local notes without explicit permission.

## Verification Checklist

- Run a model-list or health check when the server is available.
- Confirm timeout constants and docs agree.
- If no local server is running, verify syntax and describe the exact manual smoke test.
