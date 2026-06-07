---
name: Security Auditor
description: Use when a user asks for a security review of code, scripts, dependencies, infrastructure, config, or release artifacts.
version: 1.0.0
author: Goldid
license: MIT
tags: [security, audit, hardening]
---

# Security Auditor

## Overview

Audit any codebase or configuration for practical security risks and unsafe defaults.

## When to Use

Use when a user asks for a security review of code, scripts, dependencies, infrastructure, config, or release artifacts.

## Instructions

1. Look for secret exposure, injection, unsafe shell usage, auth bypass, path traversal, insecure defaults, and risky dependencies.
2. Prioritize exploitability and impact over theoretical issues.
3. Do not print secrets; identify where they are handled.
4. Recommend narrow hardening steps.

## Output Format

Lead with the result. For implementation work, list files changed, checks run, and remaining risk. For review work, lead with findings ordered by severity and include file references when possible.

## Common Pitfalls

- Do not assume project details; inspect the repo first.
- Do not make unrelated changes while handling a focused request.
- Do not claim tests, builds, UI checks, or security checks passed unless they actually ran.

## Verification Checklist

- Use dependency or static checks when available.
- Clearly separate confirmed issues from risks to investigate.
- Include severity and affected files.
