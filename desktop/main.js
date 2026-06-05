'use strict';

const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const config = require('../lib/config');
const providers = require('../lib/providers');
const prompt = require('../lib/prompt');
const memory = require('../lib/memory');
const sessions = require('../lib/sessions');
const skills = require('../lib/skills');
const projectContext = require('../lib/context');
const tools = require('../lib/tools');
const sandbox = require('../lib/sandbox');

// The GolDid desktop app supports Windows and Linux only. On macOS, use the CLI.
if (process.platform === 'darwin') {
  console.error('The GolDid desktop app is not available on macOS. Use the CLI instead: gd');
  app.quit();
  process.exit(1);
}

let mainWindow;
const approvals = new Map();
const MAX_AGENT_STEPS = 6;

if (process.env.GOLDID_DESKTOP_TEST_PROFILE) {
  app.setPath('userData', process.env.GOLDID_DESKTOP_TEST_PROFILE);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 940,
    minHeight: 640,
    backgroundColor: '#11110f',
    title: 'GolDid',
    icon: path.join(__dirname, 'assets', process.platform === 'win32' ? 'goldid-logo.ico' : 'goldid-logo.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  if (process.env.GOLDID_DESKTOP_SCREENSHOT) {
    mainWindow.webContents.once('did-finish-load', async () => {
      await new Promise((resolve) => setTimeout(resolve, 800));
      if (process.env.GOLDID_SCROLL_REPORT) {
        const report = await mainWindow.webContents.executeJavaScript(`
          (() => {
            const sidebar = document.getElementById('sidebarContent');
            const messages = document.getElementById('messages');
            sidebar.innerHTML = Array.from({ length: 80 }, (_, i) =>
              '<button class="list-item"><strong>Session ' + i + '</strong><small>Scrollable test row</small></button>'
            ).join('');
            messages.innerHTML = Array.from({ length: 60 }, (_, i) =>
              '<article class="message assistant"><div class="avatar">G</div><div class="message-body"><strong>GolDid</strong>Scrollable test message ' + i + '</div></article>'
            ).join('');
            return {
              sidebar: { clientHeight: sidebar.clientHeight, scrollHeight: sidebar.scrollHeight, overflowY: getComputedStyle(sidebar).overflowY },
              messages: { clientHeight: messages.clientHeight, scrollHeight: messages.scrollHeight, overflowY: getComputedStyle(messages).overflowY }
            };
          })()
        `);
        fs.writeFileSync(process.env.GOLDID_SCROLL_REPORT, JSON.stringify(report, null, 2));
      }
      const image = await mainWindow.webContents.capturePage();
      fs.writeFileSync(process.env.GOLDID_DESKTOP_SCREENSHOT, image.toPNG());
      app.quit();
    });
  }
}

function publicConfig() {
  const cfg = config.load();
  return {
    active: cfg.active,
    agent: {
      tools: cfg.agent?.tools !== false,
      sandbox: sandbox.mode(cfg),
      imageProvider: cfg.agent?.imageProvider || '',
      imageModel: cfg.agent?.imageModel || '',
    },
    providers: Object.fromEntries(Object.entries(providers.PROVIDERS).map(([key, def]) => {
      const conf = cfg.providers[key] || {};
      return [key, {
        key,
        label: def.label,
        kind: def.kind,
        configured: def.kind === 'local' || Boolean(conf.apiKey || conf.baseUrl),
        hasKey: Boolean(conf.apiKey),
        baseUrl: conf.baseUrl || def.defaultBaseUrl,
      }];
    })),
  };
}

ipcMain.handle('app:snapshot', () => {
  const memories = ['memory', 'user', 'personality'].map((target) => memory.read(target));
  return {
    config: publicConfig(),
    sessions: sessions.list().slice(0, 50),
    skills: skills.listResult(process.cwd()).slice(0, 200),
    memory: Object.fromEntries(memories.map((item) => [item.target, item])),
    cwd: process.cwd(),
    dataDir: config.CONFIG_DIR,
  };
});

