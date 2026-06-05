#!/usr/bin/env node
'use strict';

/*
 * GolDid — a chat-first CLI for talking to AI models.
 *
 *   gd                 start chatting with your active model
 *   gd <prompt...>     one-shot: send a single prompt and print the reply
 *   gd setup           (re)configure providers and models
 *
 * Inside the chat, slash-commands handle configuration (/help, /model, ...).
 * Styling is modeled on the Hermes Agent CLI.
 */

const readline = require('readline');
const config = require('./lib/config');
const providers = require('./lib/providers');
const ui = require('./lib/ui');
const prompt = require('./lib/prompt');
const tools = require('./lib/tools');
const memory = require('./lib/memory');
const sessions = require('./lib/sessions');
const projectContext = require('./lib/context');
const skills = require('./lib/skills');

const VERSION = '0.8.0';
const MAX_AGENT_STEPS = 6;
const TOOL_TAG = '<tool_call>';

const toolsEnabled = (cfg) => cfg.agent?.tools !== false; // default on

// Cloud providers — and Ollama's hosted ":cloud" models — get the detailed
// (cloud) system prompt; small local models get the short, natural one.
function modelClass(def, model) {
  if (def.kind === 'cloud') return 'cloud';
  if (/:cloud\b/i.test(model || '')) return 'cloud';
  return 'local';
}

function maskKey(k) {
  if (!k) return '';
  return k.length <= 8 ? '****' : `${k.slice(0, 4)}…${k.slice(-4)}`;
}

function activeLabel(cfg) {
  return cfg.active.provider
    ? `${cfg.active.provider} / ${cfg.active.model || '(no model)'}`
    : 'not configured';
}

function memorySummary() {
  try {
    const user = memory.read('user');
    const notes = memory.read('memory');
    const personality = memory.read('personality');
    return `${notes.entry_count} notes, ${user.entry_count} user, ${personality.entry_count} personality`;
  } catch {
    return 'unavailable';
  }
}

function loadConversationMemory(ctx) {
  ctx.memorySnapshot = memory.formatForPrompt({ includeEmpty: true });
  return ctx.memorySnapshot;
}

// =============================================================================
// Welcome banner (Hermes-inspired gold panel)
// =============================================================================

const LOGO = [
  '   ____       _ ____  _     _ ',
  '  / ___| ___ | |  _ \\(_) __| |',
  ' | |  _ / _ \\| | | | | |/ _` |',
  ' | |_| | (_) | | |_| | | (_| |',
  '  \\____|\\___/|_|____/|_|\\__,_|',
];
const LOGO_GRAD = [ui.gold, ui.gold, ui.amber, ui.amber, ui.bronze];

const HERO = [
  '  ██████╗  ██████╗ ██╗     ██████╗ ██╗██████╗ ',
  ' ██╔════╝ ██╔═══██╗██║     ██╔══██╗██║██╔══██╗',
  ' ██║  ███╗██║   ██║██║     ██║  ██║██║██║  ██║',
  ' ██║   ██║██║   ██║██║     ██║  ██║██║██║  ██║',
  ' ╚██████╔╝╚██████╔╝███████╗██████╔╝██║██████╔╝',
  '  ╚═════╝  ╚═════╝ ╚══════╝╚═════╝ ╚═╝╚═════╝ ',
];
const HERO_GRAD = [ui.gold, ui.gold, ui.amber, ui.amber, ui.bronze, ui.bronze];

function statusValue(value) {
  return value ? ui.gold(value) : ui.dim('not configured');
}

function providerRows(cfg, maxRows) {
  const rows = [];
  for (const [key, def] of Object.entries(providers.PROVIDERS)) {
    const conf = cfg.providers[key] || {};
    const active = cfg.active.provider === key;
    const configured = def.kind === 'local' || Boolean(conf.apiKey || conf.baseUrl);
    const mark = active ? ui.gold(ui.symbols.arrow) : configured ? ui.amber('*') : ui.dim(' ');
    const detail = conf.apiKey
      ? ui.dim('key ' + maskKey(conf.apiKey))
      : conf.baseUrl
        ? ui.dim('@ ' + conf.baseUrl)
        : def.kind === 'local'
          ? ui.dim('ready')
          : ui.color.yellow('no key');
    rows.push(`${mark} ${ui.padRight(ui.gold(key), 13)} ${ui.padRight(ui.dim(def.kind), 7)} ${detail}`);
  }
  return rows.slice(0, maxRows);
}

function toolRows(maxRows) {
  return Object.entries(tools.TOOLS).slice(0, maxRows).map(([name, t]) => {
    const approval = t.danger ? ui.color.yellow('approval') : ui.dim('auto');
    return `${ui.padRight(ui.gold(name), 12)} ${ui.padRight(approval, 10)} ${ui.dim(ui.clip(t.desc, 38))}`;
  });
}

function commandRows() {
  return [
    `${ui.gold('/setup')}      ${ui.dim('configure provider/model')}`,
    `${ui.gold('/providers')}  ${ui.dim('inspect configured backends')}`,
    `${ui.gold('/tools')}      ${ui.dim('show agent capabilities')}`,
    `${ui.gold('/memory')}     ${ui.dim('view persistent memory')}`,
    `${ui.gold('/sessions')}   ${ui.dim('find or resume past chats')}`,
    `${ui.gold('/skills')}     ${ui.dim('inspect reusable skills')}`,
    `${ui.gold('/model')}      ${ui.dim('switch or inspect model')}`,
    `${ui.gold('/help')}       ${ui.dim('command reference')}`,
    `${ui.gold('/exit')}       ${ui.dim('quit')}`,
  ];
}

