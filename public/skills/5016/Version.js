"use strict";

// GolDid normalized skill metadata.
// IMPORTANT: this file is parsed as JSON, so every key MUST be double-quoted,
// with no comments inside the object and no trailing commas.
module.exports = {
  "Author": "Goldid",
  "Name": "GolDid Regression Tester",
  "Description": "Plan and run targeted GolDid regression checks after code, UI, prompt, provider, or packaging changes.",
  "Usage": "Use when a user asks to test GolDid, verify changes, build a regression checklist, or avoid breaking existing CLI, desktop, provider, prompt, and website behavior.",
  "Model_tested": ["gpt-5","claude-sonnet"]
};
