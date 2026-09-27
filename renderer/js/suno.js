window.SA = window.SA || {};

SA.data = (() => {
  'use strict';

  const platform = SA.platform;
  const HANDLE_RE = /^[A-Za-z0-9_.-]{1,64}$/;

  function normalizeHandle(input) {
    if (typeof input !== 'string') return null;
    let value = input.trim();
    if (!value) return null;
    const url = value.match(/^(?:https?:\/\/)?(?:www\.)?suno\.com\/@?([^/?#\s]+)/i);
    if (url) value = url[1];
    value = value.replace(/^@+/, '').replace(/[/?#].*$/, '');
    return HANDLE_RE.test(value) ? value : null;
  }

  return {
    normalizeHandle,
    isElectron: () => platform.isElectron,
    fetchProfile: (handle) => platform.fetchProfile(handle),
    fetchClip: (id) => platform.fetchClip(id),
    listCache: () => platform.cache.list(),
    loadCache: (handle) => platform.cache.load(handle),
    removeCache: (handle) => platform.cache.remove(handle),
    exportData: (data) => platform.exportJson(data),
    importData: () => platform.importJson(),
    openExternal: (url) => platform.openExternal(url),
    onProgress: (callback) => platform.onProgress(callback),
  };
})();