function columns(left, right, leftWidth, rightWidth, gap = '     ') {
  const rows = [];
  const height = Math.max(left.length, right.length);
  for (let i = 0; i < height; i++) {
    const l = ui.vlen(left[i] || '') > leftWidth ? ui.dim(ui.plainClip(left[i], leftWidth)) : (left[i] || '');
    const r = ui.vlen(right[i] || '') > rightWidth ? ui.dim(ui.plainClip(right[i], rightWidth)) : (right[i] || '');
    rows.push(ui.padRight(l, leftWidth) + gap + r);
  }
  return rows;
}

function welcomeRows(cfg, width) {
  const contentWidth = Math.max(36, width - 4);
  const wide = contentWidth >= 104;
  const rows = [];

  const logo = wide ? HERO : LOGO;
  const grad = wide ? HERO_GRAD : LOGO_GRAD;
  logo.forEach((line, i) => rows.push(grad[i](line)));
  rows.push('');

  const activeProvider = cfg.active.provider || '';
  const providerDef = activeProvider ? providers.PROVIDERS[activeProvider] : null;
  const providerLabel = providerDef?.label || activeProvider || 'not configured';
  const modelLabel = cfg.active.model || '';
  const agent = toolsEnabled(cfg)
    ? ui.amber('on') + ui.dim(` - ${Object.keys(tools.TOOLS).length} tools`)
    : ui.dim('off');

  const session = [
    ui.amber('Session'),
    ui.kv('provider', statusValue(providerLabel)),
    ui.kv('model', statusValue(ui.clip(modelLabel, wide ? 52 : 32))),
    ui.kv('agent', agent),
    ui.kv('memory', ui.dim(memorySummary())),
    ui.kv('cwd', ui.dim(ui.clip(process.cwd(), wide ? 58 : 34))),
    ui.kv('config', ui.dim(ui.clip(config.CONFIG_PATH, wide ? 58 : 34))),
    '',
    ui.amber('Quick commands'),
    ...commandRows(),
  ];

  const maxToolRows = wide ? 5 : 3;
  const maxProviderRows = wide ? 9 : 4;
  const right = [
    ui.amber('Agent tools'),
    ...toolRows(maxToolRows),
    '',
    ui.amber('Providers'),
    ...providerRows(cfg, maxProviderRows),
  ];

  if (wide) {
    const gap = '      ';
    const leftWidth = Math.min(68, Math.floor((contentWidth - gap.length) * 0.43));
    const rightWidth = contentWidth - leftWidth - gap.length;
    rows.push(...columns(session, right, leftWidth, rightWidth, gap));
  } else {
    rows.push(...session, '', ...right);
  }

  const bar = ui.bronze(ui.symbols.h.repeat(contentWidth));
  const sep = ui.dim(' | ');
  const statusTail = contentWidth >= 96
    ? [ui.dim('tools ' + (toolsEnabled(cfg) ? 'on' : 'off')), ui.dim('/help commands'), ui.dim('/exit quit')]
    : [ui.dim('/help'), ui.dim('/exit')];
  const statusHead = ui.amber(ui.symbols.diamond);
  const reserved = ui.vlen(statusHead) + ui.vlen(sep) * statusTail.length + statusTail.reduce((n, s) => n + ui.vlen(s), 0) + 1;
  const modelChip = ui.gold(ui.clip(activeLabel(cfg), Math.max(12, contentWidth - reserved)));
  const status = [statusHead, modelChip, ...statusTail].join(sep);

  return [...rows, bar, status];
}

function welcome(cfg) {
  const fullScreen = Boolean(process.stdout.isTTY);
  const safeTermWidth = Math.max(40, ui.termWidth() - 2);
  const width = fullScreen ? safeTermWidth : Math.min(104, safeTermWidth);
  ui.panel(welcomeRows(cfg, width), {
    title: ui.gold(`GolDid v${VERSION}`),
    maxWidth: width,
    fillWidth: fullScreen,
  });
  if (!fullScreen) console.log('');
}

function promptStr() {
  return ui.amber(ui.symbols.prompt + ' ');
}

// =============================================================================
// Chat
// =============================================================================

/**
 * Stream one assistant turn to the terminal. Prints tokens live, but:
 *  - gates output at a <tool_call> tag (the raw tool JSON is never shown), and
 *  - when tools are on and the reply opens with `{` or `<` (i.e. it looks like a
 *    tool call), holds ALL output until the turn finishes — so even malformed
 *    tool calls don't flash on screen. The caller inspects `shown` and prints
 *    held content itself if it turned out not to be a tool call.
 * Returns { full, shown }.
 */
