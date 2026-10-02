'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell, session, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const SMOKE = !!process.env.SA_SMOKE;
const SUNO_URL_RE = /^https:\/\/(?:www\.)?suno\.com\//i;

const FIXTURE_CUES = [
  { id: 'c1', start: 0, end: 4, text: 'First line of the song' },
  { id: 'c2', start: 4.5, end: 8, text: 'Second line of the song' },
  { id: 'c3', start: 8.5, end: 12, text: 'Third line of the song' },
  { id: 'c4', start: 12.5, end: 16, text: 'Fourth line of the song' },
  { id: 'c5', start: 16.5, end: 20, text: 'Fifth line of the song' },
  { id: 'c6', start: 20.5, end: 24, text: 'Sixth line of the song' },
  { id: 'c7', start: 24.5, end: 28, text: 'Seventh line of the song' },
  { id: 'c8', start: 28.5, end: 32, text: 'Eighth line of the song' },
  { id: 'c9', start: 32.5, end: 36, text: 'Ninth line of the song' },
  { id: 'c10', start: 36.5, end: 40, text: 'Tenth line of the song' },
  { id: 'c11', start: 40.5, end: 44, text: 'Eleventh line of the song' },
  { id: 'c12', start: 44.5, end: 48, text: 'Twelfth line of the song' },
];

async function primeStudio(win, query, lang) {
  await win.loadFile(path.join(__dirname, 'renderer', 'studio.html'), { query: query || {} });
  win.webContents.send('studio:data', { cues: FIXTURE_CUES.map((cue) => ({ ...cue })), lang: lang || 'ja' });
}

function ok(data) {
  return { ok: true, data };
}

function fail(error) {
  const message = error && error.message ? error.message : String(error);
  const code = (error && error.code) || 'error';
  return { ok: false, error: { code, message } };
}

const IMAGE_HOST_RE = /(^|\.)(suno\.ai|suno\.com|cloudfront\.net)$/i;
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const ASSET_ROOTS = ['fonts', 'vendor', 'data'];
const streams = new Map();

async function fetchImageDataUrl(rawUrl) {
  if (typeof rawUrl !== 'string') {
    throw Object.assign(new Error('blocked-url'), { code: 'blocked-url' });
  }
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw Object.assign(new Error('blocked-url'), { code: 'blocked-url' });
  }
  if (parsed.protocol !== 'https:' || !IMAGE_HOST_RE.test(parsed.hostname)) {
    throw Object.assign(new Error('blocked-url'), { code: 'blocked-url' });
  }
  const response = await fetch(parsed.href, { headers: { Referer: 'https://suno.com/' } });
  if (!response.ok) {
    throw Object.assign(new Error(`image-http-${response.status}`), { code: 'image-fetch-failed' });
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > IMAGE_MAX_BYTES) {
    throw Object.assign(new Error('image-too-large'), { code: 'image-too-large' });
  }
  const contentType = (response.headers.get('content-type') || 'image/jpeg').split(';')[0].trim() || 'image/jpeg';
  return `data:${contentType};base64,${buffer.toString('base64')}`;
}

