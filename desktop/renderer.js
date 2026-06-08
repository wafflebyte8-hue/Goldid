'use strict';

const state = { snapshot: null, messages: [], sessionId: null, activeTab: 'sessions', requestId: null, streamingNode: null, toolEvents: new Map(), skillRegistry: null, installingSkills: new Set(), skillsDialogView: 'installed', skillsDialogDetail: null };
let sessionPendingDelete = null;
let commandIndex = 0;
let visibleCommands = [];
const $ = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const skillSlug = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/['"]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 64);

if (window.marked) {
  // Render code fences as our styled blocks; keep the language label.
  const renderer = new window.marked.Renderer();
  renderer.code = ({ text, lang }) => {
    const language = /^[A-Za-z0-9_+#.-]{1,24}$/.test(lang || '') ? lang : '';
    const label = language ? `<div class="code-label">${escapeHtml(language)}</div>` : '';
    return `<div class="code-block">${label}<button class="copy-btn" type="button" title="Copy">Copy</button><pre><code>${escapeHtml(text)}</code></pre></div>`;
  };
  window.marked.setOptions({ renderer, gfm: true, breaks: true });
}

function renderMessageContent(value) {
  const text = String(value ?? '').replace(/\r\n/g, '\n');
  if (!window.marked || !window.DOMPurify) {
    // Defensive fallback if the markdown libraries failed to load.
    return `<span class="message-text">${escapeHtml(text)}</span>`;
  }
  const html = window.marked.parse(text);
  return `<div class="message-text">${window.DOMPurify.sanitize(html)}</div>`;
}

// Inner HTML of one message bubble: name, rendered content, any generated
// images, and (for assistant messages with content) a copy button.
function bubbleInner(message) {
  const who = message.role === 'assistant' ? 'GolDid' : 'You';
  const images = (message.images || [])
    .map((img) => `<a class="gen-image" data-path="${escapeHtml(img.path)}" title="Open image"><img src="${escapeHtml(img.url)}" alt="generated image" loading="lazy"></a>`)
    .join('');
  const copy = message.role === 'assistant' && message.content
    ? '<button class="msg-copy copy-btn" type="button" title="Copy message">Copy</button>'
    : '';
  return `<strong>${who}</strong>${copy}${renderMessageContent(message.content)}${images}`;
}

function renderStatus() {
  const active = state.snapshot.config.active;
  const provider = state.snapshot.config.providers[active.provider];
  $('activeProvider').textContent = provider?.label || 'Not configured';
  $('activeModel').textContent = active.model || 'Open settings';
  $('connectionDot').classList.toggle('online', Boolean(provider && active.model));
  $('workingDirectory').textContent = state.snapshot.cwd;
  $('modeSelect').value = state.snapshot.config.agent?.mode || 'ask';
}

async function setMode(mode) {
  try {
    state.snapshot.config = await window.goldid.setMode(mode);
    renderStatus();
  } catch (error) {
    showNotice(error.message || String(error));
  }
}

const commands = [
  { usage: '/new', description: 'Start a new conversation', run: () => newChat() },
  { usage: '/reset', description: 'Start a new conversation', run: () => newChat() },
  { usage: '/settings', description: 'Open provider and model settings', run: () => openSettings() },
  { usage: '/model', description: 'Open model settings', run: () => openSettings() },
  { usage: '/providers', description: 'Open provider settings', run: () => openSettings() },
  { usage: '/sessions', description: 'Show saved conversations', run: () => selectSidebarTab('sessions') },
  { usage: '/skills', description: 'Open the skills manager', run: () => openSkillsDialog() },
  { usage: '/memory', description: 'Show persistent memory', run: () => selectSidebarTab('memory') },
  { usage: '/agent on', description: 'Enable agent tools', run: () => setAgent(true) },
  { usage: '/agent off', description: 'Disable agent tools', run: () => setAgent(false) },
  { usage: '/mode ask', description: 'Ask before edits', run: () => setMode('ask') },
  { usage: '/mode auto-edit', description: 'Edit automatically', run: () => setMode('auto-edit') },
  { usage: '/mode auto', description: 'Auto — model decides safety', run: () => setMode('auto') },
  { usage: '/mode plan', description: 'Plan mode (read-only)', run: () => setMode('plan') },
  { usage: '/sandbox off', description: 'Disable tool sandboxing', run: () => setSandbox('off') },
  { usage: '/sandbox jail', description: 'Confine tools to the working directory', run: () => setSandbox('jail') },
  { usage: '/sandbox docker', description: 'Run shell in a Docker container', run: () => setSandbox('docker') },
  { usage: '/image', description: 'Set up image generation (provider + model)', run: () => openImageSettings() },
  { usage: '/update', description: 'Install the latest GolDid', run: () => updateApp(false) },
  { usage: '/update check', description: 'Check for GolDid updates', run: () => checkUpdate() },
  { usage: '/tools', description: 'Show desktop agent tools', run: () => showToolHelp() },
  { usage: '/clear', description: 'Clear the current desktop transcript', run: () => newChat() },
  { usage: '/config', description: 'Open provider configuration', run: () => openSettings() },
  { usage: '/help', description: 'Show available desktop commands', run: () => showCommandHelp() },
];

function selectSidebarTab(name) {
  if (name === 'skills') {
    openSkillsDialog();
    return;
  }
  const tab = document.querySelector(`.tab[data-tab="${name}"]`);
  if (!tab) return;
  document.querySelectorAll('.tab').forEach((item) => item.classList.toggle('active', item === tab));
  state.activeTab = name;
  renderSidebar();
}

async function setAgent(enabled) {
  state.snapshot.config = await window.goldid.setAgent(enabled);
  renderStatus();
  showNotice(`Agent tools ${enabled ? 'enabled' : 'disabled'}.`);
}

async function setSandbox(mode) {
  const m = (mode || '').toLowerCase();
  if (!['off', 'jail', 'docker'].includes(m)) {
    const cur = state.snapshot.config.agent?.sandbox || 'off';
    showNotice(`Sandbox: ${cur}\n\nUse /sandbox off | jail | docker.`);
    return;
  }
  try {
    state.snapshot.config = await window.goldid.setSandbox(m);
    renderStatus();
    showNotice(m === 'off' ? 'Sandbox disabled.' : `Sandbox set to ${m}.`);
  } catch (error) {
    showNotice(error.message || String(error));
  }
}

async function setImageModel(model) {
  if (!model) {
    const cur = state.snapshot.config.agent?.imageModel || '';
    showNotice(cur
      ? `Image model: ${cur}\n\nChange with /image <model>, clear with /image clear.`
      : 'No image model set — generate_image uses a provider default.\n\nSet one with /image <model>.');
    return;
  }
  const clear = /^(none|clear|default|off|reset)$/i.test(model);
  try {
    state.snapshot.config = await window.goldid.setImageModel(clear ? '' : model);
    renderStatus();
    showNotice(clear ? 'Image model cleared — using the provider default.' : `Image model set to ${model}.`);
  } catch (error) {
    showNotice(error.message || String(error));
  }
}

function showNotice(text) {
  $('detailTitle').textContent = 'GolDid';
  $('detailContent').textContent = text;
  if (!$('detailDialog').open) $('detailDialog').showModal();
}

async function checkUpdate() {
  try {
    const status = await window.goldid.checkUpdate();
    $('detailTitle').textContent = 'GolDid Update';
    $('detailContent').textContent = [
      `Current: ${status.current}`,
      `Latest:  ${status.latest}`,
      status.updateAvailable ? 'Update available. Run /update to install it.' : 'GolDid is already up to date.',
    ].join('\n');
    if (!$('detailDialog').open) $('detailDialog').showModal();
  } catch (error) {
    showNotice(error.message || String(error));
  }
}

async function updateApp(force) {
  $('detailTitle').textContent = 'GolDid Update';
  $('detailContent').textContent = 'Checking for updates...';
  if (!$('detailDialog').open) $('detailDialog').showModal();
  try {
    const result = await window.goldid.runUpdate({ force });
    if (result.skipped) {
      $('detailContent').textContent = result.output;
      return;
    }
    $('detailContent').textContent = [
      `Updated GolDid ${result.current} -> ${result.latest}.`,
      'Restart GolDid to use the new files.',
      '',
      result.output || '',
    ].join('\n').trim();
  } catch (error) {
    $('detailContent').textContent = error.message || String(error);
  }
}

function showCommandHelp() {
  $('detailTitle').textContent = 'Desktop commands';
  $('detailContent').textContent = commands.map((item) => `${item.usage.padEnd(16)} ${item.description}`).join('\n');
  if (!$('detailDialog').open) $('detailDialog').showModal();
}

function showToolHelp() {
  $('detailTitle').textContent = 'Desktop agent tools';
  $('detailContent').textContent = [
    'time             Current date and time',
    'cwd              Working directory',
    'memory           Persistent memory',
    'skills_list      Installed skills',
    'skill_view       Full skill instructions',
    'list_dir         Directory contents',
    'read_file        Read a text file',
    'file_info        File metadata',
    'find_files       Find files recursively',
    'search_text      Search inside files',
    'web_search       Search the web',
    'generate_image   Generate an image from a prompt (approval required)',
    'write_file       Create or overwrite a file (approval required)',
    'shell            Run a command (approval required)',
  ].join('\n');
  if (!$('detailDialog').open) $('detailDialog').showModal();
}

function renderCommandMenu() {
  const input = $('messageInput').value.trimStart();
  const menu = $('commandMenu');
  if (!input.startsWith('/')) {
    menu.classList.remove('open');
    return;
  }
  const query = input.toLowerCase();
  visibleCommands = commands.filter((item) => item.usage.toLowerCase().startsWith(query));
  commandIndex = Math.min(commandIndex, Math.max(0, visibleCommands.length - 1));
  if (!visibleCommands.length) {
    menu.classList.remove('open');
    return;
  }
  menu.innerHTML = visibleCommands.map((item, index) =>
    `<button type="button" class="command-option ${index === commandIndex ? 'active' : ''}" data-command-index="${index}" role="option" aria-selected="${index === commandIndex}"><code>${escapeHtml(item.usage)}</code><span>${escapeHtml(item.description)}</span></button>`
  ).join('');
  menu.classList.add('open');
  menu.querySelectorAll('[data-command-index]').forEach((button) => button.addEventListener('click', () => executeCommand(visibleCommands[Number(button.dataset.commandIndex)])));
}

async function executeCommand(command) {
  if (!command) return false;
  $('messageInput').value = '';
  $('commandMenu').classList.remove('open');
  await command.run();
  return true;
}

async function executeTypedCommand(text) {
  const trimmed = text.trim();
  const normalized = trimmed.toLowerCase();
  // Parametric commands carry an argument the fixed menu entries can't.
  const modeMatch = normalized.match(/^\/mode(?:\s+(\S+))?$/);
  if (modeMatch) {
    $('messageInput').value = '';
    if (modeMatch[1]) await setMode(modeMatch[1]);
    else showNotice('Current mode: ' + (state.snapshot.config.agent?.mode || 'ask') + '\n\nUse /mode ask | auto-edit | auto | plan.');
    return true;
  }
  const sbMatch = normalized.match(/^\/sandbox(?:\s+(\S+))?$/);
  if (sbMatch) { await setSandbox(sbMatch[1] || ''); $('messageInput').value = ''; return true; }
  const imgMatch = trimmed.match(/^\/image(?:\s+(.+))?$/i);
  if (imgMatch) {
    $('messageInput').value = '';
    const arg = (imgMatch[1] || '').trim();
    if (!arg) openImageSettings();        // no arg → full dialog
    else await setImageModel(arg);        // /image <model> or /image clear → quick set
    return true;
  }
  const updateMatch = normalized.match(/^\/update(?:\s+(\S+))?$/);
  if (updateMatch) {
    $('messageInput').value = '';
    const arg = updateMatch[1] || '';
    if (arg === 'check' || arg === 'status') await checkUpdate();
    else await updateApp(arg === '--force' || arg === 'force');
    return true;
  }
  const command = commands.find((item) => item.usage === normalized);
  if (!command) {
    showNotice(`Unknown command: ${text}\n\nUse /help to see desktop commands.`);
    return true;
  }
  return executeCommand(command);
}

function renderSidebar() {
  const root = $('sidebarContent');
  if (state.activeTab === 'sessions') {
    root.innerHTML = '<div class="section-label">Recent conversations</div>' + state.snapshot.sessions.map((item, index) =>
      `<div class="session-row" style="--item-index:${index}"><button class="list-item" data-session="${escapeHtml(item.id)}"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.updatedAt?.slice(0, 16).replace('T', ' ') || '')} · ${item.messageCount} messages</small></button><button class="delete-session" data-delete-session="${escapeHtml(item.id)}" data-delete-title="${escapeHtml(item.title)}" title="Delete conversation" aria-label="Delete conversation"><img src="icons/trash.svg" alt=""></button></div>`
    ).join('') || '<p class="section-label">No saved sessions</p>';
    root.querySelectorAll('[data-session]').forEach((button) => button.addEventListener('click', () => loadSession(button.dataset.session)));
    root.querySelectorAll('[data-delete-session]').forEach((button) => button.addEventListener('click', () => {
      sessionPendingDelete = { id: button.dataset.deleteSession, title: button.dataset.deleteTitle };
      $('deleteDescription').textContent = `"${sessionPendingDelete.title}" will be permanently removed.`;
      $('deleteDialog').showModal();
    }));
  } else if (state.activeTab === 'skills') {
    root.innerHTML = '<div class="section-label">Skills</div><button class="list-item" data-open-skills-manager><strong>Open skills manager</strong><small>Installed skills, marketplace, install, and uninstall</small></button>';
    root.querySelector('[data-open-skills-manager]')?.addEventListener('click', () => openSkillsDialog());
  } else {
    root.innerHTML = '<div class="section-label">Persistent memory</div>' + Object.values(state.snapshot.memory).map((item, index) =>
      `<button class="list-item" style="--item-index:${index}" data-memory="${escapeHtml(item.target)}"><strong>${escapeHtml(item.target)}</strong><small>${item.entry_count} entries · ${escapeHtml(item.usage)}</small></button>`
    ).join('');
    root.querySelectorAll('[data-memory]').forEach((button) => button.addEventListener('click', () => showMemory(button.dataset.memory)));
  }
}

async function loadSkillRegistry() {
  try {
    state.skillRegistry = await window.goldid.skillRegistry();
  } catch (error) {
    state.skillRegistry = { skills: [{ id: 'error', name: 'Marketplace unavailable', description: error.message || String(error) }] };
  }
  if (state.activeTab === 'skills') renderSidebar();
  if ($('skillsDialog')?.open) renderSkillsDialog();
}

function openSkillPage(id) {
  const base = state.skillRegistry?.baseUrl || 'https://goldid-e56e5.web.app';
  window.goldid.openPath(`${base}/skills/${encodeURIComponent(id)}/`);
}

async function openSkillsDialog(view = state.skillsDialogView || 'installed') {
  state.skillsDialogView = view;
  state.skillsDialogDetail = null;
  if (!state.skillRegistry) loadSkillRegistry().catch(() => {});
  await refresh();
  renderSkillsDialog();
  if (!$('skillsDialog').open) $('skillsDialog').showModal();
}

function installedSkillKeys() {
  const keys = new Set();
  for (const item of state.snapshot?.skills || []) {
    keys.add(String(item.name || '').toLowerCase());
    keys.add(String(item.slug || '').toLowerCase());
    keys.add(skillSlug(item.name));
  }
  return keys;
}

function isMarketplaceInstalled(item) {
  const keys = installedSkillKeys();
  return keys.has(String(item.name || '').toLowerCase()) || keys.has(skillSlug(item.name)) || keys.has(String(item.id || '').toLowerCase());
}

function setSkillsView(view) {
  state.skillsDialogView = view;
  state.skillsDialogDetail = null;
  renderSkillsDialog();
}

function renderSkillsDialog() {
  if (!state.snapshot) return;
  document.querySelectorAll('[data-skills-view]').forEach((button) =>
    button.classList.toggle('active', button.dataset.skillsView === state.skillsDialogView)
  );
  $('skillsBackButton').hidden = !state.skillsDialogDetail;
  $('skillsBrowserNav').hidden = Boolean(state.skillsDialogDetail);
  $('skillsBrowserNav').parentElement.classList.toggle('detail-mode', Boolean(state.skillsDialogDetail));
  if (state.skillsDialogDetail) {
    renderSkillDetailPane();
    return;
  }
  if (state.skillsDialogView === 'marketplace') renderMarketplacePane();
  else renderInstalledPane();
}

function renderInstalledPane() {
  $('skillsPaneTitle').textContent = 'Installed';
  $('skillsPaneSubtitle').textContent = 'Skills available to GolDid right now.';
  const skills = state.snapshot.skills || [];
  $('skillsPaneContent').innerHTML = skills.length ? `<div class="skills-manager-list">${skills.map((skill, index) => `
    <button class="skills-manager-card" style="--item-index:${index}" data-installed-detail="${escapeHtml(skill.name)}">
      <div>
        <small>${escapeHtml(skill.author || skill.source || 'Installed')}</small>
        <h4>${escapeHtml(skill.name)}</h4>
        <p>${escapeHtml(skill.description)}</p>
      </div>
      <span class="secondary-button">Open</span>
    </button>
  `).join('')}</div>` : '<p class="empty-skills">No installed skills yet.</p>';
  $('skillsPaneContent').querySelectorAll('[data-installed-detail]').forEach((button) =>
    button.addEventListener('click', () => showInstalledSkillDetail(button.dataset.installedDetail))
  );
}

function renderMarketplacePane() {
  $('skillsPaneTitle').textContent = 'Marketplace';
  $('skillsPaneSubtitle').textContent = 'Official skills that are not installed yet.';
  const all = state.skillRegistry?.skills || [];
  const skills = all.filter((skill) => !isMarketplaceInstalled(skill));
  $('skillsPaneContent').innerHTML = skills.length ? `<div class="skills-manager-list">${skills.map((skill, index) => `
    <button class="skills-manager-card" style="--item-index:${index}" data-market-detail="${escapeHtml(skill.id)}">
      <div>
        <small>Skill ${escapeHtml(skill.id)} · ${escapeHtml(skill.author || 'Goldid')}</small>
        <h4>${escapeHtml(skill.name)}</h4>
        <p>${escapeHtml(skill.description)}</p>
      </div>
      <span class="secondary-button">View</span>
    </button>
  `).join('')}</div>` : '<p class="empty-skills">All recommended skills are installed.</p>';
  $('skillsPaneContent').querySelectorAll('[data-market-detail]').forEach((button) =>
    button.addEventListener('click', () => showMarketplaceSkillDetail(button.dataset.marketDetail))
  );
}

async function showInstalledSkillDetail(name) {
  const skill = state.snapshot.skills.find((item) => item.name === name);
  if (!skill) return;
  state.skillsDialogDetail = { type: 'installed', skill, body: 'Loading...' };
  renderSkillsDialog();
  try {
    state.skillsDialogDetail.body = await window.goldid.viewSkill(name);
  } catch (error) {
    state.skillsDialogDetail.body = error.message || String(error);
  }
  renderSkillsDialog();
}

async function showMarketplaceSkillDetail(id) {
  state.skillsDialogDetail = { type: 'marketplace', item: { id }, body: 'Loading Version.js...' };
  renderSkillsDialog();
  try {
    const detail = await window.goldid.marketSkillDetail(id);
    state.skillsDialogDetail = { type: 'marketplace', item: detail, body: detail.skillPreview || '' };
  } catch (error) {
    state.skillsDialogDetail = { type: 'marketplace', item: { id, name: `Skill ${id}` }, body: error.message || String(error), error: true };
  }
  renderSkillsDialog();
}

function renderSkillDetailPane() {
  const detail = state.skillsDialogDetail;
  const isInstalled = detail.type === 'installed';
  const item = isInstalled ? detail.skill : detail.item;
  $('skillsPaneTitle').textContent = item.name || `Skill ${item.id}`;
  $('skillsPaneSubtitle').textContent = isInstalled ? 'Installed folder' : 'Marketplace skill';
  const action = isInstalled
    ? `<button class="danger-button" data-uninstall-skill="${escapeHtml(item.name)}">Uninstall</button>`
    : `<button class="primary-button" data-install-skill-detail="${escapeHtml(item.id)}" ${isMarketplaceInstalled(item) || detail.error ? 'disabled' : ''}>${isMarketplaceInstalled(item) ? 'Installed' : 'Install'}</button>`;
  $('skillsPaneContent').innerHTML = `
    <div class="skill-detail-meta">
      <span><strong>Author:</strong> ${escapeHtml(item.author || 'Unknown')}</span>
      <span><strong>Version:</strong> ${escapeHtml(item.version || 'Not specified')}</span>
      <span><strong>Folder:</strong> ${escapeHtml(isInstalled ? item.slug || skillSlug(item.name) : skillSlug(item.name || item.id))}</span>
      ${item.usage ? `<span><strong>Usage:</strong> ${escapeHtml(item.usage)}</span>` : ''}
      ${item.modelTested?.length ? `<span><strong>Models tested:</strong> ${escapeHtml(item.modelTested.join(', '))}</span>` : ''}
    </div>
    <div class="skills-manager-actions">${action}</div>
    <pre class="skill-detail-body">${escapeHtml(detail.body || '')}</pre>
  `;
  $('skillsPaneContent').querySelector('[data-uninstall-skill]')?.addEventListener('click', (event) =>
    uninstallSkill(event.currentTarget.dataset.uninstallSkill)
  );
  $('skillsPaneContent').querySelector('[data-install-skill-detail]')?.addEventListener('click', (event) =>
    installSkill(event.currentTarget.dataset.installSkillDetail)
  );
}

function goBackSkillsDialog() {
  state.skillsDialogDetail = null;
  renderSkillsDialog();
}

async function installSkill(id) {
  const clean = String(id || '').trim();
  if (!clean || state.installingSkills.has(clean)) return;
  state.installingSkills.add(clean);
  if (state.activeTab === 'skills') renderSidebar();
  if ($('skillsDialog').open) renderSkillsDialog();
  try {
    if (!$('skillsDialog').open) showNotice(`Installing skill ${clean}...`);
    const result = await window.goldid.installSkill(clean);
    await refresh();
    state.skillRegistry = null;
    await loadSkillRegistry();
    const installedName = result.name || clean;
    const installedSlug = result.slug || skillSlug(installedName);
    const matching = state.snapshot.skills.find((item) =>
      item.name === installedName || item.slug === installedSlug || item.slug === skillSlug(installedName)
    );
    if (matching) {
      if ($('skillsDialog').open) await showInstalledSkillDetail(matching.name);
      else await showSkill(matching.name);
    } else {
      $('detailTitle').textContent = installedName;
      $('detailContent').textContent = `Installed ${installedName}.\n\nUse it from the Installed skills list, or open it with /skill ${installedSlug}.`;
      if (!$('skillsDialog').open) $('detailDialog').showModal();
    }
  } catch (error) {
    showNotice(error.message || String(error));
  } finally {
    state.installingSkills.delete(clean);
    if (state.activeTab === 'skills') renderSidebar();
    if ($('skillsDialog').open) renderSkillsDialog();
  }
}

async function uninstallSkill(name) {
  try {
    await window.goldid.uninstallSkill(name);
    await refresh();
    state.skillsDialogDetail = null;
    renderSkillsDialog();
  } catch (error) {
    showNotice(error.message || String(error));
  }
}

function renderMessages() {
  const root = $('messages');
  if (!state.messages.length) {
    root.innerHTML = '<div class="empty-state"><div class="empty-mark"><img src="assets/goldid-logo.png" alt=""></div><h2>What are we working on?</h2><p>Ask a question, explore a project, or continue a saved conversation.</p></div>';
    return;
  }
  root.innerHTML = state.messages.map((message) =>
    `<article class="message ${message.role}"><div class="avatar">${message.role === 'assistant' ? 'G' : 'Y'}</div><div class="message-body">${bubbleInner(message)}</div></article>`
  ).join('');
  root.scrollTop = root.scrollHeight;
}

async function refresh() {
  state.snapshot = await window.goldid.snapshot();
  renderStatus();
  renderSidebar();
}

async function loadSession(id) {
  const session = await window.goldid.loadSession(id);
  state.sessionId = session.id;
  state.toolEvents.clear();
  state.messages = session.messages.filter((item) =>
    (item.role === 'user' || item.role === 'assistant') &&
    typeof item.content === 'string' &&
    item.content.trim()
  );
  $('conversationTitle').textContent = session.title;
  renderMessages();
}

async function showSkill(name) {
  $('detailTitle').textContent = name;
  $('detailContent').textContent = await window.goldid.viewSkill(name);
  if (!$('detailDialog').open) $('detailDialog').showModal();
}

function showMemory(target) {
  const item = state.snapshot.memory[target];
  $('detailTitle').textContent = `${target} memory`;
  $('detailContent').textContent = item.entries.length ? item.entries.join('\n\n---\n\n') : '(empty)';
  if (!$('detailDialog').open) $('detailDialog').showModal();
}

function newChat() {
  state.messages = [];
  state.sessionId = null;
  state.toolEvents.clear();
  $('conversationTitle').textContent = 'New conversation';
  renderMessages();
  $('messageInput').focus();
}

function openSettings() {
  const cfg = state.snapshot.config;
  const providers = Object.values(cfg.providers);
  $('providerSelect').innerHTML = providers.map((item) => `<option value="${item.key}">${escapeHtml(item.label)} · ${item.kind}</option>`).join('');
  $('providerSelect').value = cfg.active.provider || providers[0]?.key || '';
  syncProviderForm();
  $('sandboxSelect').value = cfg.agent?.sandbox || 'off';
  loadKeystoreStatus();
  $('settingsDialog').showModal();
}

async function loadKeystoreStatus() {
  try {
    const s = await window.goldid.keystoreStatus();
    const label = s.mode === 'tpm' ? 'TPM-sealed'
      : s.mode === 'machine' ? 'machine-bound (encrypted, hidden)'
      : s.mode === 'plaintext' ? 'plaintext key.bin'
      : 'not initialized';
    $('keystoreMode').textContent = label;
    let hint = '';
    if (s.mode === 'tpm') hint = "Sealed to this machine's TPM — useless if copied elsewhere.";
    else if (s.tpmAvailable) hint = 'TPM available — click "Seal with TPM".';
    else if (s.platform === 'linux' && s.linuxTpmDevice) hint = 'TPM present; sealing may install tpm2-tools (asks for sudo).';
    else hint = 'No TPM — "Seal with TPM" falls back to machine-bound encryption.';
    $('keystoreHint').textContent = hint;
    $('keystoreRevertBtn').hidden = s.mode === 'plaintext';
  } catch (error) {
    $('keystoreMode').textContent = 'unavailable';
    $('keystoreHint').textContent = error.message || '';
  }
}

function syncProviderForm() {
  const item = state.snapshot.config.providers[$('providerSelect').value];
  $('baseUrlInput').value = item?.baseUrl || '';
  $('modelInput').value = state.snapshot.config.active.provider === item?.key ? state.snapshot.config.active.model || '' : '';
  $('modelSuggestions').innerHTML = '';
}

async function fetchModels() {
  const button = $('fetchModelsButton');
  button.disabled = true;
  button.textContent = 'Fetching…';
  try {
    const models = await window.goldid.listModels($('providerSelect').value);
    $('modelSuggestions').innerHTML = models.slice(0, 100).map((model) => `<button type="button">${escapeHtml(model)}</button>`).join('');
    $('modelSuggestions').querySelectorAll('button').forEach((item) => item.addEventListener('click', () => { $('modelInput').value = item.textContent; }));
  } catch (error) {
    $('modelSuggestions').textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = 'Fetch models';
  }
}

// Image-capable providers and their default image models (mirrors lib/providers.js).
const IMAGE_PROVIDERS = ['openai', 'xai', 'gemini', 'openrouter'];
const IMAGE_DEFAULTS = {
  openai: 'gpt-image-1',
  xai: 'grok-2-image',
  gemini: 'gemini-2.0-flash-preview-image-generation',
  openrouter: 'google/gemini-2.5-flash-image-preview',
};

function openImageSettings() {
  const cfg = state.snapshot.config;
  const opts = IMAGE_PROVIDERS.map((key) => {
    const p = cfg.providers[key];
    if (!p) return '';
    const tag = p.hasKey ? ' · has key' : ' · no key';
    return `<option value="${key}">${escapeHtml(p.label)}${tag}</option>`;
  }).filter(Boolean).join('');
  $('imageProviderSelect').innerHTML = opts;
  $('imageProviderSelect').value = cfg.agent?.imageProvider || cfg.active.provider || IMAGE_PROVIDERS[0];
  syncImageForm();
  $('imageDialog').showModal();
}

function syncImageForm() {
  const cfg = state.snapshot.config;
  const key = $('imageProviderSelect').value;
  const p = cfg.providers[key] || {};
  $('imageApiKeyInput').placeholder = p.hasKey ? 'Leave blank to reuse the saved key' : 'Paste an API key';
  $('imageApiKeyInput').value = '';
  // Pre-fill with the current image model if this provider is selected, else its default.
  const current = cfg.agent?.imageProvider === key ? cfg.agent?.imageModel : '';
  $('imageModelInput').value = current || IMAGE_DEFAULTS[key] || '';
  $('imageModelSuggestions').innerHTML = '';
}

async function fetchImageModels() {
  const button = $('fetchImageModelsButton');
  const key = $('imageProviderSelect').value;
  button.disabled = true;
  button.textContent = 'Listing…';
  try {
    const models = await window.goldid.listModels(key);
    const def = IMAGE_DEFAULTS[key];
    const ordered = [...new Set([def, ...models].filter(Boolean))];
    $('imageModelSuggestions').innerHTML = ordered.slice(0, 100)
      .map((model) => `<button type="button">${escapeHtml(model)}</button>`).join('');
    $('imageModelSuggestions').querySelectorAll('button')
      .forEach((item) => item.addEventListener('click', () => { $('imageModelInput').value = item.textContent; }));
  } catch (error) {
    $('imageModelSuggestions').textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = 'List models';
  }
}

async function sendMessage(event) {
  event.preventDefault();
  const input = $('messageInput');
  const text = input.value.trim();
  if (!text || $('sendButton').disabled) return;
  if (text.startsWith('/')) {
    await executeTypedCommand(text);
    return;
  }
  state.messages.push({ role: 'user', content: text });
  input.value = '';
  input.style.height = '';
  state.requestId = crypto.randomUUID();
  state.toolEvents.clear();
  document.body.classList.add('is-streaming');
  state.messages.push({ role: 'assistant', content: '', images: [] });
  renderMessages();
  state.streamingNode = $('messages').lastElementChild.querySelector('.message-body');
  state.streamingNode.innerHTML = bubbleInner(state.messages[state.messages.length - 1]);
  setStreaming(true);
  try {
    const result = await window.goldid.sendChat({
      requestId: state.requestId,
      sessionId: state.sessionId,
      messages: state.messages.slice(0, -1),
    });
    state.sessionId = result.sessionId;
    const last = state.messages[state.messages.length - 1];
    // Keep streamed/partial content if a stop produced no final text.
    last.content = result.text || last.content;
    if (result.stopped) last.content += last.content ? '\n\n_(stopped)_' : '_(stopped)_';
    $('conversationTitle').textContent = state.messages.find((item) => item.role === 'user')?.content.slice(0, 64) || 'Conversation';
    await refresh();
  } catch (error) {
    state.messages[state.messages.length - 1].content = `Error: ${error.message}`;
  } finally {
    state.requestId = null;
    state.streamingNode = null;
    setStreaming(false);
    renderMessages();
  }
}

function setStreaming(on) {
  document.body.classList.toggle('is-streaming', on);
  $('sendButton').hidden = on;
  $('stopButton').hidden = !on;
  $('messageInput').disabled = on;
}

async function stopStreaming() {
  if (state.requestId) await window.goldid.cancelChat(state.requestId);
}

window.goldid.onDelta(({ requestId, text }) => {
  if (requestId !== state.requestId || !state.streamingNode) return;
  state.messages[state.messages.length - 1].content += text;
  state.streamingNode.innerHTML = bubbleInner(state.messages[state.messages.length - 1]);
  $('messages').scrollTop = $('messages').scrollHeight;
});

window.goldid.onToolImage((payload) => {
  const last = state.messages[state.messages.length - 1];
  if (!last || last.role !== 'assistant') return;
  (last.images = last.images || []).push(payload);
  if (state.streamingNode) state.streamingNode.innerHTML = bubbleInner(last);
  else renderMessages();
  $('messages').scrollTop = $('messages').scrollHeight;
});

window.goldid.onToolStatus((payload) => {
  const root = $('messages');
  let event = state.toolEvents.get(payload.id);
  if (!event) {
    event = document.createElement('div');
    state.toolEvents.set(payload.id, event);
    const answer = state.streamingNode?.closest('.message');
    if (answer) root.insertBefore(event, answer);
    else root.append(event);
  }
  event.className = `tool-event ${payload.state}`;
  event.innerHTML = `<img src="icons/terminal.svg" alt=""><span>${escapeHtml(payload.name)} · ${escapeHtml(payload.state)}</span>`;
  root.scrollTop = root.scrollHeight;
});

let pendingApproval = null;
window.goldid.onApprovalRequest((payload) => {
  pendingApproval = payload;
  $('approvalText').textContent = `${payload.name} wants to run — approve?`;
  $('approvalArgsInline').textContent = JSON.stringify(payload.args || {}, null, 2);
  $('approvalBar').hidden = false;
  $('inlineApprove').focus();
});

function answerApproval(approved) {
  if (!pendingApproval) return;
  window.goldid.respondApproval({ id: pendingApproval.id, approved });
  pendingApproval = null;
  $('approvalBar').hidden = true;
}

async function deletePendingSession() {
  if (!sessionPendingDelete) return;
  const deletingActive = state.sessionId === sessionPendingDelete.id;
  await window.goldid.deleteSession(sessionPendingDelete.id);
  if (deletingActive) newChat();
  sessionPendingDelete = null;
  $('deleteDialog').close();
  await refresh();
}

document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => {
  selectSidebarTab(tab.dataset.tab);
}));
$('newChatButton').addEventListener('click', newChat);
$('settingsButton').addEventListener('click', openSettings);
$('providerSelect').addEventListener('change', syncProviderForm);
$('fetchModelsButton').addEventListener('click', fetchModels);
$('openDataButton').addEventListener('click', () => window.goldid.openPath(state.snapshot.dataDir));
$('detailClose').addEventListener('click', () => $('detailDialog').close());
$('inlineDeny').addEventListener('click', () => answerApproval(false));
$('inlineApprove').addEventListener('click', () => answerApproval(true));
$('stopButton').addEventListener('click', stopStreaming);

