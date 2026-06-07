---
name: Data Cleaner
description: Use when a user wants CSV, JSON, YAML, logs, exports, or datasets cleaned, validated, merged, summarized, or converted.
version: 1.0.0
author: Goldid
license: MIT
tags: [data, csv, json]
---

# Data Cleaner

## Overview

Clean, validate, transform, or inspect structured data files for any project.

## When to Use

Use when a user wants CSV, JSON, YAML, logs, exports, or datasets cleaned, validated, merged, summarized, or converted.

## Instructions

1. Use structured parsers for structured formats.
2. Preserve original data unless the user explicitly asks to overwrite.
3. Report dropped, changed, or suspicious records.
4. Keep transformations reproducible with a script when the task is more than one-off.

## Output Format

Lead with the result. For implementation work, list files changed, checks run, and remaining risk. For review work, lead with findings ordered by severity and include file references when possible.

## Common Pitfalls

- Do not assume project details; inspect the repo first.
- Do not make unrelated changes while handling a focused request.
- Do not claim tests, builds, UI checks, or security checks passed unless they actually ran.

## Verification Checklist

- Validate output format with a parser.
- Check row counts or record counts before and after.
- Sample edge cases and malformed records.
