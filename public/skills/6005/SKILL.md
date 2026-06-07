---
name: API Designer
description: Use when a user asks for endpoint design, request/response schemas, SDK shape, backward compatibility, or API review.
version: 1.0.0
author: Goldid
license: MIT
tags: [api, contracts, backend]
---

# API Designer

## Overview

Design, review, or improve APIs for any backend, library, service, or integration.

## When to Use

Use when a user asks for endpoint design, request/response schemas, SDK shape, backward compatibility, or API review.

## Instructions

1. Clarify resources, operations, auth, errors, pagination, idempotency, and versioning.
2. Prefer boring, predictable contracts over clever abstractions.
3. Account for compatibility and migration paths.
4. Document examples for common success and failure cases.

## Output Format

Lead with the result. For implementation work, list files changed, checks run, and remaining risk. For review work, lead with findings ordered by severity and include file references when possible.

## Common Pitfalls

- Do not assume project details; inspect the repo first.
- Do not make unrelated changes while handling a focused request.
- Do not claim tests, builds, UI checks, or security checks passed unless they actually ran.

## Verification Checklist

- Check existing API conventions in the repo.
- Validate schema examples when tooling exists.
- Call out breaking changes explicitly.