// Esc denies a pending approval, or stops a running turn.
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (pendingApproval) { answerApproval(false); }
  else if (state.requestId) { stopStreaming(); }
});

// Copy buttons (code blocks + message) and generated-image clicks, via delegation.
$('messages').addEventListener('click', (event) => {
  const copyBtn = event.target.closest('.copy-btn');
  if (copyBtn) {
    const block = copyBtn.closest('.code-block');
    const body = copyBtn.closest('.message-body');
    const text = block
      ? block.querySelector('code')?.textContent || ''
      : body?.querySelector('.message-text')?.innerText || '';
    navigator.clipboard.writeText(text).then(() => {
      const old = copyBtn.textContent;
      copyBtn.textContent = 'Copied';
      setTimeout(() => { copyBtn.textContent = old; }, 1200);
    });
    return;
  }
  const img = event.target.closest('.gen-image');
  if (img && img.dataset.path) window.goldid.openPath(img.dataset.path);
});

// Click the sidebar footer (provider/model) to open settings.
document.querySelector('.sidebar-footer')?.addEventListener('click', openSettings);
$('cancelDeleteButton').addEventListener('click', () => {
  sessionPendingDelete = null;
  $('deleteDialog').close();
});
$('confirmDeleteButton').addEventListener('click', deletePendingSession);
$('deleteDialog').addEventListener('cancel', (event) => {
  event.preventDefault();
  sessionPendingDelete = null;
  $('deleteDialog').close();
});
$('composer').addEventListener('submit', sendMessage);
$('messageInput').addEventListener('input', (event) => {
  event.target.style.height = 'auto';
  event.target.style.height = `${Math.min(event.target.scrollHeight, 180)}px`;
  commandIndex = 0;
  renderCommandMenu();
});
$('messageInput').addEventListener('keydown', (event) => {
  if ($('commandMenu').classList.contains('open')) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      commandIndex = (commandIndex + 1) % visibleCommands.length;
      renderCommandMenu();
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      commandIndex = (commandIndex - 1 + visibleCommands.length) % visibleCommands.length;
      renderCommandMenu();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      $('commandMenu').classList.remove('open');
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      $('messageInput').value = visibleCommands[commandIndex].usage;
      $('messageInput').setSelectionRange($('messageInput').value.length, $('messageInput').value.length);
      renderCommandMenu();
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      executeCommand(visibleCommands[commandIndex]);
      return;
    }
  }
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    $('composer').requestSubmit();
  }
});
document.addEventListener('click', (event) => {
  if (!event.target.closest('.composer')) $('commandMenu').classList.remove('open');
});
$('skillsClose').addEventListener('click', () => $('skillsDialog').close());
$('skillsBackButton').addEventListener('click', goBackSkillsDialog);
document.querySelectorAll('[data-skills-view]').forEach((button) =>
  button.addEventListener('click', () => setSkillsView(button.dataset.skillsView))
);
$('settingsForm').addEventListener('submit', async (event) => {
  if (event.submitter?.value === 'cancel') return;
  event.preventDefault();
  await window.goldid.saveConfig({
    provider: $('providerSelect').value,
    baseUrl: $('baseUrlInput').value,
    apiKey: $('apiKeyInput').value,
    model: $('modelInput').value,
  });
  $('apiKeyInput').value = '';
  $('settingsDialog').close();
  await refresh();
});

