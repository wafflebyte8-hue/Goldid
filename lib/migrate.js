'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const config = require('./config');

const GOLDID_DIR = path.join(os.homedir(), '.goldid');
const MEMORY_DIR = path.join(GOLDID_DIR, 'memories');
const SKILLS_DIR = path.join(GOLDID_DIR, 'skills');
const SOUL_PATH = path.join(GOLDID_DIR, 'SOUL.md');
const PROVIDER_ENV = {
  OPENAI_API_KEY: 'openai',
  ANTHROPIC_API_KEY: 'anthropic',
  GEMINI_API_KEY: 'gemini',
  GOOGLE_API_KEY: 'gemini',
  XAI_API_KEY: 'xai',
  DEEPSEEK_API_KEY: 'deepseek',
  OPENROUTER_API_KEY: 'openrouter',
};

function exists(p) {
  try { return fs.existsSync(p); } catch { return false; }
}

function readText(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return ''; }
}

function parseEnv(raw) {
  const out = {};
  for (const line of String(raw || '').split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[match[1]] = value;
  }
  return out;
}

function stripJsonComments(raw) {
  return String(raw || '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/,\s*([}\]])/g, '$1');
}

function readJson(p) {
  try { return JSON.parse(stripJsonComments(readText(p))); } catch { return {}; }
}

function yamlScalar(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function yamlPaths(raw) {
  const result = {};
  const stack = [];
  for (const line of String(raw || '').split(/\r?\n/)) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const match = line.match(/^(\s*)([A-Za-z0-9_-]+):\s*(.*?)\s*$/);
    if (!match) continue;
    const level = Math.floor(match[1].replace(/\t/g, '  ').length / 2);
    stack.length = level;
    stack[level] = match[2];
    if (match[3]) result[stack.join('.')] = yamlScalar(match[3]);
  }
  return result;
}

function resolveSecret(value, env) {
  if (typeof value === 'string') {
    const match = value.match(/^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/);
    return match ? env[match[1]] || '' : value;
  }
  if (value && typeof value === 'object' && value.source === 'env' && value.id) {
    return env[value.id] || '';
  }
  return '';
}

function addFile(plan, source, kind, from, to, options = {}) {
  if (!exists(from)) return;
  plan.items.push({ source, kind, from, to, ...options });
}

function findSkillDirs(root) {
  const found = [];
  if (!exists(root)) return found;
  const stack = [root];
  while (stack.length && found.length < 500) {
    const dir = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    if (entries.some((e) => e.isFile() && /^skill\.md$/i.test(e.name))) {
      found.push(dir);
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.') && !entry.name.startsWith('_')) {
        stack.push(path.join(dir, entry.name));
      }
    }
  }
  return found;
}

function addSkills(plan, source, roots) {
  const seen = new Set();
  for (const root of roots) {
    for (const dir of findSkillDirs(root)) {
      const slug = path.basename(dir).toLowerCase();
      if (seen.has(slug)) continue;
      seen.add(slug);
      addFile(plan, source, 'skill', dir, path.join(SKILLS_DIR, `${source}-imports`, slug), { directory: true });
    }
  }
}

function addMemories(plan, source, base) {
  addFile(plan, source, 'memory', path.join(base, 'memories', 'MEMORY.md'), path.join(MEMORY_DIR, 'MEMORY.md'), { merge: true });
  addFile(plan, source, 'user', path.join(base, 'memories', 'USER.md'), path.join(MEMORY_DIR, 'USER.md'), { merge: true });
  addFile(plan, source, 'personality', path.join(base, 'memories', 'PERSONALITY.md'), path.join(MEMORY_DIR, 'PERSONALITY.md'), { merge: true });
}

