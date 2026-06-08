---
name: GolDid Provider Doctor
description: Use when a user needs to debug GolDid model providers, API key setup, model discovery, local provider endpoints, or chat timeout behavior.
version: 1.0.0
author: Goldid
license: MIT
tags: [providers, debugging, config]
---

# GolDid Provider Doctor

## Overview

Diagnose GolDid provider setup, model listing, API keys, local endpoints, and timeout issues.

## When to Use

Use when a user needs to debug GolDid model providers, API key setup, model discovery, local provider endpoints, or chat timeout behavior.

## Instructions

1. Inspect provider settings, environment variables, config files, and selected model names before changing code.
2. Separate cloud-provider failures from local-provider failures by checking auth, base URLs, health endpoints, model-list endpoints, and chat endpoints.
3. For local providers, check whether Ollama, LM Studio, vLLM, or another service is running and whether GolDid uses the right host and port.
4. When changing timeout behavior, update provider code, docs, and any visible settings text together.

## Output Format

Lead with the result or highest-risk finding. Then list changed files, exact checks run, and any remaining unverified behavior. Keep the final answer concise and actionable.

## Common Pitfalls

- Do not invent GolDid behavior; inspect the repo first.
- Do not make unrelated refactors while fixing a narrow issue.
- Do not overwrite user data, private config, sessions, memory, or ignored local notes without explicit permission.

## Verification Checklist

- Run a model-listing command or provider smoke test when available.
- Confirm local and cloud paths still use their intended timeout values.
- Document any provider that could not be verified because credentials or a local server were unavailable.
