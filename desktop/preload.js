'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('goldid', {
  snapshot: () => ipcRenderer.invoke('app:snapshot'),
  saveConfig: (input) => ipcRenderer.invoke('config:save', input),
  setAgent: (enabled) => ipcRenderer.invoke('config:agent', enabled),
  listModels: (provider) => ipcRenderer.invoke('models:list', provider),
  loadSession: (id) => ipcRenderer.invoke('session:load', id),
  deleteSession: (id) => ipcRenderer.invoke('session:delete', id),
  viewSkill: (name) => ipcRenderer.invoke('skill:view', name),
  openPath: (target) => ipcRenderer.invoke('path:open', target),
  sendChat: (input) => ipcRenderer.invoke('chat:send', input),
  onDelta: (callback) => ipcRenderer.on('chat:delta', (_, payload) => callback(payload)),
  onToolStatus: (callback) => ipcRenderer.on('tool:status', (_, payload) => callback(payload)),
  onApprovalRequest: (callback) => ipcRenderer.on('tool:approval-request', (_, payload) => callback(payload)),
  respondApproval: (payload) => ipcRenderer.send('tool:approval-response', payload),
});
