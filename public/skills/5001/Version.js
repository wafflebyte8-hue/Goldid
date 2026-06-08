"use strict";

// GolDid normalized skill metadata.
// IMPORTANT: this file is parsed as JSON, so every key MUST be double-quoted,
// with no comments inside the object and no trailing commas.
module.exports = {
  "Author": "Goldid",
  "Name": "GolDid Provider Doctor",
  "Description": "Diagnose GolDid provider setup, model listing, API keys, local endpoints, and timeout issues.",
  "Usage": "Use when a user needs to debug GolDid model providers, API key setup, model discovery, local provider endpoints, or chat timeout behavior.",
  "Model_tested": ["gpt-5","claude-sonnet"]
};
