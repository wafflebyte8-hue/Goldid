'use strict';

/*
 * GolDid configuration store.
 * Saved to ~/.goldid/config.json so it lives with the user, not the project.
 * API keys are encrypted at rest with a local key stored in ~/.goldid/key.bin.
 *
 * Shape:
 * {
 *   "active":    { "provider": "ollama", "model": "qwen2.5-coder:3b" },
 *   "providers": {
 *     "openai":  { "apiKeyEnc": { ... } },
 *     "ollama":  { "baseUrl": "http://localhost:11434" }
 *   }
 * }
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const CONFIG_DIR = path.join(os.homedir(), '.goldid');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');
const KEY_PATH = path.join(CONFIG_DIR, 'key.bin');
const ENC_VERSION = 1;

function emptyConfig() {
  return { active: { provider: null, model: null }, providers: {}, agent: {} };
}

function ensureKey() {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  try {
    const key = fs.readFileSync(KEY_PATH);
    if (key.length === 32) return key;
  } catch {
    /* create below */
  }
  const key = crypto.randomBytes(32);
  fs.writeFileSync(KEY_PATH, key, { mode: 0o600 });
  return key;
}

function encryptSecret(value) {
  const text = String(value || '');
  if (!text) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ensureKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return {
    v: ENC_VERSION,
    alg: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: ciphertext.toString('base64'),
  };
}

function decryptSecret(payload) {
  if (!payload || typeof payload !== 'object') return '';
  if (payload.v !== ENC_VERSION || payload.alg !== 'aes-256-gcm') return '';
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', ensureKey(), Buffer.from(payload.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(payload.data, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return '';
  }
}

function normalize(parsed) {
  const providers = parsed.providers && typeof parsed.providers === 'object' ? parsed.providers : {};
  const normalizedProviders = {};
  let needsRewrite = false;

  for (const [key, conf] of Object.entries(providers)) {
    const src = conf && typeof conf === 'object' ? conf : {};
    const next = { ...src };
    if (src.apiKeyEnc) {
      next.apiKey = decryptSecret(src.apiKeyEnc);
      if (!next.apiKey) next.apiKeyEnc = src.apiKeyEnc;
    } else if (typeof src.apiKey === 'string' && src.apiKey) {
      needsRewrite = true;
    }
    if (next.apiKey) delete next.apiKeyEnc;
    normalizedProviders[key] = next;
  }

  return {
    cfg: {
      active: {
        provider: parsed.active?.provider ?? null,
        model: parsed.active?.model ?? null,
      },
      providers: normalizedProviders,
      agent: parsed.agent && typeof parsed.agent === 'object' ? parsed.agent : {},
    },
    needsRewrite,
  };
}

function forDisk(cfg) {
  const providers = {};
  for (const [key, conf] of Object.entries(cfg.providers || {})) {
    const src = conf && typeof conf === 'object' ? conf : {};
    const next = { ...src };
    if (next.apiKey) {
      next.apiKeyEnc = encryptSecret(next.apiKey);
      delete next.apiKey;
    }
    providers[key] = next;
  }
  return {
    active: cfg.active || { provider: null, model: null },
    providers,
    agent: cfg.agent && typeof cfg.agent === 'object' ? cfg.agent : {},
  };
}

function load() {
  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    const { cfg, needsRewrite } = normalize(parsed);
    if (needsRewrite) save(cfg);
    return cfg;
  } catch {
    return emptyConfig();
  }
}

function save(cfg) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  // mode 0o600 is best-effort (ignored on Windows) — keys are sensitive.
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(forDisk(cfg), null, 2) + '\n', { mode: 0o600 });
}

/** Get (creating if needed) the per-provider config object. */
function providerConf(cfg, key) {
  if (!cfg.providers[key]) cfg.providers[key] = {};
  return cfg.providers[key];
}

module.exports = { load, save, providerConf, CONFIG_PATH, CONFIG_DIR, KEY_PATH };