async function streamAssistant(cfg, system, conversation, useTools, schemas) {
  const conf = cfg.providers[cfg.active.provider] || {};
  const spin = ui.spinner(`${cfg.active.provider} / ${cfg.active.model}`);
  let spinStopped = false;
  let headerPrinted = false;
  let buf = '';
  let printedLen = 0;
  let hold = false; // withhold output that looks like a tool call
  let decided = false;

  const stopSpin = () => {
    if (!spinStopped) {
      spin.stop();
      spinStopped = true;
    }
  };
  const writePrintable = (upto) => {
    if (upto <= printedLen) return;
    let chunk = buf.slice(printedLen, upto);
    printedLen = upto;
    if (!headerPrinted) {
      chunk = chunk.replace(/^\s+/, ''); // drop leading blank lines some models emit
      if (chunk === '') return; // nothing real to show yet
      process.stdout.write('\n' + ui.gold(ui.symbols.diamond + ' '));
      headerPrinted = true;
    }
    process.stdout.write(chunk);
  };

  const onDelta = (delta) => {
    stopSpin();
    buf += delta;
    if (useTools && !decided) {
      const t = buf.replace(/^\s+/, '');
      if (t.length > 0) {
        decided = true;
        hold = t[0] === '{' || t[0] === '<'; // looks like a (maybe malformed) tool call
      }
    }
    if (hold) return;
    const idx = buf.indexOf(TOOL_TAG);
    const upto = idx >= 0 ? idx : Math.max(printedLen, buf.length - (TOOL_TAG.length - 1));
    writePrintable(upto);
  };

  let result;
  try {
    result = await providers.chatStream(cfg.active.provider, conf, cfg.active.model, conversation, {
      system, onDelta, tools: schemas,
    });
  } catch (e) {
    stopSpin();
    if (headerPrinted) process.stdout.write('\n');
    throw e;
  }
  stopSpin();
  const full = result.text || '';
  const toolCalls = result.toolCalls || [];
  if (!hold) {
    buf = full;
    const idx = full.indexOf(TOOL_TAG);
    writePrintable(idx >= 0 ? idx : full.length);
    if (headerPrinted) process.stdout.write('\n');
  }
  return { full, shown: headerPrinted, toolCalls };
}

/** Print a final (non-streamed) assistant answer that was held back. */
function showAnswer(text) {
  const t = (text || '').trim();
  if (t) console.log('\n' + ui.gold(ui.symbols.diamond + ' ') + t + '\n');
  else console.log(ui.dim('(no response)'));
}

/** A clean one-line preview of a tool's output for the ↳ line. */
function toolPreview(name, out) {
  const s = out || '';
  if (name === 'memory') {
    try {
      const r = JSON.parse(s);
      if (r && r.success) return `${r.message} (${r.target}, ${r.usage})`;
      if (r && r.error) return `memory: ${r.error}`;
    } catch {
      /* fall through to the generic preview */
    }
  }
  return (s.split('\n').find((l) => l.trim()) || '').slice(0, 80);
}

/** Execute a parsed tool call, prompting for approval on dangerous tools. */
async function runTool(call, ctx) {
  const tool = tools.TOOLS[call.name];
  console.log(ui.amber(`\n${ui.symbols.gear} ${call.name}`) + ' ' + ui.dim(JSON.stringify(call.args || {})));
  if (!tool) {
    return `Error: unknown tool "${call.name}". Available: ${Object.keys(tools.TOOLS).join(', ')}`;
  }
  if (tool.danger) {
    if (!process.stdin.isTTY) {
      ui.warning('skipped - needs approval but no interactive terminal');
      return 'Denied: this tool requires interactive user approval, which is unavailable here.';
    }
    const ans = (await ctx.ask(ui.amber('  approve? (y/N): '))).trim().toLowerCase();
    if (!ans.startsWith('y')) {
      ui.info('denied');
      return 'Denied by user.';
    }
  }
  const spin = ui.spinner('running ' + call.name);
  try {
    const out = await tool.run(call.args || {}, ctx);
    spin.stop();
    console.log(ui.dim(`  ${ui.symbols.hook} ` + toolPreview(call.name, out)));
    if (call.name === 'memory') loadConversationMemory(ctx);
    return out;
  } catch (e) {
    spin.stop();
    return 'Error: ' + e.message;
  }
}