function registerIpc() {
  ipcMain.handle('file:open', async (event, payload) => {
    try {
      const owner = BrowserWindow.fromWebContents(event.sender);
      const result = await dialog.showOpenDialog(owner, {
        title: (payload && payload.title) || 'Open file',
        properties: payload && payload.multiple ? ['openFile', 'multiSelections'] : ['openFile'],
        filters: (payload && payload.filters) || [{ name: 'All files', extensions: ['*'] }],
      });
      if (result.canceled || !result.filePaths.length) return ok({ canceled: true });
      if (payload && payload.multiple) {
        const files = result.filePaths.map((filePath) => ({ name: path.basename(filePath), type: '', bytes: new Uint8Array(fs.readFileSync(filePath)), path: filePath }));
        return ok({ canceled: false, files });
      }
      const filePath = result.filePaths[0];
      const buffer = fs.readFileSync(filePath);
      return ok({ canceled: false, name: path.basename(filePath), type: '', bytes: new Uint8Array(buffer), path: filePath });
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle('file:save', async (event, payload) => {
    try {
      const bytes = payload && payload.bytes;
      if (!bytes) {
        return fail(Object.assign(new Error('nothing-to-save'), { code: 'nothing-to-save' }));
      }
      const owner = BrowserWindow.fromWebContents(event.sender);
      const result = await dialog.showSaveDialog(owner, {
        title: (payload && payload.title) || 'Save file',
        defaultPath: (payload && payload.defaultName) || 'file',
        filters: (payload && payload.filters) || [{ name: 'All files', extensions: ['*'] }],
      });
      if (result.canceled || !result.filePath) return ok({ canceled: true });
      fs.writeFileSync(result.filePath, Buffer.from(bytes));
      return ok({ canceled: false, filePath: result.filePath });
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle('image:fetch', async (_event, payload) => {
    try {
      return ok(await fetchImageDataUrl(payload && payload.url));
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle('asset:read', (_event, payload) => {
    try {
      const relative = String((payload && payload.path) || '').replace(/\\/g, '/');
      const normalized = path.posix.normalize(relative);
      if (!normalized || normalized.startsWith('..') || path.isAbsolute(normalized)) {
        throw Object.assign(new Error('blocked-asset'), { code: 'blocked-asset' });
      }
      const parts = normalized.split('/').filter(Boolean);
      const root = parts.shift();
      if (!ASSET_ROOTS.includes(root) || !parts.length) {
        throw Object.assign(new Error('blocked-asset'), { code: 'blocked-asset' });
      }
      const base = path.resolve(path.join(__dirname, 'renderer', root));
      const file = path.resolve(base, ...parts);
      if (file !== base && !file.startsWith(`${base}${path.sep}`)) {
        throw Object.assign(new Error('blocked-asset'), { code: 'blocked-asset' });
      }
      return ok(new Uint8Array(fs.readFileSync(file)));
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle('file:stream-open', async (event, payload) => {
    try {
      const owner = BrowserWindow.fromWebContents(event.sender);
      const result = await dialog.showSaveDialog(owner, {
        title: (payload && payload.title) || 'Export video',
        defaultPath: (payload && payload.defaultName) || 'video.mp4',
        filters: (payload && payload.filters) || [{ name: 'All files', extensions: ['*'] }],
      });
      if (result.canceled || !result.filePath) return ok({ canceled: true });
      const fd = fs.openSync(result.filePath, 'w');
      const id = `stream_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
      streams.set(id, fd);
      return ok({ canceled: false, id, filePath: result.filePath });
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle('file:stream-write', (_event, payload) => {
    try {
      const id = payload && payload.id;
      const fd = streams.get(id);
      if (fd == null) return fail(Object.assign(new Error('stream-not-open'), { code: 'stream-not-open' }));
      const bytes = Buffer.from(payload.bytes || new Uint8Array(0));
      const position = payload.position == null ? null : Number(payload.position);
      const written = position == null ? fs.writeSync(fd, bytes) : fs.writeSync(fd, bytes, 0, bytes.length, position);
      return ok(written);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle('file:stream-close', (_event, payload) => {
    try {
      const id = payload && payload.id;
      const fd = streams.get(id);
      if (fd == null) return ok(false);
      fs.closeSync(fd);
      streams.delete(id);
      return ok(true);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle('file:stream-abort', (_event, payload) => {
    try {
      const id = payload && payload.id;
      const fd = streams.get(id);
      if (fd == null) return ok(false);
      fs.closeSync(fd);
      streams.delete(id);
      return ok(true);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle('studio:open', async (event, payload) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      await win.loadFile(path.join(__dirname, 'renderer', 'studio.html'));
      win.webContents.send('studio:data', { data: payload && payload.dataset, lang: payload && payload.lang });
      return ok(true);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle('home:open', async (event, payload) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      await win.loadFile(path.join(__dirname, 'renderer', 'index.html'), { query: { home: '1' } });
      win.webContents.send('studio:data', { data: payload && payload.dataset, lang: payload && payload.lang });
      return ok(true);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle('studio:autosave-read', () => {
    try {
      const file = path.join(app.getPath('userData'), 'studio-autosave.json');
      if (!fs.existsSync(file)) return ok(null);
      return ok(JSON.parse(fs.readFileSync(file, 'utf8')));
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle('studio:autosave-write', (_event, payload) => {
    try {
      const file = path.join(app.getPath('userData'), 'studio-autosave.json');
      fs.writeFileSync(file, JSON.stringify(payload && payload.project));
      return ok(true);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle('recent:list', () => {
    try {
      const file = path.join(app.getPath('userData'), 'recent.json');
      if (!fs.existsSync(file)) return ok([]);
      const list = JSON.parse(fs.readFileSync(file, 'utf8'));
      return ok(Array.isArray(list) ? list : []);
    } catch {
      return ok([]);
    }
  });

  ipcMain.handle('recent:add', (_event, entry) => {
    try {
      const file = path.join(app.getPath('userData'), 'recent.json');
      let list = [];
      try {
        list = JSON.parse(fs.readFileSync(file, 'utf8'));
      } catch {
        list = [];
      }
      if (!Array.isArray(list)) list = [];
      list = list.filter((item) => item && (!entry || item.name !== entry.name));
      list.unshift(entry);
      fs.writeFileSync(file, JSON.stringify(list.slice(0, 8), null, 2));
      return ok(true);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle('app:info', () => ok({ version: app.getVersion(), name: app.getName(), electron: process.versions.electron, chrome: process.versions.chrome }));

  ipcMain.handle('app:open-external', (_event, payload) => {
    const url = payload && payload.url;
    if (typeof url !== 'string' || !SUNO_URL_RE.test(url)) {
      return fail(Object.assign(new Error('blocked-url'), { code: 'blocked-url' }));
    }
    shell.openExternal(url);
    return ok(true);
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 940,
    minHeight: 620,
    backgroundColor: '#0b0d12',
    autoHideMenuBar: true,
    title: 'TelopMotion',
    show: !SMOKE,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  if (SMOKE && process.env.SA_SMOKE_HOME) {
    try {
      fs.rmSync(path.join(app.getPath('userData'), 'studio-autosave.json'), { force: true });
    } catch {
      /* ignore */
    }
  }
  win.loadFile(path.join(__dirname, 'renderer', 'studio.html'));

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (SUNO_URL_RE.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('file://')) return;
    event.preventDefault();
    if (SUNO_URL_RE.test(url)) shell.openExternal(url);
  });

  if (SMOKE) {
    win.webContents.on('console-message', (event, _level, message) => {
      const text = event && typeof event.message === 'string' ? event.message : message;
      console.log(`[renderer] ${text}`);
    });
    win.webContents.once('did-finish-load', async () => {
      try {
        if (process.env.SA_SMOKE_HOME) {
          const homeReport = await win.webContents.executeJavaScript(`(async () => {
            const until = async (test, timeout) => {
              const started = Date.now();
              while (Date.now() - started < (timeout || 20000)) {
                const value = test();
                if (value) return value;
                await new Promise((resolve) => setTimeout(resolve, 100));
              }
              return null;
            };
            const ready = await until(() => window.SA.store && window.SA.store.state.project);
            if (!ready) return JSON.stringify({ error: 'project-not-ready' });
            const project = window.SA.store.state.project;
            const welcome = document.getElementById('welcome');
            const startButton = document.getElementById('welcome-start');
            const initial = {
              page: location.pathname.split('/').pop(),
              cues: project.script ? project.script.cues.length : 0,
              welcome: welcome ? !welcome.hidden : false,
              hasStart: !!startButton,
              hasLyricsFile: typeof window.SA.lyricsFile === 'object',
              hasOpenHome: !!(window.SA.platform && typeof window.SA.platform.openHome === 'function'),
            };
            if (startButton) startButton.click();
            const dismissed = welcome.hidden;
            const lrc = '[ti:Smoke]\\n[ar:Test]\\n[00:01.00]First line\\n[00:03.00]Second line\\n[00:05.00]';
            const parsedLrc = window.SA.lyricsFile.parse(lrc, 'smoke.lrc');
            window.SA.store.commands.importSrt(parsedLrc.cues, { name: 'smoke.lrc' });
            const afterLrc = window.SA.store.state.project;
            const lrcCues = afterLrc.script.cues.length;
            const firstCue = afterLrc.script.cues[0];
            const lrcBeats = (afterLrc.beats[firstCue.id] || []).length;
            const lrcEnd = afterLrc.script.cues[1] ? afterLrc.script.cues[1].end : 0;
            const whisper = JSON.stringify({ segments: [{ start: 0.5, end: 2.2, text: 'Hello' }, { start: 2.6, end: 4.5, text: 'World' }] });
            const parsedWhisper = window.SA.lyricsFile.parse(whisper, 'smoke.json');
            const msJson = window.SA.lyricsFile.parse(JSON.stringify([{ start: 1000, end: 2500, text: 'ms one' }, { start: 60000, end: 63000, text: 'ms two' }]), 'ms.json');
            const srtSample = '1\\n00:00:01,000 --> 00:00:03,000\\nSRT line\\n';
            const srtDetected = window.SA.lyricsFile.detect(srtSample, 'x.txt');
            await window.SA.preview.ensureFonts();
            await new Promise((resolve) => setTimeout(resolve, 400));
            const capture = window.SA.preview.captureRGBA(1.2);
            let ink = 0;
            if (capture) {
              for (let i = 0; i < capture.data.length; i += 16) {
                if (capture.data[i] + capture.data[i + 1] + capture.data[i + 2] > 120) ink += 1;
              }
            }
            window.SA.timeline.draw();
            return JSON.stringify({
              initial,
              dismissed,
              lrcFormat: parsedLrc.format,
              lrcMeta: parsedLrc.meta && parsedLrc.meta.ti,
              lrcCues,
              lrcBeats,
              lrcEnd,
              whisperCues: parsedWhisper.cues.length,
              msStart: msJson.cues[0] ? msJson.cues[0].start : null,
              srtDetected,
              ink,
              glError: window.SA.preview.debugError(),
            });
          })()`);
          console.log('SMOKE_HOME=' + homeReport);
        }

        if (process.env.SA_SMOKE_STUDIO) {
          await primeStudio(win, {}, 'ja');
          const studio = await win.webContents.executeJavaScript(`(async () => {
            const until = async (test, timeout) => {
              const started = Date.now();
              while (Date.now() - started < (timeout || 5000)) {
                const value = test();
                if (value) return value;
                await new Promise((resolve) => setTimeout(resolve, 100));
              }
              return null;
            };
            const bootRoot = document.getElementById('boot');
            const bootDone = await until(() => bootRoot && bootRoot.hidden, 5000);
            const before = {
              menus: document.querySelectorAll('#menubar .menu-title').length,
              title: document.querySelector('[data-menu="file"]') && document.querySelector('[data-menu="file"]').textContent,
              name: document.getElementById('media-name').textContent,
              welcomeHidden: document.getElementById('welcome').hidden,
              panels: document.querySelectorAll('.panel').length,
              boot: {
                exists: !!bootRoot,
                hidden: !!(bootRoot && bootRoot.hidden),
                done: !!bootDone,
                progress: window.SA.boot ? window.SA.boot.progress() : null,
                status: document.getElementById('boot-status') ? document.getElementById('boot-status').textContent : null,
              },
            };
            document.querySelector('[data-menu="view"]').click();
            const dropdownOpen = !!document.querySelector('.dropdown');
            const items = document.querySelectorAll('.dropdown .menu-item').length;
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            const dropdownClosed = !document.querySelector('.dropdown');
            window.SA.store.commands.setOutput({ fps: 60 });
            const after = window.SA.store.state.project.output.fps;
            document.querySelector('[data-menu="edit"]').click();
            const editMenu = {
              open: !!document.querySelector('.dropdown'),
              items: [...document.querySelectorAll('.dropdown .menu-item')].map((node) => ({ text: node.textContent.trim(), disabled: node.disabled })),
            };
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            window.SA.store.undo();
            const undone = window.SA.store.state.project.output.fps;
            window.SA.store.redo();
            const redone = window.SA.store.state.project.output.fps;
            const dirtyAfterRedo = window.SA.store.isDirty();
            window.SA.store.undo();
            const cleanAfterUndo = !window.SA.store.isDirty();
            window.SA.store.redo();
            const cueCount = window.SA.store.state.project.script.cues.length;
            await window.SA.io.saveAutosave(window.SA.store.state.project);
            const missing = [];
            const firstCue = window.SA.store.state.project.script.cues[0];
            if (firstCue) window.SA.store.setSelection(['cue:' + firstCue.id], 'cue');
            const watched = () =>
              document.querySelectorAll(
                '#menubar .menu-title, [data-i18n], [data-i18n-title], .timeline-head span, .timeline-head button, #inspector-body summary, #inspector-body .ctrl-label, #inspector-body .btn-mini, #inspector-body .btn-key, #inspector-body .insp-breadcrumb'
              );
            for (const language of window.SA.i18n.languages) {
              window.SA.i18n.set(language.code);
              window.SA.menu.build();
              if (window.SA.inspector) window.SA.inspector.render();
              if (window.SA.timeline) {
                window.SA.timeline.reload();
                window.SA.timeline.draw();
              }
              for (const node of watched()) {
                const text = node.dataset && node.dataset.i18nTitle ? node.title : (node.textContent || '').trim();
                if (!text || /^[a-z]+\\.[a-zA-Z_.]+$/.test(text)) missing.push(language.code + ':' + text);
              }
            }
            window.SA.i18n.set('ja');
            window.SA.menu.build();
            if (window.SA.inspector) window.SA.inspector.render();
            const fxLabels = {};
            for (const language of window.SA.i18n.languages) {
              window.SA.i18n.set(language.code);
              fxLabels[language.code] = [
                window.SA.controls.typeLabel('animation', 'stagger'),
                window.SA.controls.typeLabel('post', 'chromaticAberration'),
                window.SA.controls.labelFor('amount'),
                window.SA.controls.valueLabel('ltr'),
              ].join(' / ');
            }
            window.SA.i18n.set('ja');
            window.SA.menu.build();
            if (window.SA.inspector) window.SA.inspector.render();
            // Palette dialog: edit a role live, add / remove a colour, then
            // cancel and confirm the scope is restored.
            const paletteRoot = document.getElementById('dialog-root');
            const paletteAt = () => JSON.stringify(window.SA.project.resolveStyle(window.SA.store.state.project, '').palette || null);
            const paletteBefore = paletteAt();
            window.SA.paletteDialog.open('project');
            const paletteState = {
              open: !!paletteRoot.querySelector('.palette-editor'),
              candidates: paletteRoot.querySelectorAll('.palette-card').length,
              roles: paletteRoot.querySelectorAll('.palette-edit-row').length,
              contrast: !!paletteRoot.querySelector('.palette-contrast'),
            };
            const addColor = paletteRoot.querySelector('.palette-edit-add button');
            if (addColor) addColor.click();
            paletteState.rolesAfterAdd = paletteRoot.querySelectorAll('.palette-edit-row').length;
            const removeColor = [...paletteRoot.querySelectorAll('.palette-edit-row button')].filter((node) => node.textContent === '✕').pop();
            if (removeColor) removeColor.click();
            paletteState.rolesAfterRemove = paletteRoot.querySelectorAll('.palette-edit-row').length;
            const hex = paletteRoot.querySelectorAll('.palette-edit-row .ctrl-hex')[2];
            if (hex) {
              hex.value = '#123456';
              hex.dispatchEvent(new Event('change', { bubbles: true }));
            }
            paletteState.changed = paletteAt() !== paletteBefore;
            const afterHex = paletteAt();
            const rerollColors = paletteRoot.querySelector('.dialog-actions button');
            if (rerollColors) rerollColors.click();
            paletteState.rerolled = paletteAt() !== afterHex;
            window.SA.paletteDialog.close(false);
            paletteState.restored = paletteAt() === paletteBefore;
            paletteState.closed = paletteRoot.hidden;
            return JSON.stringify({ before, dropdownOpen, items, dropdownClosed, editMenu, after, undone, redone, dirtyAfterRedo, cleanAfterUndo, cueCount, fxLabels, langMissing: [...new Set(missing)].slice(0, 60), langMissingCount: missing.length, paletteDialog: paletteState });
          })()`);
          console.log('SMOKE_STUDIO=' + studio);
          await win.loadFile(path.join(__dirname, 'renderer', 'studio.html'));
          await new Promise((resolve) => setTimeout(resolve, 1400));
          const restored = await win.webContents.executeJavaScript(`JSON.stringify({
            name: document.getElementById('media-name').textContent,
            cues: window.SA.store.state.project.script.cues.length,
            fps: window.SA.store.state.project.output.fps,
          })`);
          console.log('SMOKE_STUDIO_RESTORE=' + restored);
        }

        if (process.env.SA_SMOKE_SHOT) {
          await primeStudio(win, {}, 'en');
          win.setContentSize(1600, 1000);
          win.setOpacity(1);
          win.show();
          const shotStatus = await win.webContents.executeJavaScript(`(async () => {
            const until = async (test, timeout) => {
              const started = Date.now();
              while (Date.now() - started < (timeout || 20000)) {
                const value = test();
                if (value) return value;
                await new Promise((resolve) => setTimeout(resolve, 100));
              }
              return null;
            };
            const ready = await until(() => window.SA.store.state.project && window.SA.store.state.project.script && window.SA.store.state.project.script.cues.length);
            if (!ready) return 'project-not-ready';
            const doc = window.SA.store.state.project;
            const cue = doc.script.cues.find((entry) => (doc.beats[entry.id] || []).some((beat) => beat.text)) || doc.script.cues[0];
            await window.SA.preview.ensureFonts();
            await new Promise((resolve) => setTimeout(resolve, 900));
            if (cue) {
              window.SA.store.setSelection(['cue:' + cue.id], 'cue');
              const beats = doc.beats[cue.id] || [];
              const beat = beats.find((entry) => entry.text) || beats[0];
              window.SA.preview.seek(beat ? (beat.start + beat.end) / 2 : cue.start);
              await new Promise((resolve) => setTimeout(resolve, 500));
              if (window.SA.preview.render) window.SA.preview.render();
            }
            const zoom = document.getElementById('tl-zoom');
            if (zoom) {
              zoom.value = '60';
              zoom.dispatchEvent(new Event('input', { bubbles: true }));
            }
            const infoTab = document.getElementById('media-tab-info');
            if (infoTab) infoTab.click();
            const mediaBody = document.querySelector('.media-panel .panel-body');
            if (mediaBody) mediaBody.scrollLeft = 0;
            const inspectorBody = document.querySelector('.inspector-panel .panel-body');
            if (inspectorBody) inspectorBody.scrollTop = 0;
            window.SA.timeline.draw();
            window.SA.studio.renderAll();
            await new Promise((resolve) => setTimeout(resolve, 600));
            // captureRGBA must re-render right before reading: WebGL clears the drawing buffer after compositing
            const capture = window.SA.preview.captureRGBA(window.SA.store.state.playhead);
            let ink = 0;
            if (capture) {
              for (let i = 0; i < capture.data.length; i += 16) {
                if (capture.data[i] + capture.data[i + 1] + capture.data[i + 2] > 120) ink += 1;
              }
            }
            const bytes = new Uint8Array(capture.data.buffer);
            let binary = '';
            for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
            const rect = document.getElementById('preview-canvas').getBoundingClientRect();
            return JSON.stringify({
              status: 'ok',
              ink,
              glError: window.SA.preview.debugError(),
              width: capture.width,
              height: capture.height,
              data: btoa(binary),
              rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
              viewport: { width: window.innerWidth, height: window.innerHeight },
              ui: (() => {
                const body = document.querySelector('.media-panel .panel-body');
                return {
                  tabs: [...document.querySelectorAll('.media-tabs .btn')].map((b) => ({
                    text: b.textContent,
                    active: b.classList.contains('is-active'),
                    x: Math.round(b.getBoundingClientRect().x),
                  })),
                  scrollLeft: body ? Math.round(body.scrollLeft) : null,
                  scrollWidth: body ? body.scrollWidth : null,
                  clientWidth: body ? body.clientWidth : null,
                };
              })(),
            });
          })()`);
          await new Promise((resolve) => setTimeout(resolve, 700));
          const shotReport = typeof shotStatus === 'string' ? JSON.parse(shotStatus) : shotStatus;
          const pageImage = await win.webContents.capturePage();
          const pageSize = pageImage.getSize();
          let finalImage = pageImage;
          if (shotReport && shotReport.data && shotReport.rect) {
            const bitmap = pageImage.toBitmap();
            const pixels = Buffer.from(shotReport.data, 'base64');
            const scale = pageSize.width / Math.max(1, shotReport.viewport.width);
            const destX = Math.round(shotReport.rect.x * scale);
            const destY = Math.round(shotReport.rect.y * scale);
            const destW = Math.max(1, Math.round(shotReport.rect.width * scale));
            const destH = Math.max(1, Math.round(shotReport.rect.height * scale));
            const srcW = shotReport.width;
            const srcH = shotReport.height;
            for (let y = 0; y < destH; y += 1) {
              const sy = Math.min(srcH - 1, Math.floor((y * srcH) / destH));
              const row = (destY + y) * pageSize.width;
              for (let x = 0; x < destW; x += 1) {
                const sx = Math.min(srcW - 1, Math.floor((x * srcW) / destW));
                const si = (sy * srcW + sx) * 4;
                const di = (row + destX + x) * 4;
                if (di + 3 >= bitmap.length) continue;
                bitmap[di] = pixels[si + 2];
                bitmap[di + 1] = pixels[si + 1];
                bitmap[di + 2] = pixels[si];
                bitmap[di + 3] = 255;
              }
            }
            finalImage = nativeImage.createFromBitmap(bitmap, { width: pageSize.width, height: pageSize.height });
          }
          const shotBytes = finalImage.toPNG();
          const shotTarget = path.join(__dirname, 'snapshot', 'studio-overview.png');
          fs.writeFileSync(shotTarget, shotBytes);
          console.log(
            `SMOKE_SHOT=${shotTarget} status=${shotReport && shotReport.status} ink=${shotReport && shotReport.ink} glError=${shotReport && shotReport.glError} bytes=${shotBytes.length}`
          );
        }

        if (process.env.SA_SMOKE_FXDEMO) {
          // FX demo contact sheet: renders the first cues of a demo project into
          // one PNG so the colour and size steps can be checked at a glance.
          // The frames are captured at full output resolution (reduced preview
          // scales draw the text at the wrong size) and then drawn into the
          // sheet at TILE x TILE * aspect.
          // SA_SMOKE_FXDEMO_FILE / _FROM / _COUNT / _COLUMNS / _TILE / _OUT override.
          const demoFile = process.env.SA_SMOKE_FXDEMO_FILE
            ? path.resolve(process.env.SA_SMOKE_FXDEMO_FILE)
            : path.join(__dirname, 'demo', 'fx800-1.telopmotion.json');
          const demoFrom = Math.max(1, Number(process.env.SA_SMOKE_FXDEMO_FROM) || 1);
          const demoLabel = Math.max(1, Number(process.env.SA_SMOKE_FXDEMO_LABEL) || demoFrom);
          const demoCount = Math.max(1, Math.min(64, Number(process.env.SA_SMOKE_FXDEMO_COUNT) || 16));
          const demoColumns = Math.max(1, Math.min(8, Number(process.env.SA_SMOKE_FXDEMO_COLUMNS) || 4));
          const demoTile = Math.max(160, Math.min(1920, Number(process.env.SA_SMOKE_FXDEMO_TILE) || 480));
          const demoScale = ['full', 'half', 'quarter'].includes(process.env.SA_SMOKE_FXDEMO_SCALE) ? process.env.SA_SMOKE_FXDEMO_SCALE : 'full';
          const demoOut = process.env.SA_SMOKE_FXDEMO_OUT
            ? path.resolve(process.env.SA_SMOKE_FXDEMO_OUT)
            : path.join(__dirname, 'demo', `fx800-preview-${demoLabel}.png`);
          const demoDoc = JSON.parse(fs.readFileSync(demoFile, 'utf8'));
          win.setContentSize(1280, 900);
          win.setOpacity(1);
          win.show();
          await primeStudio(win, {}, 'ja');
          const sheet = await win.webContents.executeJavaScript(`(async () => {
            const until = async (test, timeout) => {
              const started = Date.now();
              while (Date.now() - started < (timeout || 20000)) {
                const value = test();
                if (value) return value;
                await new Promise((resolve) => setTimeout(resolve, 100));
              }
              return null;
            };
            const ready = await until(() => window.SA.store && window.SA.store.state.project, 20000);
            if (!ready) return JSON.stringify({ error: 'not-ready' });
            window.SA.store.load(${JSON.stringify(demoDoc)});
            const previousScale = window.SA.preview.getScaleMode();
            window.SA.preview.setScale('${demoScale}');
            await window.SA.preview.ensureFonts();
            await new Promise((resolve) => setTimeout(resolve, 800));
            const cues = window.SA.store.state.project.script.cues;
            const from = ${demoFrom - 1};
            const frames = [];
            for (let i = 0; i < ${demoCount} && from + i < cues.length; i += 1) {
              const cue = cues[from + i];
              // hold phase: the enter has finished and the exit has not started
              const mid = Math.max(cue.start, cue.end - 0.7);
              window.SA.store.setSelection(['cue:' + cue.id], 'cue');
              window.SA.preview.seek(mid);
              const capture = window.SA.preview.captureRGBA(mid);
              if (!capture) return JSON.stringify({ error: 'no-capture', n: ${demoLabel} + i });
              frames.push({ n: ${demoLabel} + i, capture });
              await new Promise((resolve) => setTimeout(resolve, 60));
            }
            if (!frames.length) return JSON.stringify({ error: 'no-frames' });
            window.SA.preview.setScale(previousScale);
            const width = frames[0].capture.width;
            const height = frames[0].capture.height;
            const tile = Math.round(${demoTile});
            const columns = Math.min(${demoColumns}, frames.length);
            const rows = Math.ceil(frames.length / columns);
            const tileWidth = tile;
            const tileHeight = Math.round((tile * height) / width);
            const source = document.createElement('canvas');
            source.width = width;
            source.height = height;
            const sourceCtx = source.getContext('2d');
            const canvas = document.createElement('canvas');
            canvas.width = tileWidth * columns;
            canvas.height = tileHeight * rows;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            for (let i = 0; i < frames.length; i += 1) {
              const frame = frames[i];
              const x = (i % columns) * tileWidth;
              const y = Math.floor(i / columns) * tileHeight;
              sourceCtx.putImageData(new ImageData(new Uint8ClampedArray(frame.capture.data), width, height), 0, 0);
              ctx.drawImage(source, 0, 0, width, height, x, y, tileWidth, tileHeight);
              ctx.fillStyle = 'rgba(0, 0, 0, 0.62)';
              ctx.fillRect(x + 6, y + 6, 72, 26);
              ctx.fillStyle = '#ffffff';
              ctx.font = 'bold 16px sans-serif';
              ctx.fillText('No.' + frame.n, x + 10, y + 24);
            }
            return JSON.stringify({
              status: 'ok',
              frames: frames.length,
              width: canvas.width,
              height: canvas.height,
              glError: window.SA.preview.debugError(),
              data: canvas.toDataURL('image/png'),
            });
          })()`);
          const report = typeof sheet === 'string' ? JSON.parse(sheet) : sheet;
          if (report && report.status === 'ok' && report.data) {
            const base64 = String(report.data).replace(/^data:image\/png;base64,/, '');
            fs.mkdirSync(path.dirname(demoOut), { recursive: true });
            fs.writeFileSync(demoOut, Buffer.from(base64, 'base64'));
            console.log(`SMOKE_FXDEMO=${demoOut} frames=${report.frames} size=${report.width}x${report.height} glError=${report.glError} bytes=${fs.statSync(demoOut).size}`);
          } else {
            console.log(`SMOKE_FXDEMO_FAILED=${sheet}`);
          }
        }

        if (process.env.SA_SMOKE_QUALITY) {
          // Preview quality regression: the same cue rendered at full / half /
          // quarter must show the same picture. The reduced frames are compared
          // with a downscaled copy of the full frame (a mismatch is what the
          // old bug produced: output-size text drawn into a smaller frame).
          win.setOpacity(0);
          win.showInactive();
          await primeStudio(win, {}, 'ja');
          const quality = await win.webContents.executeJavaScript(`(async () => {
            const until = async (test, timeout) => {
              const started = Date.now();
              while (Date.now() - started < (timeout || 20000)) {
                const value = test();
                if (value) return value;
                await new Promise((resolve) => setTimeout(resolve, 100));
              }
              return null;
            };
            const ready = await until(() => window.SA.store && window.SA.store.state.project, 20000);
            if (!ready) return JSON.stringify({ error: 'not-ready' });
            const doc = window.SA.store.state.project;
            const cue = doc.script.cues[0];
            if (!cue) return JSON.stringify({ error: 'no-cue' });
            await window.SA.preview.ensureFonts();
            await new Promise((resolve) => setTimeout(resolve, 600));
            const beats = doc.beats[cue.id] || [];
            const beat = beats[beats.length - 1] || null;
            const time = beat ? Math.max(beat.start, beat.end - 0.6) : cue.start + (cue.end - cue.start) * 0.75;
            const previousScale = window.SA.preview.getScaleMode();
            const captures = {};
            for (const mode of ['full', 'half', 'quarter']) {
              window.SA.preview.setScale(mode);
              await new Promise((resolve) => setTimeout(resolve, 250));
              const capture = window.SA.preview.captureRGBA(time);
              if (!capture) return JSON.stringify({ error: 'no-capture', mode });
              captures[mode] = capture;
            }
            window.SA.preview.setScale(previousScale);
            const full = captures.full;
            const source = document.createElement('canvas');
            source.width = full.width;
            source.height = full.height;
            const sourceCtx = source.getContext('2d');
            const image = sourceCtx.createImageData(full.width, full.height);
            image.data.set(full.data);
            sourceCtx.putImageData(image, 0, 0);
            const stats = {};
            let ok = true;
            for (const mode of ['half', 'quarter']) {
              const capture = captures[mode];
              const down = document.createElement('canvas');
              down.width = capture.width;
              down.height = capture.height;
              const downCtx = down.getContext('2d');
              downCtx.imageSmoothingEnabled = true;
              downCtx.imageSmoothingQuality = 'high';
              downCtx.drawImage(source, 0, 0, capture.width, capture.height);
              const expected = downCtx.getImageData(0, 0, capture.width, capture.height).data;
              const actual = capture.data;
              let inkExpected = 0;
              let inkActual = 0;
              let mismatch = 0;
              let sum = 0;
              const pixels = capture.width * capture.height;
              for (let i = 0; i < expected.length; i += 4) {
                const la = (expected[i] + expected[i + 1] + expected[i + 2]) / 3;
                const lb = (actual[i] + actual[i + 1] + actual[i + 2]) / 3;
                if (la > 40) inkExpected += 1;
                if (lb > 40) inkActual += 1;
                const delta = Math.abs(la - lb);
                sum += delta;
                if (delta > 32) mismatch += 1;
              }
              const inkDelta = Math.abs(inkExpected - inkActual) / Math.max(1, pixels);
              const mismatchRatio = mismatch / Math.max(1, pixels);
              const mean = sum / Math.max(1, pixels);
              const pass = mismatchRatio < 0.02 && inkDelta < 0.01;
              if (!pass) ok = false;
              stats[mode] = {
                size: [capture.width, capture.height],
                inkFull: inkExpected,
                ink: inkActual,
                inkDelta: Number(inkDelta.toFixed(4)),
                mismatch: Number(mismatchRatio.toFixed(4)),
                mean: Number(mean.toFixed(2)),
                pass,
              };
            }
            return JSON.stringify({ ok, time, stats, glError: window.SA.preview.debugError() });
          })()`);
          console.log('SMOKE_QUALITY=' + quality);
        }

        if (process.env.SA_SMOKE_LYRICS) {
          win.setOpacity(0);
          win.showInactive();
          await new Promise((resolve) => setTimeout(resolve, 400));
          await primeStudio(win, {}, 'ja');
          const lyrics = await win.webContents.executeJavaScript(`(async () => {
            const until = async (test, timeout) => {
              const started = Date.now();
              while (Date.now() - started < (timeout || 20000)) {
                const value = test();
                if (value) return value;
                await new Promise((resolve) => setTimeout(resolve, 100));
              }
              return null;
            };
            const ready = await until(() => window.SA.store.state.project && window.SA.store.state.project.script && window.SA.store.state.project.script.cues.length);
            if (!ready) return JSON.stringify({ error: 'project-not-ready' });
            const doc = JSON.parse(JSON.stringify(window.SA.store.state.project));
            doc.script.cues = [{ id: 'smoke_cue', start: 0, end: 30, text: 'O 8 A あ 愛', spans: [], fx: {}, meta: { kind: 'custom' } }];
            window.SA.store.load(doc);
            const fonts = await window.SA.lyricsFont.ensure('O 8 A あ 愛', 'NotoSans-Regular');
            await until(() => document.getElementById('preview-status').hidden, 20000);
            await new Promise((resolve) => setTimeout(resolve, 250));
            const capture = window.SA.preview.captureRGBA(5);
            if (!capture) return JSON.stringify({ error: 'no-capture' });
            const project = window.SA.store.state.project;
            const beat = window.SA.lyricsEngine.beatForCue(project.script.cues[0]);
            const scene = window.SA.lyricsScene.buildScene(project, beat, fonts);
            // capture.frame letters are already in capture pixels (the scene is
            // built at the render scale), so sample them 1:1
            const factor = 1;
            const pixel = (x, y) => {
              const px = Math.max(0, Math.min(capture.width - 1, Math.round(x * factor)));
              const py = Math.max(0, Math.min(capture.height - 1, Math.round(y * factor)));
              const index = (py * capture.width + px) * 4;
              return [capture.data[index], capture.data[index + 1], capture.data[index + 2]];
            };
            const lum = (rgb) => (rgb[0] + rgb[1] + rgb[2]) / 3;
            const frameLetters = [];
            for (const cueEntry of (capture.frame && capture.frame.cues) || []) {
              for (const item of cueEntry.letters) frameLetters.push(item);
            }
            const letterO = frameLetters.find((entry) => entry.char === 'O');
            const letterAi = frameLetters.find((entry) => entry.char === '愛');
            const holeCenter = pixel(letterO.center.x, letterO.center.y);
            const stroke = pixel(letterO.bbox.x + letterO.bbox.w * 0.12, letterO.center.y);
            const aiPixels = [];
            for (let i = 0; i < 5; i += 1) aiPixels.push(pixel(letterAi.bbox.x + letterAi.bbox.w * (0.1 + i * 0.2), letterAi.bbox.y + letterAi.bbox.h * 0.5));
            const debug = {
              oCenter: letterO.center,
              oBox: letterO.bbox,
              dataKind: Object.prototype.toString.call(capture.data),
              dataLength: capture.data.length,
              sample: [capture.data[0], capture.data[1], capture.data[2], capture.data[3]],
            };
            const canvas = document.createElement('canvas');
            canvas.width = capture.width;
            canvas.height = capture.height;
            const ctx = canvas.getContext('2d');
            const image = ctx.createImageData(capture.width, capture.height);
            image.data.set(capture.data);
            ctx.putImageData(image, 0, 0);
            let glyphsMissing = 0;
            for (const entry of scene.letters) if (entry.src !== 'font') glyphsMissing += 1;
            return JSON.stringify({
              webgl: window.SA.preview.isWebGL2(),
              glError: window.SA.preview.debugError(),
              letters: scene.letters.map((entry) => entry.char).join(''),
              glyphsMissing,
              holeCenter: lum(holeCenter),
              stroke: lum(stroke),
              aiInk: aiPixels.map(lum),
              capture: [capture.width, capture.height],
              debug,
              png: canvas.toDataURL('image/png'),
            });
          })()`);
          const parsedLyrics = JSON.parse(lyrics);
          if (parsedLyrics.png) {
            const png = Buffer.from(parsedLyrics.png.split(',')[1], 'base64');
            const target = path.join(app.getPath('temp'), 'suno-lyrics-smoke.png');
            fs.writeFileSync(target, png);
            delete parsedLyrics.png;
            console.log(`SMOKE_LYRICS_PNG=${target} bytes=${png.length}`);
          }
          console.log('SMOKE_LYRICS=' + JSON.stringify(parsedLyrics));
          const sync = await win.webContents.executeJavaScript(`(async () => {
            const sampleRate = 48000;
            const seconds = 4;
            const samples = sampleRate * seconds;
            const buffer = new ArrayBuffer(44 + samples * 2);
            const view = new DataView(buffer);
            const writeText = (offset, text) => {
              for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
            };
            writeText(0, 'RIFF');
            view.setUint32(4, 36 + samples * 2, true);
            writeText(8, 'WAVE');
            writeText(12, 'fmt ');
            view.setUint32(16, 16, true);
            view.setUint16(20, 1, true);
            view.setUint16(22, 1, true);
            view.setUint32(24, sampleRate, true);
            view.setUint32(28, sampleRate * 2, true);
            view.setUint16(32, 2, true);
            view.setUint16(34, 16, true);
            writeText(36, 'data');
            view.setUint32(40, samples * 2, true);
            for (let i = 0; i < samples; i += 1) {
              view.setInt16(44 + i * 2, Math.sin((i / sampleRate) * 2 * Math.PI * 440) * 8000, true);
            }
            const blob = new Blob([buffer], { type: 'audio/wav' });
            window.SA.preview.setAudioSource(URL.createObjectURL(blob), 'smoke.wav');
            window.SA.preview.seek(0);
            window.SA.preview.play();
            await new Promise((resolve) => setTimeout(resolve, 900));
            const state = {
              hasAudio: window.SA.preview.hasAudio(),
              audioPlaying: window.SA.preview.isAudioPlaying(),
              audioTime: window.SA.preview.getAudioTime(),
              playhead: window.SA.store.state.playhead,
            };
            window.SA.preview.pause();
            state.delta = Math.abs(state.audioTime - state.playhead);
            return JSON.stringify(state);
          })()`);
          console.log('SMOKE_LYRICS_SYNC=' + sync);
          await win.loadFile(path.join(__dirname, 'renderer', 'studio.html'), { query: { 'no-webgl2': '1' } });
          await new Promise((resolve) => setTimeout(resolve, 1600));
          const fallback = await win.webContents.executeJavaScript(`JSON.stringify({
            href: window.location.href,
            webgl: window.SA.preview.isWebGL2(),
            warnHidden: document.getElementById('preview-warn').hidden,
            warnText: document.getElementById('preview-warn').textContent,
          })`);
          console.log('SMOKE_LYRICS_FALLBACK=' + fallback);
        }

        if (process.env.SA_SMOKE_BEATS) {
          win.setOpacity(0);
          win.showInactive();
          await new Promise((resolve) => setTimeout(resolve, 400));
          await primeStudio(win, {}, 'ja');
          const beatsReport = await win.webContents.executeJavaScript(`(async () => {
            const until = async (test, timeout) => {
              const started = Date.now();
              while (Date.now() - started < (timeout || 20000)) {
                const value = test();
                if (value) return value;
                await new Promise((resolve) => setTimeout(resolve, 100));
              }
              return null;
            };
            const ready = await until(() => window.SA.store.state.project && window.SA.store.state.project.script && window.SA.store.state.project.script.cues.length);
            if (!ready) return JSON.stringify({ error: 'project-not-ready' });
            const en = 'A journey of a thousand miles begins with a single step but every step is a story worth telling to someone.';
            const ja = '今日はとても良い天気なので、公園へ行って、写真を撮りました。明日も晴れるといいですね。それではまた会いましょう。';
            const doc = JSON.parse(JSON.stringify(window.SA.store.state.project));
            doc.script.cues = [
              { id: 'en1', start: 0, end: 12, text: en, meta: { kind: 'custom' } },
              { id: 'ja1', start: 12.5, end: 28, text: ja, meta: { kind: 'custom' } },
              { id: 'fast1', start: 28.5, end: 31, text: en, meta: { kind: 'custom' } },
              { id: 'rep1', start: 31.5, end: 61.5, text: 'Hello world', meta: { kind: 'custom' }, textFlow: { longHold: { mode: 'repeat', threshold: 6, interval: 4 } } },
              { id: 'rec1', start: 62, end: 82, text: en, meta: { kind: 'custom' }, textFlow: { recap: { mode: 'end', minPages: 2 } } },
            ];
            doc.textFlow = {};
            window.SA.store.load(doc);
            await window.SA.preview.ensureFonts();
            await new Promise((resolve) => setTimeout(resolve, 400));
            const project = window.SA.store.state.project;
            window.SA.textflow.apply(project);
            window.SA.store.touch(['script']);
            await new Promise((resolve) => setTimeout(resolve, 150));
            const beats = project.beats;
            const enPages = beats.en1.filter((beat) => beat.kind === 'page').length;
            const jaBeats = beats.ja1.filter((beat) => beat.kind === 'page' || beat.kind === 'single');
            const repeats = beats.rep1.filter((beat) => beat.kind === 'repeat').length;
            const recaps = beats.rec1.filter((beat) => beat.kind === 'recap').length;
            const tooFast = ((project.beatWarnings.fast1) || []).length > 0;
            const repBeat = beats.rep1.find((beat) => beat.kind === 'repeat');
            const recBeat = beats.rec1.find((beat) => beat.kind === 'recap');
            const captureAt = (time) => {
              const capture = window.SA.preview.captureRGBA(time);
              if (!capture) return null;
              return { ids: capture.frame.cues.map((cue) => cue.beatId), width: capture.width, height: capture.height, data: capture.data };
            };
            const atRepeat = captureAt((repBeat.start + repBeat.end) / 2);
            const atRecap = captureAt((recBeat.start + recBeat.end) / 2);
            const png = (capture) => {
              const canvas = document.createElement('canvas');
              canvas.width = capture.width;
              canvas.height = capture.height;
              const ctx = canvas.getContext('2d');
              const image = ctx.createImageData(capture.width, capture.height);
              image.data.set(capture.data);
              ctx.putImageData(image, 0, 0);
              return canvas.toDataURL('image/png');
            };
            const recapPng = png(atRecap);

            // Beat editing: move an edge, pin, restructure and check that it survives.
            const firstBeat = beats.en1[0];
            const movedEnd = Math.min(firstBeat.end + 1, project.script.cues[0].end - 0.3);
            window.SA.store.commands.moveBeatEdge('en1', firstBeat.id, 'end', movedEnd, { coalesceKey: 'smoke-edge' });
            const pinnedBeat = window.SA.store.state.project.beats.en1.find((beat) => beat.id === firstBeat.id);
            const moved = pinnedBeat ? pinnedBeat.pinned && Math.abs(pinnedBeat.end - movedEnd) < 1e-6 : false;
            window.SA.store.commands.restructureCue('en1');
            const afterRestructure = window.SA.store.state.project.beats.en1.find((beat) => beat.id === firstBeat.id);
            const survived = !!(afterRestructure && afterRestructure.pinned && Math.abs(afterRestructure.end - movedEnd) < 1e-6);
            window.SA.store.undo();

            // Split and merge a Japanese page beat.
            const beforeSplit = window.SA.store.state.project.beats.ja1.length;
            const target = window.SA.store.state.project.beats.ja1[0];
            window.SA.store.commands.splitBeat('ja1', target.id, (target.start + target.end) / 2);
            const afterSplit = window.SA.store.state.project.beats.ja1.length;
            const mergedTarget = window.SA.store.state.project.beats.ja1.find((beat) => beat.id === target.id);
            window.SA.store.commands.mergeBeats('ja1', mergedTarget ? mergedTarget.id : target.id);
            const afterMerge = window.SA.store.state.project.beats.ja1.length;
            window.SA.store.undo();
            const afterUndo = window.SA.store.state.project.beats.ja1.length;

            return JSON.stringify({
              enPages,
              jaBeats: jaBeats.length,
              jaKinds: jaBeats.map((beat) => beat.kind),
              repeats,
              recaps,
              tooFast,
              atRepeat: atRepeat ? atRepeat.ids : null,
              atRecap: atRecap ? atRecap.ids : null,
              moved,
              survived,
              split: { before: beforeSplit, after: afterSplit, merged: afterMerge, undone: afterUndo },
              png: recapPng,
            });
          })()`);
          const parsedBeats = JSON.parse(beatsReport);
          if (parsedBeats.png) {
            const png = Buffer.from(parsedBeats.png.split(',')[1], 'base64');
            const target = path.join(app.getPath('temp'), 'suno-beats-smoke.png');
            fs.writeFileSync(target, png);
            delete parsedBeats.png;
            console.log(`SMOKE_BEATS_PNG=${target} bytes=${png.length}`);
          }
          console.log('SMOKE_BEATS=' + JSON.stringify(parsedBeats));
          const beat = await win.webContents.executeJavaScript(`(() => {
            const path = window.SA.store.state.project.beats.en1[0].id;
            window.SA.store.setSelection(['cue:en1/beat:' + path], 'beat');
            window.SA.preview.seek(window.SA.store.state.project.beats.en1[0].start + 0.5);
            return JSON.stringify({ selected: window.SA.store.state.selection.paths[0].slice(0, 24), zoom: window.SA.timeline.getZoom() });
          })()`);
          console.log('SMOKE_BEATS_UI=' + beat);
          await new Promise((resolve) => setTimeout(resolve, 400));
          const shot = await win.capturePage();
          const shotPath = path.join(app.getPath('temp'), 'suno-studio-smoke.png');
          fs.writeFileSync(shotPath, shot.toPNG());
          console.log(`SMOKE_BEATS_UI_PNG=${shotPath} bytes=${shot.toPNG().length}`);
        }

        if (process.env.SA_SMOKE_MOTION) {
          win.setOpacity(0);
          win.showInactive();
          await new Promise((resolve) => setTimeout(resolve, 400));
          await primeStudio(win, { motion: '1' }, 'ja');
          const motionReport = await win.webContents.executeJavaScript(`(async () => {
            const until = async (test, timeout) => {
              const started = Date.now();
              while (Date.now() - started < (timeout || 20000)) {
                const value = test();
                if (value) return value;
                await new Promise((resolve) => setTimeout(resolve, 100));
              }
              return null;
            };
            const ready = await until(() => window.SA.store.state.project && window.SA.store.state.project.script && window.SA.store.state.project.script.cues.length);
            if (!ready) return JSON.stringify({ error: 'project-not-ready' });
            const CUE = 5;
            const styles = {
              m_circle: { layout: { type: 'circle', params: { radius: 0.3 } }, enter: { type: 'elasticPop', motion: { in: { duration: 1.2 } } }, exit: { type: 'zoomOut' } },
              m_vertical: { layout: { type: 'vertical' }, enter: { type: 'typewriter', motion: { in: { duration: 1 } } }, exit: { type: 'typewriterReverse' } },
              m_wave: { layout: { type: 'wave', params: { amp: 0.12 } }, enter: { type: 'slide', params: { dir: 'up' } }, exit: { type: 'slide', params: { dir: 'down' } } },
              m_spiral: { layout: { type: 'spiral' }, enter: { type: 'scatterIn' }, exit: { type: 'explode' } },
              m_grid: { layout: { type: 'grid' }, enter: { type: 'dropBounce' }, exit: { type: 'shrinkToCenter' } },
              m_stacked: { layout: { type: 'stackedWords' }, enter: { type: 'zoomIn' }, exit: { type: 'gravityFall' } },
              m_scatter: { layout: { type: 'scatter' }, enter: { type: 'particlesAssemble' }, exit: { type: 'particlesDisperse' } },
              m_path: { layout: { type: 'path', params: { points: [{ x: 0.1, y: 0.7 }, { x: 0.5, y: 0.3 }, { x: 0.9, y: 0.6 }] } }, enter: { type: 'flip3D' }, exit: { type: 'melt' } },
              m_bob: { layout: { type: 'row' }, hold: [{ type: 'floatBob', params: { amp: 0.05, speed: 1 } }, { type: 'breathing', params: { amount: 0.05 } }], enter: { type: 'neonFlicker' }, exit: { type: 'dissolve' } },
            };
            const texts = {
              m_circle: 'Achievement unlocked',
              m_vertical: '縦書きのテスト',
              m_wave: 'A wave of letters',
              m_spiral: 'Spiral out',
              m_grid: 'Grid layout',
              m_stacked: 'Stacked words line',
              m_scatter: 'Scattered around',
              m_path: 'Follow the path',
              m_bob: 'Floating quietly',
            };
            const doc = JSON.parse(JSON.stringify(window.SA.store.state.project));
            doc.script.cues = Object.keys(styles).map((id, index) => ({
              id,
              start: index * CUE,
              end: index * CUE + CUE - 0.2,
              text: texts[id],
              meta: { kind: 'custom' },
            }));
            doc.cueStyles = JSON.parse(JSON.stringify(styles));
            doc.textFlow = {};
            window.SA.store.load(doc);
            await window.SA.preview.ensureFonts();
            await new Promise((resolve) => setTimeout(resolve, 400));
            window.SA.textflow.apply(window.SA.store.state.project);
            window.SA.store.touch(['script']);
            await new Promise((resolve) => setTimeout(resolve, 200));
            const lum = (data, index) => (data[index] + data[index + 1] + data[index + 2]) / 3;
            const report = [];
            const pngs = {};
            for (let index = 0; index < Object.keys(styles).length; index += 1) {
              const id = Object.keys(styles)[index];
              const time = index * CUE + CUE * 0.55;
              const capture = window.SA.preview.captureRGBA(time);
              if (!capture) {
                report.push({ id, error: 'no-capture' });
                continue;
              }
              const letters = [];
              for (const cue of capture.frame.cues) for (const letter of cue.letters) letters.push(letter);
              let finite = letters.length > 0;
              for (const letter of letters) {
                if (!Number.isFinite(letter.center.x) || !Number.isFinite(letter.center.y)) finite = false;
                for (const value of letter.quad) if (!Number.isFinite(value)) finite = false;
              }
              let ink = 0;
              for (let i = 0; i < capture.data.length; i += 4 * 32) {
                if (lum(capture.data, i) > 90) ink += 1;
              }
              const center = letters.length
                ? letters.reduce((acc, letter) => ({ x: acc.x + letter.center.x / letters.length, y: acc.y + letter.center.y / letters.length }), { x: 0, y: 0 })
                : null;
              let radiusSpread = 0;
              if (id === 'm_circle' && center) {
                const distances = letters.map((letter) => Math.hypot(letter.center.x - center.x, letter.center.y - center.y));
                radiusSpread = Math.max(...distances) - Math.min(...distances);
              }
              report.push({ id, letters: letters.length, finite, ink, radiusSpread: Math.round(radiusSpread * 100) / 100 });
              if (id === 'm_circle' || id === 'm_path' || id === 'm_vertical') {
                const canvas = document.createElement('canvas');
                canvas.width = capture.width;
                canvas.height = capture.height;
                const ctx = canvas.getContext('2d');
                const image = ctx.createImageData(capture.width, capture.height);
                image.data.set(capture.data);
                ctx.putImageData(image, 0, 0);
                pngs[id] = canvas.toDataURL('image/png');
              }
            }
            const glError = window.SA.preview.debugError();
            return JSON.stringify({ glError, report, pngs });
          })()`);
          const parsedMotion = JSON.parse(motionReport);
          if (parsedMotion.pngs) {
            for (const [id, dataUrl] of Object.entries(parsedMotion.pngs)) {
              const png = Buffer.from(dataUrl.split(',')[1], 'base64');
              const target = path.join(app.getPath('temp'), `suno-motion-${id}.png`);
              fs.writeFileSync(target, png);
              console.log(`SMOKE_MOTION_PNG=${target} id=${id} bytes=${png.length}`);
            }
            delete parsedMotion.pngs;
          }
          console.log('SMOKE_MOTION=' + JSON.stringify(parsedMotion));
        }

        if (process.env.SA_SMOKE_FONT) {
          win.setOpacity(0);
          win.showInactive();
          await new Promise((resolve) => setTimeout(resolve, 400));
          await primeStudio(win, { font: '1' }, 'ja');
          const fontReport = await win.webContents.executeJavaScript(`(async () => {
            const until = async (test, timeout) => {
              const started = Date.now();
              while (Date.now() - started < (timeout || 20000)) {
                const value = test();
                if (value) return value;
                await new Promise((resolve) => setTimeout(resolve, 100));
              }
              return null;
            };
            const ready = await until(() => window.SA.store.state.project && window.SA.store.state.project.script && window.SA.store.state.project.script.cues.length);
            if (!ready) return JSON.stringify({ error: 'project-not-ready' });
            const CUE = 6;
            // simultaneous timing keeps every letter at the same block scale
            const styles = {
              f_size: {
                animation: { type: 'simultaneous' },
                hold: [{ type: 'fontSize', params: { from: 1, to: 2.8, period: 2, mode: 'pulse', ease: 'linear', sync: 'free' }, motion: { in: { duration: 0.4 }, out: { duration: 0.4 } } }],
              },
              f_fill: {
                animation: { type: 'simultaneous' },
                hold: [{ type: 'fillScreen', params: { fill: 0.92, max: 20, period: 2.4, mode: 'pulse', ease: 'linear', sync: 'free' }, motion: { in: { duration: 0.4 }, out: { duration: 0.4 } } }],
              },
              f_enter: {
                animation: { type: 'simultaneous' },
                enter: { type: 'megaZoomIn', params: { from: 10, fade: false }, motion: { in: { duration: 1.4, ease: 'linear' } } },
              },
              f_deform: {
                animation: { type: 'simultaneous' },
                hold: [
                  { type: 'squashStretch', params: { amount: 0.5, speed: 0.8, phase: 0.5 } },
                  { type: 'swirl', params: { angle: 60, freq: 1, speed: 0.7 } },
                ],
              },
            };
            const texts = {
              f_size: 'Size pulse test',
              f_fill: 'Fill the frame',
              f_enter: 'Mega zoom in',
              f_deform: 'Squash and swirl',
            };
            const doc = JSON.parse(JSON.stringify(window.SA.store.state.project));
            doc.script.cues = Object.keys(styles).map((id, index) => ({
              id,
              start: index * CUE,
              end: index * CUE + CUE - 0.2,
              text: texts[id],
              meta: { kind: 'custom' },
            }));
            doc.cueStyles = JSON.parse(JSON.stringify(styles));
            doc.textFlow = {};
            window.SA.store.load(doc);
            await window.SA.preview.ensureFonts();
            await new Promise((resolve) => setTimeout(resolve, 400));
            window.SA.textflow.apply(window.SA.store.state.project);
            window.SA.store.touch(['script']);
            await new Promise((resolve) => setTimeout(resolve, 200));

            const bounds = (capture) => {
              let minX = capture.width;
              let minY = capture.height;
              let maxX = -1;
              let maxY = -1;
              let ink = 0;
              for (let y = 0; y < capture.height; y += 2) {
                for (let x = 0; x < capture.width; x += 2) {
                  const i = (y * capture.width + x) * 4;
                  const lum = (capture.data[i] + capture.data[i + 1] + capture.data[i + 2]) / 3;
                  if (lum <= 80) continue;
                  ink += 1;
                  if (x < minX) minX = x;
                  if (y < minY) minY = y;
                  if (x > maxX) maxX = x;
                  if (y > maxY) maxY = y;
                }
              }
              if (maxX < 0) return { ink: 0, w: 0, h: 0 };
              return { ink, w: maxX - minX, h: maxY - minY };
            };
            const indexOf = (id) => Object.keys(styles).indexOf(id);
            const at = (id, t) => indexOf(id) * CUE + t;
            const shot = (id, t) => {
              const capture = window.SA.preview.captureRGBA(at(id, t));
              if (!capture) return { id, t, error: 'no-capture' };
              const box = bounds(capture);
              return { id, t, ink: box.ink, w: box.w, h: box.h, ratio: Math.round((box.w / capture.width) * 100) / 100 };
            };
            const report = {
              sizeTrough: shot('f_size', 0.5),
              sizePeak: shot('f_size', 1.5),
              fillTrough: shot('f_fill', 2.9),
              fillPeak: shot('f_fill', 1.7),
              enterEarly: shot('f_enter', 0.1),
              enterSettled: shot('f_enter', 1.8),
              deform: shot('f_deform', 2.5),
            };
            report.sizeOk = report.sizePeak.w > report.sizeTrough.w * 1.5;
            report.fillOk = report.fillPeak.w > report.fillTrough.w * 1.5;
            report.enterOk = report.enterEarly.w >= report.enterSettled.w * 1.5;
            report.deformOk = report.deform.ink > 0 && report.deform.w > 0;
            report.glError = window.SA.preview.debugError();
            return JSON.stringify(report);
          })()`);
          console.log('SMOKE_FONT=' + fontReport);
        }

        if (process.env.SA_SMOKE_AESTAGE) {
          win.setOpacity(0);
          win.showInactive();
          await new Promise((resolve) => setTimeout(resolve, 400));
          await primeStudio(win, { aestage: '1' }, 'ja');
          const stageReport = await win.webContents.executeJavaScript(`(async () => {
            const until = async (test, timeout) => {
              const started = Date.now();
              while (Date.now() - started < (timeout || 20000)) {
                const value = test();
                if (value) return value;
                await new Promise((resolve) => setTimeout(resolve, 100));
              }
              return null;
            };
            const ready = await until(() => window.SA.store.state.project && window.SA.store.state.project.script && window.SA.store.state.project.script.cues.length);
            if (!ready) return JSON.stringify({ error: 'project-not-ready' });
            const IDS = ['trackingTitle', 'karaokeSweep', 'waveThrough', 'impactBurst', 'frameDraw', 'bracketCallout', 'randomFlicker', 'beatStrike'];
            const looks = IDS.map((id) => window.SA.presets.get(id)).filter(Boolean);
            const missing = IDS.filter((id) => !window.SA.presets.get(id));
            const CUE = 4;
            const doc = JSON.parse(JSON.stringify(window.SA.store.state.project));
            doc.script.cues = looks.map((look, index) => ({ id: look.id, start: index * CUE, end: index * CUE + CUE - 0.2, text: look.name, meta: { kind: 'custom', presetId: look.id } }));
            doc.cueStyles = {};
            doc.clips = (doc.clips || []).filter((clip) => clip.trackId !== 'bg');
            doc.textFlow = {};
            for (const look of looks) {
              doc.cueStyles[look.id] = JSON.parse(JSON.stringify(look.style));
              const background = look.style.background;
              const cue = doc.script.cues.find((entry) => entry.id === look.id);
              if (background && background.type && background.type !== 'none') {
                doc.clips.push({ id: 'bg_' + look.id, trackId: 'bg', start: cue.start, end: cue.end, spec: { type: background.type, params: JSON.parse(JSON.stringify(background.params || {})) }, opacity: 1, fadeIn: 0.2, fadeOut: 0.2, colors: null });
              }
            }
            window.SA.store.load(doc);
            await window.SA.preview.ensureFonts();
            await new Promise((resolve) => setTimeout(resolve, 500));
            window.SA.textflow.apply(window.SA.store.state.project);
            window.SA.store.touch(['script']);
            await new Promise((resolve) => setTimeout(resolve, 300));

            const capture = (id, t) => window.SA.preview.captureRGBA(id === null ? t : window.SA.store.state.project.script.cues.find((cue) => cue.id === id).start + t);
            const stats = (shot) => {
              let minX = shot.width;
              let minY = shot.height;
              let maxX = -1;
              let maxY = -1;
              let ink = 0;
              let left = 0;
              let right = 0;
              let leftTint = 0;
              let rightTint = 0;
              for (let y = 0; y < shot.height; y += 2) {
                for (let x = 0; x < shot.width; x += 2) {
                  const i = (y * shot.width + x) * 4;
                  const r = shot.data[i];
                  const g = shot.data[i + 1];
                  const b = shot.data[i + 2];
                  const lum = (r + g + b) / 3;
                  if (lum <= 80) continue;
                  ink += 1;
                  if (x < minX) minX = x;
                  if (y < minY) minY = y;
                  if (x > maxX) maxX = x;
                  if (y > maxY) maxY = y;
                  // the accent highlight is pink, the base text is white
                  const tint = r - b;
                  if (x < shot.width / 2) { left += 1; leftTint += tint; }
                  else { right += 1; rightTint += tint; }
                }
              }
              return {
                ink,
                w: maxX < 0 ? 0 : maxX - minX,
                h: maxY < 0 ? 0 : maxY - minY,
                tint: (left ? leftTint / left : 0) - (right ? rightTint / right : 0),
              };
            };
            const shotOf = (id, t) => {
              const shot = capture(id, t);
              return shot ? stats(shot) : { ink: 0, w: 0, h: 0, tint: 0 };
            };

            const report = { missing, looks: [] };
            const tiles = [];
            for (const look of looks) {
              const entry = { id: look.id, enter: shotOf(look.id, 0.25), hold: shotOf(look.id, 1.8), exit: shotOf(look.id, CUE - 0.5) };
              // the shape layer is isolated by rendering the same look with and
              // without its shape posts at two moments
              const shapePosts = (look.style.post || []).filter((post) => post && post.type === 'shapeLayer');
              if (shapePosts.length) {
                const cue = window.SA.store.state.project.script.cues.find((item) => item.id === look.id);
                const withShape = JSON.parse(JSON.stringify(window.SA.store.state.project.cueStyles[look.id]));
                const without = JSON.parse(JSON.stringify(withShape));
                without.post = withShape.post.filter((post) => post.type !== 'shapeLayer');
                const at = (style, t) => {
                  window.SA.store.state.project.cueStyles[look.id] = style;
                  const shot = capture(look.id, t);
                  return shot ? shot : null;
                };
                const meanDiff = (a, b) => {
                  if (!a || !b) return 0;
                  let sum = 0;
                  let count = 0;
                  for (let i = 0; i < a.data.length; i += 16) {
                    sum += Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
                    count += 3;
                  }
                  return count ? sum / count : 0;
                };
                const early = meanDiff(at(withShape, 0.2), at(without, 0.2));
                const late = meanDiff(at(withShape, 1.8), at(without, 1.8));
                window.SA.store.state.project.cueStyles[look.id] = withShape;
                entry.shape = { early: Math.round(early * 100) / 100, late: Math.round(late * 100) / 100, posts: shapePosts.length };
                // the shape must paint; the trim's growth is asserted exactly in
                // scripts/test/shape-layer.test.js (per drive)
                entry.shapeOk = late > 0.05;
              }
              if (look.id === 'karaokeSweep') {
                const a = shotOf(look.id, 0.6);
                const b = shotOf(look.id, 1.4);
                entry.sweep = { a: Math.round(a.tint), b: Math.round(b.tint) };
                entry.sweepOk = Math.abs(a.tint - b.tint) > 1.5 || Math.abs(a.ink - b.ink) > 40;
              }
              report.looks.push(entry);
              tiles.push({ capture: capture(look.id, 0.25) }, { capture: capture(look.id, 1.8) }, { capture: capture(look.id, CUE - 0.5) });
            }
            report.trackingOk = report.looks.every((entry) => entry.id !== 'trackingTitle' || entry.enter.w >= entry.hold.w * 0.99);
            report.drawOk = report.looks.every((entry) => entry.shapeOk !== false);
            report.glError = window.SA.preview.debugError();

            // contact sheet: 8 looks x 3 moments, tiles at half size
            const first = tiles.find((tile) => tile.capture);
            if (first) {
              const tileW = Math.floor(first.capture.width / 2);
              const tileH = Math.floor(first.capture.height / 2);
              const cols = 3;
              const canvas = document.createElement('canvas');
              canvas.width = tileW * cols;
              canvas.height = tileH * Math.ceil(tiles.length / cols);
              const c2d = canvas.getContext('2d');
              tiles.forEach((tile, index) => {
                if (!tile.capture) return;
                const off = document.createElement('canvas');
                off.width = tile.capture.width;
                off.height = tile.capture.height;
                off.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(tile.capture.data), tile.capture.width, tile.capture.height), 0, 0);
                c2d.drawImage(off, (index % cols) * tileW, Math.floor(index / cols) * tileH, tileW, tileH);
              });
              report.sheet = canvas.toDataURL('image/png');
            }
            return JSON.stringify(report);
          })()`);
          try {
            const parsed = JSON.parse(stageReport);
            if (parsed.sheet) {
              const png = Buffer.from(parsed.sheet.split(',')[1], 'base64');
              const sheetPath = path.join(__dirname, 'snapshot', 'aestage-sheet.png');
              fs.mkdirSync(path.dirname(sheetPath), { recursive: true });
              fs.writeFileSync(sheetPath, png);
              parsed.sheetPath = sheetPath;
              delete parsed.sheet;
              console.log(`SMOKE_AESTAGE_PNG=${sheetPath} bytes=${png.length}`);
            }
            console.log('SMOKE_AESTAGE=' + JSON.stringify(parsed));
          } catch (error) {
            console.log('SMOKE_AESTAGE=' + stageReport);
          }
        }

        if (process.env.SA_SMOKE_SHADERS) {
          win.setOpacity(0);
          win.showInactive();
          await new Promise((resolve) => setTimeout(resolve, 400));
          await primeStudio(win, { shaders: '1' }, 'ja');
          const shaderReport = await win.webContents.executeJavaScript(`(async () => {
            const until = async (test, timeout) => {
              const started = Date.now();
              while (Date.now() - started < (timeout || 20000)) {
                const value = test();
                if (value) return value;
                await new Promise((resolve) => setTimeout(resolve, 100));
              }
              return null;
            };
            const ready = await until(() => window.SA.store.state.project && window.SA.store.state.project.script && window.SA.store.state.project.script.cues.length);
            if (!ready) return JSON.stringify({ error: 'project-not-ready' });
            window.SA.store.commands.generateScript([
              { id: 's1', start: 0, end: 10, text: 'Shader coverage test', meta: { kind: 'custom' } },
              { id: 's2', start: 11, end: 21, text: 'Second line', meta: { kind: 'custom' } },
            ], {});
            await window.SA.preview.ensureFonts();
            await new Promise((resolve) => setTimeout(resolve, 400));
            const project = window.SA.store.state.project;
            const engine = window.SA.preview.engine();
            const base = {
              layout: { type: 'row' },
              enter: { type: 'fade', motion: { in: { duration: 0.05 } } },
              exit: { type: 'fade', motion: { out: { duration: 0.05 } } },
            };
            const render = (patch, time) => {
              project.cueStyles = { s2: { ...base, ...patch } };
              window.SA.store.touch(['script']);
              const capture = window.SA.preview.captureRGBA(time == null ? 16 : time);
              if (!capture) return { error: 'no-capture' };
              let ink = 0;
              for (let i = 0; i < capture.data.length; i += 4 * 16) {
                if (capture.data[i] + capture.data[i + 1] + capture.data[i + 2] > 200) ink += 1;
              }
              return { ink, glError: window.SA.preview.debugError() };
            };
            const results = { fill: [], edge: [], post: [], background: [], representation: [] };
            const pngs = {};
            const capturePng = (patch, time, id) => {
              project.cueStyles = { s2: { ...base, ...patch } };
              window.SA.store.touch(['script']);
              const capture = window.SA.preview.captureRGBA(time == null ? 16 : time);
              if (!capture) return;
              const canvas = document.createElement('canvas');
              canvas.width = capture.width;
              canvas.height = capture.height;
              const ctx = canvas.getContext('2d');
              const image = ctx.createImageData(capture.width, capture.height);
              image.data.set(capture.data);
              ctx.putImageData(image, 0, 0);
              pngs[id] = canvas.toDataURL('image/png');
            };
            for (const descriptor of window.SA.fx.list('fill')) results.fill.push({ type: descriptor.type, ...render({ fill: { type: descriptor.type, params: {} } }) });
            for (const descriptor of window.SA.fx.list('edge')) results.edge.push({ type: descriptor.type, ...render({ edge: [{ type: descriptor.type, params: {} }] }) });
            for (const descriptor of window.SA.fx.list('post')) results.post.push({ type: descriptor.type, ...render({ post: [{ type: descriptor.type, params: {} }] }) });
            for (const descriptor of window.SA.fx.list('background')) results.background.push({ type: descriptor.type, ...render({ background: { type: descriptor.type, params: {} } }) });
            for (const type of ['particlesAssemble', 'shatterRebuild', 'strokeDrawOn', 'morphFromPrevious']) {
              results.representation.push({ type, ...render({ enter: { type, motion: { in: { duration: 1 } } } }, 11.5) });
            }
            results.echo = render({ animation: { type: 'echo', params: { count: 4, offset: 0.08, opacity: 0.5 } } });
            results.clones = render({
              clones: [
                { id: 'c1', dx: 0.06, dy: 0.05, scale: 0.9, rotate: -4, opacity: 0.5, hue: 30, delay: 0, motion: { type: 'drift', amount: 0.01, speed: 1 } },
                { id: 'c2', dx: -0.06, dy: -0.04, scale: 0.8, rotate: 4, opacity: 0.35, hue: -40, delay: 0.1, motion: { type: 'orbit', amount: 0.01, speed: 0.8 } },
              ],
            });
            capturePng({ fill: { type: 'chrome', params: {} }, edge: [{ type: 'outline', params: {} }] }, 16, 'chrome');
            capturePng({ fill: { type: 'fire', params: {} }, edge: [{ type: 'neonGlow', params: { bloom: true } }] }, 16, 'fire');
            capturePng({ post: [{ type: 'glitchBlocks', params: {} }] }, 16, 'glitch');
            capturePng({ background: { type: 'card', params: {} }, fill: { type: 'solid', params: {} } }, 16, 'card');
            capturePng({ enter: { type: 'particlesAssemble', motion: { in: { duration: 1 } } } }, 11.5, 'particles');
            capturePng({ enter: { type: 'dropBounce', motion: { in: { duration: 1 } } } }, 11.5, 'bounce');
            const floatTargets = !!(engine && engine.context && engine.context.floatTargets);
            return JSON.stringify({ floatTargets, results, pngs });
          })()`);
          const parsedShaders = JSON.parse(shaderReport);
          if (parsedShaders.pngs) {
            for (const [id, dataUrl] of Object.entries(parsedShaders.pngs)) {
              const png = Buffer.from(dataUrl.split(',')[1], 'base64');
              const target = path.join(app.getPath('temp'), `suno-shader-${id}.png`);
              fs.writeFileSync(target, png);
              console.log(`SMOKE_SHADERS_PNG=${target} id=${id} bytes=${png.length}`);
            }
            delete parsedShaders.pngs;
          }
          console.log('SMOKE_SHADERS=' + JSON.stringify(parsedShaders));
        }

        if (process.env.SA_SMOKE_EDIT) {
          win.setOpacity(0);
          win.showInactive();
          await new Promise((resolve) => setTimeout(resolve, 400));
          await primeStudio(win, { edit: '1' }, 'ja');
          const editReport = await win.webContents.executeJavaScript(`(async () => {
            const until = async (test, timeout) => {
              const started = Date.now();
              while (Date.now() - started < (timeout || 20000)) {
                const value = test();
                if (value) return value;
                await new Promise((resolve) => setTimeout(resolve, 100));
              }
              return null;
            };
            const ready = await until(() => window.SA.store.state.project && window.SA.store.state.project.script && window.SA.store.state.project.script.cues.length);
            if (!ready) return JSON.stringify({ error: 'project-not-ready' });
            window.SA.store.commands.generateScript([{ id: 'e1', start: 0, end: 12, text: 'Edit me', meta: { kind: 'custom' } }], {});
            await window.SA.preview.ensureFonts();
            await new Promise((resolve) => setTimeout(resolve, 400));
            window.SA.textflow.apply(window.SA.store.state.project);
            window.SA.store.touch(['script']);
            await new Promise((resolve) => setTimeout(resolve, 200));
            const project = window.SA.store.state.project;
            const beat = project.beats.e1[0];
            const time = Math.min(beat.end - 0.1, beat.start + 2);
            window.SA.preview.seek(time);
            await new Promise((resolve) => setTimeout(resolve, 200));
            const capture = window.SA.preview.captureRGBA(time);
            const letters = capture && capture.frame && capture.frame.cues[0] ? capture.frame.cues[0].letters : [];
            const letter = letters[Math.floor(letters.length / 2)];
            if (!letter) return JSON.stringify({ error: 'no-letters' });
            // Select a letter through the same API the overlay uses.
            window.SA.inspector.selectAt(letter.path);
            await new Promise((resolve) => setTimeout(resolve, 60));
            const inspectorMarkers = document.querySelectorAll('#inspector-body .btn-key').length;
            // Pointer drag: move the selection, then scale and rotate through the handles.
            const overlay = document.getElementById('preview-overlay');
            const rect = overlay.getBoundingClientRect();
            const engineToCss = (point) => ({
              x: (point.x / capture.width) * rect.width,
              y: (point.y / capture.height) * rect.height,
            });
            const dispatch = (type, x, y, buttons) => {
              const event = new PointerEvent(type, {
                clientX: rect.left + x,
                clientY: rect.top + y,
                bubbles: true,
                cancelable: true,
                pointerId: 7,
                pointerType: 'mouse',
                isPrimary: true,
                button: 0,
                buttons: buttons == null ? (type === 'pointerup' ? 0 : 1) : buttons,
              });
              overlay.dispatchEvent(event);
            };
            const center = engineToCss({ x: letter.center.x, y: letter.center.y });
            dispatch('pointerdown', center.x, center.y);
            dispatch('pointermove', center.x + 24, center.y + 12);
            dispatch('pointerup', center.x + 24, center.y + 12, 0);
            await new Promise((resolve) => setTimeout(resolve, 100));
            const snapshot = (value) => JSON.parse(JSON.stringify(value || null));
            const moved = snapshot(window.SA.store.state.project.overrides[letter.path]);
            const refreshed = window.SA.preview.captureRGBA(time);
            const refreshedLetter = (refreshed.frame.cues[0].letters || []).find((entry) => entry.path === letter.path) || letter;
            const box = boxOf(refreshedLetter);
            const enginePerCss = capture.width / rect.width;
            const handle = engineToCss({ x: box.x + box.w, y: box.y + box.h });
            dispatch('pointerdown', handle.x, handle.y);
            dispatch('pointermove', handle.x + 30, handle.y + 30);
            dispatch('pointerup', handle.x + 30, handle.y + 30, 0);
            await new Promise((resolve) => setTimeout(resolve, 100));
            const scaled = snapshot(window.SA.store.state.project.overrides[letter.path]);
            const rotate = engineToCss({ x: box.x + box.w / 2, y: box.y - 24 * enginePerCss });
            dispatch('pointerdown', rotate.x, rotate.y);
            dispatch('pointermove', rotate.x + 40, rotate.y + 40);
            dispatch('pointerup', rotate.x + 40, rotate.y + 40, 0);
            await new Promise((resolve) => setTimeout(resolve, 100));
            const afterRotate = snapshot(window.SA.store.state.project.overrides[letter.path]);
            window.SA.overlay.nudge(12, -6);
            await new Promise((resolve) => setTimeout(resolve, 80));
            const nudged = snapshot(window.SA.store.state.project.overrides[letter.path]);
            function boxOf(entry) {
              const xs = [entry.quad[0], entry.quad[2], entry.quad[4], entry.quad[6]];
              const ys = [entry.quad[1], entry.quad[3], entry.quad[5], entry.quad[7]];
              const x0 = Math.min(...xs);
              const y0 = Math.min(...ys);
              return { x: x0, y: y0, w: Math.max(1, Math.max(...xs) - x0), h: Math.max(1, Math.max(...ys) - y0) };
            }
            // Inspector markers and reset after the moves.
            await new Promise((resolve) => setTimeout(resolve, 120));
            const setRows = document.querySelectorAll('#inspector-body .ctrl-row.is-set').length;
            const resetButtons = document.querySelectorAll('#inspector-body .btn-reset').length;
            // Keyframes: two keys on transform.y and check the rendered position differs.
            const cueStart = 0;
            window.SA.store.commands.setKeyframe(letter.path, 'transform.y', 0, 0, 'linear');
            window.SA.store.commands.setKeyframe(letter.path, 'transform.y', 6, 200, 'linear');
            await new Promise((resolve) => setTimeout(resolve, 80));
            const atStart = window.SA.preview.captureRGBA(cueStart + 0.5);
            const atMid = window.SA.preview.captureRGBA(cueStart + 3);
            const yOf = (capture, path) => {
              for (const cue of capture.frame.cues) for (const item of cue.letters) if (item.path === path) return item.center.y;
              return null;
            };
            const keyDelta = Math.abs((yOf(atMid, letter.path) || 0) - (yOf(atStart, letter.path) || 0));
            // Undo restores the pre-keyframe state.
            window.SA.store.undo();
            const afterUndoKeys = !!(window.SA.store.state.project.keyframes[letter.path] || {}).y && Object.keys(window.SA.store.state.project.keyframes[letter.path] || {}).length;
            // Text edit orphans: shrink the cue text, then check orphans + the inspector row.
            const orphansBefore = Object.keys(window.SA.store.state.project.orphans.e1 || {}).length;
            window.SA.store.commands.editCueText('e1', 'Hi', {});
            await new Promise((resolve) => setTimeout(resolve, 150));
            window.SA.inspector.selectAt('cue:e1');
            await new Promise((resolve) => setTimeout(resolve, 80));
            const orphans = Object.keys(window.SA.store.state.project.orphans.e1 || {}).length;
            const orphanRow = !!document.querySelector('#inspector-body .insp-orphans');
            const overlaySize = [overlay.width, overlay.height];
            return JSON.stringify({
              letter: letter.char,
              inspectorKeys: inspectorMarkers,
              moved: moved ? { x: moved.transform && moved.transform.x, y: moved.transform && moved.transform.y } : null,
              scaled: scaled ? scaled.transform && scaled.transform.scale : null,
              rotated: afterRotate ? afterRotate.transform && afterRotate.transform.rotate : null,
              nudged: nudged ? nudged.transform && { x: nudged.transform.x, y: nudged.transform.y } : null,
              setRows,
              resetButtons,
              keyDelta: Math.round(keyDelta * 100) / 100,
              afterUndoKeys,
              orphansBefore,
              orphans,
              orphanRow,
              overlaySize,
              glError: window.SA.preview.debugError(),
            });
          })()`);
          console.log('SMOKE_EDIT=' + editReport);
          await new Promise((resolve) => setTimeout(resolve, 300));
          const shot = await win.capturePage();
          const shotPath = path.join(app.getPath('temp'), 'suno-edit-smoke.png');
          fs.writeFileSync(shotPath, shot.toPNG());
          console.log(`SMOKE_EDIT_PNG=${shotPath} bytes=${shot.toPNG().length}`);
        }

        if (process.env.SA_SMOKE_TIMELINE) {
          win.setOpacity(0);
          win.showInactive();
          await new Promise((resolve) => setTimeout(resolve, 400));
          await primeStudio(win, { timeline: '1' }, 'ja');
          const timelineReport = await win.webContents.executeJavaScript(`(async () => {
            const until = async (test, timeout) => {
              const started = Date.now();
              while (Date.now() - started < (timeout || 20000)) {
                const value = test();
                if (value) return value;
                await new Promise((resolve) => setTimeout(resolve, 100));
              }
              return null;
            };
            const ready = await until(() => window.SA.store.state.project && window.SA.store.state.project.script && window.SA.store.state.project.script.cues.length);
            if (!ready) return JSON.stringify({ error: 'project-not-ready' });
            const cues = window.SA.store.state.project.script.cues;
            if (!cues.length) return JSON.stringify({ error: 'no-cues' });
            await window.SA.preview.ensureFonts();
            await new Promise((resolve) => setTimeout(resolve, 300));
            // Cue move/trim/split/merge with snapping, then check the SRT output.
            const cue = cues[3] || cues[0];
            const playhead = cue.end + 0.4;
            window.SA.preview.seek(playhead);
            const snapped = window.SA.timeline.snapTime(playhead + 0.07);
            const frameSnapped = window.SA.timeline.snapFrame(1.017);
            window.SA.store.commands.moveCue(cue.id, cue.start + 0.5, { coalesceKey: 'smoke:move' });
            const moved = window.SA.store.state.project.script.cues.find((entry) => entry.id === cue.id);
            window.SA.store.commands.trimCue(cue.id, 'end', moved.end + 0.5, { coalesceKey: 'smoke:trim' });
            const trimmed = window.SA.store.state.project.script.cues.find((entry) => entry.id === cue.id);
            const srt = window.SA.srt.stringify(window.SA.store.state.project.script.cues);
            const srtHasTrimmed = srt.includes(window.SA.srt.formatTime(trimmed.end));
            window.SA.store.commands.splitCue(cue.id, (trimmed.start + trimmed.end) / 2);
            const afterSplit = window.SA.store.state.project.script.cues.length;
            const first = window.SA.store.state.project.script.cues.find((entry) => entry.id === cue.id);
            window.SA.store.commands.mergeCues(cue.id);
            const afterMerge = window.SA.store.state.project.script.cues.length;
            // Keyframes: select a letter and seed two keys with the same store
            // command the inspector key button uses (the timeline's toolbar
            // add-property control is gone), then drag one, copy and paste.
            const time = trimmed.start + 0.4;
            const capture = window.SA.preview.captureRGBA(time);
            const letters = capture && capture.frame.cues[0] ? capture.frame.cues[0].letters : [];
            const letter = letters[Math.floor(letters.length / 2)];
            if (!letter) return JSON.stringify({ error: 'no-letters' });
            window.SA.inspector.selectAt(letter.path);
            await new Promise((resolve) => setTimeout(resolve, 120));
            window.SA.timeline.reload();
            const sel = window.SA.inspector.selectionInfo();
            const keyValue = window.SA.inspector.valueFor('transform.x');
            const keyAt = (at) => {
              window.SA.preview.seek(at);
              window.SA.store.commands.setKeyframe(
                letter.path,
                'transform.x',
                window.SA.timeline.snapFrame(window.SA.inspector.localTimeFor(sel.cueId, sel.beatId)),
                keyValue,
                'linear'
              );
            };
            keyAt(time);
            keyAt(trimmed.start + 2.2);
            const track = (window.SA.store.state.project.keyframes[letter.path] || {})['transform.x'] || [];
            // Drag the second key earlier.
            window.SA.store.commands.moveKeyframe(letter.path, 'transform.x', 1, 1.5);
            const dragged = ((window.SA.store.state.project.keyframes[letter.path] || {})['transform.x'] || []).map((key) => key.t);
            // Copy/paste at the playhead.
            window.SA.timeline.selectKey(letter.path, 'transform.x', 0);
            window.SA.timeline.copyKeys();
            window.SA.preview.seek(trimmed.start + 3.4);
            window.SA.timeline.pasteKeys();
            const pasted = ((window.SA.store.state.project.keyframes[letter.path] || {})['transform.x'] || []).length;
            window.SA.timeline.selectKey(letter.path, 'transform.x', 0);
            window.SA.timeline.setKeyframeEase ? null : null;
            window.SA.store.commands.setKeyframeEase(letter.path, 'transform.x', 0, 'backOut');
            const ease = (((window.SA.store.state.project.keyframes[letter.path] || {})['transform.x'] || [])[0] || {}).ease;
            window.SA.timeline.deleteKeys();
            const afterDelete = ((window.SA.store.state.project.keyframes[letter.path] || {})['transform.x'] || []).length;
            // Audio peaks: synthesize a short WAV, load it and wait for the decode.
            const sampleRate = 8000;
            const samples = sampleRate * 2;
            const buffer = new ArrayBuffer(44 + samples * 2);
            const view = new DataView(buffer);
            const writeText = (offset, text) => {
              for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
            };
            writeText(0, 'RIFF');
            view.setUint32(4, 36 + samples * 2, true);
            writeText(8, 'WAVE');
            writeText(12, 'fmt ');
            view.setUint32(16, 16, true);
            view.setUint16(20, 1, true);
            view.setUint16(22, 1, true);
            view.setUint32(24, sampleRate, true);
            view.setUint32(28, sampleRate * 2, true);
            view.setUint16(32, 2, true);
            view.setUint16(34, 16, true);
            writeText(36, 'data');
            view.setUint32(40, samples * 2, true);
            for (let i = 0; i < samples; i += 1) view.setInt16(44 + i * 2, Math.sin((i / sampleRate) * 2 * Math.PI * 440) * 8000, true);
            window.SA.preview.setAudioSource(URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' })), 'smoke.wav');
            const peaks = await until(() => window.SA.preview.getPeaks(), 5000);
            window.SA.timeline.draw();
            const canvas = document.getElementById('timeline-canvas');
            let ink = 0;
            if (canvas) {
              const check = document.createElement('canvas');
              check.width = canvas.width;
              check.height = canvas.height;
              const checkCtx = check.getContext('2d');
              checkCtx.drawImage(canvas, 0, 0);
              const data = checkCtx.getImageData(0, 0, check.width, check.height).data;
              for (let i = 0; i < data.length; i += 4 * 64) {
                if (data[i] + data[i + 1] + data[i + 2] > 90) ink += 1;
              }
            }
            // Horizontal scrollbar + zoom-out fit: at the minimum zoom every cue
            // fits, and a horizontal scrollbar appears when zoomed in.
            const hscrollEl = document.getElementById('timeline-hscroll');
            const thumbEl = document.getElementById('timeline-hscroll-thumb');
            const scrollEl = document.getElementById('timeline-scroll');
            const totalDuration = window.SA.preview.duration();
            const availableWidth = (scrollEl ? scrollEl.clientWidth : 0) - 150;
            window.SA.timeline.setZoom(60);
            window.SA.timeline.draw();
            const hscrollVisible = !!(hscrollEl && !hscrollEl.hidden);
            const hscrollThumb = thumbEl ? thumbEl.offsetWidth : 0;
            window.SA.timeline.setScrollX(999999);
            const maxScroll = window.SA.timeline.getScrollX();
            window.SA.timeline.setScrollX(0);
            window.SA.timeline.setZoom(1);
            const zoomAtMin = window.SA.timeline.getZoom();
            const fitsAtMin = zoomAtMin * totalDuration <= availableWidth + 2;
            // Editing a beat text must change the rendered frame and survive a
            // restructure (the cue keeps only the timing).
            const editCue = window.SA.store.state.project.script.cues[0];
            const editBeat = (window.SA.store.state.project.beats[editCue.id] || [])[0];
            let beatEditDiff = null;
            let beatEditSurvives = null;
            if (editBeat) {
              const at = editBeat.start + (editBeat.end - editBeat.start) * 0.6;
              const beforeShot = window.SA.preview.captureRGBA(at);
              window.SA.store.commands.editBeatText(editCue.id, editBeat.id, 'ZZTESTZZ', {});
              const afterShot = window.SA.preview.captureRGBA(at);
              const storedText = (window.SA.store.state.project.beats[editCue.id] || [])[0].text;
              const renderedChars = afterShot && afterShot.frame && afterShot.frame.cues[0] ? afterShot.frame.cues[0].letters.map((letter) => letter.char).join('') : '';
              window.__beatEditDebug = { storedText, renderedChars };
              if (beforeShot && afterShot) {
                let diff = 0;
                const length = Math.min(beforeShot.data.length, afterShot.data.length);
                for (let i = 0; i < length; i += 4 * 64) {
                  if (Math.abs(beforeShot.data[i] - afterShot.data[i]) + Math.abs(beforeShot.data[i + 1] - afterShot.data[i + 1]) + Math.abs(beforeShot.data[i + 2] - afterShot.data[i + 2]) > 40) diff += 1;
                }
                beatEditDiff = diff;
              }
              window.SA.store.commands.restructureCue(editCue.id);
              const kept = (window.SA.store.state.project.beats[editCue.id] || []).find((entry) => entry.text === 'ZZTESTZZ');
              beatEditSurvives = !!kept;
            }
            // Selecting a beat on the timeline must show the beat in the inspector.
            const selCue = window.SA.store.state.project.script.cues[0];
            const selBeat = (window.SA.store.state.project.beats[selCue.id] || [])[0];
            let inspectorBeat = null;
            if (selBeat) {
              window.SA.store.setSelection(['cue:' + selCue.id + '/beat:' + selBeat.id], 'beat');
              await new Promise((resolve) => setTimeout(resolve, 50));
              const inspBody = document.getElementById('inspector-body');
              inspectorBeat = {
                id: selBeat.id,
                breadcrumb: (inspBody.querySelector('.insp-breadcrumb') || {}).textContent || '',
                beatActions: !!inspBody.querySelector('.insp-beat-actions'),
              };
            }
            return JSON.stringify({
              inspectorBeat,
              beatEditDiff,
              beatEditSurvives,
              beatEditDebug: window.__beatEditDebug,
              hscrollVisible,
              hscrollThumb,
              maxScroll: Math.round(maxScroll),
              zoomAtMin: Math.round(zoomAtMin * 100) / 100,
              fitsAtMin,
              snapped: Math.round(snapped * 1000) / 1000,
              frameSnapped: Math.round(frameSnapped * 1000) / 1000,
              moved: moved ? Math.round(moved.start * 100) / 100 : null,
              trimmed: trimmed ? Math.round(trimmed.end * 100) / 100 : null,
              srtHasTrimmed,
              afterSplit,
              afterMerge,
              keys: track.length,
              dragged,
              pasted,
              ease,
              afterDelete,
              peaks: peaks ? peaks.peaks.length : 0,
              canvas: canvas ? [canvas.width, canvas.height] : null,
              ink,
              glError: window.SA.preview.debugError(),
            });
          })()`);
          console.log('SMOKE_TIMELINE=' + timelineReport);
          await new Promise((resolve) => setTimeout(resolve, 300));
          const shot = await win.capturePage();
          const shotPath = path.join(app.getPath('temp'), 'suno-timeline-smoke.png');
          fs.writeFileSync(shotPath, shot.toPNG());
          console.log(`SMOKE_TIMELINE_PNG=${shotPath} bytes=${shot.toPNG().length}`);
        }

        if (process.env.SA_SMOKE_RANDOM) {
          win.setOpacity(0);
          win.showInactive();
          await new Promise((resolve) => setTimeout(resolve, 400));
          await primeStudio(win, { random: '1' }, 'ja');
          const randomReport = await win.webContents.executeJavaScript(`(async () => {
            const until = async (test, timeout) => {
              const started = Date.now();
              while (Date.now() - started < (timeout || 20000)) {
                const value = test();
                if (value) return value;
                await new Promise((resolve) => setTimeout(resolve, 100));
              }
              return null;
            };
            const ready = await until(() => window.SA.store.state.project && window.SA.store.state.project.script && window.SA.store.state.project.script.cues.length);
            if (!ready) return JSON.stringify({ error: 'project-not-ready' });
            await window.SA.preview.ensureFonts();
            const store = window.SA.store;
            const resolved = () => JSON.stringify(SA.project.resolveStyle(store.state.project, 'cue:' + store.state.project.script.cues[0].id));
            // Presets: apply the last one and confirm it is reflected.
            const presets = window.SA.presets.list();
            for (const preset of presets) store.commands.setStyle('project', preset.style);
            const afterPresets = JSON.parse(resolved());
            // Random: deterministic per seed (on the same starting state), re-roll changes.
            const pureA = window.SA.random.randomize({ project: store.state.project, scope: 'cues', seed: 42, intensity: 2 });
            const pureB = window.SA.random.randomize({ project: store.state.project, scope: 'cues', seed: 42, intensity: 2 });
            const deterministic = JSON.stringify(pureA.patches) === JSON.stringify(pureB.patches);
            window.SA.random.apply(store.state.project, { scope: 'cues', seed: 42, intensity: 2 });
            const first = resolved();
            const beforeReroll = JSON.parse(first);
            window.SA.random.apply(store.state.project, { scope: 'cues', seed: 43, intensity: 2 });
            const rerolled = resolved();
            const rerollDiffers = rerolled !== first;
            // Locks.
            const fillBefore = JSON.parse(resolved()).fill;
            window.SA.random.apply(store.state.project, { scope: 'cues', seed: 7, locks: ['fill', 'post'] });
            const afterLocked = JSON.parse(resolved());
            const lockedFill = JSON.stringify(afterLocked.fill) === JSON.stringify(fillBefore);
            const lockedPost = !afterLocked.post;
            // Manual overrides are untouched.
            const cue = store.state.project.script.cues[0];
            const beat = store.state.project.beats[cue.id][0];
            const path = 'cue:' + cue.id + '/beat:' + beat.id + '/line:0/word:0/letter:0';
            store.commands.setProp(path, 'transform.x', 33, {});
            window.SA.random.apply(store.state.project, { scope: 'elements', paths: [path], seed: 5 });
            const guard = JSON.parse(JSON.stringify(store.state.project.overrides[path]));
            const guardKept = guard && guard.transform && guard.transform.x === 33 && !guard.enter;
            window.SA.random.apply(store.state.project, { scope: 'elements', paths: [path], seed: 5, overwriteManual: true });
            const forced = JSON.parse(JSON.stringify(store.state.project.overrides[path]));
            const forcedWrote = !!(forced && Object.keys(forced).some((group) => group !== 'transform'));
            // Palettes round-trip through localStorage and the built-in list.
            window.SA.colors.saveCustomPalettes([{ id: 'smoke1', name: 'Smoke', builtin: false, colors: ['#112233', '#445566'] }]);
            const custom = window.SA.colors.customPalettes();
            const paletteRoundTrip = custom.length === 1 && custom[0].colors.length === 2 && window.SA.colors.allPalettes().some((entry) => entry.id === 'smoke1');
            const paletteCount = custom.length;
            const paletteAll = window.SA.colors.allPalettes().length;
            window.SA.colors.saveCustomPalettes([]);
            // A gradient fill renders.
            const cueStyle = { fill: { type: 'gradientSweep', params: { angle: 30, speed: 0.4 } }, color: { fill: { kind: 'gradient', type: 'linear', angle: 30, stops: [{ pos: 0, color: '#ff0000', alpha: 1 }, { pos: 1, color: '#00ff00', alpha: 1 }] } } };
            store.commands.setStyle({ cueId: cue.id }, cueStyle);
            const captureTime = beat.start + (beat.end - beat.start) * 0.5;
            const capture = window.SA.preview.captureRGBA(captureTime);
            let ink = 0;
            for (let i = 0; i < (capture ? capture.data.length : 0); i += 4 * 16) {
              if (capture.data[i] + capture.data[i + 1] + capture.data[i + 2] > 120) ink += 1;
            }
            const canvas = document.createElement('canvas');
            canvas.width = capture.width;
            canvas.height = capture.height;
            const ctx = canvas.getContext('2d');
            const image = ctx.createImageData(capture.width, capture.height);
            image.data.set(capture.data);
            ctx.putImageData(image, 0, 0);
            // おまかせ: draw one of the 800 classified looks by theme + five axes,
            // then adjust the fine parameters (palette, text) from the same axes.
            const autoBtn = document.getElementById('tl-auto-direct');
            if (autoBtn) autoBtn.click();
            await until(() => store.state.project.styleMode && store.state.project.styleMode.look, 8000);
            await new Promise((resolve) => setTimeout(resolve, 300));
            const allBeats = [];
            for (const c of store.state.project.script.cues) {
              for (const b of (store.state.project.beats[c.id] || [])) allBeats.push(b);
            }
            const beatStyles = store.state.project.beatStyles || {};
            const autoStyled = allBeats.filter((b) => {
              const s = beatStyles[b.id];
              return !!(s && s.text && s.text.size);
            }).length;
            const autoLines = allBeats.length > 0 && allBeats.every((b) => ['line', 'phrase', 'word'].includes(b.chunk));
            const autoSplits = [...new Set(allBeats.map((b) => b.chunk))];
            const autoDurations = allBeats.map((b) => b.end - b.start);
            const autoBeatAvg = autoDurations.length
              ? Math.round((autoDurations.reduce((sum, value) => sum + value, 0) / autoDurations.length) * 100) / 100
              : 0;
            const perCue = store.state.project.script.cues.map((c) => (store.state.project.beats[c.id] || []).length);
            const splitCues = perCue.filter((n) => n > 1).length;
            const maxBeats = perCue.length ? Math.max(...perCue) : 0;
            // Backdrop patterns cycle the pattern-variants library: no repeats.
            const midTrack = (store.state.project.tracks || []).find((entry) => entry.kind === 'backdrop');
            const backdropClips = midTrack ? (store.state.project.clips || []).filter((clip) => clip.trackId === midTrack.id) : [];
            const backdropPatterns = backdropClips.filter((clip) => clip.spec && clip.spec.type === 'pattern');
            const backdropKeys = new Set(backdropPatterns.map((clip) => [clip.spec.params.mode, clip.spec.params.size, clip.spec.params.count].join('|')));
            const backdropUnique = backdropKeys.size;
            const backdropTotal = backdropClips.length;
            const backdropVariants = window.SA.patternVariants ? window.SA.patternVariants.count() : 0;
            const cueWithBeats = store.state.project.script.cues.find((c) => (store.state.project.beats[c.id] || []).length > 1);
            let beatPixelDiff = null;
            if (cueWithBeats) {
              const bs = store.state.project.beats[cueWithBeats.id];
              const shotA = window.SA.preview.captureRGBA(bs[0].start + (bs[0].end - bs[0].start) * 0.7);
              const shotB = window.SA.preview.captureRGBA(bs[1].start + (bs[1].end - bs[1].start) * 0.7);
              if (shotA && shotB) {
                let diff = 0;
                const length = Math.min(shotA.data.length, shotB.data.length);
                for (let i = 0; i < length; i += 4 * 64) {
                  if (Math.abs(shotA.data[i] - shotB.data[i]) + Math.abs(shotA.data[i + 1] - shotB.data[i + 1]) + Math.abs(shotA.data[i + 2] - shotB.data[i + 2]) > 40) diff += 1;
                }
                beatPixelDiff = diff;
              }
            }
            // the theme (font, location, palette) must stay identical across beats
            const beatResolved = allBeats.map((b) =>
              window.SA.project.resolveStyle(store.state.project, 'cue:' + b.cueId + '/beat:' + b.id)
            );
            const autoPalettes = new Set(beatResolved.map((s) => (s.palette && s.palette.id) || null));
            const autoColors = new Set(beatResolved.map((s) => JSON.stringify((s.color && s.color.fill) || null)));
            const autoFonts = new Set(beatResolved.map((s) => (s.text && s.text.fontId) || null));
            const autoSizes = allBeats.map((b) => (beatStyles[b.id] && beatStyles[b.id].text ? beatStyles[b.id].text.size : 0)).filter((value) => value);
            const autoSizeRange = autoSizes.length ? [Math.min(...autoSizes), Math.max(...autoSizes)] : [];
            const themeFont = store.state.project.style.text && store.state.project.style.text.fontId;
            const autoFontStable = beatResolved.every((s) => !s.text || !s.text.fontId || s.text.fontId === themeFont);
            const autoLocationKinds = new Set(beatResolved.map((s) => JSON.stringify(s.location || null))).size;
            const autoPaletteKinds = new Set(beatResolved.map((s) => (s.palette && s.palette.id) || null)).size;
            const autoPostKinds = new Set(beatResolved.map((s) => JSON.stringify((s.post || []).map((entry) => entry.type)))).size;
            const autoEnterKinds = new Set(beatResolved.map((s) => (s.enter && s.enter.type) || null)).size;
            const autoExitKinds = new Set(beatResolved.map((s) => (s.exit && s.exit.type) || null)).size;
            // おまかせ look: which of the 800 was drawn, and does the resolved
            // style still carry its headline effect?
            const lookPool = window.SA.looks && window.SA.looks.current ? window.SA.looks.current() : null;
            const styleMode = store.state.project.styleMode || {};
            const autoLook = styleMode.look || null;
            const autoLookCount = lookPool ? lookPool.count() : 0;
            let autoLookHeadline = null;
            let autoLookMatch = null;
            let autoLookMotion = null;
            if (lookPool && autoLook) {
              const entry = lookPool.get(autoLook.n);
              if (entry) {
                autoLookHeadline = entry.group + '.' + entry.type;
                if (lookPool.data && lookPool.data.motion && lookPool.data.motion.buckets && entry.motion) {
                  autoLookMotion = lookPool.data.motion.buckets[entry.motion.bucket] ? lookPool.data.motion.buckets[entry.motion.bucket].label : null;
                }
                const first = beatResolved[0];
                if (first && ['hold', 'edge', 'post', 'bgEdge'].includes(entry.group)) {
                  const list = Array.isArray(first[entry.group]) ? first[entry.group] : [];
                  autoLookMatch = list.some((instance) => instance && instance.type === entry.type);
                } else if (first && first[entry.group] && first[entry.group].type) {
                  autoLookMatch = first[entry.group].type === entry.type;
                }
              }
            }
            const sampleBeats = allBeats.slice(0, 4);
            const shots = sampleBeats.map((b) => window.SA.preview.captureRGBA(b.start + (b.end - b.start) * 0.75)).filter(Boolean);
            let autoPng = null;
            if (shots.length) {
              const tileW = shots[0].width;
              const tileH = shots[0].height;
              const autoCanvas = document.createElement('canvas');
              autoCanvas.width = tileW * 2;
              autoCanvas.height = tileH * 2;
              const autoCtx = autoCanvas.getContext('2d');
              shots.forEach((shot, i) => {
                const tile = document.createElement('canvas');
                tile.width = shot.width;
                tile.height = shot.height;
                const tileCtx = tile.getContext('2d');
                const image = tileCtx.createImageData(shot.width, shot.height);
                image.data.set(shot.data);
                tileCtx.putImageData(image, 0, 0);
                autoCtx.drawImage(tile, (i % 2) * tileW, Math.floor(i / 2) * tileH);
              });
              autoPng = autoCanvas.toDataURL('image/png');
            }
            return JSON.stringify({
              autoPng,
              autoBeatCount: allBeats.length,
              autoStyled,
              autoLines,
              autoSplits,
              autoBeatAvg,
              autoPerCueMax: maxBeats,
              autoSplitCues: splitCues,
              autoBeatPixelDiff: beatPixelDiff,
              autoPalettes: autoPalettes.size,
              autoColors: autoColors.size,
              autoFonts: autoFonts.size,
              autoLook,
              autoLookCount,
              autoLookHeadline,
              autoLookMatch,
              autoLookMotion,
              autoEnterKinds,
              autoExitKinds,
              backdropTotal,
              backdropPatterns: backdropPatterns.length,
              backdropUnique,
              backdropVariants,
              autoSizeRange,
              autoFontStable,
              autoLocationKinds,
              autoPaletteKinds,
              autoPostKinds,
              presets: presets.length,
              presetApplied: afterPresets.enter && afterPresets.enter.type === 'elasticPop',
              deterministic,
              rerollDiffers,
              beforeRerollEnter: beforeReroll.enter && beforeReroll.enter.type,
              lockedFill,
              lockedPost,
              guardKept,
              forcedWrote,
              paletteRoundTrip,
              paletteCount,
              paletteAll,
              ink,
              glError: window.SA.preview.debugError(),
              png: canvas.toDataURL('image/png'),
            });
          })()`);
          const parsedRandom = JSON.parse(randomReport);
          if (parsedRandom.autoPng) {
            const png = Buffer.from(parsedRandom.autoPng.split(',')[1], 'base64');
            const target = path.join(app.getPath('temp'), 'suno-autodirect-smoke.png');
            fs.writeFileSync(target, png);
            delete parsedRandom.autoPng;
            console.log(`SMOKE_AUTODIRECT_PNG=${target} bytes=${png.length}`);
          }
          if (parsedRandom.png) {
            const png = Buffer.from(parsedRandom.png.split(',')[1], 'base64');
            const target = path.join(app.getPath('temp'), 'suno-random-smoke.png');
            fs.writeFileSync(target, png);
            delete parsedRandom.png;
            console.log(`SMOKE_RANDOM_PNG=${target} bytes=${png.length}`);
          }
          console.log('SMOKE_RANDOM=' + JSON.stringify(parsedRandom));
        }

        if (process.env.SA_SMOKE_EXPORT) {
          win.setOpacity(0);
          win.showInactive();
          await new Promise((resolve) => setTimeout(resolve, 400));
          await primeStudio(win, { export: '1' }, 'ja');
          const exportReport = await win.webContents.executeJavaScript(`(async () => {
            const until = async (test, timeout) => {
              const started = Date.now();
              while (Date.now() - started < (timeout || 30000)) {
                const value = test();
                if (value) return value;
                await new Promise((resolve) => setTimeout(resolve, 100));
              }
              return null;
            };
            const ready = await until(() => window.SA.store.state.project && window.SA.store.state.project.script && window.SA.store.state.project.script.cues.length);
            if (!ready) return JSON.stringify({ error: 'project-not-ready' });
            window.SA.store.commands.generateScript([{ id: 'x1', start: 0, end: 1.2, text: 'Export test', meta: { kind: 'custom' } }], {});
            await window.SA.preview.ensureFonts();
            await new Promise((resolve) => setTimeout(resolve, 400));
            const project = window.SA.store.state.project;
            // A short WAV so the export can mux an audio track.
            const sampleRate = 8000;
            const samples = sampleRate;
            const wav = new ArrayBuffer(44 + samples * 2);
            const wavView = new DataView(wav);
            const writeText = (offset, text) => {
              for (let i = 0; i < text.length; i += 1) wavView.setUint8(offset + i, text.charCodeAt(i));
            };
            writeText(0, 'RIFF');
            wavView.setUint32(4, 36 + samples * 2, true);
            writeText(8, 'WAVE');
            writeText(12, 'fmt ');
            wavView.setUint32(16, 16, true);
            wavView.setUint16(20, 1, true);
            wavView.setUint16(22, 1, true);
            wavView.setUint32(24, sampleRate, true);
            wavView.setUint32(28, sampleRate * 2, true);
            wavView.setUint16(32, 2, true);
            wavView.setUint16(34, 16, true);
            writeText(36, 'data');
            wavView.setUint32(40, samples * 2, true);
            for (let i = 0; i < samples; i += 1) wavView.setInt16(44 + i * 2, Math.sin((i / sampleRate) * 2 * Math.PI * 440) * 8000, true);
            window.SA.preview.setAudioSource(URL.createObjectURL(new Blob([wav], { type: 'audio/wav' })), 'smoke.wav');
            const audioBuffer = await until(() => window.SA.preview.getAudioBuffer(), 5000);
            const width = 480;
            const height = 270;
            const fps = 24;
            const range = { from: 0, to: 0.25 };
            const makeEngine = () => {
              const canvas = new OffscreenCanvas(width, height);
              const engine = window.SA.lyricsEngine.createEngine({ canvas, width, height, quality: 'export', preserveDrawingBuffer: true });
              engine.setProject(project);
              engine.setAssets({ fonts: window.SA.lyricsFont.getActive() });
              return { canvas, engine };
            };
            const runOne = async (options) => {
              const { canvas, engine } = makeEngine();
              try {
                console.log('export-stage: start ' + JSON.stringify(options));
                const result = await Promise.race([
                  window.SA.videoExport.exportVideo({
                    width,
                    height,
                    fps,
                    range,
                    bitrate: 700000,
                    save: false,
                    debug: true,
                    ...options,
                    renderFrame: (time) => engine.renderFrame(time),
                    captureBitmap: () => canvas.transferToImageBitmap(),
                  }),
                  new Promise((resolve) => setTimeout(() => resolve({ ok: false, timeout: true }), 30000)),
                ]);
                console.log('export-stage: done ' + JSON.stringify({ ok: result.ok, format: result.format, codec: result.codec }));
                if (!result.ok) return { ok: false, error: result.timeout ? 'timeout' : result.canceled ? 'canceled' : 'failed' };
                const bytes = result.data;
                let binary = '';
                for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
                return { ok: true, format: result.format, codec: result.codec, audioCodec: result.audioCodec || null, bytes: bytes.length, base64: btoa(binary) };
              } catch (error) {
                console.log('export-stage: error ' + error.message);
                return { ok: false, error: error.message };
              } finally {
                engine.dispose();
              }
            };
            const mp4 = await runOne({ format: 'auto', audioBuffer });
            const webm = await runOne({ format: 'webm', audioBuffer });
            const zip = await runOne({ transparent: true, format: 'auto' });
            const strip = (entry) => {
              if (!entry.base64) return entry;
              const { base64, ...rest } = entry;
              return { ...rest, base64 };
            };
            return JSON.stringify({
              mp4: strip(mp4),
              webm: strip(webm),
              zip: strip(zip),
              glError: window.SA.preview.debugError(),
            });
          })()`);
          const parsedExport = JSON.parse(exportReport);
          const writeOut = (key, extension) => {
            const entry = parsedExport[key];
            if (!entry || !entry.base64) return;
            const bytes = Buffer.from(entry.base64, 'base64');
            const target = path.join(app.getPath('temp'), `suno-export-smoke.${extension}`);
            fs.writeFileSync(target, bytes);
            const magic = bytes.subarray(0, 8).toString('hex');
            console.log(`SMOKE_EXPORT_${key.toUpperCase()}=${target} bytes=${bytes.length} magic=${magic}`);
            entry.base64 = `${bytes.length} bytes`;
          };
          writeOut('mp4', 'mp4');
          writeOut('webm', 'webm');
          writeOut('zip', 'zip');
          console.log('SMOKE_EXPORT=' + JSON.stringify(parsedExport));
        }

        if (process.env.SA_SMOKE_LAYERS) {
          win.setOpacity(0);
          win.showInactive();
          await new Promise((resolve) => setTimeout(resolve, 400));
          await primeStudio(win, { layers: '1' }, 'en');
          const layersReport = await win.webContents.executeJavaScript(`(async () => {
            const until = async (test, timeout) => {
              const started = Date.now();
              while (Date.now() - started < (timeout || 30000)) {
                const value = test();
                if (value) return value;
                await new Promise((resolve) => setTimeout(resolve, 100));
              }
              return null;
            };
            const ready = await until(() => window.SA.store.state.project && window.SA.store.state.project.script && window.SA.store.state.project.script.cues.length);
            if (!ready) return JSON.stringify({ error: 'project-not-ready' });
            const project = window.SA.store.state.project;
            window.SA.store.commands.generateScript([{ id: 'x1', start: 0, end: 1.5, text: 'Layer test', meta: { kind: 'custom' } }], {});
            await window.SA.preview.ensureFonts();
            await new Promise((resolve) => setTimeout(resolve, 500));
            const sample = (capture, x, y) => {
              const px = Math.max(0, Math.min(capture.width - 1, Math.round(x)));
              const py = Math.max(0, Math.min(capture.height - 1, Math.round(y)));
              const index = (py * capture.width + px) * 4;
              return [capture.data[index], capture.data[index + 1], capture.data[index + 2], capture.data[index + 3]];
            };
            const ink = (capture) => {
              let count = 0;
              for (let i = 0; i < capture.data.length; i += 4 * 16) {
                if (capture.data[i] + capture.data[i + 1] + capture.data[i + 2] > 120) count += 1;
              }
              return count;
            };
            const time = 0.6;
            const backgroundLayer = { id: 'bg1', slot: 'background', type: 'solid', color: '#00ff00', opacity: 1, fit: 'stretch' };
            const plain = window.SA.preview.captureRGBA(time);
            const plainInk = ink(plain);
            project.layers = [backgroundLayer];
            await new Promise((resolve) => setTimeout(resolve, 400));
            const withBackground = window.SA.preview.captureRGBA(time);
            const corner = sample(withBackground, withBackground.width * 0.02, withBackground.height * 0.02);
            const backgroundGreen = corner[1] > 200 && corner[0] < 60 && corner[2] < 60;
            const textInk = ink(withBackground);
            const canvas = new OffscreenCanvas(16, 16);
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ff0000';
            ctx.fillRect(0, 0, 16, 16);
            const blob = await canvas.convertToBlob({ type: 'image/png' });
            const dataUrl = await new Promise((resolve) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result);
              reader.readAsDataURL(blob);
            });
            const probe = await (async () => {
              try {
                const image = await window.SA.platform.loadImage(dataUrl, 'probe');
                const bitmap = await createImageBitmap(image);
                const size = { width: bitmap.width, height: bitmap.height };
                bitmap.close();
                const probeCanvas = document.createElement('canvas');
                probeCanvas.width = 64;
                probeCanvas.height = 64;
                const probeGl = probeCanvas.getContext('webgl2', { alpha: true, antialias: false, preserveDrawingBuffer: true });
                if (!probeGl) return { ok: true, ...size, pass: 'no-webgl2' };
                const pass = window.SA.glLayers.create(probeGl);
                const loaded = await pass.preload([{ id: 'p', type: 'image', src: dataUrl, enabled: true }]);
                const drawn = pass.draw([{ id: 'p', type: 'image', src: dataUrl, fit: 'stretch', opacity: 1 }], { width: 64, height: 64 });
                const pixel = new Uint8Array(4);
                probeGl.readPixels(32, 32, 1, 1, probeGl.RGBA, probeGl.UNSIGNED_BYTE, pixel);
                const error = probeGl.getError();
                pass.dispose();
                return { ok: true, ...size, loaded, drawn, pixel: [pixel[0], pixel[1], pixel[2], pixel[3]], error };
              } catch (error) {
                return { ok: false, error: String((error && error.message) || error) };
              }
            })();
            project.layers = [
              backgroundLayer,
              { id: 'fg1', slot: 'foreground', type: 'image', src: dataUrl, opacity: 1, fit: 'actual', transform: { x: -0.4, y: -0.3 } },
            ];
            window.SA.preview.captureRGBA(time);
            await new Promise((resolve) => setTimeout(resolve, 600));
            const withForeground = window.SA.preview.captureRGBA(time);
            const marker = sample(withForeground, withForeground.width * 0.1, withForeground.height * 0.2);
            const markerRed = marker[0] > 200 && marker[1] < 60 && marker[2] < 60;
            const foregroundInk = ink(withForeground);
            project.layers = [backgroundLayer, { id: 'fg2', slot: 'foreground', type: 'solid', color: '#0000ff', opacity: 1 }];
            await new Promise((resolve) => setTimeout(resolve, 400));
            const withSolidForeground = window.SA.preview.captureRGBA(time);
            const solidMarker = sample(withSolidForeground, withSolidForeground.width * 0.1, withSolidForeground.height * 0.2);
            const solidMarkerBlue = solidMarker[2] > 200 && solidMarker[0] < 60 && solidMarker[1] < 60;
            // Video layer: record a green WebM from a canvas and composite it.
            const sourceCanvas = document.createElement('canvas');
            sourceCanvas.width = 64;
            sourceCanvas.height = 36;
            const sourceCtx = sourceCanvas.getContext('2d');
            sourceCtx.fillStyle = '#00ff00';
            sourceCtx.fillRect(0, 0, 64, 36);
            const stream = sourceCanvas.captureStream(15);
            const chunks = [];
            const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
            recorder.ondataavailable = (event) => {
              if (event.data && event.data.size) chunks.push(event.data);
            };
            const recorded = new Promise((resolve) => {
              recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
            });
            recorder.start();
            await new Promise((resolve) => setTimeout(resolve, 700));
            recorder.stop();
            const videoBlob = await recorded;
            const videoUrl = URL.createObjectURL(videoBlob);
            project.layers = [
              backgroundLayer,
              { id: 'v1', slot: 'foreground', type: 'video', src: videoUrl, opacity: 1, fit: 'actual', transform: { x: 0.3, y: 0.25 } },
            ];
            const previewEngine = window.SA.preview.engine();
            if (previewEngine && typeof previewEngine.preloadLayers === 'function') await previewEngine.preloadLayers();
            if (previewEngine && typeof previewEngine.prepareLayers === 'function') await previewEngine.prepareLayers(0.2, { playback: 'export' });
            const withVideo = window.SA.preview.captureRGBA(0.2);
            const videoMarker = sample(withVideo, withVideo.width * 0.8, withVideo.height * 0.75);
            const videoGreen = videoMarker[1] > 180 && videoMarker[0] < 80 && videoMarker[2] < 80;
            // Motion: fade in at the layer start, and a start/end window hides the layer.
            const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
            project.layers = [{ ...backgroundLayer, id: 'm1', motion: { in: { type: 'fade', duration: 0.5, delay: 0 }, out: { type: 'fade', duration: 0.3, delay: 0 } } }];
            await sleep(300);
            const motionStart = sample(window.SA.preview.captureRGBA(0), 0.02 * plain.width, 0.02 * plain.height);
            const motionDone = sample(window.SA.preview.captureRGBA(time), 0.02 * plain.width, 0.02 * plain.height);
            const motionOk = !(motionStart[1] > 200) && motionDone[1] > 200;
            project.layers = [{ ...backgroundLayer, id: 'w1', start: 1, end: 2 }];
            await sleep(200);
            const windowHidden = sample(window.SA.preview.captureRGBA(0.6), 0.02 * plain.width, 0.02 * plain.height);
            const windowHiddenOk = !(windowHidden[1] > 200);
            // Custom blend (backdrop copy): difference(green, blue) = cyan.
            project.layers = [backgroundLayer, { id: 'cb1', slot: 'foreground', type: 'solid', color: '#0000ff', blend: 'difference', opacity: 1 }];
            await sleep(300);
            const blended = sample(window.SA.preview.captureRGBA(time), 0.02 * plain.width, 0.02 * plain.height);
            const customBlendOk = blended[0] < 80 && blended[1] > 180 && blended[2] > 180;
            // Filter pass renders without GL errors.
            project.layers = [backgroundLayer, { id: 'fl1', slot: 'foreground', type: 'solid', color: '#223344', filter: { type: 'chromaticAberration', params: { amount: 6, radial: true } } }];
            window.SA.preview.captureRGBA(time);
            const filterError = window.SA.preview.debugError();
            // Timeline layer rows and the Media panel video tab.
            const timelineCanvas = document.getElementById('timeline-canvas');
            const heightBefore = timelineCanvas.height;
            project.layers = [backgroundLayer, { id: 'fgrow', slot: 'foreground', type: 'solid', color: '#123456' }];
            window.SA.timeline.draw();
            const heightWithLayers = timelineCanvas.height;
            const layersRowOk = heightWithLayers > heightBefore;
            window.SA.store.setSelection(['layer:fgrow'], 'layer');
            window.SA.inspector.render();
            const layerInspectorOk = document.getElementById('inspector-body').textContent.includes(window.SA.i18n.t('layers.title'));
            window.SA.store.setSelection([], null);
            window.SA.store.commands.addMedia({ kind: 'videos', id: 'vm1', name: 'probe.webm', src: videoUrl });
            document.getElementById('media-tab-video').click();
            const videoPaneVisible = !document.getElementById('media-pane-video').hidden;
            const mediaItems = document.querySelectorAll('#media-video-list .media-item').length;
            const mediaItem = document.querySelector('#media-video-list .media-item .media-item-actions .btn');
            project.layers = [];
            if (mediaItem) mediaItem.click();
            const layerAddedFromMedia = window.SA.store.state.project.layers.length;
            window.SA.store.commands.removeMedia('videos', 'vm1');
            project.layers = [];
            await new Promise((resolve) => setTimeout(resolve, 400));
            const cleared = window.SA.preview.captureRGBA(time);
            const clearedCorner = sample(cleared, cleared.width * 0.02, cleared.height * 0.02);
            const clearedOk = !(clearedCorner[1] > 200 && clearedCorner[0] < 60);
            // The background track's base colour: a set colour fills the frame,
            // hiding the track clears it back to transparent (the chroma key is
            // a preset of that colour, not an engine default).
            const bgTrack = (window.SA.store.state.project.tracks || []).find((track) => track.kind === 'background');
            window.SA.store.commands.setTrackColor(bgTrack.id, { kind: 'solid', value: '#00b140', alpha: 1 });
            await new Promise((resolve) => setTimeout(resolve, 300));
            const basePixel = sample(window.SA.preview.captureRGBA(time), 0.02 * plain.width, 0.02 * plain.height);
            const baseGreenOk = basePixel[1] > 140 && basePixel[0] < 40 && basePixel[3] > 200;
            window.SA.store.commands.updateTrack(bgTrack.id, { hidden: true });
            await new Promise((resolve) => setTimeout(resolve, 300));
            const hiddenPixel = sample(window.SA.preview.captureRGBA(time), 0.02 * plain.width, 0.02 * plain.height);
            const hiddenBaseOk = hiddenPixel[3] < 10;
            window.SA.store.commands.setTrackColor(bgTrack.id, null);
            window.SA.store.commands.updateTrack(bgTrack.id, { hidden: false });
            const preview = document.createElement('canvas');
            preview.width = withForeground.width;
            preview.height = withForeground.height;
            const previewCtx = preview.getContext('2d');
            const image = previewCtx.createImageData(preview.width, preview.height);
            image.data.set(withForeground.data);
            previewCtx.putImageData(image, 0, 0);
            return JSON.stringify({
              plainInk,
              backgroundGreen,
              textInk,
              textPreserved: textInk > plainInk * 0.5,
              marker,
              markerRed,
              probe,
              foregroundInk,
              solidMarker,
              solidMarkerBlue,
              videoMarker,
              videoGreen,
              motionOk,
              windowHiddenOk,
              customBlendOk,
              filterError,
              layersRowOk,
              layerInspectorOk,
              videoPaneVisible,
              mediaItems,
              layerAddedFromMedia,
              clearedOk,
              basePixel,
              baseGreenOk,
              hiddenPixel,
              hiddenBaseOk,
              glError: window.SA.preview.debugError(),
              png: preview.toDataURL('image/png'),
            });
          })()`);
          const parsedLayers = JSON.parse(layersReport);
          if (parsedLayers.png) {
            const png = Buffer.from(parsedLayers.png.split(',')[1], 'base64');
            const target = path.join(app.getPath('temp'), 'suno-layers-smoke.png');
            fs.writeFileSync(target, png);
            delete parsedLayers.png;
            console.log(`SMOKE_LAYERS_PNG=${target} bytes=${png.length}`);
          }
          console.log('SMOKE_LAYERS=' + JSON.stringify(parsedLayers));
        }

        if (process.env.SA_SMOKE_AUDIO) {
          win.setOpacity(0);
          win.showInactive();
          await new Promise((resolve) => setTimeout(resolve, 400));
          await primeStudio(win, { audio: '1' }, 'en');
          const audioReport = await win.webContents.executeJavaScript(`(async () => {
            const until = async (test, timeout) => {
              const started = Date.now();
              while (Date.now() - started < (timeout || 15000)) {
                const value = test();
                if (value) return value;
                await new Promise((resolve) => setTimeout(resolve, 100));
              }
              return null;
            };
            const ready = await until(() => window.SA.store.state.project && window.SA.store.state.project.script && window.SA.store.state.project.script.cues.length);
            if (!ready) return JSON.stringify({ error: 'project-not-ready' });
            const sampleRate = 16000;
            const samples = sampleRate * 2;
            const wav = new ArrayBuffer(44 + samples * 2);
            const view = new DataView(wav);
            const writeText = (offset, text) => {
              for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
            };
            writeText(0, 'RIFF');
            view.setUint32(4, 36 + samples * 2, true);
            writeText(8, 'WAVE');
            writeText(12, 'fmt ');
            view.setUint32(16, 16, true);
            view.setUint16(20, 1, true);
            view.setUint16(22, 1, true);
            view.setUint32(24, sampleRate, true);
            view.setUint32(28, sampleRate * 2, true);
            view.setUint16(32, 2, true);
            view.setUint16(34, 16, true);
            writeText(36, 'data');
            view.setUint32(40, samples * 2, true);
            const half = samples / 2;
            for (let i = 0; i < samples; i += 1) {
              const value = i < half ? Math.sin((i / sampleRate) * 2 * Math.PI * 440) * 12000 : 0;
              view.setInt16(44 + i * 2, value, true);
            }
            window.SA.preview.setAudioSource(URL.createObjectURL(new Blob([wav], { type: 'audio/wav' })), 'audio-smoke.wav');
            const analysis = await until(() => window.SA.preview.getAudioAnalysis(), 20000);
            if (!analysis) return JSON.stringify({ error: 'analysis-missing' });
            // Media panel audio tab: waveform + spectrum sprite should draw.
            document.getElementById('media-tab-audio').click();
            await new Promise((resolve) => setTimeout(resolve, 250));
            const audioCanvas = document.getElementById('media-audio-canvas');
            const audioCtx = audioCanvas.getContext('2d');
            const audioPixels = audioCtx.getImageData(0, 0, audioCanvas.width, audioCanvas.height).data;
            let audioInk = 0;
            for (let i = 0; i < audioPixels.length; i += 4 * 8) {
              if (audioPixels[i] + audioPixels[i + 1] + audioPixels[i + 2] > 60) audioInk += 1;
            }
            const audioMeta = document.getElementById('media-audio-meta').textContent;
            window.SA.store.commands.generateScript([{ id: 'a1', start: 0, end: 2, text: 'Audio react', meta: { kind: 'custom' } }], {});
            window.SA.store.commands.setStyle(
              { cueId: 'a1' },
              { edge: [{ type: 'outline', params: { width: { audio: { band: 'rms', gain: 60, max: 24 } }, softness: 0.3 } }] }
            );
            await new Promise((resolve) => setTimeout(resolve, 400));
            const ink = (capture) => {
              let count = 0;
              for (let i = 0; i < capture.data.length; i += 4 * 16) {
                if (capture.data[i] + capture.data[i + 1] + capture.data[i + 2] > 120) count += 1;
              }
              return count;
            };
            const loud = window.SA.preview.captureRGBA(0.5);
            const silent = window.SA.preview.captureRGBA(1.5);
            const loudInk = ink(loud);
            const silentInk = ink(silent);
            const preview = document.createElement('canvas');
            preview.width = loud.width;
            preview.height = loud.height;
            const previewCtx = preview.getContext('2d');
            const image = previewCtx.createImageData(preview.width, preview.height);
            image.data.set(loud.data);
            previewCtx.putImageData(image, 0, 0);
            return JSON.stringify({
              frames: analysis.frameCount,
              fps: analysis.fps,
              loudInk,
              silentInk,
              reacts: loudInk > silentInk * 1.2,
              audioInk,
              audioMeta,
              glError: window.SA.preview.debugError(),
              png: preview.toDataURL('image/png'),
            });
          })()`);
          const parsedAudio = JSON.parse(audioReport);
          if (parsedAudio.png) {
            const png = Buffer.from(parsedAudio.png.split(',')[1], 'base64');
            const target = path.join(app.getPath('temp'), 'suno-audio-smoke.png');
            fs.writeFileSync(target, png);
            delete parsedAudio.png;
            console.log(`SMOKE_AUDIO_PNG=${target} bytes=${png.length}`);
          }
          console.log('SMOKE_AUDIO=' + JSON.stringify(parsedAudio));
        }

        if (process.env.SA_SMOKE_FILLERS) {
          win.setOpacity(0);
          win.showInactive();
          await new Promise((resolve) => setTimeout(resolve, 400));
          await primeStudio(win, { fillers: '1' }, 'en');
          const fillersReport = await win.webContents.executeJavaScript(`(async () => {
            const until = async (test, timeout) => {
              const started = Date.now();
              while (Date.now() - started < (timeout || 20000)) {
                const value = test();
                if (value) return value;
                await new Promise((resolve) => setTimeout(resolve, 100));
              }
              return null;
            };
            const ready = await until(() => window.SA.store.state.project && window.SA.store.state.project.script && window.SA.store.state.project.script.cues.length);
            if (!ready) return JSON.stringify({ error: 'project-not-ready' });
            // start from an empty user filler library so the save / reload check is clean
            try { localStorage.removeItem('sa.fillerPresets'); } catch { /* ignore */ }
            window.SA.store.commands.generateScript([
              { id: 'x1', start: 2, end: 3.2, text: 'First line', meta: { kind: 'custom' } },
              { id: 'x2', start: 5.3, end: 6.5, text: 'Second line', meta: { kind: 'custom' } },
            ], {});
            window.SA.store.commands.setCredits({
              title: { source: 'custom', text: 'Smoke Title' },
              artist: { source: 'custom', text: 'Smoke Artist' },
              modes: { element: { enabled: false }, always: { enabled: false }, end: { enabled: false } },
            });
            window.SA.store.commands.setFillers({
              enabled: true,
              byKind: {
                intro: { type: 'shapes', params: { set: 'circles', count: 10 } },
                interlude: { type: 'countdown', params: { style: 'bar', from: 2 } },
                outro: { type: 'none', params: {} },
              },
            });
            window.SA.store.commands.regenerateFillers();
            await window.SA.preview.ensureFonts();
            await new Promise((resolve) => setTimeout(resolve, 500));
            const ink = (capture, region) => {
              const x0 = region ? Math.floor(region.x0 * capture.width) : 0;
              const x1 = region ? Math.ceil(region.x1 * capture.width) : capture.width;
              const y0 = region ? Math.floor(region.y0 * capture.height) : 0;
              const y1 = region ? Math.ceil(region.y1 * capture.height) : capture.height;
              let count = 0;
              for (let y = y0; y < y1; y += 2) {
                for (let x = x0; x < x1; x += 2) {
                  const index = (y * capture.width + x) * 4;
                  if (capture.data[index] + capture.data[index + 1] + capture.data[index + 2] > 120) count += 1;
                }
              }
              return count;
            };
            // Shapes filler in the intro gap.
            const withShapes = window.SA.preview.captureRGBA(0.6);
            const shapesInk = ink(withShapes);
            window.SA.store.commands.setFillers({ byKind: { intro: { type: 'none', params: {} } } });
            window.SA.store.commands.regenerateFillers();
            await new Promise((resolve) => setTimeout(resolve, 300));
            const withNone = window.SA.preview.captureRGBA(0.6);
            const noneInk = ink(withNone);
            // Countdown filler in the interlude.
            window.SA.store.commands.setFillers({ byKind: { intro: { type: 'shapes', params: { set: 'circles', count: 10 } } } });
            window.SA.store.commands.regenerateFillers();
            await new Promise((resolve) => setTimeout(resolve, 200));
            const countdown = window.SA.preview.captureRGBA(4.0);
            const countdownInk = ink(countdown);
            // Pin the interlude clip, then move the next cue: the spec survives and the clip follows.
            window.SA.store.commands.setFillerClip('x1>x2', { type: 'sineWave', params: { waves: 2 } });
            const pinnedClips = window.SA.fillers.clips(window.SA.store.state.project.script.cues, window.SA.preview.duration(), window.SA.fillers.settingsFor(window.SA.store.state.project));
            const pinnedClip = pinnedClips.find((clip) => clip.key === 'x1>x2');
            window.SA.store.commands.moveCue('x2', 6.0, { coalesceKey: 'smoke:move' });
            const movedClips = window.SA.fillers.clips(window.SA.store.state.project.script.cues, window.SA.preview.duration(), window.SA.fillers.settingsFor(window.SA.store.state.project));
            const movedClip = movedClips.find((clip) => clip.key === 'x1>x2');
            // Inspector: selecting a filler clip opens the preset picker and the
            // layer editor, with the pinned sineWave spec as the current layer.
            const fillerTrackClips = () =>
              (window.SA.store.state.project.clips || [])
                .filter((clip) => window.SA.project.trackKindOf(window.SA.store.state.project, clip.trackId) === 'filler')
                .sort((a, b) => a.start - b.start);
            window.SA.store.setSelection(['clip:' + fillerTrackClips()[1].id], 'clip');
            window.SA.inspector.render();
            const inspectorText = document.getElementById('inspector-body').textContent;
            const fillerInspectorOk = inspectorText.includes(window.SA.i18n.t('filler.presets')) && inspectorText.includes(window.SA.i18n.t('filler.type.sineWave'));
            window.SA.store.setSelection([], null);
            // Preset library: a built-in combo preset renders ink on the intro
            // clip, then a 3-layer custom filler (pattern + figures + animated
            // text); the custom one saves to the user library and reloads.
            const introClip = fillerTrackClips()[0];
            window.SA.store.commands.updateClip(introClip.id, { spec: window.SA.fillerLibrary.specOf('combo-dots-calm-orbit') });
            await new Promise((resolve) => setTimeout(resolve, 300));
            const presetTime = Math.min(introClip.end - 0.1, introClip.start + 0.8);
            const presetCapture = window.SA.preview.captureRGBA(presetTime);
            const presetInk = ink(presetCapture);
            const customSpec = window.SA.fillerRender.fromLayers([
              window.SA.fillerRender.defaults('pattern'),
              {
                type: 'figures',
                params: { ...window.SA.fillerRender.paramDefaults('figures'), motif: 'orbit', in: 'pop', hold: 'spin', out: 'burstOut' },
              },
              { type: 'textAnim', params: { ...window.SA.fillerRender.paramDefaults('textAnim'), text: '{title}' } },
            ]);
            window.SA.store.commands.updateClip(introClip.id, { spec: customSpec });
            for (const clip of fillerTrackClips()) {
              if (clip.id !== introClip.id) window.SA.store.commands.updateClip(clip.id, { spec: customSpec });
            }
            await new Promise((resolve) => setTimeout(resolve, 300));
            const customCapture = window.SA.preview.captureRGBA(presetTime);
            const customInk = ink(customCapture);
            const customPng = (() => {
              const canvas = document.createElement('canvas');
              canvas.width = customCapture.width;
              canvas.height = customCapture.height;
              const context2d = canvas.getContext('2d');
              const image = context2d.createImageData(canvas.width, canvas.height);
              image.data.set(customCapture.data);
              context2d.putImageData(image, 0, 0);
              return canvas.toDataURL('image/png');
            })();
            const customPngBytes = Math.round(((customPng.length - customPng.indexOf(',') - 1) * 3) / 4);
            const customLayers = window.SA.fillerRender.layersOf(customSpec).length;
            const savedFiller = window.SA.fillerLibrary.save('Smoke custom filler', customSpec);
            const savedFillerOk = !!(savedFiller && window.SA.fillerLibrary.get(savedFiller.id));
            const userListOk = window.SA.fillerLibrary.userList().some((entry) => entry.name === 'Smoke custom filler');
            // Credits: the intro element draws text, and always-on draws during a cue.
            window.SA.store.commands.setFillers({ enabled: false });
            window.SA.store.commands.setCredits({ modes: { element: { enabled: true, at: 'start', duration: 4 } } });
            await new Promise((resolve) => setTimeout(resolve, 300));
            const element = window.SA.preview.captureRGBA(0.5);
            const elementInk = ink(element);
            window.SA.store.commands.setCredits({ modes: { always: { enabled: true, position: 'topRight', opacity: 1, scale: 0.5 } } });
            await new Promise((resolve) => setTimeout(resolve, 300));
            const always = window.SA.preview.captureRGBA(2.5);
            const alwaysInk = ink(always, { x0: 0.6, y0: 0, x1: 1, y1: 0.25 });
            window.SA.store.commands.setCredits({ modes: { element: { enabled: false }, always: { enabled: false }, end: { enabled: true, duration: 5, afterLastCue: true } } });
            const creditsDuration = window.SA.preview.duration();
            const lastCueEnd = window.SA.store.state.project.script.cues.reduce((max, cue) => Math.max(max, cue.end), 0);
            await new Promise((resolve) => setTimeout(resolve, 300));
            const endCard = window.SA.preview.captureRGBA(lastCueEnd + 1);
            const endInk = ink(endCard);
            // The timeline gets fillers and credits rows.
            window.SA.timeline.draw();
            const timelineCanvas = document.getElementById('timeline-canvas');
            const creditClips = window.SA.credits.elements(window.SA.store.state.project).length;
            // Element selection path for credits.
            window.SA.store.setSelection(['credit:end'], 'credit');
            window.SA.inspector.render();
            const creditInspectorOk = document.getElementById('inspector-body').textContent.includes(window.SA.i18n.t('credits.modeEnd'));
            window.SA.store.setSelection([], null);
            const preview = document.createElement('canvas');
            preview.width = endCard.width;
            preview.height = endCard.height;
            const previewCtx = preview.getContext('2d');
            const image = previewCtx.createImageData(preview.width, preview.height);
            image.data.set(endCard.data);
            previewCtx.putImageData(image, 0, 0);
            return JSON.stringify({
              shapesInk,
              noneInk,
              shapesOk: shapesInk > 40 && shapesInk > noneInk * 4,
              countdownInk,
              countdownOk: countdownInk > 10,
              pinnedType: pinnedClip && pinnedClip.spec ? pinnedClip.spec.type : null,
              pinnedFlag: !!(pinnedClip && pinnedClip.pinned),
              movedFrom: movedClip ? Math.round(movedClip.from * 100) / 100 : null,
              movedTo: movedClip ? Math.round(movedClip.to * 100) / 100 : null,
              followsCue: !!movedClip && Math.abs(movedClip.to - (6.0 - 0.25)) < 0.01 && movedClip.spec.type === 'sineWave',
              fillerInspectorOk,
              presetInk,
              presetOk: presetInk > 40,
              customInk,
              customOk: customInk > 40,
              customPngBytes,
              customPngOk: customPngBytes > 5000,
              customLayers,
              customLayersOk: customLayers === 3,
              savedFillerOk,
              userListOk,
              elementInk,
              elementOk: elementInk > 40,
              alwaysInk,
              alwaysOk: alwaysInk > 20,
              creditsDuration: Math.round(creditsDuration * 100) / 100,
              lastCueEnd,
              endInk,
              endOk: endInk > 40,
              timelineHeight: timelineCanvas ? timelineCanvas.height : 0,
              creditClips,
              creditInspectorOk,
              glError: window.SA.preview.debugError(),
              png: preview.toDataURL('image/png'),
            });
          })()`);
          const parsedFillers = JSON.parse(fillersReport);
          if (parsedFillers.png) {
            const png = Buffer.from(parsedFillers.png.split(',')[1], 'base64');
            const target = path.join(app.getPath('temp'), 'suno-fillers-smoke.png');
            fs.writeFileSync(target, png);
            delete parsedFillers.png;
            console.log(`SMOKE_FILLERS_PNG=${target} bytes=${png.length}`);
          }
          console.log('SMOKE_FILLERS=' + JSON.stringify(parsedFillers));
        }
      } catch (error) {
        console.error(`SMOKE_ERROR=${error.message}`);
      }
      app.quit();
    });
  }

  return win;
}

app.whenReady().then(() => {
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['*://*.suno.ai/*', '*://*.cloudfront.net/*'] },
    (details, callback) => {
      callback({
        requestHeaders: {
          ...details.requestHeaders,
          Referer: 'https://suno.com/',
        },
      });
    }
  );

  registerIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  for (const fd of streams.values()) {
    try {
      fs.closeSync(fd);
    } catch {
      /* ignore */
    }
  }
  streams.clear();
});
