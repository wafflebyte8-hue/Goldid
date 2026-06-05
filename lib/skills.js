'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const MAX_SKILLS = 500;
const MAX_SKILL_CHARS = 30000;

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
    const slug = path.basename(dir).toLowerCase();
    const name = String(parsed.metadata.name || slug).replace(/\s+/g, ' ').trim().slice(0, 80);
    const platforms = Array.isArray(parsed.metadata.platforms) ? parsed.metadata.platforms : [];
    const description = String(parsed.metadata.description || firstHeading(parsed.body) || 'No description.')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 240);
    return {
      name,
      slug,
      description,
      version: String(parsed.metadata.version || '').trim(),
      author: String(parsed.metadata.author || '').trim(),
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
    '',
    body,
  ].join('\n');
}

function listResult(cwd = process.cwd()) {
  return discover(cwd).map(({ name, description, version, platforms, source, file }) => ({
    name,
    description,
    version,
    platforms,
    source,
    file,
  }));
}

module.exports = {
  MAX_SKILL_CHARS,
  defaultRoots,
  parseFrontmatter,
  discover,
  find,
  catalog,
  render,
  listResult,
};
