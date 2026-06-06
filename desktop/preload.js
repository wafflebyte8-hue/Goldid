'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('goldid', {
  snapshot: () => ipcRenderer.invoke('app:snapshot'),
  saveConfig: (input) => ipcRenderer.invoke('config:save', input),
  setAgent: (enabled) => ipcRenderer.invoke('config:agent', enabled),
  setMode: (mode) => ipcRenderer.invoke('config:mode', mode),
  setSandbox: (mode) => ipcRenderer.invoke('config:sandbox', mode),
  setImageModel: (model) => ipcRenderer.invoke('config:imageModel', model),
  setImageConfig: (input) => ipcRenderer.invoke('config:imageSetup', input),
  listModels: (provider) => ipcRenderer.invoke('models:list', provider),
  loadSession: (id) => ipcRenderer.invoke('session:load', id),
  deleteSession: (id) => ipcRenderer.invoke('session:delete', id),
  viewSkill: (name) => ipcRenderer.invoke('skill:view', name),
  skillRegistry: () => ipcRenderer.invoke('skill:registry'),
  installSkill: (id) => ipcRenderer.invoke('skill:install', id),
  openPath: (target) => ipcRenderer.invoke('path:open', target),
  sendChat: (input) => ipcRenderer.invoke('chat:send', input),
  cancelChat: (requestId) => ipcRenderer.invoke('chat:cancel', requestId),
  keystoreStatus: () => ipcRenderer.invoke('keystore:status'),
  keystoreMigrate: () => ipcRenderer.invoke('keystore:migrate'),
  keystoreRevert: () => ipcRenderer.invoke('keystore:revert'),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  runUpdate: (opts) => ipcRenderer.invoke('update:run', opts),
  onDelta: (callback) => ipcRenderer.on('chat:delta', (_, payload) => callback(payload)),
  onToolStatus: (callback) => ipcRenderer.on('tool:status', (_, payload) => callback(payload)),
  onToolImage: (callback) => ipcRenderer.on('tool:image', (_, payload) => callback(payload)),
  onApprovalRequest: (callback) => ipcRenderer.on('tool:approval-request', (_, payload) => callback(payload)),
  respondApproval: (payload) => ipcRenderer.send('tool:approval-response', payload),
});