$('modeSelect').addEventListener('change', (event) => setMode(event.target.value));
$('sandboxSelect').addEventListener('change', async (event) => {
  try {
    state.snapshot.config = await window.goldid.setSandbox(event.target.value);
    renderStatus();
  } catch (error) {
    showNotice(error.message || String(error));
    event.target.value = state.snapshot.config.agent?.sandbox || 'off';
  }
});
$('keystoreMigrateBtn').addEventListener('click', async () => {
  const btn = $('keystoreMigrateBtn');
  const old = btn.textContent;
  btn.disabled = true; btn.textContent = 'Sealing…';
  try {
    const r = await window.goldid.keystoreMigrate();
    showNotice(r.message || (r.ok ? 'Done.' : 'Failed.'));
  } catch (error) {
    showNotice(error.message || String(error));
  } finally {
    btn.disabled = false; btn.textContent = old;
    loadKeystoreStatus();
  }
});
$('keystoreRevertBtn').addEventListener('click', async () => {
  try {
    const r = await window.goldid.keystoreRevert();
    showNotice(r.message || 'Reverted.');
  } catch (error) {
    showNotice(error.message || String(error));
  } finally {
    loadKeystoreStatus();
  }
});

$('imageProviderSelect').addEventListener('change', syncImageForm);
$('fetchImageModelsButton').addEventListener('click', fetchImageModels);
$('imageForm').addEventListener('submit', async (event) => {
  if (event.submitter?.value === 'cancel') return;
  event.preventDefault();
  try {
    state.snapshot.config = await window.goldid.setImageConfig({
      provider: $('imageProviderSelect').value,
      apiKey: $('imageApiKeyInput').value,
      model: $('imageModelInput').value.trim(),
    });
    renderStatus();
  } catch (error) {
    showNotice(error.message || String(error));
    return;
  }
  $('imageApiKeyInput').value = '';
  $('imageDialog').close();
});

refresh().catch((error) => {
  $('messages').innerHTML = `<div class="empty-state"><h2>Could not start GolDid</h2><p>${escapeHtml(error.message)}</p></div>`;
});