/** Run a full agent turn: stream, run any tool calls, loop until a final answer. */
async function handleChat(text, conversation, ctx) {
  const cfg = config.load();
  if (!cfg.active.provider || !cfg.active.model) {
    ui.warning('No model configured yet — run /setup.');
    return;
  }
  const def = providers.PROVIDERS[cfg.active.provider];
  const useTools = toolsEnabled(cfg);
  // OpenAI-compatible providers get native function calling (reliable, even for
  // small local models); Anthropic/Gemini fall back to the text protocol.
  const native = useTools && def.chat === 'openai';
  const toolsMode = useTools ? (native ? 'native' : 'text') : 'off';
  const schemas = native ? tools.toolSchemas() : null;
  const memorySnapshot = ctx.memorySnapshot || loadConversationMemory(ctx);
  const system = prompt.buildSystemPrompt({
    kind: modelClass(def, cfg.active.model),
    soul: prompt.loadSoul(),
    toolsMode,
    model: cfg.active.model,
    cwd: process.cwd(),
    memorySnapshot,
    projectContext: projectContext.format(process.cwd()),
    skillsCatalog: skills.catalog(process.cwd()),
  });

  conversation.push({ role: 'user', content: text });

  for (let step = 0; step < MAX_AGENT_STEPS; step++) {
    let full, shown, toolCalls;
    try {
      ({ full, shown, toolCalls } = await streamAssistant(cfg, system, conversation, useTools, schemas));
    } catch (e) {
      conversation.pop(); // drop the turn we couldn't answer
      ui.error(e.message);
      return;
    }
    const last = step === MAX_AGENT_STEPS - 1;

    // Native function-calling path.
    if (native && toolCalls.length) {
      conversation.push({ role: 'assistant', content: full || '', tool_calls: toolCalls });
      for (const tc of toolCalls) {
        let args = {};
        try {
          args = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
        } catch {
          /* leave empty; runTool will report missing args */
        }
        const result = await runTool({ name: tc.function.name, args }, ctx);
        conversation.push({ role: 'tool', tool_call_id: tc.id, content: result });
      }
      if (last) console.log(ui.dim('(reached the tool-call limit for this turn)'));
      continue;
    }

    // Text-protocol path (Anthropic/Gemini, or a model that ignored native tools).
    conversation.push({ role: 'assistant', content: full });
    const call = useTools ? tools.parseToolCall(full) : null;
    if (!call) {
      if (!shown) showAnswer(full); // held-back content that wasn't a tool call
      break;
    }
    const result = await runTool(call, ctx);
    conversation.push({
      role: 'user',
      content: `<tool_result name="${call.name}">\n${result}\n</tool_result>`,
    });
    if (last) console.log(ui.dim('(reached the tool-call limit for this turn)'));
  }
  if (ctx.sessionId && conversation.length) {
    try {
      sessions.save(ctx.sessionId, conversation, { cwd: process.cwd() });
    } catch (e) {
      ui.warning('Could not save session: ' + e.message);
    }
  }
  console.log('');
}

// =============================================================================
// Slash commands
// =============================================================================

function providersList() {
  const cfg = config.load();
  const rows = [[ui.dim(''), ui.dim('key'), ui.dim('type'), ui.dim('provider'), ui.dim('status')]];
  for (const [key, def] of Object.entries(providers.PROVIDERS)) {
    const conf = cfg.providers[key] || {};
    const isActive = cfg.active.provider === key;
    const configured = def.kind === 'local' || !!conf.apiKey || !!conf.baseUrl;
    const mark = isActive ? ui.gold(ui.symbols.arrow) : configured ? ui.amber('*') : ' ';
    const tag = def.kind === 'cloud' ? ui.amber(def.kind) : ui.dim(def.kind);
    let detail = '';
    if (conf.apiKey) detail = ui.dim('key ' + maskKey(conf.apiKey));
    else if (def.needsKey) detail = ui.color.yellow('no key');
    else detail = ui.dim('ready');
    if (conf.baseUrl) detail += ui.dim((detail ? ' ' : '') + '@ ' + conf.baseUrl);
    rows.push([mark, ui.gold(key), tag, def.label, detail]);
  }
  ui.panel(
    [
      ...ui.table(rows),
      '',
      ui.dim(`${ui.symbols.arrow} active    * configured/local`),
    ],
    { title: ui.gold('Providers'), maxWidth: 104 }
  );
  console.log('');
}

async function listModels(args) {
  const cfg = config.load();
  const key = (args[0] || cfg.active.provider || '').toLowerCase();
  const def = providers.PROVIDERS[key];
  if (!def) return ui.warning('Usage: /models <provider>');
  ui.info(`Fetching models from ${def.label}...`);
  try {
    const ms = await providers.fetchModels(key, cfg.providers[key] || {});
    if (!ms.length) return ui.warning('No models returned.');
    ms.forEach((m, i) => console.log(`  ${ui.amber(String(i + 1).padStart(3))}. ${m}`));
  } catch (e) {
    ui.error(e.message);
  }
}

function showConfig() {
  const cfg = config.load();
  const rows = [
    ui.kv('file', ui.dim(ui.clip(config.CONFIG_PATH, 74))),
    ui.kv('active', cfg.active.provider ? ui.gold(activeLabel(cfg)) : ui.dim('none')),
  ];
  const keys = Object.keys(cfg.providers);
  rows.push('', ui.amber('Providers'));
  if (!keys.length) rows.push(ui.dim('  (none configured yet - run /setup)'));
  else {
    rows.push(
      ...ui.table(keys.map((k) => {
        const p = cfg.providers[k];
        const bits = [];
        if (p.apiKey) bits.push('key=' + maskKey(p.apiKey));
        if (p.baseUrl) bits.push('url=' + p.baseUrl);
        return [ui.gold(k), ui.dim(bits.join('  ') || '(empty)')];
      }))
    );
  }
  ui.panel(rows, { title: ui.gold('Configuration'), maxWidth: 104 });
  console.log('');
}

function setModel(args) {
  const cfg = config.load();
  if (!cfg.active.provider) return ui.warning('No active provider. Run /setup.');
  const name = args.join(' ').trim();
  if (!name) return ui.info('Active model: ' + (cfg.active.model || '(none)'));
  cfg.active.model = name;
  config.save(cfg);
  ui.success(`Active model: ${name}`);
}

async function setKey(args, ctx) {
  const key = (args[0] || '').toLowerCase();
  const def = providers.PROVIDERS[key];
  if (!def) return ui.warning('Usage: /key <provider> [key]');
  let val = args[1];
  if (!val) val = (await ui.askMasked(ctx.rl, ui.amber(`  API key for ${def.label}: `))).trim();
  if (!val) return ui.warning('No key entered.');
  const cfg = config.load();
  config.providerConf(cfg, key).apiKey = val;
  config.save(cfg);
  ui.success(`Saved key for ${def.label} (${maskKey(val)}).`);
}

