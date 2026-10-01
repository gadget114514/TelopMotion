'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sunoApi', {
  fetchProfile: (handle) => ipcRenderer.invoke('suno:fetch', { handle }),
  fetchClip: (id) => ipcRenderer.invoke('suno:clip', { id }),
  cacheList: () => ipcRenderer.invoke('cache:list'),
  cacheLoad: (handle) => ipcRenderer.invoke('cache:load', { handle }),
  cacheRemove: (handle) => ipcRenderer.invoke('cache:remove', { handle }),
  cacheExport: (handle, data) => ipcRenderer.invoke('cache:export', { handle, data }),
  cacheImport: () => ipcRenderer.invoke('cache:import'),
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
  onProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('suno:progress', listener);
    return () => ipcRenderer.removeListener('suno:progress', listener);
  },
});