function collectHermes(plan, sourceDir, includeSecrets) {
  if (!exists(sourceDir)) return;
  plan.sources.push({ name: 'hermes', path: sourceDir });
  addFile(plan, 'hermes', 'soul', path.join(sourceDir, 'SOUL.md'), SOUL_PATH);
  addMemories(plan, 'hermes', sourceDir);
  addSkills(plan, 'hermes', [path.join(sourceDir, 'skills')]);

  const env = parseEnv(readText(path.join(sourceDir, '.env')));
  const yaml = yamlPaths(readText(path.join(sourceDir, 'config.yaml')));
  const provider = yaml['model.provider'] || '';
  const model = yaml['model.default'] || yaml.model || '';
  const baseUrl = yaml['model.base_url'] || '';
  if (provider || model || baseUrl) plan.providers.push({ source: 'hermes', provider, model, baseUrl });
  if (includeSecrets) {
    for (const [name, target] of Object.entries(PROVIDER_ENV)) {
      if (env[name]) plan.secrets.push({ source: 'hermes', provider: target, value: env[name] });
    }
    if (yaml['model.api_key']) {
      const value = resolveSecret(yaml['model.api_key'], env);
      if (value) plan.secrets.push({ source: 'hermes', provider: provider || 'openai', value });
    }
  }
}

function openClawWorkspace(sourceDir, cfg) {
  const configured = cfg?.agents?.defaults?.workspace;
  const candidates = [
    configured && path.resolve(sourceDir, configured),
    path.join(sourceDir, 'workspace'),
    path.join(sourceDir, 'workspace-main'),
    path.join(sourceDir, 'workspace.default'),
  ].filter(Boolean);
  return candidates.find(exists) || candidates[0];
}

function collectOpenClaw(plan, sourceDir, includeSecrets) {
  if (!exists(sourceDir)) return;
  plan.sources.push({ name: 'openclaw', path: sourceDir });
  const configPath = ['openclaw.json', 'clawdbot.json', 'moltbot.json']
    .map((name) => path.join(sourceDir, name)).find(exists);
  const cfg = configPath ? readJson(configPath) : {};
  const workspace = openClawWorkspace(sourceDir, cfg);
  const env = {
    ...parseEnv(readText(path.join(sourceDir, '.env'))),
    ...(cfg.env?.vars || {}),
    ...(cfg.env || {}),
  };

  addFile(plan, 'openclaw', 'soul', path.join(workspace, 'SOUL.md'), SOUL_PATH);
  addFile(plan, 'openclaw', 'memory', path.join(workspace, 'MEMORY.md'), path.join(MEMORY_DIR, 'MEMORY.md'), { merge: true });
  addFile(plan, 'openclaw', 'user', path.join(workspace, 'USER.md'), path.join(MEMORY_DIR, 'USER.md'), { merge: true });
  addFile(plan, 'openclaw', 'context', path.join(workspace, 'AGENTS.md'), path.join(GOLDID_DIR, 'imports', 'openclaw-AGENTS.md'));
  addSkills(plan, 'openclaw', [
    path.join(workspace, 'skills'),
    path.join(workspace, '.agents', 'skills'),
    path.join(os.homedir(), '.agents', 'skills'),
    path.join(sourceDir, 'skills'),
  ]);

  const modelSetting = cfg?.agents?.defaults?.model;
  const model = typeof modelSetting === 'string' ? modelSetting : modelSetting?.primary || '';
  const providers = cfg?.models?.providers || {};
  for (const [name, provider] of Object.entries(providers)) {
    plan.providers.push({
      source: 'openclaw',
      provider: name,
      model: model.startsWith(name + '/') ? model.slice(name.length + 1) : '',
      baseUrl: provider.baseUrl || provider.base_url || '',
    });
    if (includeSecrets) {
      const value = resolveSecret(provider.apiKey || provider.api_key, env);
      if (value) plan.secrets.push({ source: 'openclaw', provider: name, value });
    }
  }
  if (model && !Object.keys(providers).length) {
    const parts = model.split('/');
    plan.providers.push({
      source: 'openclaw',
      provider: parts.length > 1 ? parts.shift() : '',
      model: parts.join('/') || model,
      baseUrl: '',
    });
  }
  if (includeSecrets) {
    for (const [name, target] of Object.entries(PROVIDER_ENV)) {
      if (env[name]) plan.secrets.push({ source: 'openclaw', provider: target, value: env[name] });
    }
    const auth = readJson(path.join(sourceDir, 'agents', 'main', 'agent', 'auth-profiles.json'));
    for (const profile of Object.values(auth.profiles || auth)) {
      if (!profile || typeof profile !== 'object') continue;
      const provider = profile.provider || profile.type || '';
      const value = profile.apiKey || profile.api_key || profile.key || '';
      if (provider && value) plan.secrets.push({ source: 'openclaw', provider, value });
    }
  }
}

