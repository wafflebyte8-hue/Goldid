'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const MAX_SKILLS = 500;
const MAX_SKILL_CHARS = 30000;
const VERSION_FILE = 'Version.js';
const VERSION_MD_FILE = 'Version.md';
const REGISTRY_URL = 'https://goldid-e56e5.web.app/skills/registry.json';

function platformName() {
  if (process.platform === 'win32') return 'windows';
  if (process.platform === 'darwin') return 'macos';
  return 'linux';
}

function defaultRoots(cwd = process.cwd()) {
  const home = os.homedir();
  const hermesHomes = [
    process.env.HERMES_HOME,
    path.join(home, '.hermes'),
  ].filter(Boolean);
  const roots = [
    { path: path.join(cwd, 'skills'), source: 'project' },
    { path: path.join(cwd, '.agents', 'skills'), source: 'openclaw-project' },
    { path: path.join(cwd, '.goldid', 'skills'), source: 'project' },
    { path: path.join(home, '.goldid', 'skills'), source: 'goldid' },
    { path: path.join(home, '.agents', 'skills'), source: 'openclaw-personal' },
  ];
  for (const hermesHome of hermesHomes) {
    roots.push({ path: path.join(hermesHome, 'skills'), source: 'hermes' });
    roots.push({ path: path.join(hermesHome, 'hermes-agent', 'skills'), source: 'hermes-bundled' });
  }
  roots.push({ path: path.join(home, '.openclaw', 'skills'), source: 'openclaw' });
  return roots.filter((root, index, all) =>
    all.findIndex((item) => path.resolve(item.path) === path.resolve(root.path)) === index
  );
}

function scalar(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  return text;
}

function listValue(value) {
  const text = String(value || '').trim();
  if (!text) return [];
  if (text.startsWith('[') && text.endsWith(']')) {
    return text.slice(1, -1).split(',').map(scalar).filter(Boolean);
  }
  return [scalar(text)].filter(Boolean);
}

function parseFrontmatter(raw) {
  const text = String(raw || '').replace(/\r\n/g, '\n');
  if (!text.startsWith('---\n')) return { metadata: {}, body: text.trim() };
  const end = text.indexOf('\n---\n', 4);
  if (end < 0) return { metadata: {}, body: text.trim() };

  const metadata = {};
  const lines = text.slice(4, end).split('\n');
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    const value = match[2];
    if (value === '>' || value === '|') {
      const continuation = [];
      while (i + 1 < lines.length && /^\s+/.test(lines[i + 1])) {
        continuation.push(lines[++i].trim());
      }
      metadata[key] = value === '>' ? continuation.join(' ') : continuation.join('\n');
    } else if (key === 'platforms' || key === 'tags') {
      const values = listValue(value);
      while (i + 1 < lines.length && /^\s*-\s+/.test(lines[i + 1])) {
        values.push(scalar(lines[++i].replace(/^\s*-\s+/, '')));
      }
      metadata[key] = values;
    } else if (value) {
      metadata[key] = scalar(value);
    }
  }
  return { metadata, body: text.slice(end + 5).trim() };
}

function firstHeading(body) {
  const match = String(body || '').match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : '';
}