async function setUrl(args, ctx) {
  const key = (args[0] || '').toLowerCase();
  const def = providers.PROVIDERS[key];
  if (!def) return ui.warning('Usage: /url <provider> [url]');
  let val = args[1];
  if (!val) val = (await ctx.ask(ui.amber(`  Base URL for ${def.label} [${def.defaultBaseUrl}]: `))).trim();
  const cfg = config.load();
  config.providerConf(cfg, key).baseUrl = val || def.defaultBaseUrl;
  config.save(cfg);
  ui.success(`Base URL for ${def.label} set to ${cfg.providers[key].baseUrl}.`);
}

function soulCmd() {
  prompt.ensureSoul();
  console.log(ui.dim('\nsoul file: ' + prompt.SOUL_PATH));
  console.log(prompt.loadSoul().split('\n').slice(0, 14).join('\n'));
  console.log(ui.dim('\nmemory dir: ' + memory.MEMORY_DIR));
  console.log(ui.dim('personality file: ' + memory.PERSONALITY_PATH));
  console.log(ui.dim('use /memory to view the durable notes GolDid learns.'));
  console.log(ui.dim('\nedit that file to change GolDid’s personality.\n'));
}

function memoryEntryLines(result, title) {
  const lines = [
    ui.amber(title),
    ui.kv('file', ui.dim(ui.clip(result.path, 78))),
    ui.kv('usage', ui.dim(result.usage)),
  ];
  if (!result.entries.length) {
    lines.push(ui.dim('  (empty)'));
  } else {
    result.entries.forEach((entry, i) => {
      const oneLine = entry.replace(/\s+/g, ' ');
      lines.push(ui.dim(String(i + 1).padStart(2) + '. ') + ui.clip(oneLine, 86));
    });
  }
  return lines;
}

function showMemory() {
  const personality = memory.read('personality');
  const user = memory.read('user');
  const notes = memory.read('memory');
  ui.panel(
    [
      ...memoryEntryLines(personality, 'Personality'),
      '',
      ...memoryEntryLines(user, 'User profile'),
      '',
      ...memoryEntryLines(notes, 'Memory'),
      '',
      ui.dim('quick add: ') + ui.amber('/remember personality <style note>') + ui.dim(' or ') + ui.amber('/remember user <preference>'),
      ui.dim('edit: ') + ui.amber('/memory add|remove|replace <personality|user|memory> ...'),
    ],
    { title: ui.gold('Persistent Memory'), maxWidth: 112 }
  );
  console.log('');
}

function showMemoryResult(result, ctx) {
  if (result.success) {
    ui.success(`${result.message} ${result.target}: ${result.usage}`);
    if (ctx) loadConversationMemory(ctx);
  } else {
    ui.error(result.error || 'memory update failed');
  }
}

function splitTarget(args) {
  const first = (args[0] || '').toLowerCase();
  if (['user', 'memory', 'personality'].includes(first)) return { target: first, rest: args.slice(1) };
  return { target: 'memory', rest: args };
}

function rememberCmd(args, ctx) {
  const parsed = splitTarget(args);
  const content = parsed.rest.join(' ').trim();
  if (!content) return ui.warning('Usage: /remember [personality|user|memory] <thing to remember>');
  showMemoryResult(memory.add(parsed.target, content), ctx);
}

function forgetCmd(args, ctx) {
  const explicit = ['personality', 'user', 'memory'].includes((args[0] || '').toLowerCase());
  const parsed = splitTarget(args);
  const oldText = parsed.rest.join(' ').trim();
  if (!oldText) return ui.warning('Usage: /forget [personality|user|memory] <matching text>');
  let result = memory.remove(parsed.target, oldText);
  if (!explicit && !result.success) result = memory.remove('user', oldText);
  if (!explicit && !result.success) result = memory.remove('personality', oldText);
  showMemoryResult(result, ctx);
}

function memoryCmd(args, ctx) {
  const action = (args[0] || 'show').toLowerCase();
  if (action === 'show' || action === 'read' || action === 'list') return showMemory();
  if (action === 'add') return rememberCmd(args.slice(1), ctx);
  if (action === 'remove' || action === 'forget') return forgetCmd(args.slice(1), ctx);
  if (action === 'clear') {
    const parsed = splitTarget(args.slice(1));
    showMemoryResult(memory.clear(parsed.target), ctx);
    return;
  }
  if (action === 'replace') {
    const parsed = splitTarget(args.slice(1));
    const body = parsed.rest.join(' ');
    const idx = body.indexOf('=>');
    if (idx < 0) return ui.warning('Usage: /memory replace [user|memory] <old text> => <new text>');
    const oldText = body.slice(0, idx).trim();
    const content = body.slice(idx + 2).trim();
    showMemoryResult(memory.replace(parsed.target, oldText, content), ctx);
    return;
  }
  ui.warning('Usage: /memory [show|add|remove|replace|clear] ...');
}

function resetConversation(ctx, convo) {
  convo.length = 0;
  ctx.sessionId = sessions.newId();
  loadConversationMemory(ctx);
  ui.success(`Started session ${ctx.sessionId} and reloaded persistent memory.`);
}