ipcMain.handle('config:save', (_, input) => {
  const cfg = config.load();
  const provider = String(input.provider || '');
  if (!providers.PROVIDERS[provider]) throw new Error('Unknown provider');
  const conf = config.providerConf(cfg, provider);
  if (typeof input.apiKey === 'string' && input.apiKey.trim()) conf.apiKey = input.apiKey.trim();
  if (typeof input.baseUrl === 'string' && input.baseUrl.trim()) conf.baseUrl = input.baseUrl.trim();
  cfg.active = { provider, model: String(input.model || '').trim() };
  config.save(cfg);
  return publicConfig();
});

ipcMain.handle('config:agent', (_, enabled) => {
  const cfg = config.load();
  cfg.agent = { ...(cfg.agent || {}), tools: Boolean(enabled) };
  config.save(cfg);
  return publicConfig();
});

ipcMain.handle('config:sandbox', (_, mode) => {
  const cfg = config.load();
  const m = ['off', 'jail', 'docker'].includes(mode) ? mode : 'off';
  if (m === 'docker' && !sandbox.dockerAvailable()) {
    throw new Error('Docker is not available — install/start it first, or use jail.');
  }
  cfg.agent = { ...(cfg.agent || {}), sandbox: m };
  config.save(cfg);
  return publicConfig();
});

ipcMain.handle('config:imageModel', (_, model) => {
  const cfg = config.load();
  cfg.agent = { ...(cfg.agent || {}) };
  const m = String(model || '').trim();
  if (m) cfg.agent.imageModel = m;
  else delete cfg.agent.imageModel;
  config.save(cfg);
  return publicConfig();
});

ipcMain.handle('config:imageSetup', (_, input) => {
  const cfg = config.load();
  const provider = String(input.provider || '');
  if (!providers.PROVIDERS[provider]) throw new Error('Unknown provider');
  const model = String(input.model || '').trim();
  if (!model) throw new Error('Choose an image model');
  // Reuse the saved key by default; only overwrite if a new one was entered.
  const apiKey = String(input.apiKey || '').trim();
  if (apiKey) config.providerConf(cfg, provider).apiKey = apiKey;
  cfg.agent = { ...(cfg.agent || {}), imageProvider: provider, imageModel: model };
  config.save(cfg);
  return publicConfig();
});

ipcMain.handle('models:list', async (_, provider) => {
  const cfg = config.load();
  return providers.fetchModels(provider, cfg.providers[provider] || {});
});

ipcMain.handle('session:load', (_, id) => sessions.load(id));
ipcMain.handle('session:delete', (_, id) => sessions.remove(id));
ipcMain.handle('skill:view', (_, name) => {
  const skill = skills.find(name, process.cwd());
  if (!skill) throw new Error('Skill not found');
  return skills.render(skill);
});
ipcMain.handle('path:open', (_, target) => shell.openPath(target));
ipcMain.on('tool:approval-response', (_, payload) => {
  const resolve = approvals.get(payload.id);
  if (!resolve) return;
  approvals.delete(payload.id);
  resolve(Boolean(payload.approved));
});

function requestApproval(sender, call) {
  return new Promise((resolve) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    approvals.set(id, resolve);
    sender.send('tool:approval-request', { id, name: call.name, args: call.args || {} });
  });
}

