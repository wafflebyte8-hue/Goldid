---
name: Skill Creator
description: Use when a user wants to create, update, publish, validate, or document a GolDid skill.
version: 1.0.0
author: Goldid
license: MIT
tags: [skills, documentation, metadata]
---

# Skill Creator

## Overview

Use this skill to create or improve portable GolDid skills. The goal is a skill
folder that another model can reliably discover, load, and follow.

## When to Use

- The user asks to create a new skill.
- The user asks to update an existing skill.
- The user asks to publish a skill to the public registry.
- The user asks whether a `SKILL.md` / `Version.js` pair is valid.

Do not use when the user only asks how to run an already installed skill.

## Inputs

- The intended skill name or topic.
- The target audience and trigger conditions.
- Any existing `SKILL.md`, `Version.js`, registry entry, or page.
- Whether the skill is local-only or public.

## Instructions

1. Clarify the skill's trigger: write when to use it and when not to use it.
2. Choose a stable kebab-case folder slug.
3. Write `SKILL.md` with YAML frontmatter:
   - `name`
   - `description`
   - `version`
   - `author`
   - `license`
   - `tags`
4. Make the description concrete. It should be discoverable from the skills
   catalog without opening the full body.
5. Write a body with:
   - Overview
   - When to Use
   - Inputs
   - Instructions
   - Tools
   - Output Format
   - Common Pitfalls
   - Verification Checklist
6. Write `Version.js` with double-quoted keys. GolDid parses this file as
   metadata and does not execute it.
7. If publishing publicly, add a registry entry and a skill page under
   `public/skills/<id>/`.
8. Verify the skill can be loaded and the install command uses the assigned id.

## Tools

- `search_text` and `find_files` to locate existing skills.
- `read_file` to inspect templates and registry entries.
- `write_file` or local edits to create skill files.
- `shell` for syntax/static checks when useful.

## Output Format

Summarize:

- Skill name and id/slug.
- Files created or updated.
- Trigger description.
- Verification performed.
- Any manual publishing step.

## Common Pitfalls

- Vague descriptions that do not tell the model when to load the skill.
- Missing or invalid frontmatter.
- `Version.js` with unquoted keys.
- Forgetting to update `registry.json` for public skills.
- Creating a skill that is too broad to be useful.

## Verification Checklist

- [ ] `SKILL.md` starts with valid YAML frontmatter.
- [ ] Description has concrete triggers.
- [ ] `Version.js` uses double-quoted keys.
- [ ] Public registry entry points to the correct files.
- [ ] Skill page install command matches the assigned id.