function showSessions(args) {
  const query = args.join(' ').trim();
  const items = sessions.search(query).slice(0, 20);
  const rows = items.map((item) => [
    ui.gold(item.id),
    ui.dim(String(item.messageCount)),
    ui.dim(item.updatedAt ? item.updatedAt.slice(0, 16).replace('T', ' ') : ''),
    ui.clip(item.title, 54),
  ]);
  ui.panel(
    [
      ui.kv('directory', ui.dim(ui.clip(sessions.SESSION_DIR, 78))),
      query ? ui.kv('search', ui.gold(query)) : ui.dim('Most recent sessions'),
      '',
      ...(rows.length
        ? ui.table([[ui.dim('id'), ui.dim('msgs'), ui.dim('updated'), ui.dim('title')], ...rows])
        : [ui.dim('  (no matching sessions)')]),
      '',
      ui.dim('resume: ') + ui.amber('/resume <session-id>'),
    ],
    { title: ui.gold('Sessions'), maxWidth: 120 }
  );
  console.log('');
}

function sessionCmd(args, ctx, conversation) {
  const requested = args.join('-').trim();
  if (requested) {
    const saved = sessions.save(requested, conversation, { cwd: process.cwd() });
    ctx.sessionId = saved.id;
    return ui.success(`Current conversation saved as ${saved.id}.`);
  }
  ui.info(`Current session: ${ctx.sessionId}`);
}

function resumeSession(args, ctx, conversation) {
  const id = args[0];
  if (!id) return ui.warning('Usage: /resume <session-id>');
  try {
    const saved = sessions.load(id);
    conversation.splice(0, conversation.length, ...saved.messages);
    ctx.sessionId = saved.id;
    loadConversationMemory(ctx);
    ui.success(`Resumed ${saved.id}: ${saved.title}`);
  } catch (e) {
    ui.error('Could not resume session: ' + e.message);
  }
}

function deleteSession(args, ctx) {
  const id = args[0];
  if (!id) return ui.warning('Usage: /delete-session <session-id>');
  if (id === ctx.sessionId) return ui.warning('Start /reset before deleting the active session.');
  try {
    if (sessions.remove(id)) ui.success(`Deleted session ${id}.`);
    else ui.warning(`Session not found: ${id}`);
  } catch (e) {
    ui.error('Could not delete session: ' + e.message);
  }
}

function showSkills() {
  const installed = skills.listResult(process.cwd());
  const rows = installed.map((skill) => [
    ui.gold(skill.name),
    ui.dim(skill.source),
    ui.dim(skill.version || ''),
    ui.clip(skill.description, 58),
  ]);
  ui.panel(
    [
      ...(rows.length
        ? ui.table([[ui.dim('name'), ui.dim('source'), ui.dim('version'), ui.dim('description')], ...rows])
        : [ui.dim('  (no compatible skills found)')]),
      '',
      ui.dim('view: ') + ui.amber('/skill <name>'),
      ui.dim('native directory: ') + ui.gold(skills.defaultRoots(process.cwd())[3].path),
    ],
    { title: ui.gold('Skills'), maxWidth: 124 }
  );
  console.log('');
}

function showSkill(args, ctx) {
  const name = args.join(' ').trim();
  if (!name) return ui.warning('Usage: /skill <name>');
  const skill = skills.find(name, process.cwd());
  if (!skill) return ui.warning(`Skill not found: ${name}`);
  console.log('');
  ui.panel(
    [
      ui.kv('name', ui.gold(skill.name)),
      ui.kv('source', ui.dim(skill.source)),
      ui.kv('file', ui.dim(ui.clip(skill.file, 88))),
      '',
      skills.render(skill, ctx.sessionId),
    ],
    { title: ui.gold('Skill'), maxWidth: 120 }
  );
  console.log('');
}

function agentCmd(args) {
  const cfg = config.load();
  const cur = toolsEnabled(cfg);
  const a = (args[0] || '').toLowerCase();
  const next = a === 'on' ? true : a === 'off' ? false : !cur;
  cfg.agent = { ...(cfg.agent || {}), tools: next };
  config.save(cfg);
  ui.success(`Agent tools ${next ? 'enabled' : 'disabled'}.`);
  if (next) ui.info('the model can now use: ' + Object.keys(tools.TOOLS).join(', '));
}

function toolsCmd() {
  const cfg = config.load();
  const rows = [
    ui.kv('agent', toolsEnabled(cfg) ? ui.amber('on') : ui.dim('off - /agent on')),
    '',
    ...ui.table(Object.entries(tools.TOOLS).map(([name, t]) => {
      const args = Object.keys(t.args).length ? '(' + Object.keys(t.args).join(', ') + ')' : '()';
      const approval = t.danger ? ui.color.yellow('yes') : ui.dim('no');
      return [ui.gold(name), ui.dim(ui.clip(args, 16)), approval, ui.dim(ui.clip(t.desc, 28))];
    })),
  ];
  ui.panel(rows, { title: ui.gold('Tools'), maxWidth: 108 });
  console.log('');
}

