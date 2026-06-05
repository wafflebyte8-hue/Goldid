'use strict';

/*
 * Terminal UI helpers for GolDid.
 * Inspired by Hermes Agent's terminal language: gold/amber/bronze accents,
 * panel-first layouts, quiet status helpers, masked key entry, and keyboard
 * navigable setup menus. No dependencies.
 */

const supportsColor =
  Boolean(process.stdout.isTTY) &&
  process.env.NO_COLOR == null &&
  process.env.TERM !== 'dumb';

const ESC = '\x1b[';
const ANSI_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;

const symbols = {
  diamond: '\u25c6',
  bullet: '\u25cf',
  circle: '\u25cb',
  check: '\u2713',
  warning: '\u26a0',
  cross: '\u2715',
  gear: '\u2699',
  arrow: '\u203a',
  hook: '\u21b3',
  prompt: '\u276f',
  goodbye: '\u283f',
  h: '\u2500',
  v: '\u2502',
  tl: '\u256d',
  tr: '\u256e',
  bl: '\u2570',
  br: '\u256f',
};

const colorize = (code, s) => (supportsColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const rgb = (r, g, b, bold = false) => (s) =>
  supportsColor ? `\x1b[${bold ? '1;' : ''}38;2;${r};${g};${b}m${s}\x1b[0m` : s;

const color = {
  bold: (s) => colorize('1', s),
  dim: (s) => colorize('2', s),
  red: (s) => colorize('31', s),
  green: (s) => colorize('32', s),
  yellow: (s) => colorize('33', s),
  cyan: (s) => colorize('36', s),
  gray: (s) => colorize('90', s),
};

const gold = rgb(255, 215, 0, true);
const amber = rgb(255, 191, 0);
const bronze = rgb(205, 127, 50);
const mutedGold = rgb(184, 134, 11);
const cream = rgb(255, 248, 220);
const dim = color.dim;

const termWidth = () => Math.max(40, process.stdout.columns || 80);
const termHeight = () => Math.max(10, process.stdout.rows || 24);
const vlen = (s) => String(s ?? '').replace(ANSI_RE, '').length;
const repeat = (s, n) => s.repeat(Math.max(0, n));
const padRight = (s, width) => String(s ?? '') + repeat(' ', width - vlen(String(s ?? '')));

function clip(s, max = 72) {
  s = String(s ?? '');
  if (s.length <= max) return s;
  if (max <= 6) return s.slice(0, max);
  const keep = max - 3;
  const left = Math.ceil(keep / 2);
  const right = Math.floor(keep / 2);
  return s.slice(0, left) + '...' + s.slice(s.length - right);
}

function plainClip(s, max = 72) {
  s = String(s ?? '');
  return vlen(s) <= max ? s : clip(s.replace(ANSI_RE, ''), max);
}

function header(t) {
  console.log('\n' + gold(`${symbols.diamond} ${t}`));
}

function info(t) {
  console.log(dim('  ' + t));
}

function success(t) {
  console.log(color.green(`${symbols.check} ${t}`));
}

function warning(t) {
  console.log(color.yellow(`${symbols.warning} ${t}`));
}

function error(t) {
  console.log(color.red(`${symbols.cross} ${t}`));
}

function rule(width = 58) {
  console.log(bronze(repeat(symbols.h, Math.min(width, termWidth() - 2))));
}

function clear() {
  if (process.stdout.isTTY) process.stdout.write('\x1b[2J\x1b[3J\x1b[H');
}

function transcriptBottom() {
  return Math.max(1, termHeight() - 3);
}

function reserveInputArea() {
  if (process.stdout.isTTY) process.stdout.write(`\x1b[1;${transcriptBottom()}r`);
}

function resetScrollRegion() {
  if (process.stdout.isTTY) process.stdout.write('\x1b[r');
}

function moveToTranscript() {
  if (!process.stdout.isTTY) return;
  reserveInputArea();
  const top = Math.max(1, termHeight() - 2);
  process.stdout.write(`\x1b[${top};1H\x1b[2K`);
  process.stdout.write(`\x1b[${top + 1};1H\x1b[2K`);
  process.stdout.write(`\x1b[${top + 2};1H\x1b[2K`);
  process.stdout.write(`\x1b[${transcriptBottom()};1H\x1b[2K`);
}

function drawInputFrame() {
  if (!process.stdout.isTTY) return;
  reserveInputArea();
  const width = termWidth();
  const top = Math.max(1, termHeight() - 2);
  const line = amber(repeat(symbols.h, width - 1));
  process.stdout.write(`\x1b[${top};1H\x1b[2K${line}`);
  process.stdout.write(`\x1b[${top + 1};1H\x1b[2K`);
  process.stdout.write(`\x1b[${top + 2};1H\x1b[2K${line}`);
  process.stdout.write(`\x1b[${top + 1};1H`);
}

function normalizeRows(rows) {
  return (rows || []).map((r) => (r == null ? '' : String(r)));
}

/** Draw a rounded box around rows, with optional title and responsive width. */
function panel(rows, opts = {}) {
  rows = normalizeRows(rows);
  const border = opts.border || bronze;
  const title = opts.title || '';
  const maxWidth = Math.min(opts.maxWidth || 96, termWidth() - 2);
  const minInner = Math.max(24, vlen(title) + 4, ...rows.map(vlen)) + 2;
  const inner = opts.fillWidth
    ? maxWidth - 2
    : Math.min(Math.max(minInner, opts.width || 0), maxWidth - 2);
  const targetRows = opts.fillHeight
    ? Math.max(rows.length, Math.max(1, Math.min(opts.height || termHeight(), termHeight()) - 2))
    : rows.length;
  while (rows.length < targetRows) rows.push('');
  const dash = (n) => repeat(symbols.h, n);
  const rawTitle = title ? ` ${title} ` : '';
  const titleLen = vlen(rawTitle);

  const top = rawTitle
    ? symbols.tl + symbols.h + rawTitle + dash(inner - titleLen - 1) + symbols.tr
    : symbols.tl + dash(inner) + symbols.tr;

  console.log(border(top));
  for (const row of rows) {
    const line = vlen(row) > inner - 2 ? plainClip(row, inner - 5) + '...' : row;
    console.log(border(symbols.v) + ' ' + padRight(line, inner - 2) + ' ' + border(symbols.v));
  }
  console.log(border(symbols.bl + dash(inner) + symbols.br));
}

function panelColumns(groups, opts = {}) {
  const clean = groups.map((g) => normalizeRows(g.rows || g));
  const widths = clean.map((rows) => Math.max(1, ...rows.map(vlen)));
  const gap = opts.gap || '   ';
  const total = widths.reduce((n, w) => n + w, 0) + gap.length * (widths.length - 1);
  const available = Math.min(opts.maxWidth || 96, termWidth() - 2) - 4;

  if (total > available) {
    const rows = [];
    clean.forEach((group, i) => {
      if (i) rows.push('');
      rows.push(...group);
    });
    return panel(rows, opts);
  }

  const height = Math.max(...clean.map((rows) => rows.length));
  const rows = [];
  for (let i = 0; i < height; i++) {
    rows.push(clean.map((group, col) => padRight(group[i] || '', widths[col])).join(gap));
  }
  return panel(rows, opts);
}

function table(rows, opts = {}) {
  rows = rows || [];
  const pad = opts.padding == null ? 2 : opts.padding;
  const widths = [];
  for (const row of rows) {
    row.forEach((cell, i) => {
      widths[i] = Math.max(widths[i] || 0, vlen(cell));
    });
  }
  return rows.map((row) =>
    row.map((cell, i) => (i === row.length - 1 ? String(cell) : padRight(cell, widths[i] + pad))).join('')
  );
}

function kv(label, value, width = 8) {
  return dim(String(label).padEnd(width)) + ' ' + value;
}

function tag(text, tone = 'amber') {
  const fn = tone === 'gold' ? gold : tone === 'green' ? color.green : tone === 'red' ? color.red : amber;
  return fn(text);
}

async function numberMenu(ask, title, choices, defaultIdx = 0) {
  console.log('\n' + amber(title));
  choices.forEach((ch, i) => {
    const marker = i === defaultIdx ? symbols.bullet : symbols.circle;
    const line = `  ${marker} ${String(i + 1).padStart(2)}. ${ch}`;
    console.log(i === defaultIdx ? gold(line) : line);
  });
  info(`Enter 1-${choices.length}${defaultIdx != null ? `  (blank = ${defaultIdx + 1})` : ''}`);
  for (;;) {
    const v = (await ask(dim(`  select [1-${choices.length}]: `))).trim();
    if (!v && defaultIdx != null) return defaultIdx;
    const idx = parseInt(v, 10) - 1;
    if (idx >= 0 && idx < choices.length) return idx;
    error(`Please enter a number between 1 and ${choices.length}.`);
  }
}

function keyMenu(ctx, title, choices, defaultIdx = 0, opts = {}) {
  const stdin = process.stdin;
  const stdout = process.stdout;
  const pageSize = Math.max(5, Math.min(opts.pageSize || 12, (stdout.rows || 24) - 7));
  let idx = Math.min(Math.max(defaultIdx || 0, 0), choices.length - 1);
  let top = Math.max(0, Math.min(idx - Math.floor(pageSize / 2), choices.length - pageSize));

  const ask = typeof ctx === 'function' ? ctx : ctx.ask;
  const rl = typeof ctx === 'function' ? null : ctx.rl;
  if (!stdin.isTTY || !stdout.isTTY || !stdin.setRawMode || choices.length < 2) {
    return numberMenu(ask, title, choices, defaultIdx);
  }

  let drawn = 0;
  const adjustTop = () => {
    if (idx < top) top = idx;
    if (idx >= top + pageSize) top = idx - pageSize + 1;
    top = Math.max(0, Math.min(top, Math.max(0, choices.length - pageSize)));
  };

  const writeLine = (line = '') => {
    stdout.write(`${ESC}2K\r${line}\n`);
    drawn++;
  };

  const render = () => {
    if (drawn) stdout.write(`${ESC}${drawn}A`);
    drawn = 0;
    writeLine('');
    writeLine(amber(title));
    const end = Math.min(choices.length, top + pageSize);
    if (top > 0) writeLine(dim(`  ${symbols.arrow} ${top} more above`));
    for (let i = top; i < end; i++) {
      const selected = i === idx;
      const marker = selected ? symbols.bullet : symbols.circle;
      const pointer = selected ? symbols.arrow : ' ';
      const line = `  ${pointer} ${marker} ${String(i + 1).padStart(2)}. ${plainClip(choices[i], termWidth() - 12)}`;
      writeLine(selected ? gold(line) : line);
    }
    if (end < choices.length) writeLine(dim(`  ${symbols.arrow} ${choices.length - end} more below`));
    writeLine(dim('  Up/Down move  Enter select  Esc keep current'));
  };

  return new Promise((resolve, reject) => {
    const wasRaw = Boolean(stdin.isRaw);

    const cleanup = () => {
      stdin.off('data', onData);
      if (stdin.setRawMode) stdin.setRawMode(wasRaw);
      stdout.write(`${ESC}?25h`);
      if (rl && typeof rl.resume === 'function') rl.resume();
    };

    const finish = (value) => {
      cleanup();
      stdout.write('\n');
      resolve(value);
    };

    const onData = (buf) => {
      const key = buf.toString('utf8');
      if (key === '\r' || key === '\n') return finish(idx);
      if (key === '\x03') {
        cleanup();
        stdout.write('\n');
        return reject(new Error('cancelled'));
      }
      if (key === '\x1b') return finish(defaultIdx);

      if (key === '\x1b[A') idx = Math.max(0, idx - 1);
      else if (key === '\x1b[B') idx = Math.min(choices.length - 1, idx + 1);
      else if (key === '\x1b[H') idx = 0;
      else if (key === '\x1b[F') idx = choices.length - 1;
      else if (key === '\x1b[5~') idx = Math.max(0, idx - pageSize);
      else if (key === '\x1b[6~') idx = Math.min(choices.length - 1, idx + pageSize);
      else if (/^[1-9]$/.test(key) && Number(key) <= choices.length) return finish(Number(key) - 1);
      else return;

      adjustTop();
      render();
    };

    if (rl && typeof rl.pause === 'function') rl.pause();
    stdout.write(`${ESC}?25l`);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
    render();
  });
}

/**
 * Select menu. In a TTY it supports arrows; otherwise it falls back to a
 * numbered prompt. Pass either the full ctx object ({ rl, ask }) or ask().
 */
async function menu(ctxOrAsk, title, choices, defaultIdx = 0, opts = {}) {
  if (!Array.isArray(choices) || choices.length === 0) throw new Error('menu requires choices');
  return keyMenu(ctxOrAsk, title, choices, defaultIdx, opts);
}

/** Prompt for a secret, echoing '*'. Plain prompt when stdin isn't a TTY. */
function askMasked(rl, query) {
  if (!process.stdin.isTTY) return new Promise((res) => rl.question(query, res));
  return new Promise((resolve) => {
    const orig = rl._writeToOutput;
    let masking = false;
    rl._writeToOutput = function (str) {
      if (!masking) return orig.call(rl, str);
      if (/^[^\x00-\x1f]+$/.test(str)) return orig.call(rl, '*'.repeat(str.length));
      return orig.call(rl, str);
    };
    rl.question(query, (answer) => {
      rl._writeToOutput = orig;
      resolve(answer);
    });
    masking = true;
  });
}

/** Braille spinner shown while waiting on the model. Returns { stop() }. */
function spinner(label) {
  if (!process.stdout.isTTY) return { stop() {} };
  const frames = ['\u280b', '\u2819', '\u2839', '\u2838', '\u283c', '\u2834', '\u2826', '\u2827', '\u2807', '\u280f'];
  let i = 0;
  const id = setInterval(() => {
    process.stdout.write('\r' + gold(frames[i++ % frames.length]) + ' ' + dim(label) + '   ');
  }, 80);
  return {
    stop() {
      clearInterval(id);
      process.stdout.write('\r' + repeat(' ', vlen(label) + 6) + '\r');
    },
  };
}

module.exports = {
  color,
  gold,
  amber,
  bronze,
  mutedGold,
  cream,
  dim,
  symbols,
  header,
  info,
  success,
  warning,
  error,
  rule,
  clear,
  reserveInputArea,
  resetScrollRegion,
  moveToTranscript,
  drawInputFrame,
  panel,
  panelColumns,
  table,
  kv,
  tag,
  menu,
  askMasked,
  spinner,
  vlen,
  plainClip,
  termWidth,
  termHeight,
  padRight,
  clip,
  useColor: supportsColor,
};
