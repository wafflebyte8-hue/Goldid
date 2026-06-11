'use strict';

const fs = require('fs');
const path = require('path');

const IGNORE_DIRS = new Set([
  '.git', '.hg', '.svn', 'node_modules', 'dist', 'build', 'out', 'coverage',
  '.next', '.nuxt', '.svelte-kit', '.firebase', '.cache', '.parcel-cache',
  'vendor', '__pycache__',
]);
const IGNORE_FILES = new Set(['.env', '.env.local', '.env.production', '.DS_Store']);
const TEXT_EXTS = new Set([
  '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.json', '.html', '.css',
  '.scss', '.sass', '.less', '.vue', '.svelte', '.md', '.py', '.rb', '.go',
  '.rs', '.java', '.cs', '.php', '.sh', '.ps1',
]);

function normalizeRel(file) {
  return file.split(path.sep).join('/');
}

function shouldIgnore(name, fullPath) {
  if (IGNORE_FILES.has(name)) return true;
  if (name.startsWith('.env')) return true;
  try {
    return fs.statSync(fullPath).isDirectory() && IGNORE_DIRS.has(name);
  } catch {
    return false;
  }
}

function walk(root, dir = root, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (shouldIgnore(entry.name, full)) continue;
    if (entry.isDirectory()) walk(root, full, out);
    else if (entry.isFile() && TEXT_EXTS.has(path.extname(entry.name).toLowerCase())) {
      out.push(normalizeRel(path.relative(root, full)));
    }
  }
  return out;
}

function readSmall(root, rel) {
  const full = path.join(root, rel);
  const stat = fs.statSync(full);
  if (stat.size > 1024 * 1024) return '';
  return fs.readFileSync(full, 'utf8');
}

function extractRefs(text) {
  const refs = new Set();
  const patterns = [
    /\bimport\s+(?:[^'"]+\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bexport\s+[^'"]*\s+from\s+['"]([^'"]+)['"]/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /<script[^>]+src=['"]([^'"]+)['"]/g,
    /<link[^>]+href=['"]([^'"]+)['"]/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text))) refs.add(match[1]);
  }
  return [...refs];
}

function resolveRef(root, fromRel, ref, fileSet) {
  if (!ref || !ref.startsWith('.')) return null;
  const fromDir = path.dirname(fromRel);
  const base = normalizeRel(path.normalize(path.join(fromDir, ref)));
  const candidates = [
    base,
    `${base}.js`, `${base}.jsx`, `${base}.mjs`, `${base}.cjs`,
    `${base}.ts`, `${base}.tsx`, `${base}.json`, `${base}.css`, `${base}.html`,
    `${base}/index.js`, `${base}/index.ts`, `${base}/index.tsx`, `${base}/index.html`,
  ];
  return candidates.find((item) => fileSet.has(item)) || null;
}

function build(rootDir) {
  const root = path.resolve(rootDir || process.cwd());
  const files = walk(root).sort((a, b) => a.localeCompare(b));
  const fileSet = new Set(files);
  const nodes = files.map((id) => {
    let size = 0;
    try { size = fs.statSync(path.join(root, id)).size; } catch { /* keep 0 */ }
    return { id, label: path.basename(id), group: path.dirname(id) === '.' ? '' : path.dirname(id), size };
  });
  const edges = [];
  for (const file of files) {
    let text = '';
    try { text = readSmall(root, file); } catch { continue; }
    for (const ref of extractRefs(text)) {
      const target = resolveRef(root, file, ref, fileSet);
      if (target && target !== file) edges.push({ source: file, target, type: 'import' });
    }
  }
  return { root, generatedAt: new Date().toISOString(), nodes, edges };
}

module.exports = { build };
