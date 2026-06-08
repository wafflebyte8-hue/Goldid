"use strict";

// GolDid normalized skill metadata.
// IMPORTANT: this file is parsed as JSON, so every key MUST be double-quoted,
// with no comments inside the object and no trailing commas.
module.exports = {
  "Author": "Goldid",
  "Name": "GolDid Local Model Tuner",
  "Description": "Tune GolDid behavior for Ollama, LM Studio, vLLM, llama.cpp, and other local model servers.",
  "Usage": "Use when a user is configuring or debugging local models, local provider timeouts, small-model prompt behavior, or local endpoint compatibility.",
  "Model_tested": ["gpt-5","claude-sonnet"]
};
