'use strict';

/*
 * Agent tools for GolDid — a small, safe subset of what Hermes exposes.
 * The model invokes a tool by emitting a <tool_call> block (see lib/prompt.js);
 * goldid.js parses it, runs the tool here, and feeds the result back.
 *
 * `danger: true` tools require interactive user approval before they run.
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const memory = require('./memory');
const skills = require('./skills');

const MAX_OUTPUT = 4000;
const clip = (s) =>
  s.length > MAX_OUTPUT ? s.slice(0, MAX_OUTPUT) + `\n…(${s.length - MAX_OUTPUT} more chars truncated)` : s;

const SKIP_DIRS = new Set(['.git', 'node_modules', '.next', 'dist', 'build', '.cache']);
const MAX_WALK_ENTRIES = 15000;
const MAX_SEARCH_FILE_BYTES = 1024 * 1024;

function asInt(value, fallback, max) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
}

function asBool(value) {
  return /^(1|true|yes|y|on)$/i.test(String(value || ''));
}

function normalizeRel(root, full) {
  const rel = path.relative(root, full) || path.basename(full);
  return rel.split(path.sep).join('/');
}

function wildcardRegex(pattern) {
  const escaped = String(pattern || '*').replace(/[.+^${}()|[\]\\]/g, '\\$&');
  return new RegExp('^' + escaped.replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
}

function makeMatcher(pattern) {
  pattern = String(pattern || '*').trim() || '*';
  if (pattern.includes('*') || pattern.includes('?')) {
    const re = wildcardRegex(pattern);
    return (rel, base) => re.test(rel) || re.test(base);
  }
  const needle = pattern.toLowerCase();
  return (rel, base) => rel.toLowerCase().includes(needle) || base.toLowerCase().includes(needle);
}

function walk(root, onEntry) {
  root = path.resolve(root || '.');
  const stack = [root];
  let seen = 0;
  while (stack.length) {
    const dir = stack.pop();
    let items;
    try {
      items = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const item of items) {
      if (++seen > MAX_WALK_ENTRIES) return { root, truncated: true, seen };
      const full = path.join(dir, item.name);
      const rel = normalizeRel(root, full);
      onEntry({ item, full, rel });
      if (item.isDirectory() && !SKIP_DIRS.has(item.name) && !item.isSymbolicLink()) {
        stack.push(full);
      }
    }
  }
  return { root, truncated: false, seen };
}

function typeOfStat(st) {
  if (st.isFile()) return 'file';
  if (st.isDirectory()) return 'directory';
  if (st.isSymbolicLink()) return 'symlink';
  if (st.isSocket()) return 'socket';
  if (st.isFIFO()) return 'fifo';
  return 'other';
}

// --- web search (DuckDuckGo HTML endpoint; no API key required) ---

const SEARCH_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&#x0*27;|&apos;/gi, "'")
    .replace(/&nbsp;/g, ' ');
}

function stripTags(s) {
  return decodeEntities(String(s).replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

// DDG wraps result links as //duckduckgo.com/l/?uddg=<encoded-real-url>&...
function resolveRedirect(href) {
  const m = href.match(/[?&]uddg=([^&]+)/);
  if (m) {
    try {
      return decodeURIComponent(m[1]);
    } catch {
      /* fall through, keep raw */
    }
  }
  return href.startsWith('//') ? 'https:' + href : href;
}

function parseSearchResults(html, limit) {
  const hits = [];
  const linkRe = /<a\b[^>]*class="[^"]*\bresult__a\b[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = linkRe.exec(html)) && hits.length < limit) {
    const title = stripTags(m[2]);
    if (title) hits.push({ title, url: resolveRedirect(decodeEntities(m[1])), snippet: '' });
  }
  // Snippets appear in the same document order; zip them onto the hits.
  const snipRe = /class="[^"]*\bresult__snippet\b[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  let s;
  let i = 0;
  while ((s = snipRe.exec(html)) && i < hits.length) {
    hits[i++].snippet = stripTags(s[1]);
  }
  return hits;
}