function section(body, names) {
  const wanted = names.map((name) => name.toLowerCase());
  const lines = String(body || '').replace(/\r\n/g, '\n').split('\n');
  let start = -1;
  let level = 0;
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{2,6})\s+(.+?)\s*$/);
    if (match && wanted.includes(match[2].trim().toLowerCase())) {
      start = i + 1;
      level = match[1].length;
      break;
    }
  }
  if (start < 0) return '';
  const content = [];
  for (let i = start; i < lines.length; i++) {
    const heading = lines[i].match(/^(#{1,6})\s+/);
    if (heading && heading[1].length <= level) break;
    content.push(lines[i]);
  }
  return content.join('\n').trim();
}

function parseVersionManifest(dir) {
  const mdFile = path.join(dir, VERSION_MD_FILE);
  try {
    const raw = fs.readFileSync(mdFile, 'utf8');
    const parsed = parseFrontmatter(raw);
    const source = parsed.metadata && Object.keys(parsed.metadata).length ? parsed.metadata : JSON.parse(parsed.body || raw);
    return {
      Author: source.Author || source.author || 'Unknown',
      Name: source.Name || source.name || 'Unknown',
      Description: source.Description || source.description || 'Unknown',
      Usage: source.Usage || source.usage || 'Unknown',
      Model_tested: source.Model_tested || source.model_tested || source.models || 'Unknown',
    };
  } catch {
    /* fall through to legacy Version.js */
  }
  const file = path.join(dir, VERSION_FILE);
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const match = raw.match(/module\.exports\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);
    if (!match) return {};
    const parsed = JSON.parse(match[1]);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function parseVersionSource(raw) {
  try {
    const match = String(raw || '').match(/module\.exports\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);
    if (!match) return {};
    const parsed = JSON.parse(match[1]);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function modelList(value) {
  if (Array.isArray(value)) return value.map(String).map((x) => x.trim()).filter(Boolean);
  return listValue(value);
}

function known(value) {
  const text = String(value ?? '').trim();
  return text && text.toLowerCase() !== 'unknown' ? text : '';
}

function normalizedManifest(parsed, dir, source) {
  const metadata = parsed.metadata || {};
  const existing = parseVersionManifest(dir);
  return {
    Author: String(known(existing.Author) || metadata.author || source || 'Unknown').trim(),
    Name: String(known(existing.Name) || metadata.name || path.basename(dir)).trim(),
    Description: String(
      known(existing.Description) || metadata.description || firstHeading(parsed.body) || 'No description.'
    ).replace(/\s+/g, ' ').trim(),
    Usage: String(
      known(existing.Usage) || metadata.usage || section(parsed.body, ['When to Use', 'Usage']) || ''
    ).trim(),
    Model_tested: modelList(existing.Model_tested)
      .filter((item) => item.toLowerCase() !== 'unknown')
      .concat(modelList(metadata.model_tested || metadata.models_tested || metadata.models || [])),
  };
}

function unknownManifest() {
  return {
    Author: 'Unknown',
    Name: 'Unknown',
    Description: 'Unknown',
    Usage: 'Unknown',
    Model_tested: 'Unknown',
  };
}

function versionSource(manifest) {
  return [
    "'use strict';",
    '',
    '// GolDid normalized skill metadata. SKILL.md remains the portable source.',
    'module.exports = ' + JSON.stringify(manifest, null, 2) + ';',
    '',
  ].join('\n');
}

function writeVersionManifest(dir, source = 'goldid', overwrite = false) {
  const skillFile = ['SKILL.md', 'skill.md']
    .map((name) => path.join(dir, name))
    .find((file) => fs.existsSync(file));
  if (!skillFile) throw new Error(`SKILL.md not found in ${dir}`);
  const target = path.join(dir, VERSION_FILE);
  if (fs.existsSync(target) && !overwrite) return parseVersionManifest(dir);
  const imported = ['hermes', 'openclaw'].includes(String(source).toLowerCase());
  const parsed = parseFrontmatter(fs.readFileSync(skillFile, 'utf8'));
  const manifest = imported ? unknownManifest() : normalizedManifest(parsed, dir, source);
  fs.writeFileSync(target, versionSource(manifest), 'utf8');
  return manifest;
}

function skillInstallRoot() {
  return path.join(os.homedir(), '.goldid', 'skills', 'goldid');
}

function safeSkillId(id) {
  const clean = String(id || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{1,63}$/.test(clean)) throw new Error('invalid skill id');
  return clean;
}

function skillFolderName(name, fallback) {
  const slug = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return slug || fallback;
}

function defaultRegistryUrl() {
  return process.env.GOLDID_SKILL_REGISTRY_URL || REGISTRY_URL;
}

async function fetchRegistry(registryUrl = defaultRegistryUrl()) {
  const res = await fetch(registryUrl, {
    headers: {
      Accept: 'application/json',
      'Cache-Control': 'no-cache',
      'User-Agent': 'GolDid skills',
    },
  });
  if (!res.ok) throw new Error(`skill registry unavailable: HTTP ${res.status}`);
  const json = await res.json();
  const skills = Array.isArray(json.skills) ? json.skills : [];
  return {
    baseUrl: String(json.baseUrl || registryUrl.replace(/\/skills\/registry\.json.*$/, '')).replace(/\/+$/, ''),
    skills: skills.map((item) => ({
      id: String(item.id || '').trim(),
      name: String(item.name || item.id || '').trim(),
      description: String(item.description || '').trim(),
      author: String(item.author || '').trim(),
      version: String(item.version || '').trim(),
      tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
      skillUrl: String(item.skillUrl || '').trim(),
      versionUrl: String(item.versionUrl || '').trim(),
      pageUrl: String(item.pageUrl || '').trim(),
    })).filter((item) => item.id),
  };
}

function absoluteUrl(baseUrl, url) {
  if (/^https?:\/\//i.test(url)) return url;
  return baseUrl + '/' + String(url || '').replace(/^\/+/, '');
}

async function fetchTextUrl(url) {
  const res = await fetch(url, {
    headers: {
      Accept: 'text/plain,text/markdown,*/*',
      'Cache-Control': 'no-cache',
      'User-Agent': 'GolDid skills',
    },
  });
  if (!res.ok) throw new Error(`could not download ${url}: HTTP ${res.status}`);
  return res.text();
}

async function installFromRegistry(id, opts = {}) {
  const clean = safeSkillId(id);
  const registry = await fetchRegistry(opts.registryUrl || defaultRegistryUrl());
  const item = registry.skills.find((skill) => skill.id.toLowerCase() === clean);
  if (!item) throw new Error(`skill not found in registry: ${clean}`);
  const skillUrl = absoluteUrl(registry.baseUrl, item.skillUrl || `skills/${clean}/SKILL.md`);
  const versionUrl = absoluteUrl(registry.baseUrl, item.versionUrl || `skills/${clean}/Version.js`);
  const [skillMd, versionSourceText] = await Promise.all([fetchTextUrl(skillUrl), fetchTextUrl(versionUrl)]);
  const versionManifest = parseVersionSource(versionSourceText);
  const registryName = item.name && item.name.toLowerCase() !== clean ? item.name : '';
  const dir = path.join(skillInstallRoot(), skillFolderName(registryName || versionManifest.Name, clean));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), skillMd, 'utf8');
  fs.writeFileSync(path.join(dir, VERSION_FILE), versionSourceText, 'utf8');
  const manifest = parseVersionManifest(dir);
  if (!manifest.Name || manifest.Name === 'Unknown') writeVersionManifest(dir, 'goldid', true);
  const installed = readSkill(path.join(dir, 'SKILL.md'), 'goldid');
  return {
    id: clean,
    name: installed?.name || item.name || clean,
    dir,
    version: installed?.version || item.version || '',
  };
}

function findSkillFiles(root) {
  const found = [];
  if (!fs.existsSync(root)) return found;
  const stack = [root];
  while (stack.length && found.length < MAX_SKILLS) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    const skill = entries.find((entry) => entry.isFile() && /^skill\.md$/i.test(entry.name));
    if (skill) {
      found.push(path.join(dir, skill.name));
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
      stack.push(path.join(dir, entry.name));
    }
  }
  return found;
}

function readSkill(file, source) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = parseFrontmatter(raw);
    const dir = path.dirname(file);
    const manifest = normalizedManifest(parsed, dir, source);
    const slug = path.basename(dir).toLowerCase();
    const name = String(manifest.Name || slug).replace(/\s+/g, ' ').trim().slice(0, 80);
    const platforms = Array.isArray(parsed.metadata.platforms) ? parsed.metadata.platforms : [];
    const description = String(manifest.Description || 'No description.')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 240);
    return {
      name,
      slug,
      description,
      version: String(parsed.metadata.version || '').trim(),
      author: String(manifest.Author || '').trim(),
      usage: String(manifest.Usage || '').trim(),
      modelTested: modelList(manifest.Model_tested),
      manifest,
      platforms: platforms.map((item) => item.toLowerCase()),
      source,
      file,
      dir,
      body: parsed.body,
      raw,
    };
  } catch {
    return null;
  }
}

