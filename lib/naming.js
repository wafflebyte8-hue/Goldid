'use strict';

const providers = require('./providers');

const MODES = ['never', 'auto', 'always'];
const AUTO_TPS_THRESHOLD = 10;

function normalizeMode(value) {
  const mode = String(value || 'auto').trim().toLowerCase();
  return MODES.includes(mode) ? mode : 'auto';
}

function estimateTokens(text) {
  return Math.max(1, Math.ceil(String(text || '').length / 4));
}

function tpsFor(text, startedAt, endedAt = Date.now()) {
  const seconds = Math.max(0.001, (endedAt - startedAt) / 1000);
  return estimateTokens(text) / seconds;
}

function shouldGenerate(mode, tps) {
  const normalized = normalizeMode(mode);
  if (normalized === 'never') return false;
  if (normalized === 'always') return true;
  return Number(tps || 0) > AUTO_TPS_THRESHOLD;
}

function cleanTitle(value) {
  return String(value || '')
    .replace(/^["'`]+|["'`.]+$/g, '')
    .replace(/^title:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

function titleMessages(conversation) {
  const filtered = (conversation || []).filter((message) =>
    (message.role === 'user' || message.role === 'assistant') &&
    typeof message.content === 'string' &&
    message.content.trim()
  );
  return filtered.slice(0, 6).map((message) => ({
    role: message.role,
    content: String(message.content).slice(0, 1200),
  }));
}

async function generateTitle(cfg, conversation) {
  if (!cfg?.active?.provider || !cfg?.active?.model) return '';
  const conf = cfg.providers?.[cfg.active.provider] || {};
  const messages = titleMessages(conversation);
  if (!messages.length) return '';
  const text = await providers.chat(
    cfg.active.provider,
    conf,
    cfg.active.model,
    messages,
    {
      system: [
        'Create a short chat title.',
        'Return only the title, no quotes, no punctuation at the end.',
        'Use 2 to 6 words. Be specific and neutral.',
      ].join('\n'),
    },
  );
  return cleanTitle(text);
}

function defaultTitle(conversation) {
  const first = (conversation || []).find((m) => m.role === 'user' && typeof m.content === 'string');
  return first ? first.content.replace(/\s+/g, ' ').trim().slice(0, 80) : 'New conversation';
}

async function maybeGenerateTitle({ cfg, conversation, startedAt, mode, currentTitle }) {
  const existing = String(currentTitle || '').replace(/\s+/g, ' ').trim();
  if (existing && existing !== defaultTitle(conversation)) {
    return { title: '', tps: 0, skipped: true, reason: 'already_named' };
  }
  const final = [...(conversation || [])].reverse().find((message) => message.role === 'assistant');
  const tps = tpsFor(final?.content || '', startedAt);
  if (!shouldGenerate(mode ?? cfg?.agent?.naming, tps)) return { title: '', tps, skipped: true };
  const title = await generateTitle(cfg, conversation);
  return { title, tps, skipped: !title };
}

module.exports = {
  AUTO_TPS_THRESHOLD,
  MODES,
  normalizeMode,
  estimateTokens,
  tpsFor,
  shouldGenerate,
  generateTitle,
  maybeGenerateTitle,
};
