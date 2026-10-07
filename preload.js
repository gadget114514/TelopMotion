'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sunoApi', {
  saveFile: (payload) => ipcRenderer.invoke('file:save', payload),
  fileOpen: (payload) => ipcRenderer.invoke('file:open', payload),
  readAsset: (assetPath) => ipcRenderer.invoke('asset:read', { path: assetPath }),
  streamOpen: (payload) => ipcRenderer.invoke('file:stream-open', payload),
  streamWrite: (payload) => ipcRenderer.invoke('file:stream-write', payload),
  streamClose: (payload) => ipcRenderer.invoke('file:stream-close', payload),
  streamAbort: (payload) => ipcRenderer.invoke('file:stream-abort', payload),
  imageFetch: (url) => ipcRenderer.invoke('image:fetch', { url }),
  openStudio: (payload) => ipcRenderer.invoke('studio:open', payload),
  openHome: (payload) => ipcRenderer.invoke('home:open', payload),
  onStudioData: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('studio:data', listener);
    return () => ipcRenderer.removeListener('studio:data', listener);
  },
  studioAutosaveRead: () => ipcRenderer.invoke('studio:autosave-read'),
  studioAutosaveWrite: (payload) => ipcRenderer.invoke('studio:autosave-write', payload),
  recentList: () => ipcRenderer.invoke('recent:list'),
  recentAdd: (entry) => ipcRenderer.invoke('recent:add', entry),
  appInfo: () => ipcRenderer.invoke('app:info'),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', { url }),
  openDevTools: (mode) => ipcRenderer.invoke('devtools:open', { mode: mode || 'right' }),
  toggleDevTools: () => ipcRenderer.invoke('devtools:toggle'),
  debugOpen: () => ipcRenderer.invoke('debug:open'),
  debugToggle: () => ipcRenderer.invoke('debug:toggle'),
  debugLog: (entry) => ipcRenderer.invoke('debug:log', entry),
  debugHistory: () => ipcRenderer.invoke('debug:history'),
  debugClear: () => ipcRenderer.invoke('debug:clear'),
  onDebugLog: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('debug:log', listener);
    return () => ipcRenderer.removeListener('debug:log', listener);
  },
  onDebugClear: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('debug:clear', listener);
    return () => ipcRenderer.removeListener('debug:clear', listener);
  },
  onProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('suno:progress', listener);
    return () => ipcRenderer.removeListener('suno:progress', listener);
  },
});