function buildPlan(options = {}) {
  const home = os.homedir();
  const plan = { sources: [], items: [], providers: [], secrets: [], warnings: [] };
  const selected = options.source || 'both';
  if (selected === 'both' || selected === 'hermes') {
    collectHermes(
      plan,
      options.hermesDir || process.env.HERMES_HOME || path.join(home, '.hermes'),
      options.includeSecrets
    );
  }
  if (selected === 'both' || selected === 'openclaw') {
    collectOpenClaw(plan, options.openclawDir || path.join(home, '.openclaw'), options.includeSecrets);
  }
  if (!plan.sources.length) plan.warnings.push('No Hermes or OpenClaw data directories were found.');
  if (!options.includeSecrets) plan.warnings.push('API keys were not inspected. Add --secrets to migrate them.');
  return plan;
}

function uniqueEntries(raw) {
  return String(raw || '').replace(/\r\n/g, '\n')
    .split(/\n---\n|\n§\n/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function mergeText(from, to) {
  const merged = [...new Set([...uniqueEntries(readText(to)), ...uniqueEntries(readText(from))])];
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.writeFileSync(to, merged.join('\n---\n'), 'utf8');
}

function copyItem(item, overwrite) {
  if (item.merge) {
    mergeText(item.from, item.to);
    return 'merged';
  }
  if (exists(item.to) && !overwrite) return 'skipped';
  fs.mkdirSync(path.dirname(item.to), { recursive: true });
  if (exists(item.to)) fs.rmSync(item.to, { recursive: true, force: true });
  fs.cpSync(item.from, item.to, { recursive: Boolean(item.directory) });
  return 'copied';
}

function normalizeProvider(name) {
  const key = String(name || '').toLowerCase();
  const aliases = {
    google: 'gemini',
    'google-gemini': 'gemini',
    'google-generative-ai': 'gemini',
    'openai-completions': 'openai',
    'anthropic-messages': 'anthropic',
  };
  return aliases[key] || key;
}

function applyPlan(plan, options = {}) {
  const report = { copied: 0, merged: 0, skipped: 0, providers: 0, secrets: 0, unsupported: [] };
  for (const item of plan.items) {
    const result = copyItem(item, options.overwrite);
    report[result]++;
  }

  const cfg = config.load();
  const supported = new Set(['openai', 'anthropic', 'gemini', 'xai', 'deepseek', 'openrouter', 'ollama', 'vllm', 'lmstudio']);
  for (const entry of plan.providers) {
    const provider = normalizeProvider(entry.provider);
    if (!supported.has(provider)) {
      if (provider) report.unsupported.push(provider);
      continue;
    }
    const conf = config.providerConf(cfg, provider);
    if (entry.baseUrl && (options.overwrite || !conf.baseUrl)) conf.baseUrl = entry.baseUrl;
    if (entry.model && (options.overwrite || !cfg.active.model)) {
      cfg.active = { provider, model: entry.model };
    }
    report.providers++;
  }
  for (const entry of plan.secrets) {
    const provider = normalizeProvider(entry.provider);
    if (!supported.has(provider) || !entry.value) continue;
    const conf = config.providerConf(cfg, provider);
    if (options.overwrite || !conf.apiKey) {
      conf.apiKey = entry.value;
      report.secrets++;
    }
  }
  config.save(cfg);
  report.unsupported = [...new Set(report.unsupported)];
  return report;
}

function summarize(plan) {
  const counts = {};
  for (const item of plan.items) counts[item.kind] = (counts[item.kind] || 0) + 1;
  return {
    sources: plan.sources,
    files: counts,
    providers: plan.providers.map(({ source, provider, model, baseUrl }) => ({ source, provider, model, baseUrl })),
    secretCount: plan.secrets.length,
    warnings: plan.warnings,
  };
}

module.exports = { buildPlan, applyPlan, summarize, parseEnv, yamlPaths, resolveSecret };