function printHelp() {
  const rows = [
    ['/setup [provider]', 'pick a provider, add a key/URL, choose a model'],
    ['/use <provider>', 'switch provider (then choose a model)'],
    ['/model [name]', 'show or set the active model'],
    ['/models [provider]', 'list available models'],
    ['/providers', 'list all providers and their status'],
    ['/key <provider> [k]', 'set a provider API key'],
    ['/url <provider> [u]', 'set a provider base URL'],
    ['/agent [on|off]', 'toggle tool use (the agent)'],
    ['/tools', 'list the agent tools'],
    ['/soul', 'show/locate the SOUL.md personality file'],
    ['/memory', 'show or edit persistent memory'],
    ['/sessions [query]', 'list or search saved conversations'],
    ['/session [name]', 'show or name the current session'],
    ['/resume <id>', 'resume a saved conversation'],
    ['/delete-session <id>', 'delete a saved conversation'],
    ['/skills', 'list compatible installed skills'],
    ['/skill <name>', 'inspect one skill'],
    ['/remember [target] <text>', 'save memory/user/personality'],
    ['/forget [target] <text>', 'remove a memory entry'],
    ['/config', 'show current configuration'],
    ['/reset', 'start a new conversation'],
    ['/clear', 'clear the screen'],
    ['/version', 'show the GolDid version'],
    ['/help', 'show this help'],
    ['/exit', 'quit (/quit too)'],
  ];
  const formatted = rows.map(([cmd, desc]) => [ui.gold(cmd), ui.dim(desc)]);
  const split = Math.ceil(formatted.length / 2);
  ui.panelColumns(
    [
      {
        rows: [
          ui.amber('Chat'),
          ui.dim('Type a message and press Enter.'),
          '',
          ...ui.table(formatted.slice(0, split)),
        ],
      },
      {
        rows: [
          ui.amber('Commands'),
          ui.dim('Slash commands work inside chat.'),
          '',
          ...ui.table(formatted.slice(split)),
        ],
      },
    ],
    { title: ui.gold('Help'), maxWidth: 112, gap: '     ' }
  );
  console.log('');
}

const slash = {
  help: { run: () => printHelp() },
  setup: { run: (args, ctx) => runSetup(args, ctx) },
  use: { run: (args, ctx) => runSetup(args, ctx) },
  model: { run: (args) => setModel(args) },
  models: { run: (args) => listModels(args) },
  providers: { run: () => providersList() },
  key: { run: (args, ctx) => setKey(args, ctx) },
  url: { run: (args, ctx) => setUrl(args, ctx) },
  agent: { run: (args) => agentCmd(args) },
  tools: { run: () => toolsCmd() },
  soul: { run: () => soulCmd() },
  memory: { run: (args, ctx) => memoryCmd(args, ctx) },
  sessions: { run: (args) => showSessions(args) },
  session: { run: (args, ctx, convo) => sessionCmd(args, ctx, convo) },
  resume: { run: (args, ctx, convo) => resumeSession(args, ctx, convo) },
  'delete-session': { run: (args, ctx) => deleteSession(args, ctx) },
  skills: { run: () => showSkills() },
  skill: { run: (args, ctx) => showSkill(args, ctx) },
  remember: { run: (args, ctx) => rememberCmd(args, ctx) },
  forget: { run: (args, ctx) => forgetCmd(args, ctx) },
  config: { run: () => showConfig() },
  reset: { run: (args, ctx, convo) => resetConversation(ctx, convo) },
  clear: { run: () => ui.clear() },
  version: { run: () => console.log(VERSION) },
  exit: { run: () => process.exit(0) },
};
slash.quit = slash.exit;
slash.ai = slash.providers;

async function handleSlash(input, ctx, conversation) {
  const parts = input.trim().split(/\s+/).filter(Boolean);
  const name = (parts[0] || '').toLowerCase();
  const cmd = slash[name];
  if (!cmd) {
    ui.warning(`Unknown command: /${name}`);
    ui.info('try /help');
    return;
  }
  await cmd.run(parts.slice(1), ctx, conversation);
}

// =============================================================================
// Setup wizard (Hermes-inspired)
// =============================================================================

