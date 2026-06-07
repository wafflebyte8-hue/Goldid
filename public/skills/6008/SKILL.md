---
name: Performance Profiler
description: Use when a user reports slow startup, lag, high memory, slow queries, expensive builds, or performance regressions.
version: 1.0.0
author: Goldid
license: MIT
tags: [performance, profiling, optimization]
---

# Performance Profiler

## Overview

Find and fix performance bottlenecks in any application with measurement-first changes.

## When to Use

Use when a user reports slow startup, lag, high memory, slow queries, expensive builds, or performance regressions.

## Instructions

1. Measure or identify the hot path before optimizing.
2. Prefer algorithmic, IO, caching, batching, and query improvements before micro-optimizations.
3. Avoid changing behavior while optimizing.
4. Keep benchmarks or timings comparable before and after.

## Output Format

Lead with the result. For implementation work, list files changed, checks run, and remaining risk. For review work, lead with findings ordered by severity and include file references when possible.

## Common Pitfalls

- Do not assume project details; inspect the repo first.
- Do not make unrelated changes while handling a focused request.
- Do not claim tests, builds, UI checks, or security checks passed unless they actually ran.

## Verification Checklist

- Run the benchmark, profile, or timing command used to justify the change.
- Report before/after when available.
- State if performance was inferred rather than measured.
