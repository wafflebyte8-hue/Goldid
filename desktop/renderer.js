'use strict';

const state = { snapshot: null, messages: [], sessionId: null, activeTab: 'sessions', requestId: null, streamingNode: null, toolEvents: new Map() };
let sessionPendingDelete = null;
const $ = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function renderMessageContent(value) {
  const text = String(value ?? '').replace(/\r\n/g, '\n');
  const parts = text.split(/```/);
  return parts.map((part, index) => {
    if (index % 2 === 0) return `<span class="message-text">${escapeHtml(part)}</span>`;
    const newline = part.indexOf('\n');
    const firstLine = newline >= 0 ? part.slice(0, newline).trim() : '';
    const hasLanguage = /^[A-Za-z0-9_+#.-]{1,24}$/.test(firstLine);
    const language = hasLanguage ? firstLine : '';
    const code = newline >= 0 && hasLanguage ? part.slice(newline + 1) : part;
    return `<div class="code-block">${language ? `<div class="code-label">${escapeHtml(language)}</div>` : ''}<pre><code>${escapeHtml(code.replace(/\n$/, ''))}</code></pre></div>`;
  }).join('');
}

function renderStatus() {
  const active = state.snapshot.config.active;
  const provider = state.snapshot.config.providers[active.provider];
  $('activeProvider').textContent = provider?.label || 'Not configured';
  $('activeModel').textContent = active.model || 'Open settings';
  $('connectionDot').classList.toggle('online', Boolean(provider && active.model));
  $('workingDirectory').textContent = state.snapshot.cwd;
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
    root.innerHTML = '<div class="section-label">Available skills</div>' + state.snapshot.skills.map((item, index) =>
      `<button class="list-item" style="--item-index:${index}" data-skill="${escapeHtml(item.name)}"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.description)}</small></button>`
    ).join('') || '<p class="section-label">No compatible skills found</p>';
    root.querySelectorAll('[data-skill]').forEach((button) => button.addEventListener('click', () => showSkill(button.dataset.skill)));
  } else {
    root.innerHTML = '<div class="section-label">Persistent memory</div>' + Object.values(state.snapshot.memory).map((item, index) =>
      `<button class="list-item" style="--item-index:${index}" data-memory="${escapeHtml(item.target)}"><strong>${escapeHtml(item.target)}</strong><small>${item.entry_count} entries · ${escapeHtml(item.usage)}</small></button>`
    ).join('');
    root.querySelectorAll('[data-memory]').forEach((button) => button.addEventListener('click', () => showMemory(button.dataset.memory)));
  }
}

function renderMessages() {
  const root = $('messages');
  if (!state.messages.length) {
    root.innerHTML = '<div class="empty-state"><div class="empty-mark"><img src="assets/goldid-logo.png" alt=""></div><h2>What are we working on?</h2><p>Ask a question, explore a project, or continue a saved conversation.</p></div>';
    return;
  }
  root.innerHTML = state.messages.map((message) =>
    `<article class="message ${message.role}"><div class="avatar">${message.role === 'assistant' ? 'G' : 'Y'}</div><div class="message-body"><strong>${message.role === 'assistant' ? 'GolDid' : 'You'}</strong>${renderMessageContent(message.content)}</div></article>`
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
  $('detailDialog').showModal();
}

function showMemory(target) {
  const item = state.snapshot.memory[target];
  $('detailTitle').textContent = `${target} memory`;
  $('detailContent').textContent = item.entries.length ? item.entries.join('\n\n---\n\n') : '(empty)';
  $('detailDialog').showModal();
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
  $('settingsDialog').showModal();
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

async function sendMessage(event) {
  event.preventDefault();
  const input = $('messageInput');
  const text = input.value.trim();
  if (!text || $('sendButton').disabled) return;
  state.messages.push({ role: 'user', content: text });
  input.value = '';
  input.style.height = '';
  state.requestId = crypto.randomUUID();
  state.toolEvents.clear();
  document.body.classList.add('is-streaming');
  state.messages.push({ role: 'assistant', content: '' });
  renderMessages();
  state.streamingNode = $('messages').lastElementChild.querySelector('.message-body');
  state.streamingNode.innerHTML = '<strong>GolDid</strong>';
  $('sendButton').disabled = true;
  try {
    const result = await window.goldid.sendChat({
      requestId: state.requestId,
      sessionId: state.sessionId,
      messages: state.messages.slice(0, -1),
    });
    state.sessionId = result.sessionId;
    state.messages[state.messages.length - 1].content = result.text;
    $('conversationTitle').textContent = state.messages.find((item) => item.role === 'user')?.content.slice(0, 64) || 'Conversation';
    await refresh();
  } catch (error) {
    state.messages[state.messages.length - 1].content = `Error: ${error.message}`;
  } finally {
    state.requestId = null;
    state.streamingNode = null;
    $('sendButton').disabled = false;
    document.body.classList.remove('is-streaming');
    renderMessages();
  }
}

window.goldid.onDelta(({ requestId, text }) => {
  if (requestId !== state.requestId || !state.streamingNode) return;
  state.messages[state.messages.length - 1].content += text;
  state.streamingNode.innerHTML = `<strong>GolDid</strong>${renderMessageContent(state.messages[state.messages.length - 1].content)}`;
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
  $('approvalDescription').textContent = `${payload.name} is requesting permission to act on your machine.`;
  $('approvalArgs').textContent = JSON.stringify(payload.args || {}, null, 2);
  $('approvalDialog').showModal();
});

function answerApproval(approved) {
  if (!pendingApproval) return;
  window.goldid.respondApproval({ id: pendingApproval.id, approved });
  pendingApproval = null;
  $('approvalDialog').close();
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
  document.querySelectorAll('.tab').forEach((item) => item.classList.toggle('active', item === tab));
  state.activeTab = tab.dataset.tab;
  renderSidebar();
}));
$('newChatButton').addEventListener('click', newChat);
$('settingsButton').addEventListener('click', openSettings);
$('providerSelect').addEventListener('change', syncProviderForm);
$('fetchModelsButton').addEventListener('click', fetchModels);
$('openDataButton').addEventListener('click', () => window.goldid.openPath(state.snapshot.dataDir));
$('detailClose').addEventListener('click', () => $('detailDialog').close());
$('denyToolButton').addEventListener('click', () => answerApproval(false));
$('approveToolButton').addEventListener('click', () => answerApproval(true));
$('approvalDialog').addEventListener('cancel', (event) => {
  event.preventDefault();
  answerApproval(false);
});
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
});
$('messageInput').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    $('composer').requestSubmit();
  }
});
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

refresh().catch((error) => {
  $('messages').innerHTML = `<div class="empty-state"><h2>Could not start GolDid</h2><p>${escapeHtml(error.message)}</p></div>`;
});
