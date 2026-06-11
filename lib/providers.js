'use strict';

/*
 * AI provider registry for GolDid.
 *
 * Most providers speak the OpenAI-compatible HTTP API (GET /v1/models,
 * POST /v1/chat/completions). Anthropic and Gemini use their own shapes,
 * handled as special cases below.
 *
 * Fields:
 *   label          human-readable name
 *   kind           'cloud' | 'local'
 *   needsKey       true if an API key is required
 *   keyOptional    true if a key may be set but isn't required (e.g. secured vLLM)
 *   keyHint        example key format, shown when prompting
 *   defaultBaseUrl base endpoint, overridable per-provider in config (baseUrl)
 *   modelsPath     path to list models
 *   parse          response shape for the model list: 'openai' | 'gemini' | 'ollama'
 *   auth           how to authenticate: 'bearer' | 'bearer-optional' | 'anthropic' | 'gemini' | 'none'
 *   chat           chat request style: 'openai' | 'anthropic' | 'gemini'
 *   chatPath       path for chat (openai/anthropic styles)
 *   modelsFallback optional { path, parse } tried if the primary list is empty/fails
 */

const PROVIDERS = {
  anthropic: {
    label: 'Anthropic', kind: 'cloud', needsKey: true, keyHint: 'sk-ant-...',
    defaultBaseUrl: 'https://api.anthropic.com',
    modelsPath: '/v1/models', parse: 'openai', auth: 'anthropic',
    chat: 'anthropic', chatPath: '/v1/messages',
  },
  openai: {
    label: 'OpenAI', kind: 'cloud', needsKey: true, keyHint: 'sk-...',
    defaultBaseUrl: 'https://api.openai.com',
    modelsPath: '/v1/models', parse: 'openai', auth: 'bearer',
    chat: 'openai', chatPath: '/v1/chat/completions',
  },
  gemini: {
    label: 'Google Gemini', kind: 'cloud', needsKey: true, keyHint: 'AIza...',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    modelsPath: '/v1beta/models', parse: 'gemini', auth: 'gemini',
    chat: 'gemini',
  },
  xai: {
    label: 'xAI (Grok)', kind: 'cloud', needsKey: true, keyHint: 'xai-...',
    defaultBaseUrl: 'https://api.x.ai',
    modelsPath: '/v1/models', parse: 'openai', auth: 'bearer',
    chat: 'openai', chatPath: '/v1/chat/completions',
  },
  deepseek: {
    label: 'DeepSeek', kind: 'cloud', needsKey: true, keyHint: 'sk-...',
    defaultBaseUrl: 'https://api.deepseek.com',
    modelsPath: '/models', parse: 'openai', auth: 'bearer',
    chat: 'openai', chatPath: '/chat/completions',
  },
  openrouter: {
    label: 'OpenRouter', kind: 'cloud', needsKey: true, keyHint: 'sk-or-...',
    defaultBaseUrl: 'https://openrouter.ai/api',
    modelsPath: '/v1/models', parse: 'openai', auth: 'bearer',
    chat: 'openai', chatPath: '/v1/chat/completions',
  },
  ollama: {
    label: 'Ollama', kind: 'local', needsKey: false,
    defaultBaseUrl: 'http://localhost:11434',
    modelsPath: '/v1/models', parse: 'openai', auth: 'none',
    chat: 'openai', chatPath: '/v1/chat/completions',
    modelsFallback: { path: '/api/tags', parse: 'ollama' },
  },
  vllm: {
    label: 'vLLM', kind: 'local', needsKey: false, keyOptional: true, keyHint: 'token',
    defaultBaseUrl: 'http://localhost:8000',
    modelsPath: '/v1/models', parse: 'openai', auth: 'bearer-optional',
    chat: 'openai', chatPath: '/v1/chat/completions',
  },
  lmstudio: {
    label: 'LM Studio', kind: 'local', needsKey: false,
    defaultBaseUrl: 'http://localhost:1234',
    modelsPath: '/v1/models', parse: 'openai', auth: 'none',
    chat: 'openai', chatPath: '/v1/chat/completions',
  },
};

const CHAT_TIMEOUT_MS = 120000;
const LOCAL_CHAT_TIMEOUT_MS = 30 * 60 * 1000;

function baseUrl(def, conf) {
  return (conf.baseUrl || def.defaultBaseUrl).replace(/\/+$/, '');
}