async function fetchText(url, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeout || 12000);
  try {
    const res = await fetch(url, {
      method: opts.method || 'GET',
      headers: { 'User-Agent': SEARCH_UA, ...(opts.headers || {}) },
      body: opts.body,
      signal: ctrl.signal,
    });
    if (!res.ok && res.status !== 202) throw new Error('HTTP ' + res.status);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// Primary: scrape the DuckDuckGo HTML results page. Works from ordinary IPs; some
// flagged/datacenter IPs get an empty 202 anti-bot stub, in which case we fall back.
async function scrapeDuckDuckGo(query, limit) {
  const html = await fetchText('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query), {
    headers: { Accept: 'text/html', 'Accept-Language': 'en-US,en;q=0.9' },
  });
  return parseSearchResults(html, limit);
}

// Fallback: DuckDuckGo Instant Answer API — official JSON, no key, never bot-blocked,
// but only carries abstracts / related topics (great for factual lookups).
async function instantAnswer(query, limit) {
  const txt = await fetchText(
    'https://api.duckduckgo.com/?q=' + encodeURIComponent(query) + '&format=json&no_html=1&no_redirect=1&t=goldid',
    { headers: { Accept: 'application/json' } }
  );
  let data;
  try {
    data = JSON.parse(txt);
  } catch {
    return [];
  }
  const hits = [];
  const push = (title, url, snippet) => {
    if (hits.length < limit && title && url) {
      hits.push({ title: String(title).trim(), url, snippet: String(snippet || '').trim() });
    }
  };
  if (data.AbstractText) push(data.Heading || query, data.AbstractURL, data.AbstractText);
  const walk = (arr) => {
    for (const t of arr || []) {
      if (hits.length >= limit) break;
      if (Array.isArray(t.Topics)) walk(t.Topics);
      else if (t.FirstURL && t.Text) push(t.Text.split(' - ')[0], t.FirstURL, t.Text);
    }
  };
  walk(data.RelatedTopics);
  return hits.slice(0, limit);
}

async function webSearch(query, limit) {
  let hits = [];
  try {
    hits = await scrapeDuckDuckGo(query, limit);
  } catch {
    /* fall through to the instant-answer API */
  }
  if (!hits.length) {
    try {
      hits = await instantAnswer(query, limit);
    } catch {
      /* give up gracefully; the tool reports no results */
    }
  }
  return hits;
}