function compatible(skill) {
  return !skill.platforms.length || skill.platforms.includes(platformName());
}

function discover(cwd = process.cwd()) {
  const byName = new Map();
  for (const root of defaultRoots(cwd)) {
    for (const file of findSkillFiles(root.path)) {
      const skill = readSkill(file, root.source);
      if (!skill || !compatible(skill)) continue;
      const key = skill.name.toLowerCase();
      if (!byName.has(key)) byName.set(key, skill);
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function find(name, cwd = process.cwd()) {
  const needle = String(name || '').trim().toLowerCase();
  if (!needle) return null;
  const skills = discover(cwd);
  return skills.find((skill) => skill.name.toLowerCase() === needle || skill.slug === needle) || null;
}

function catalog(cwd = process.cwd()) {
  const skills = discover(cwd);
  if (!skills.length) return '';
  return [
    '# Available skills',
    '',
    'Skills are reusable instruction documents. When a task matches one, call skill_view',
    'to load its full instructions before acting. Do not claim to have used a skill',
    'unless you loaded it. Project skills override user and imported skills.',
    '',
    ...skills.map((skill) => `- ${skill.name}: ${skill.description}`),
  ].join('\n');
}

function render(skill, sessionId = '') {
  if (!skill) return '';
  const dir = skill.dir;
  let body = skill.body
    .replace(/\$\{HERMES_SKILL_DIR\}/g, dir)
    .replace(/\$\{GOLDID_SKILL_DIR\}/g, dir);
  if (sessionId) body = body.replace(/\$\{HERMES_SESSION_ID\}/g, sessionId);
  if (body.length > MAX_SKILL_CHARS) body = body.slice(0, MAX_SKILL_CHARS) + '\n\n[skill truncated]';
  return [
    `[Skill: ${skill.name}]`,
    `[Skill directory: ${dir}]`,
    `[Source: ${skill.source}]`,
    `[Author: ${skill.author || 'Unknown'}]`,
    `[Usage: ${skill.usage || 'See skill instructions'}]`,
    `[Models tested: ${skill.modelTested.length ? skill.modelTested.join(', ') : 'Not specified'}]`,
    '',
    body,
  ].join('\n');
}

function listResult(cwd = process.cwd()) {
  return discover(cwd).map(({ name, description, version, author, usage, modelTested, platforms, source, file }) => ({
    name,
    description,
    version,
    author,
    usage,
    modelTested,
    platforms,
    source,
    file,
  }));
}

// --- first-run scaffolding for the personal skills directory ---------------

const GOLDID_FOLDER_README = [
  '# Your GolDid skills',
  '',
  'Put your own GolDid skills in this folder, one per subfolder. Each skill is a',
  'directory containing a `SKILL.md` (and ideally a `Version.js`).',
  '',
  'Copy the starter in `../_Template/your-skill-name` to begin, rename the folder',
  'to your skill\'s slug, and edit the two files.',
  '',
].join('\n');

const TEMPLATE_SKILL_MD = [
  '---',
  'name: your-skill-name',
  'description: Use when ... — one or two sentences describing EXACTLY when this skill applies. This is the only text the model sees before deciding whether to open the skill, so lead with "Use when" and name concrete triggers, not vague topics.',
  'version: 1.0.0',
  'author: Your Name',
  'license: MIT',
  'metadata:',
  '  goldid:',
  '    tags: [tag-one, tag-two]',
  '    related_skills: []',
  '---',
  '',
  '<!--',
  'HOW TO USE THIS TEMPLATE',
  '- Copy this folder into ../goldid/ and rename it to your skill slug (kebab-case).',
  '  Public marketplace installs also use readable skill-name slugs for folders.',
  '- Fill in the frontmatter above. `name` and `description` are the ONLY things',
  '  loaded into the prompt up front; the body below is loaded on demand when the',
  '  model runs skill_view. So the description must make the trigger obvious.',
  '- Keep the body skimmable and imperative — deterministic instructions, not prose.',
  '- Delete these comments and any sections you do not need.',
  '- Update Version.js too (keys MUST be double-quoted — it is parsed as JSON).',
  '-->',
  '',
  '# Your Skill Name',
  '',
  '## Overview',
  '',
  'One short paragraph: what this skill does and the concrete outcome it produces.',
  '',
  '## When to Use',
  '',
  '- Concrete trigger 1 (a thing the user asks for)',
  '- Concrete trigger 2',
  '',
  'Do not use when:',
  '',
  '- Out-of-scope case 1',
  '- Out-of-scope case 2',
  '',
  '## Inputs',
  '',
  'What the skill needs before it can start (files, paths, access, parameters).',
  'If something required is missing, say the model should ask for it first.',
  '',
  '## Instructions',
  '',
  'Numbered, ordered, deterministic steps. Be specific — the value of a skill is',
  'removing guesswork.',
  '',
  '1. Step one.',
  '2. Step two.',
  '3. Step three.',
  '',
  '## Tools',
  '',
  'Which GolDid tools this skill relies on and why (read_file, search_text, shell,',
  'web_search, write_file, generate_image, ...). Note any that need approval.',
  '',
  '## Output Format',
  '',
  'Exactly what the final result should look like — sections, fields, or files to',
  'produce. Show the shape so every run is consistent.',
  '',
  '## Examples',
  '',
  'A short worked example: a sample request, what the model does, and the output.',
  'One good example beats a page of description.',
  '',
  '## Common Pitfalls',
  '',
  '- Mistake 1 — and how to avoid it.',
  '- Mistake 2 — and how to avoid it.',
  '',
  '## Verification Checklist',
  '',
  '- [ ] Required inputs gathered',
  '- [ ] Steps followed in order',
  '- [ ] Output matches the format above',
  '- [ ] Edge cases / failure modes handled',
  '',
].join('\n');

const TEMPLATE_VERSION_JS = [
  '"use strict";',
  '',
  '// GolDid normalized skill metadata.',
  '// IMPORTANT: this file is parsed as JSON, so every key MUST be double-quoted,',
  '// with no comments inside the object and no trailing commas.',
  'module.exports = {',
  '  "Author": "Your Name",',
  '  "Name": "your-skill-name",',
  '  "Description": "One-line description of what this skill does.",',
  '  "Usage": "Use when ... (one line describing the trigger).",',
  '  "Model_tested": ["gpt-5", "claude-sonnet"]',
  '};',
  '',
].join('\n');

/**
 * Create the personal skills scaffold under ~/.goldid/skills on first run:
 *   goldid/                       ← put your own skills here (with a README)
 *   _Template/your-skill-name/    ← starter SKILL.md + Version.js
 * The template lives under an underscore-prefixed folder so the loader skips it
 * (it is a reference, not an active skill). Idempotent: never overwrites files.
 */
function ensureScaffold() {
  try {
    const root = path.join(os.homedir(), '.goldid', 'skills');
    fs.mkdirSync(root, { recursive: true });

    const goldidDir = path.join(root, 'goldid');
    if (!fs.existsSync(goldidDir)) {
      fs.mkdirSync(goldidDir, { recursive: true });
      fs.writeFileSync(path.join(goldidDir, 'README.md'), GOLDID_FOLDER_README);
    }

    const tplDir = path.join(root, '_Template', 'your-skill-name');
    if (!fs.existsSync(tplDir)) {
      fs.mkdirSync(tplDir, { recursive: true });
      fs.writeFileSync(path.join(tplDir, 'SKILL.md'), TEMPLATE_SKILL_MD);
      fs.writeFileSync(path.join(tplDir, 'Version.js'), TEMPLATE_VERSION_JS);
    }
  } catch {
    /* non-fatal */
  }
}

module.exports = {
  MAX_SKILL_CHARS,
  VERSION_FILE,
  ensureScaffold,
  defaultRoots,
  parseFrontmatter,
  discover,
  find,
  catalog,
  render,
  listResult,
  parseVersionManifest,
  writeVersionManifest,
  fetchRegistry,
  installFromRegistry,
  unknownManifest,
};
