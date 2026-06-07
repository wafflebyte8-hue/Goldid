---
name: UI Auditor
description: Use when a user asks to polish, review, redesign, or fix usability issues in any application interface.
version: 1.0.0
author: Goldid
license: MIT
tags: [ui, ux, frontend]
---

# UI Auditor

## Overview

Review or improve any web or desktop UI for hierarchy, spacing, responsiveness, and usability.

## When to Use

Use when a user asks to polish, review, redesign, or fix usability issues in any application interface.

## Instructions

1. Inspect existing UI patterns before proposing changes.
2. Improve hierarchy, spacing, contrast, empty states, focus states, and responsive behavior.
3. Keep operational tools dense and scannable; avoid decorative clutter.
4. Check that text and controls do not overlap at common viewport sizes.

## Output Format

Lead with the result. For implementation work, list files changed, checks run, and remaining risk. For review work, lead with findings ordered by severity and include file references when possible.

## Common Pitfalls

- Do not assume project details; inspect the repo first.
- Do not make unrelated changes while handling a focused request.
- Do not claim tests, builds, UI checks, or security checks passed unless they actually ran.

## Verification Checklist

- Run the UI if possible.
- Use screenshots or route checks for meaningful visual changes.
- Mention any viewport or interaction not verified.