const TOOLS = {
  time: {
    desc: 'Get the current local date and time.',
    args: {},
    required: [],
    danger: false,
    run: async () => new Date().toString(),
  },
  cwd: {
    desc: 'Get the current working directory.',
    args: {},
    required: [],
    danger: false,
    run: async () => process.cwd(),
  },
  memory: {
    desc: 'Read or update curated persistent memory/personality across sessions.',
    args: {
      action: 'read, add, replace, or remove',
      target: 'memory, user, or personality (default "memory")',
      content: 'entry content for add/replace',
      old_text: 'short unique substring for replace/remove',
    },
    required: ['action'],
    danger: false,
    run: async (args) => memory.runTool(args || {}),
  },
  skills_list: {
    desc: 'List installed reusable skills and their descriptions.',
    args: {},
    required: [],
    danger: false,
    run: async () => JSON.stringify(skills.listResult(process.cwd()), null, 2),
  },
  skill_view: {
    desc: 'Load the full instructions for one installed skill before using it.',
    args: { name: 'skill name or directory slug' },
    required: ['name'],
    danger: false,
    run: async ({ name }, ctx = {}) => {
      const skill = skills.find(name, process.cwd());
      if (!skill) throw new Error(`skill not found: ${name}`);
      return skills.render(skill, ctx.sessionId || '');
    },
  },
  list_dir: {
    desc: 'List the entries in a directory.',
    args: { path: 'directory path (default ".")' },
    required: [],
    danger: false,
    run: async ({ path: p = '.' }) => {
      const items = fs.readdirSync(p, { withFileTypes: true });
      return clip(items.map((d) => (d.isDirectory() ? d.name + '/' : d.name)).join('\n') || '(empty)');
    },
  },
  read_file: {
    desc: 'Read the contents of a UTF-8 text file.',
    args: { path: 'file path' },
    required: ['path'],
    danger: false,
    run: async ({ path: p }) => {
      if (!p) throw new Error('path is required');
      return clip(fs.readFileSync(p, 'utf8'));
    },
  },
  file_info: {
    desc: 'Get metadata for a file or directory.',
    args: { path: 'file or directory path' },
    required: ['path'],
    danger: false,
    run: async ({ path: p }) => {
      if (!p) throw new Error('path is required');
      const full = path.resolve(p);
      const st = fs.lstatSync(full);
      const lines = [
        `path: ${full}`,
        `type: ${typeOfStat(st)}`,
        `size: ${st.size} bytes`,
        `modified: ${st.mtime.toISOString()}`,
        `created: ${st.birthtime.toISOString()}`,
      ];
      if (st.isDirectory()) {
        try {
          lines.push(`entries: ${fs.readdirSync(full).length}`);
        } catch {
          lines.push('entries: unreadable');
        }
      }
      return lines.join('\n');
    },
  },
  find_files: {
    desc: 'Find files or directories recursively by name, substring, or wildcard pattern.',
    args: {
      path: 'directory to search (default ".")',
      pattern: 'name substring or wildcard pattern like "*.js" (default "*")',
      max_results: 'maximum results to return (default 100)',
    },
    required: [],
    danger: false,
    run: async ({ path: p = '.', pattern = '*', max_results = '100' }) => {
      const root = path.resolve(p || '.');
      const limit = asInt(max_results, 100, 500);
      const match = makeMatcher(pattern);
      const found = [];
      const result = walk(root, ({ item, rel }) => {
        if (found.length >= limit) return;
        if (match(rel, item.name)) found.push(item.isDirectory() ? rel + '/' : rel);
      });
      const suffix = result.truncated ? `\n...(stopped after ${result.seen} entries)` : '';
      return clip((found.join('\n') || '(no matches)') + suffix);
    },
  },
  search_text: {
    desc: 'Search text files recursively for a string.',
    args: {
      path: 'file or directory to search (default ".")',
      pattern: 'text to search for',
      case_sensitive: 'true or false (default false)',
      max_results: 'maximum matching lines to return (default 100)',
    },
    required: ['pattern'],
    danger: false,
    run: async ({ path: p = '.', pattern, case_sensitive = 'false', max_results = '100' }) => {
      if (!pattern) throw new Error('pattern is required');
      const root = path.resolve(p || '.');
      const limit = asInt(max_results, 100, 500);
      const sensitive = asBool(case_sensitive);
      const needle = sensitive ? String(pattern) : String(pattern).toLowerCase();
      const matches = [];

      const searchFile = (full, rel) => {
        if (matches.length >= limit) return;
        let st;
        try {
          st = fs.statSync(full);
        } catch {
          return;
        }
        if (!st.isFile() || st.size > MAX_SEARCH_FILE_BYTES) return;
        let text;
        try {
          const buf = fs.readFileSync(full);
          if (buf.includes(0)) return;
          text = buf.toString('utf8');
        } catch {
          return;
        }
        const lines = text.split(/\r?\n/);
        for (let i = 0; i < lines.length && matches.length < limit; i++) {
          const hay = sensitive ? lines[i] : lines[i].toLowerCase();
          if (hay.includes(needle)) {
            matches.push(`${rel}:${i + 1}: ${lines[i].trim().slice(0, 180)}`);
          }
        }
      };

      let result = { truncated: false, seen: 1 };
      const st = fs.statSync(root);
      if (st.isFile()) {
        searchFile(root, path.basename(root));
      } else {
        result = walk(root, ({ item, full, rel }) => {
          if (item.isFile()) searchFile(full, rel);
        });
      }
      const suffix = result.truncated ? `\n...(stopped after ${result.seen} entries)` : '';
      return clip((matches.join('\n') || '(no matches)') + suffix);
    },
  },
  web_search: {
    desc: 'Search the web (DuckDuckGo) for current information; returns titles, URLs, and snippets.',
    args: {
      query: 'the search query',
      max_results: 'maximum results to return (default 5)',
    },
    required: ['query'],
    danger: false,
    run: async ({ query, max_results = '5' }) => {
      const q = String(query || '').trim();
      if (!q) throw new Error('query is required');
      const limit = asInt(max_results, 5, 10);
      const hits = await webSearch(q, limit);
      if (!hits.length) return `(no results for "${q}")`;
      return clip(
        hits
          .map((h, i) => `${i + 1}. ${h.title}\n   ${h.url}${h.snippet ? '\n   ' + h.snippet : ''}`)
          .join('\n\n')
      );
    },
  },
  write_file: {
    desc: 'Create or overwrite a text file.',
    args: { path: 'file path', content: 'text to write' },
    required: ['path', 'content'],
    danger: true,
    run: async ({ path: p, content = '' }) => {
      if (!p) throw new Error('path is required');
      fs.mkdirSync(path.dirname(path.resolve(p)), { recursive: true });
      fs.writeFileSync(p, content);
      return `Wrote ${Buffer.byteLength(content)} bytes to ${p}`;
    },
  },
  shell: {
    desc: 'Run a shell command on this machine and return its output.',
    args: { command: 'the command line to execute' },
    required: ['command'],
    danger: true,
    run: ({ command }) =>
      new Promise((resolve) => {
        if (!command) return resolve('Error: command is required');
        exec(command, { timeout: 60000, windowsHide: true, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
          const out = ((stdout || '') + (stderr || '')).trim();
          resolve(clip(out || (err ? 'Error: ' + err.message : '(no output)')));
        });
      }),
  },
};

