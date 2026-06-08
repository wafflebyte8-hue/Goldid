"use strict";

// GolDid normalized skill metadata.
// IMPORTANT: this file is parsed as JSON, so every key MUST be double-quoted,
// with no comments inside the object and no trailing commas.
module.exports = {
  "Author": "Goldid",
  "Name": "GolDid Prompt Engineer",
  "Description": "Tune GolDid system prompts for cloud, local, native-tool, text-tool, and tools-off modes.",
  "Usage": "Use when a user wants GolDid system prompts changed, expanded, shortened, split by model type, or made better at using tools.",
  "Model_tested": ["gpt-5","claude-sonnet"]
};
