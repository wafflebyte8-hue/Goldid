---
name: GolDid UI Polisher
description: Use when a user asks to upgrade, polish, fix, or redesign GolDid UI in the desktop app or website.
version: 1.0.0
author: Goldid
license: MIT
tags: [ui, desktop, accessibility]
---

# GolDid UI Polisher

## Overview

Upgrade GolDid desktop or web UI spacing, hierarchy, contrast, states, and responsive behavior.

## When to Use

Use when a user asks to upgrade, polish, fix, or redesign GolDid UI in the desktop app or website.

## Instructions

1. Start from the existing UI system and improve density, hierarchy, spacing, contrast, keyboard focus, empty states, and responsiveness.
2. Avoid decorative noise that makes operational tools harder to scan.
3. Keep controls familiar: icons for actions, toggles for binary settings, inputs for numbers, tabs for views, and menus for option sets.
4. Check that text fits inside buttons, cards, and compact panels on small screens.

## Output Format

Lead with the result or highest-risk finding. Then list changed files, exact checks run, and any remaining unverified behavior. Keep the final answer concise and actionable.

## Common Pitfalls

- Do not invent GolDid behavior; inspect the repo first.
- Do not make unrelated refactors while fixing a narrow issue.
- Do not overwrite user data, private config, sessions, memory, or ignored local notes without explicit permission.

## Verification Checklist

- Run the app or static site when practical.
- Use screenshots or route checks for substantial UI changes.
- Search CSS for one-note palette drift when doing broad redesigns.
