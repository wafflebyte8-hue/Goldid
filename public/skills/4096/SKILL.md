---
name: Security Checker
description: Use when a user wants code, configuration, scripts, dependencies, or release artifacts checked for practical security risks.
version: 1.0.0
author: GolDid
license: MIT
tags: [security, audit, hardening]
---

# Security Checker

## Overview

Use this skill to inspect a project for practical security risks and unsafe
defaults. Focus on issues that could expose secrets, execute unintended commands,
weaken authentication, corrupt data, or ship unsafe behavior.

## When to Use

- The user asks for a security review or audit.
- The user asks whether a script, installer, desktop app, CLI, or API path is
  safe.
- The user provides logs or code that may involve secrets, shell commands,
  sandboxing, permissions, or network calls.
- The user asks to harden a project before release.

Do not use for purely stylistic code review unless a security risk is involved.

## Inputs

- Repository root or target files.
- The user's threat model, if stated.
- Relevant logs, scripts, config files, API code, or installer code.

## Instructions

1. Define the scope. Identify what will and will not be reviewed.
2. Inspect high-risk surfaces first:
   - secret storage and logging
   - shell command construction
   - file write/delete/move behavior
   - installer/uninstaller scripts
   - authentication and API key handling
   - network requests and update paths
   - desktop preload/IPC boundaries
   - sandbox and permission settings
3. Search for risky patterns:
   - hardcoded secrets
   - tokens printed to logs
   - unquoted shell paths
   - command injection
   - path traversal
   - broad recursive deletion
   - unsafe HTML injection
   - disabled security flags without justification
   - missing approval for machine-affecting actions
4. Prioritize findings by severity:
   - Critical: likely secret exposure, code execution, destructive action, or auth
     bypass.
   - High: realistic exploit path or dangerous default.
   - Medium: defense weakness or platform-specific risk.
   - Low: hygiene issue with limited impact.
5. For each finding, include evidence, impact, and a narrow fix.
6. If asked to implement fixes, patch only the relevant files and run targeted
   checks.

## Tools

- `search_text` for risky patterns.
- `read_file` for source/config/script inspection.
- `list_dir` / `find_files` to identify security-relevant files.
- `shell` for dependency or syntax checks when approved.

## Output Format

Lead with findings:

- Severity
- File/path
- Evidence
- Impact
- Recommended fix

Then include:

- Scope reviewed.
- Checks run.
- Remaining gaps or assumptions.

If there are no findings, say that clearly and list the remaining residual risk.

## Common Pitfalls

- Reporting vague "best practices" without evidence.
- Ignoring installer and updater scripts.
- Printing secrets in the review.
- Treating sandboxing as a substitute for safe commands.
- Missing desktop preload/renderer boundaries.

## Verification Checklist

- [ ] Secrets are not printed or stored unsafely.
- [ ] Shell commands quote paths and avoid untrusted interpolation.
- [ ] Destructive filesystem operations validate targets.
- [ ] HTML/Markdown rendering sanitizes user/model content.
- [ ] Desktop IPC exposes only narrow named functions.
- [ ] Installers/uninstallers preserve personal data by default.
- [ ] Update paths verify expected sources and handle failure clearly.