function authHeaders(def, conf) {
  const headers = { 'Content-Type': 'application/json' };
  const key = conf.apiKey;
  switch (def.auth) {
    case 'bearer':
    case 'bearer-optional':
      if (key) headers['Authorization'] = `Bearer ${key}`;
      break;
    case 'anthropic':
      if (key) headers['x-api-key'] = key;
      headers['anthropic-version'] = '2023-06-01';
      break;
    case 'gemini': // key travels in the query string
    case 'none':
    default:
      break;
  }
  return headers;
}

function parseModels(style, json) {
  switch (style) {
    case 'openai':
      return (json.data || []).map((m) => m.id).filter(Boolean);
    case 'gemini':
      return (json.models || [])
        .map((m) => (m.name || '').replace(/^models\//, ''))
        .filter(Boolean);
    case 'ollama':
      return (json.models || []).map((m) => m.name).filter(Boolean);
    default:
      return [];
  }
}

async function fetchJson(url, opts = {}) {
  const { timeout = 15000, ...rest } = opts;
  let res;
  try {
    res = await fetch(url, { ...rest, signal: AbortSignal.timeout(timeout) });
  } catch (e) {
    if (e.name === 'TimeoutError') throw new Error('request timed out');
    // Connection refused etc. — most common for local servers that aren't running.
    throw new Error(e.cause?.code || e.code || e.message || 'connection failed');
  }
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { _raw: text };
  }
  if (!res.ok) {
    const detail = json.error?.message || json.error || json.message || json._raw;
    const msg = typeof detail === 'string' && detail ? detail : `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return json;
}

function modelsUrl(def, conf, pathOverride) {
  let url = baseUrl(def, conf) + (pathOverride || def.modelsPath);
  if (def.auth === 'gemini') {
    const sep = url.includes('?') ? '&' : '?';
    url += `${sep}key=${encodeURIComponent(conf.apiKey || '')}&pageSize=1000`;
  }
  return url;
}

/** Fetch the list of available model ids for a provider. Returns sorted string[]. */
async function fetchModels(key, conf) {
  const def = PROVIDERS[key];
  if (!def) throw new Error(`unknown provider: ${key}`);
  const headers = authHeaders(def, conf);

  let models = [];
  let primaryError;
  try {
    const res = await fetchJson(modelsUrl(def, conf), { headers });
    models = parseModels(def.parse, res);
  } catch (e) {
    primaryError = e;
  }

  if ((!models.length || primaryError) && def.modelsFallback) {
    const res = await fetchJson(modelsUrl(def, conf, def.modelsFallback.path), { headers });
    models = parseModels(def.modelsFallback.parse, res);
  } else if (primaryError) {
    throw primaryError;
  }

  return [...new Set(models)].sort((a, b) => a.localeCompare(b));
}

function asMessages(messages) {
  return Array.isArray(messages) ? messages : [{ role: 'user', content: String(messages) }];
}

function geminiContents(msgs) {
  return msgs.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
}

/**
 * Send a conversation to a model and return the full text reply (non-streaming).
 * `messages` is an array of { role: 'user'|'assistant', content }.
 * `opts.system` is an optional system prompt, placed per the provider's API.
 */
async function chat(key, conf, model, messages, opts = {}) {
  const def = PROVIDERS[key];
  if (!def) throw new Error(`unknown provider: ${key}`);
  const msgs = asMessages(messages);
  const system = opts.system;
  const timeout = def.kind === 'local' ? LOCAL_CHAT_TIMEOUT_MS : CHAT_TIMEOUT_MS;

  if (def.chat === 'anthropic') {
    const body = { model, max_tokens: 2048, messages: msgs };
    if (system) body.system = system;
    const json = await fetchJson(baseUrl(def, conf) + def.chatPath, {
      method: 'POST', headers: authHeaders(def, conf), body: JSON.stringify(body), timeout,
    });
    return (json.content || []).map((b) => b.text || '').join('');
  }

  if (def.chat === 'gemini') {
    const body = { contents: geminiContents(msgs) };
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    const url = `${baseUrl(def, conf)}/v1beta/models/${model}:generateContent?key=${encodeURIComponent(conf.apiKey || '')}`;
    const json = await fetchJson(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), timeout,
    });
    return (json.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  }

  // OpenAI-compatible
  const oaMsgs = system ? [{ role: 'system', content: system }, ...msgs] : msgs;
  const json = await fetchJson(baseUrl(def, conf) + def.chatPath, {
    method: 'POST', headers: authHeaders(def, conf), body: JSON.stringify({ model, messages: oaMsgs }), timeout,
  });
  return json.choices?.[0]?.message?.content || '';
}

// Sensible default image model per provider when the caller doesn't name one.
const DEFAULT_IMAGE_MODEL = {
  openai: 'gpt-image-1',
  xai: 'grok-2-image',
  gemini: 'gemini-2.0-flash-preview-image-generation',
  openrouter: 'google/gemini-2.5-flash-image-preview',
};

/**
 * Generate an image from a text prompt. Returns { b64, mime } or { url, mime }.
 * Uses the provider's native image API: Gemini's generateContent (inline image
 * data) or the OpenAI-compatible /v1/images/generations endpoint (OpenAI, xAI,
 * OpenRouter, and local servers that implement it). Throws if the provider/model
 * does not support image generation.
 */
async function generateImage(key, conf, model, prompt, opts = {}) {
  const def = PROVIDERS[key];
  if (!def) throw new Error(`unknown provider: ${key}`);
  const imageModel = model || DEFAULT_IMAGE_MODEL[key];
  if (!imageModel) throw new Error(`${def.label} does not support image generation`);

  if (def.chat === 'gemini') {
    const url = `${baseUrl(def, conf)}/v1beta/models/${imageModel}:generateContent?key=${encodeURIComponent(conf.apiKey || '')}`;
    const json = await fetchJson(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] }), timeout: 120000,
    });
    const part = (json.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData?.data);
    if (!part) throw new Error('the model returned no image (try an image-capable model)');
    return { b64: part.inlineData.data, mime: part.inlineData.mimeType || 'image/png' };
  }

  if (def.chat === 'anthropic') {
    throw new Error('Anthropic does not offer image generation — switch to a provider that does (e.g. OpenAI, Gemini, xAI).');
  }

  // OpenAI-compatible images endpoint. Note: gpt-image-1 (and some compatible
  // backends) reject `response_format` — it always returns b64_json — while
  // dall-e-* default to returning a URL. We omit the param and accept either
  // shape below, so both work without a per-model special case.
  const url = baseUrl(def, conf) + '/v1/images/generations';
  const body = { model: imageModel, prompt, n: 1 };
  if (opts.size) body.size = opts.size;
  const json = await fetchJson(url, {
    method: 'POST', headers: authHeaders(def, conf), body: JSON.stringify(body), timeout: 120000,
  });
  const d = (json.data && json.data[0]) || {};
  if (d.b64_json) return { b64: d.b64_json, mime: 'image/png' };
  if (d.url) return { url: d.url, mime: 'image/png' };
  throw new Error('the provider returned no image data');
}

// Combine a timeout with an optional external abort signal (for user cancel),
// without relying on AbortSignal.any (not available on Node 18).
function linkedSignal(external, timeout) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  // Don't let the timeout hold the process open after the request finishes —
  // otherwise a one-shot `gd "prompt"` would hang until the timer fires.
  if (typeof timer.unref === 'function') timer.unref();
  if (external) {
    if (external.aborted) ctrl.abort();
    else external.addEventListener('abort', () => ctrl.abort(), { once: true });
  }
  return ctrl.signal;
}

async function fetchStream(url, opts = {}) {
  const { timeout = 120000, signal: external, ...rest } = opts;
  let res;
  try {
    res = await fetch(url, { ...rest, signal: linkedSignal(external, timeout) });
  } catch (e) {
    if (external && external.aborted) throw new Error('cancelled');
    if (e.name === 'TimeoutError' || e.name === 'AbortError') throw new Error('request timed out');
    throw new Error(e.cause?.code || e.code || e.message || 'connection failed');
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let msg = text;
    try {
      const j = JSON.parse(text);
      msg = j.error?.message || j.error || j.message || text;
    } catch {
      /* keep raw */
    }
    const err = new Error(typeof msg === 'string' && msg ? msg : `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res;
}

async function* sseLines(res) {
  const decoder = new TextDecoder();
  let buf = '';
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).replace(/\r$/, '');
      buf = buf.slice(nl + 1);
      if (line) yield line;
    }
  }
  if (buf.trim()) yield buf.trim();
}

