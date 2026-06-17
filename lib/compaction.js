"use strict";

const APPROX_CHARS_PER_TOKEN = 4;
const AUTO_COMPACT_RATIO = 0.8;
const KEEP_RECENT_MESSAGES = 8;

function textOf(value) {
  if (typeof value === "string") return value;
  if (value == null) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function estimateTokens(value) {
  return Math.ceil(textOf(value).length / APPROX_CHARS_PER_TOKEN);
}

function estimateMessages(messages, system = "") {
  let total = estimateTokens(system);
  for (const message of Array.isArray(messages) ? messages : []) {
    total += 4 + estimateTokens(message.role || "") + estimateTokens(message.content || "");
    if (Array.isArray(message.tool_calls)) total += estimateTokens(message.tool_calls);
  }
  return total;
}

function shouldCompact({ messages, system, contextLength }) {
  const limit = Number(contextLength);
  if (!Number.isFinite(limit) || limit <= 0) return { compact: false, tokens: estimateMessages(messages, system), limit: null };
  const tokens = estimateMessages(messages, system);
  return { compact: tokens >= limit * AUTO_COMPACT_RATIO, tokens, limit };
}

function splitForCompaction(messages) {
  const list = Array.isArray(messages) ? messages : [];
  if (list.length <= KEEP_RECENT_MESSAGES + 2) return null;
  const keep = list.slice(-KEEP_RECENT_MESSAGES);
  return { older: list.slice(0, -KEEP_RECENT_MESSAGES), keep };
}

function transcript(messages) {
  return messages.map((m) => {
    const role = m.role || "message";
    const content = textOf(m.content || "");
    return `${role.toUpperCase()}:\n${content}`;
  }).join("\n\n---\n\n");
}

function summaryMessage(summary) {
  return {
    role: "user",
    content: [
      "[Conversation compacted by GolDid]",
      "Use this summary as prior conversation context. It preserves the user's goals, decisions, constraints, and important results, but the recent un-compacted messages that follow are more authoritative.",
      "",
      summary.trim(),
    ].join("\n"),
    compacted: true,
  };
}

function buildSummaryPrompt(messages) {
  return [
    "Compact this conversation for a future assistant turn.",
    "Preserve concrete user goals, current task state, key decisions, file paths, commands, errors, constraints, and any unresolved next steps.",
    "Omit pleasantries, repeated wording, and low-value intermediate chatter.",
    "Do not invent facts. Keep it concise but complete enough that the conversation can continue.",
    "",
    transcript(messages),
  ].join("\n");
}

async function compactMessages({ providers, cfg, messages }) {
  const parts = splitForCompaction(messages);
  if (!parts) return { messages, compacted: false };
  const prompt = buildSummaryPrompt(parts.older);
  const summary = await providers.chat(
    cfg.active.provider,
    cfg.providers[cfg.active.provider] || {},
    cfg.active.model,
    [{ role: "user", content: prompt }],
    {
      system: "You compact chat history into a faithful continuation summary. Return only the summary.",
    },
  );
  const compacted = [summaryMessage(summary || "(summary unavailable)"), ...parts.keep];
  return { messages: compacted, compacted: true, summaryTokens: estimateTokens(summary) };
}

module.exports = {
  AUTO_COMPACT_RATIO,
  estimateTokens,
  estimateMessages,
  shouldCompact,
  compactMessages,
};
