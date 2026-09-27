window.SA = window.SA || {};

SA.platform = (() => {
  'use strict';

  const bridge = typeof window.sunoApi === 'object' && window.sunoApi ? window.sunoApi : null;
  const isElectron = !!bridge;

  function unsupported(feature) {
    return Object.assign(new Error(`${feature} is not available in the web build`), { code: 'unsupported' });
  }

  function unwrap(response) {
    if (response && response.ok) return response.data;
    const error = new Error((response && response.error && response.error.message) || 'unknown-error');
    error.code = (response && response.error && response.error.code) || 'error';
    throw error;
  }

  function isDataset(value) {
    return !!value && typeof value === 'object' && !!value.profile && Array.isArray(value.songs);
  }

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  function pickJsonFile() {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.hidden = true;
      document.body.appendChild(input);
      let settled = false;
      function finish(result) {
        if (settled) return;
        settled = true;
        input.remove();
        resolve(result);
      }
      input.addEventListener(
        'change',
        () => {
          const file = input.files && input.files[0];
          if (!file) {
            finish({ canceled: true });
            return;
          }
          file.text().then(
            (text) => finish({ canceled: false, data: JSON.parse(text) }),
            () => finish({ canceled: false, error: true })
          );
        },
        { once: true }
      );
      input.addEventListener('cancel', () => finish({ canceled: true }), { once: true });
      input.click();
    });
  }

  function fetchProfile(handle) {
    if (!isElectron) return Promise.reject(unsupported('fetchProfile'));
    return bridge.fetchProfile(handle).then(unwrap);
  }

  function fetchClip(id) {
    if (!isElectron) return Promise.reject(unsupported('fetchClip'));
    return bridge.fetchClip(id).then(unwrap);
  }

  const cache = {
    list: () => (isElectron ? bridge.cacheList().then(unwrap).catch(() => []) : Promise.resolve([])),
    load: (handle) => (isElectron ? bridge.cacheLoad(handle).then(unwrap).catch(() => null) : Promise.resolve(null)),
    remove: (handle) => (isElectron ? bridge.cacheRemove(handle).then(unwrap).catch(() => false) : Promise.resolve(false)),
  };

  const imageCache = new Map();

  function loadImageElement(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.decoding = 'async';
      image.onload = () => resolve(image);
      image.onerror = () => reject(Object.assign(new Error('image-load-failed'), { code: 'image-load-failed' }));
      image.src = src;
    });
  }

  function placeholderImage(label) {
    const size = 256;
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, '#ff8a3d');
    gradient.addColorStop(1, '#ff4d8d');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    const initial = String(label || '?').trim().charAt(0).toUpperCase() || '?';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.font = '700 118px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initial, size / 2, size / 2 + 6);
    return canvas.transferToImageBitmap();
  }

  async function loadImage(url, label) {
    if (!url) return null;
    if (imageCache.has(url)) return imageCache.get(url);
    const request = (async () => {
      try {
        if (isElectron && /^https?:/i.test(url)) {
          const dataUrl = unwrap(await bridge.imageFetch(url));
          return await loadImageElement(dataUrl);
        }
        return await loadImageElement(url);
      } catch {
        return placeholderImage(label);
      }
    })();
    imageCache.set(url, request);
    return request;
  }

  async function importJson() {
    if (isElectron) {
      const result = unwrap(await bridge.cacheImport());
      return result || { canceled: true };
    }
    const picked = await pickJsonFile();
    if (picked.canceled) return { canceled: true };
    if (picked.error || !isDataset(picked.data)) {
      throw Object.assign(new Error('invalid-json'), { code: 'invalid-json' });
    }
    return { canceled: false, data: picked.data };
  }

  async function saveFile(payload) {
    const options = payload || {};
    if (!isElectron) {
      const body = options.blob || new Blob([options.bytes], { type: options.mime || 'application/octet-stream' });
      const name = options.name || 'download';
      downloadBlob(body, name);
      return { canceled: false, filePath: name };
    }
    if (typeof bridge.saveFile !== 'function') throw unsupported('saveFile');
    const bytes = options.bytes || (options.blob ? new Uint8Array(await options.blob.arrayBuffer()) : null);
    return unwrap(await bridge.saveFile({ bytes, defaultName: options.name, mime: options.mime }));
  }

  function filtersFor(accept) {
    const tokens = String(accept || '')
      .split(',')
      .map((token) => token.trim())
      .filter(Boolean);
    const extensions = tokens.filter((token) => token.startsWith('.')).map((token) => token.slice(1));
    if (!extensions.length) return [{ name: 'All files', extensions: ['*'] }];
    return [{ name: extensions.join(', ').toUpperCase(), extensions }];
  }

  function pickFile(accept) {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept || '';
      input.hidden = true;
      document.body.appendChild(input);
      let settled = false;
      function finish(result) {
        if (settled) return;
        settled = true;
        input.remove();
        resolve(result);
      }
      input.addEventListener(
        'change',
        () => {
          const file = input.files && input.files[0];
          if (!file) {
            finish(null);
            return;
          }
          file.arrayBuffer().then(
            (buffer) => finish({ name: file.name, type: file.type, bytes: new Uint8Array(buffer) }),
            () => finish(null)
          );
        },
        { once: true }
      );
      input.addEventListener('cancel', () => finish(null), { once: true });
      input.click();
    });
  }

  async function readFile(accept) {
    if (isElectron) {
      const result = unwrap(await bridge.fileOpen({ filters: filtersFor(accept) }));
      if (!result || result.canceled) return null;
      return { name: result.name, type: result.type, bytes: new Uint8Array(result.bytes), path: result.path };
    }
    return pickFile(accept);
  }

  async function readAsset(path) {
    if (isElectron && typeof bridge.readAsset === 'function') {
      const data = unwrap(await bridge.readAsset(path));
      if (data instanceof ArrayBuffer) return data;
      return new Uint8Array(data).buffer;
    }
    const response = await fetch(path);
    if (!response.ok) {
      throw Object.assign(new Error(`asset-http-${response.status}`), { code: 'asset-fetch-failed' });
    }
    return await response.arrayBuffer();
  }

  async function openStream(options) {
    const opts = options || {};
    if (isElectron && typeof bridge.streamOpen === 'function') {
      const opened = unwrap(await bridge.streamOpen({ defaultName: opts.name, filters: opts.filters }));
      if (!opened || opened.canceled) return null;
      const id = opened.id;
      let closed = false;
      return {
        path: opened.filePath,
        async write(bytes, position) {
          if (closed) return false;
          return unwrap(await bridge.streamWrite({ id, bytes, position: position == null ? null : position }));
        },
        async close() {
          if (closed) return false;
          closed = true;
          return unwrap(await bridge.streamClose({ id }));
        },
        async abort() {
          if (closed) return false;
          closed = true;
          try {
            return unwrap(await bridge.streamAbort({ id }));
          } catch {
            return false;
          }
        },
      };
    }
    if (typeof window.showSaveFilePicker === 'function') {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: opts.name || 'video',
          types: [{ description: opts.description || 'Video', accept: { [opts.mime || 'video/mp4']: [opts.extension || '.mp4'] } }],
        });
        const writable = await handle.createWritable();
        let position = 0;
        return {
          path: handle.name,
          async write(bytes, pos) {
            if (pos == null) {
              await writable.write(bytes);
              position += bytes.byteLength;
              return position;
            }
            await writable.write({ type: 'write', position: pos, data: bytes });
            position = Math.max(position, pos + bytes.byteLength);
            return position;
          },
          async close() {
            await writable.close();
            return true;
          },
          async abort() {
            try {
              await writable.abort();
            } catch {
              /* ignore */
            }
            return true;
          },
        };
      } catch {
        return null;
      }
    }
    return null;
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('sa-studio', 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const store of ['handoff', 'autosave']) {
          if (!db.objectStoreNames.contains(store)) db.createObjectStore(store);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(Object.assign(new Error('indexeddb-failed'), { code: 'indexeddb-failed' }));
    });
  }

  async function idbGet(store, key) {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const request = db.transaction(store, 'readonly').objectStore(store).get(key);
      request.onsuccess = () => resolve(request.result == null ? null : request.result);
      request.onerror = () => resolve(null);
    });
  }

  async function idbSet(store, key, value) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(store, 'readwrite');
      transaction.objectStore(store).put(value, key);
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(Object.assign(new Error('indexeddb-failed'), { code: 'indexeddb-failed' }));
    });
  }

  async function readHandoff() {
    if (isElectron) return null;
    const value = await idbGet('handoff', 'current');
    if (value) await idbSet('handoff', 'current', null);
    return value;
  }

  function waitForHandoff() {
    if (isElectron && typeof bridge.onStudioData === 'function') {
      return new Promise((resolve) => bridge.onStudioData((payload) => resolve(payload || null)));
    }
    return Promise.resolve(null);
  }

  async function openStudio(dataset, lang) {
    if (isElectron && typeof bridge.openStudio === 'function') {
      await bridge.openStudio({ dataset, lang });
      return true;
    }
    await idbSet('handoff', 'current', { dataset, lang, at: Date.now() });
    window.location.href = 'studio.html#handoff';
    return true;
  }

  async function openHome(dataset, lang) {
    if (isElectron && typeof bridge.openHome === 'function') {
      await bridge.openHome({ dataset, lang });
      return true;
    }
    await idbSet('handoff', 'current', { dataset, lang, at: Date.now() });
    window.location.href = 'index.html#handoff';
    return true;
  }

  async function readAutosave() {
    if (isElectron && typeof bridge.studioAutosaveRead === 'function') {
      const result = await bridge.studioAutosaveRead();
      return result && result.ok ? result.data : null;
    }
    return idbGet('autosave', 'current');
  }

  async function writeAutosave(project) {
    if (isElectron && typeof bridge.studioAutosaveWrite === 'function') {
      await bridge.studioAutosaveWrite({ project });
      return true;
    }
    await idbSet('autosave', 'current', project);
    return true;
  }

  const RECENT_KEY = 'sa.studio.recent';

  const recent = {
    async list() {
      if (isElectron && typeof bridge.recentList === 'function') {
        const result = await bridge.recentList();
        return result && result.ok ? result.data || [] : [];
      }
      try {
        return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
      } catch {
        return [];
      }
    },
    async add(entry) {
      if (isElectron && typeof bridge.recentAdd === 'function') {
        await bridge.recentAdd(entry);
        return true;
      }
      try {
        const list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').filter((item) => item.name !== entry.name);
        list.unshift(entry);
        localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 8)));
      } catch {
        /* ignore storage errors */
      }
      return true;
    },
  };

  async function exportJson(dataset) {
    if (!isDataset(dataset)) throw Object.assign(new Error('nothing-to-export'), { code: 'nothing-to-export' });
    const handle = (dataset.profile && dataset.profile.handle) || 'profile';
    if (isElectron) return unwrap(await bridge.cacheExport(null, dataset));
    return saveFile({ bytes: new TextEncoder().encode(JSON.stringify(dataset, null, 2)), name: `suno-${handle}.json`, mime: 'application/json' });
  }

  function openExternal(url) {
    if (isElectron) return bridge.openExternal(url).then(unwrap).catch(() => false);
    window.open(url, '_blank', 'noopener');
    return Promise.resolve(true);
  }

  function onProgress(callback) {
    if (isElectron && typeof bridge.onProgress === 'function') return bridge.onProgress(callback);
    return () => {};
  }

  return {
    isElectron,
    isDataset,
    fetchProfile,
    fetchClip,
    cache,
    loadImage,
    importJson,
    readFile,
    readAsset,
    openStream,
    saveFile,
    exportJson,
    readHandoff,
    waitForHandoff,
    openStudio,
    openHome,
    readAutosave,
    writeAutosave,
    recent,
    openExternal,
    onProgress,
  };
})();