async function runDesktopTool(sender, call, sessionId) {
  const tool = tools.TOOLS[call.name];
  if (!tool) return `Error: unknown tool "${call.name}"`;
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  sender.send('tool:status', { id, name: call.name, state: 'running', args: call.args || {} });

  // Same sandbox + image wiring as the CLI's runTool, so desktop behaves identically.
  const cfg = config.load();
  const ctx = { sessionId };
  ctx.generateImage = (prompt, opts = {}) => {
    const key = cfg.agent?.imageProvider || cfg.active.provider;
    if (!key) throw new Error('no provider configured');
    const conf = config.providerConf(cfg, key);
    const model = opts.model || cfg.agent?.imageModel || undefined;
    return providers.generateImage(key, conf, model, prompt, { size: opts.size });
  };
  if (sandbox.mode(cfg) !== 'off') {
    try {
      sandbox.enforcePaths(call);
    } catch (e) {
      sender.send('tool:status', { id, name: call.name, state: 'error', error: e.message });
      return 'Error: ' + e.message;
    }
    ctx.wrapShell = (command) => sandbox.wrapShell(command, cfg);
  }

  if (tool.danger && !(await requestApproval(sender, call))) {
    sender.send('tool:status', { id, name: call.name, state: 'denied' });
    return 'Denied by user.';
  }
  try {
    const output = await tool.run(call.args || {}, ctx);
    sender.send('tool:status', { id, name: call.name, state: 'complete' });
    return output;
  } catch (error) {
    sender.send('tool:status', { id, name: call.name, state: 'error', error: error.message });
    return `Error: ${error.message}`;
  }
}

ipcMain.handle('chat:send', async (event, input) => {
  const cfg = config.load();
  if (!cfg.active.provider || !cfg.active.model) throw new Error('Configure a provider and model first.');
  const def = providers.PROVIDERS[cfg.active.provider];
  const conversation = Array.isArray(input.messages) ? [...input.messages] : [];
  const sessionId = input.sessionId || sessions.newId();
  const useTools = cfg.agent?.tools !== false;
  const native = useTools && def.chat === 'openai';
  const toolsMode = useTools ? (native ? 'native' : 'text') : 'off';
  const system = prompt.buildSystemPrompt({
    kind: def.kind === 'cloud' || /:cloud\b/i.test(cfg.active.model) ? 'cloud' : 'local',
    soul: prompt.loadSoul(),
    toolsMode,
    model: cfg.active.model,
    cwd: process.cwd(),
    memorySnapshot: memory.formatForPrompt({ includeEmpty: true }),
    projectContext: projectContext.format(process.cwd()),
    skillsCatalog: skills.catalog(process.cwd()),
  });
  let finalText = '';

  for (let step = 0; step < MAX_AGENT_STEPS; step++) {
    if (native) {
      const result = await providers.chatStream(
        cfg.active.provider,
        cfg.providers[cfg.active.provider] || {},
        cfg.active.model,
        conversation,
        {
          system,
          tools: tools.toolSchemas(),
          onDelta: (text) => event.sender.send('chat:delta', { requestId: input.requestId, text }),
        }
      );
      if (!result.toolCalls.length) {
        finalText = result.text;
        conversation.push({ role: 'assistant', content: result.text });
        break;
      }
      conversation.push({ role: 'assistant', content: result.text || '', tool_calls: result.toolCalls });
      for (const tc of result.toolCalls) {
        let args = {};
        try { args = tc.function.arguments ? JSON.parse(tc.function.arguments) : {}; } catch { /* report through tool */ }
        const output = await runDesktopTool(event.sender, { name: tc.function.name, args }, sessionId);
        conversation.push({ role: 'tool', tool_call_id: tc.id, content: output });
      }
      continue;
    }

    const text = await providers.chat(
      cfg.active.provider,
      cfg.providers[cfg.active.provider] || {},
      cfg.active.model,
      conversation,
      { system }
    );
    const call = useTools ? tools.parseToolCall(text) : null;
    if (!call) {
      finalText = text;
      conversation.push({ role: 'assistant', content: text });
      event.sender.send('chat:delta', { requestId: input.requestId, text });
      break;
    }
    conversation.push({ role: 'assistant', content: text });
    const output = await runDesktopTool(event.sender, call, sessionId);
    conversation.push({
      role: 'user',
      content: `<tool_result name="${call.name}">\n${output}\n</tool_result>`,
    });
  }

  if (!finalText) finalText = '(reached the tool-call limit for this turn)';
  sessions.save(sessionId, conversation, { cwd: process.cwd() });
  return { sessionId, text: finalText };
});

app.whenReady().then(() => {
  prompt.ensureSoul();
  memory.ensureFiles();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
