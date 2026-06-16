'use strict';

const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const config = require('../lib/config');
const projects = require('../lib/projects');
const providers = require('../lib/providers');
const prompt = require('../lib/prompt');
const memory = require('../lib/memory');
const sessions = require('../lib/sessions');
const naming = require('../lib/naming');
const skills = require('../lib/skills');
const projectContext = require('../lib/context');
const tools = require('../lib/tools');
const sandbox = require('../lib/sandbox');
const keystore = require('../lib/keystore');
const agentmode = require('../lib/agentmode');
const updater = require('../lib/updater');
const projectGraph = require('../lib/project-graph');

const VERSION = require('../package.json').version;

// The GolDid desktop app supports Windows and Linux only. On macOS, use the CLI.
if (process.platform === 'darwin') {
  console.error('The GolDid desktop app is not available on macOS. Use the CLI instead: gd');
  app.quit();
  process.exit(1);
}

if (process.platform === 'linux' && process.env.GOLDID_ELECTRON_SANDBOX !== '1') {
  app.commandLine.appendSwitch('no-sandbox');
}
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('gtk-version', '3');
}
if (process.platform === 'linux' && process.env.GOLDID_ELECTRON_GPU !== '1') {
  app.disableHardwareAcceleration();
}

let mainWindow;
const approvals = new Map();
const activeRequests = new Map(); // requestId -> AbortController (for cancel)

// The app launches in plain-chat mode with NO active project. Opening a project
// binds the working directory to its folder and unlocks the agent tools + the
// 3D codebase visualizer; closing it returns to plain chat. We capture the
// launch directory so closing a project can restore it.
const BASE_DIR = process.cwd();
let activeProject = null;

// Bind (or clear) the active project. Changing the real working directory is
// the single lever that points everything that reads process.cwd() — the graph
// scanner, skills discovery, project-context lookup, and relative-path tools —
// at the project folder.
function setActiveProject(project) {
  const target = project && projects.exists(project) ? project.path : BASE_DIR;
  try {
    process.chdir(target);
  } catch {
    activeProject = null;
    return;
  }
  activeProject = project && projects.exists(project) ? project : null;
}

// Tools (and therefore the agentic system prompt) are only active inside a
// project. In plain chat the model just talks.
function toolsActive(cfg) {
  return Boolean(activeProject) && cfg.agent?.tools !== false;
}

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
      // Always quit, even if the capture fails (e.g. no GPU compositing in a
      // headless VM) — a hung test process is worse than a missing screenshot.
      try {
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
      } catch (e) {
        console.error('screenshot capture failed: ' + e.message);
        process.exitCode = 1;
      }
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
      mode: agentmode.getMode(cfg),
      naming: naming.normalizeMode(cfg.agent?.naming),
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
    skills: activeProject ? skills.listResult(process.cwd()).slice(0, 200) : [],
    memory: Object.fromEntries(memories.map((item) => [item.target, item])),
    cwd: process.cwd(),
    dataDir: config.CONFIG_DIR,
    projects: projects.list(),
    activeProject,
  };
});

// --- projects: create / open / close / delete --------------------------------

ipcMain.handle('project:list', () => projects.list());

// Open a native folder picker and register the chosen folder as a project,
// then open it. Returns { activeProject, projects } or { cancelled: true }.
ipcMain.handle('project:create', async (_, input = {}) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose a project folder',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths.length) return { cancelled: true };
  const project = projects.create({ name: input.name, path: result.filePaths[0] });
  setActiveProject(project);
  return { activeProject, projects: projects.list() };
});

ipcMain.handle('project:open', (_, id) => {
  const project = projects.get(id);
  if (!project) throw new Error('Project not found');
  if (!projects.exists(project)) throw new Error(`Project folder is missing: ${project.path}`);
  projects.touch(id);
  setActiveProject(project);
  return { activeProject, projects: projects.list() };
});

ipcMain.handle('project:close', () => {
  setActiveProject(null);
  return { activeProject, projects: projects.list() };
});