/** OpenAI-format tool/function schemas for native function calling. */
function toolSchemas() {
  return Object.entries(TOOLS).map(([name, t]) => ({
    type: 'function',
    function: {
      name,
      description: t.desc,
      parameters: {
        type: 'object',
        properties: Object.fromEntries(
          Object.entries(t.args).map(([k, d]) => [k, { type: 'string', description: d }])
        ),
        required: t.required || [],
      },
    },
  }));
}

/** One-line descriptions of every tool, for the system prompt / `/tools`. */
function toolSummaryLines() {
  return Object.entries(TOOLS).map(([name, t]) => {
    const args = Object.keys(t.args).length ? '(' + Object.keys(t.args).join(', ') + ')' : '()';
    return `- ${name}${args}: ${t.desc}${t.danger ? ' [needs approval]' : ''}`;
  });
}

function extractJson(s) {
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
}

function asCall(obj) {
  if (!obj || typeof obj !== 'object') return null;
  // Small models mislabel the name key (name/tool/function/file/...) — accept the
  // common variants. `args` may also arrive as arguments/parameters/input.
  let name = null;
  for (const k of ['name', 'tool', 'tool_name', 'function', 'action', 'file']) {
    if (typeof obj[k] === 'string') { name = obj[k]; break; }
  }
  if (!name) return null;
  return { name, args: obj.args || obj.arguments || obj.parameters || obj.input || {} };
}

/**
 * Extract a tool call from model output, tolerating the ways small models mangle
 * it: missing the opening <tool_call> tag, ```json fences, or a bare JSON object.
 * Returns { name, args } or null.
 */
function parseToolCall(text) {
  // 1. Proper <tool_call> … </tool_call> block.
  let m = text.match(/<tool_call>\s*([\s\S]*?)<\/tool_call>/i);
  if (m) return asCall(extractJson(m[1]));
  // 2. A dangling </tool_call> with no opening tag (a common slip).
  m = text.match(/([\s\S]*?)<\/tool_call>/i);
  if (m && m[1].includes('{')) return asCall(extractJson(m[1]));
  // 3. The whole reply is just a JSON object that names a known tool.
  const fenced = text.trim().match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  const body = (fenced ? fenced[1] : text).trim();
  if (/^\{[\s\S]*\}$/.test(body)) {
    const call = asCall(extractJson(body));
    if (call && TOOLS[call.name]) return call; // guard against ordinary JSON answers
  }
  return null;
}

module.exports = { TOOLS, toolSchemas, toolSummaryLines, parseToolCall, clip };