/**
 * Stream a conversation. Calls `onDelta(text)` for each chunk as it arrives.
 * `system` is the system prompt; `tools` (OpenAI-format schemas) enables native
 * function calling on OpenAI-compatible providers. Resolves with
 * { text, toolCalls }, where toolCalls is an array of raw OpenAI tool_call
 * objects ({ id, type, function: { name, arguments } }), or [] if none.
 */
async function chatStream(key, conf, model, messages, { system, onDelta, tools, signal } = {}) {
  const def = PROVIDERS[key];
  if (!def) throw new Error(`unknown provider: ${key}`);
  const msgs = asMessages(messages);
  const emit = (t) => { if (t && onDelta) onDelta(t); };
  let full = '';
  const timeout = def.kind === 'local' ? LOCAL_CHAT_TIMEOUT_MS : CHAT_TIMEOUT_MS;

  if (def.chat === 'gemini') {
    const body = { contents: geminiContents(msgs) };
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    const url = `${baseUrl(def, conf)}/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(conf.apiKey || '')}`;
    const res = await fetchStream(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal, timeout });
    for await (const line of sseLines(res)) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      try {
        const j = JSON.parse(data);
        const t = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
        full += t; emit(t);
      } catch { /* ignore partial */ }
    }
    return { text: full, toolCalls: [] };
  }

  if (def.chat === 'anthropic') {
    const body = { model, max_tokens: 4096, stream: true, messages: msgs };
    if (system) body.system = system;
    const res = await fetchStream(baseUrl(def, conf) + def.chatPath, { method: 'POST', headers: authHeaders(def, conf), body: JSON.stringify(body), signal, timeout });
    for await (const line of sseLines(res)) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data) continue;
      try {
        const j = JSON.parse(data);
        if (j.type === 'content_block_delta' && j.delta?.text) {
          full += j.delta.text; emit(j.delta.text);
        }
      } catch { /* ignore */ }
    }
    return { text: full, toolCalls: [] };
  }

  // OpenAI-compatible
  const oaMsgs = system ? [{ role: 'system', content: system }, ...msgs] : msgs;
  const body = { model, messages: oaMsgs, stream: true };
  if (tools && tools.length) body.tools = tools;
  const res = await fetchStream(baseUrl(def, conf) + def.chatPath, {
    method: 'POST', headers: authHeaders(def, conf), body: JSON.stringify(body), signal, timeout,
  });
  let reasoning = '';
  const toolAcc = {}; // index -> { id, type, function: { name, arguments } }
  for await (const line of sseLines(res)) {
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') continue;
    try {
      const d = JSON.parse(data).choices?.[0]?.delta || {};
      const t = d.content || '';
      if (t) { full += t; emit(t); }
      // Reasoning models (e.g. Nemotron, DeepSeek-R1) put their output in a
      // separate reasoning field and may leave `content` empty.
      const r = d.reasoning_content ?? d.reasoning ?? '';
      if (r) reasoning += r;
      // Native tool calls stream as fragments keyed by index; concatenate them.
      if (Array.isArray(d.tool_calls)) {
        for (const tc of d.tool_calls) {
          const i = tc.index ?? 0;
          const acc = (toolAcc[i] ||= { id: '', type: 'function', function: { name: '', arguments: '' } });
          if (tc.id) acc.id = tc.id;
          if (tc.function?.name) acc.function.name += tc.function.name;
          if (tc.function?.arguments) acc.function.arguments += tc.function.arguments;
        }
      }
    } catch { /* ignore partial */ }
  }
  const toolCalls = Object.values(toolAcc).filter((c) => c.function.name);
  // Fall back to the reasoning text when no answer content and no tool call.
  const text = full.trim() || (toolCalls.length ? '' : reasoning);
  if (!full.trim() && !toolCalls.length && reasoning.trim()) emit(reasoning);
  return { text, toolCalls };
}

// Providers known to support image generation, in menu order.
const IMAGE_PROVIDERS = Object.keys(DEFAULT_IMAGE_MODEL);

module.exports = {
  PROVIDERS, fetchModels, chat, chatStream, generateImage, baseUrl,
  DEFAULT_IMAGE_MODEL, IMAGE_PROVIDERS,
};