ipcMain.handle('project:delete', (_, id) => {
  if (activeProject && activeProject.id === id) setActiveProject(null);
  projects.remove(id);
  return { activeProject, projects: projects.list() };
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

ipcMain.handle('config:mode', (_, mode) => {
  const cfg = config.load();
  const m = agentmode.MODES.includes(mode) ? mode : 'ask';
  cfg.agent = { ...(cfg.agent || {}), mode: m };
  config.save(cfg);
  return publicConfig();
});

ipcMain.handle('config:naming', (_, mode) => {
  const cfg = config.load();
  cfg.agent = { ...(cfg.agent || {}), naming: naming.normalizeMode(mode) };
  config.save(cfg);
  return publicConfig();
});

ipcMain.handle('keystore:status', () => keystore.status());
ipcMain.handle('keystore:migrate', () => keystore.migrateToTpm());
ipcMain.handle('keystore:revert', () => keystore.revertToPlaintext());
ipcMain.handle('update:check', () => updater.check(VERSION));
ipcMain.handle('update:run', (_, opts = {}) => updater.update({
  currentVersion: VERSION,
  rootDir: path.resolve(__dirname, '..'),
  force: Boolean(opts.force),
}));

ipcMain.handle('session:load', (_, id) => sessions.load(id));
ipcMain.handle('session:delete', (_, id) => sessions.remove(id));
ipcMain.handle('skill:view', (_, name) => {
  const skill = skills.find(name, process.cwd());
  if (!skill) throw new Error('Skill not found');
  return skills.render(skill);
});
ipcMain.handle('skill:registry', () => skills.fetchRegistry());
ipcMain.handle('skill:market-detail', (_, id) => skills.registrySkillDetail(id));
ipcMain.handle('skill:install', (_, id) => skills.installFromRegistry(id));
ipcMain.handle('skill:uninstall', (_, name) => skills.uninstallInstalled(name, process.cwd()));
ipcMain.handle('path:open', (_, target) => shell.openPath(target));
ipcMain.handle('project:graph', () => {
  if (!activeProject) throw new Error('Open a project to see its codebase graph.');
  return projectGraph.build(activeProject.path);
});
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

  const mode = agentmode.getMode(cfg);
  const decision = agentmode.decide(mode, call.name, !!tool.danger, call.args || {});
  if (decision === 'block') {
    sender.send('tool:status', { id, name: call.name, state: 'denied' });
    return agentmode.blockedMessage(call.name);
  }
  if (decision === 'ask' && !(await requestApproval(sender, call))) {
    sender.send('tool:status', { id, name: call.name, state: 'denied' });
    return 'Denied by user.';
  }
  try {
    const output = await tool.run(call.args || {}, ctx);
    sender.send('tool:status', { id, name: call.name, state: 'complete' });
    // Surface a generated image inline: the tool returns "Saved N bytes to <path>".
    if (call.name === 'generate_image') {
      const m = String(output).match(/Saved \d+ bytes to (.+)$/);
      if (m && fs.existsSync(m[1])) {
        // pathToFileURL builds a valid file:/// URL on every platform (a plain
        // 'file://' + path breaks on Windows drive letters).
        sender.send('tool:image', { path: m[1], url: pathToFileURL(path.resolve(m[1])).href });
      }
    }
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
  // Tools (and the agentic prompt, project context, and skills catalog) are
  // only active inside a project. With no project open this is a plain chat.
  const useTools = toolsActive(cfg);
  const native = useTools && def.chat === 'openai';
  const toolsMode = useTools ? (native ? 'native' : 'text') : 'off';
  const system = prompt.buildSystemPrompt({
    kind: def.kind === 'cloud' || /:cloud\b/i.test(cfg.active.model) ? 'cloud' : 'local',
    soul: prompt.loadSoul(),
    toolsMode,
    mode: agentmode.getMode(cfg),
    model: cfg.active.model,
    cwd: process.cwd(),
    namingMode: naming.normalizeMode(cfg.agent?.naming),
    memorySnapshot: memory.formatForPrompt({ includeEmpty: true }),
    projectContext: useTools ? projectContext.format(process.cwd()) : '',
    skillsCatalog: useTools ? skills.catalog(process.cwd()) : '',
  });
  let finalText = '';
  let ended = null;
  const responseStartedAt = Date.now();

  // Per-request abort controller so the renderer's Stop button can cancel.
  const controller = new AbortController();
  if (input.requestId) activeRequests.set(input.requestId, controller);
  const cancelled = () => controller.signal.aborted;

  try {
    // Unlimited tool-calling: loop until the model returns a final answer with no
    // tool call. The model controls termination — there is no fixed step cap.
    while (!cancelled()) {
      if (native) {
        let streamed = '';
        let result;
        try {
          result = await providers.chatStream(
            cfg.active.provider,
            cfg.providers[cfg.active.provider] || {},
            cfg.active.model,
            conversation,
            {
              system,
              tools: tools.toolSchemas(),
              signal: controller.signal,
              onDelta: (text) => { streamed += text; event.sender.send('chat:delta', { requestId: input.requestId, text }); },
            }
          );
        } catch (e) {
          if (cancelled()) { finalText = streamed; break; }
          throw e;
        }
        if (!result.toolCalls.length) {
          const parsed = tools.parseEndChat(result.text);
          finalText = parsed.text;
          ended = parsed.ended;
          conversation.push({ role: 'assistant', content: result.text });
          break;
        }
        conversation.push({ role: 'assistant', content: result.text || '', tool_calls: result.toolCalls });
        for (const tc of result.toolCalls) {
          if (cancelled()) break;
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
      if (cancelled()) break;
      const call = useTools ? tools.parseToolCall(text) : null;
      if (!call) {
        const parsed = tools.parseEndChat(text);
        finalText = parsed.text;
        ended = parsed.ended;
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
  } finally {
    if (input.requestId) activeRequests.delete(input.requestId);
  }

  const stopped = cancelled();
  if (!finalText && !stopped) finalText = '(no answer produced)';
  let saved = sessions.save(sessionId, conversation, { cwd: process.cwd() });
  let generatedTitle = '';
  if (!stopped) {
    try {
      const named = await naming.maybeGenerateTitle({
        cfg,
        conversation,
        startedAt: responseStartedAt,
        currentTitle: saved.title,
      });
      if (named.title) {
        saved = sessions.rename(sessionId, named.title);
        generatedTitle = saved.title;
      }
    } catch {
      /* title generation is best effort */
    }
  }
  return { sessionId, text: finalText, stopped, ended, title: generatedTitle || saved.title };
});

ipcMain.handle('chat:cancel', (_, requestId) => {
  const controller = activeRequests.get(requestId);
  if (controller) { controller.abort(); return true; }
  return false;
});

app.whenReady().then(() => {
  prompt.ensureSoul();
  memory.ensureFiles();
  skills.ensureScaffold();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});