async function runSetup(args, ctx) {
  const keys = Object.keys(providers.PROVIDERS);
  const cfg = config.load();

  ui.header('GolDid Setup');
  ui.info('Connect an AI provider, then choose a model to use.');
  ui.info('Settings are saved to ' + config.CONFIG_PATH);

  let key = (args[0] || '').toLowerCase();
  if (!providers.PROVIDERS[key]) {
    const labels = keys.map((k) => {
      const d = providers.PROVIDERS[k];
      const conf = cfg.providers[k] || {};
      const status = conf.apiKey
        ? ui.color.green(ui.symbols.check + ' key')
        : conf.baseUrl
          ? ui.color.green(ui.symbols.check + ' url')
          : '';
      return `${d.label.padEnd(15)} ${ui.dim(d.kind)}  ${status}`;
    });
    const cur = keys.indexOf(cfg.active.provider);
    const idx = await ui.menu(ctx, 'Choose a provider:', labels, cur >= 0 ? cur : 0);
    key = keys[idx];
  }
  const def = providers.PROVIDERS[key];
  const conf = config.providerConf(cfg, key);

  ui.header(`Configure ${def.label}`);
  if (def.kind === 'cloud') {
    if (conf.apiKey) {
      ui.success(`API key already set (${maskKey(conf.apiKey)}).`);
      const replace = (await ctx.ask(ui.amber('  Replace it? (y/N): '))).trim().toLowerCase();
      if (replace.startsWith('y')) conf.apiKey = '';
    }
    if (!conf.apiKey) {
      ui.info(`Paste your ${def.label} API key (input is hidden).`);
      const k = (await ui.askMasked(ctx.rl, ui.amber(`  ${def.label} key (${def.keyHint}): `))).trim();
      if (!k) return ui.warning('No key entered - setup cancelled.');
      conf.apiKey = k;
    }
  } else {
    const curUrl = conf.baseUrl || def.defaultBaseUrl;
    const url = (await ctx.ask(ui.amber(`  Base URL [${curUrl}]: `))).trim();
    conf.baseUrl = url || curUrl;
    if (def.keyOptional) {
      const k = (await ui.askMasked(ctx.rl, ui.amber('  API token (optional, blank to skip): '))).trim();
      if (k) conf.apiKey = k;
    }
    ui.info(`Using ${conf.baseUrl}`);
  }
  config.save(cfg);

  ui.header('Choose a model');
  ui.info(`Fetching available models from ${def.label}...`);
  let models;
  try {
    models = await providers.fetchModels(key, conf);
  } catch (e) {
    ui.error('Could not fetch models: ' + e.message);
    if (def.kind === 'local') ui.info(`Is the server running at ${conf.baseUrl || def.defaultBaseUrl}?`);
    return manualModelSetup(cfg, key, def, ctx);
  }
  if (!models.length) {
    ui.warning('No models returned by the provider.');
    return manualModelSetup(cfg, key, def, ctx);
  }

  const curModel = models.indexOf(cfg.active.model);
  const idx = await ui.menu(ctx, `${models.length} models available:`, models, curModel >= 0 ? curModel : 0, { pageSize: 14 });
  cfg.active = { provider: key, model: models[idx] };
  config.save(cfg);
  finishSetup(cfg);
}

async function manualModelSetup(cfg, key, def, ctx) {
  const m = (await ctx.ask(ui.amber('  Enter a model name manually (blank to cancel): '))).trim();
  if (!m) return ui.warning('Setup cancelled - no model selected.');
  cfg.active = { provider: key, model: m };
  config.save(cfg);
  finishSetup(cfg);
}

function finishSetup(cfg) {
  const def = providers.PROVIDERS[cfg.active.provider];
  console.log('');
  ui.panel(
    [
      ui.kv('provider', ui.gold(def.label)),
      ui.kv('model', ui.gold(ui.clip(cfg.active.model, 58))),
      '',
      ui.dim('type a message to start chatting, or ') + ui.amber('/help'),
    ],
    { title: ui.gold(`${ui.symbols.check} Setup complete`), border: ui.gold, maxWidth: 92 }
  );
  console.log('');
}

// =============================================================================
// REPL + entry point
// =============================================================================

function repl(ctx) {
  return new Promise((resolve) => {
    (async () => {
      const promptIdle = () => {
        ui.drawInputFrame();
        ctx.rl.setPrompt(promptStr());
        ctx.rl.prompt();
      };
      const showOutput = () => {
        ui.moveToTranscript();
      };

      let cfg = config.load();
      ui.clear();
      welcome(cfg);
      if (!cfg.active.provider || !cfg.active.model) {
        ui.warning("Let's get you set up first.");
        try {
          await runSetup([], ctx);
        } catch (e) {
          ui.error(e.message);
        }
        cfg = config.load();
        console.log('');
      }

      const conversation = [];
      ctx.sessionId ||= sessions.newId();
      loadConversationMemory(ctx);
      const { rl } = ctx;
      promptIdle();
      let busy = false;
      rl.on('line', async (line) => {
        if (busy) return;
        const text = line.trim();
        if (!text) {
          promptIdle();
          return;
        }
        busy = true;
        try {
          showOutput();
          if (text.startsWith('/')) {
            await handleSlash(text.slice(1), ctx, conversation);
          } else {
            await handleChat(text, conversation, ctx);
          }
        } catch (e) {
          ui.error(e.message);
        }
        busy = false;
        promptIdle();
      });
      rl.on('close', () => {
        ui.resetScrollRegion();
        console.log(ui.bronze('\n' + ui.symbols.goodbye + ' goodbye'));
        resolve();
      });
    })();
  });
}

const UTILITY = new Set([
  'setup', 'use', 'model', 'models', 'providers', 'key', 'url',
  'agent', 'tools', 'soul', 'memory', 'remember', 'forget', 'config',
  'sessions', 'session', 'resume', 'delete-session',
  'skills', 'skill',
  'reset', 'clear', 'version', 'help', 'exit', 'quit',
]);

async function oneShot(argv, ctx) {
  const first = argv[0].toLowerCase().replace(/^\//, '');
  if (UTILITY.has(first)) {
    await handleSlash(argv.join(' ').replace(/^\//, ''), ctx, []);
  } else {
    // Anything else is treated as a prompt to the active model.
    await handleChat(argv.join(' '), [], ctx);
  }
}

async function main() {
  prompt.ensureSoul();
  memory.ensureFiles();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ctx = {
    rl,
    ask: (q) => new Promise((res) => rl.question(q, res)),
    sessionId: sessions.newId(),
  };
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    await repl(ctx);
  } else {
    try {
      await oneShot(argv, ctx);
    } catch (e) {
      ui.error(e.message);
    }
    rl.close();
  }
}

main();
