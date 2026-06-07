---
name: Accessibility Checker
description: Use when a user asks for accessibility review, keyboard support, screen reader behavior, color contrast, labels, or semantic markup.
version: 1.0.0
author: Goldid
license: MIT
tags: [accessibility, a11y, ui]
---

# Accessibility Checker

## Overview

Audit and improve accessibility in any web, desktop, or mobile interface.

## When to Use

Use when a user asks for accessibility review, keyboard support, screen reader behavior, color contrast, labels, or semantic markup.

## Instructions

1. Check keyboard navigation, focus visibility, labels, headings, landmarks, contrast, and reduced-motion concerns.
2. Prefer semantic controls over div-based controls.
3. Do not rely on color alone for state.
4. Keep accessibility fixes aligned with existing UI patterns.

## Output Format

Lead with the result. For implementation work, list files changed, checks run, and remaining risk. For review work, lead with findings ordered by severity and include file references when possible.

## Common Pitfalls

- Do not assume project details; inspect the repo first.
- Do not make unrelated changes while handling a focused request.
- Do not claim tests, builds, UI checks, or security checks passed unless they actually ran.

## Verification Checklist

- Run available accessibility tooling when configured.
- Manually reason through keyboard order.
- Call out any screen-reader behavior not verified.
