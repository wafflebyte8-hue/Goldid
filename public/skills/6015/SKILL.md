---
name: Migration Planner
description: Use when a user wants a migration plan, phased rollout, compatibility strategy, or risk assessment.
version: 1.0.0
author: Goldid
license: MIT
tags: [migration, planning, architecture]
---

# Migration Planner

## Overview

Plan migrations between frameworks, libraries, providers, data formats, or architectures for any project.

## When to Use

Use when a user wants a migration plan, phased rollout, compatibility strategy, or risk assessment.

## Instructions

1. Inventory current usage and constraints first.
2. Split migration into reversible phases with verification gates.
3. Identify data, API, config, deployment, and user-impact risks.
4. Prefer coexistence and adapters when big-bang replacement is risky.

## Output Format

Lead with the result. For implementation work, list files changed, checks run, and remaining risk. For review work, lead with findings ordered by severity and include file references when possible.

## Common Pitfalls

- Do not assume project details; inspect the repo first.
- Do not make unrelated changes while handling a focused request.
- Do not claim tests, builds, UI checks, or security checks passed unless they actually ran.

## Verification Checklist

- Point to files or commands used for inventory.
- Include rollback and validation steps.
- Mark unknowns that require testing or stakeholder decisions.
