window.SA = window.SA || {};

SA.io = (() => {
  'use strict';

  let autosaveTimer = null;

  function sanitizeName(value) {
    return String(value || 'project').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'project';
  }

  function fileName(project) {
    return `${sanitizeName(project.meta && project.meta.title)}.sunostudio.json`;
  }

  function toBytes(project) {
    return new TextEncoder().encode(JSON.stringify(project, null, 2));
  }

  function fromBytes(bytes) {
    const text = new TextDecoder().decode(bytes);
    return JSON.parse(text);
  }

  async function save(project, options) {
    const opts = options || {};
    const bytes = toBytes(project);
    const result = await SA.platform.saveFile({
      bytes,
      name: opts.name || fileName(project),
      mime: 'application/json',
    });
    if (!result || result.canceled) return result || { canceled: true };
    const entry = { name: (project.meta && project.meta.title) || 'Untitled', path: result.filePath, updatedAt: new Date().toISOString() };
    SA.platform.recent.add(entry).catch(() => {});
    SA.store.markClean();
    return result;
  }

  function loadFromObject(raw) {
    const migrated = SA.project.migrate(raw);
    if (!migrated.ok) {
      const error = new Error(migrated.error || 'invalid-project');
      error.code = migrated.error || 'invalid-project';
      throw error;
    }
    SA.store.load(migrated.project);
    return migrated.project;
  }

  async function open() {
    const picked = await SA.platform.readFile('.json,application/json');
    if (!picked) return { canceled: true };
    const project = loadFromObject(fromBytes(picked.bytes));
    SA.platform.recent.add({ name: project.meta.title || picked.name, path: picked.path || picked.name, updatedAt: new Date().toISOString() }).catch(() => {});
    return { canceled: false, project, name: picked.name };
  }

  function importSrt(cues, name) {
    SA.store.commands.importSrt(cues, { name });
  }

  async function readSrt() {
    return readLyrics('.srt');
  }

  async function readLyrics(accept) {
    const picked = await SA.platform.readFile(accept || '.srt,.lrc,.json,.txt,application/json,text/plain');
    if (!picked) return { canceled: true };
    const text = new TextDecoder().decode(picked.bytes);
    const result = SA.lyricsFile.parse(text, picked.name);
    if (result.project) return { canceled: false, project: true, name: picked.name };
    if (!result.cues.length) {
      const error = new Error('no-lyrics');
      error.code = 'no-lyrics';
      throw error;
    }
    importSrt(result.cues, picked.name);
    return { canceled: false, cues: result.cues, warnings: result.warnings, format: result.format, name: picked.name };
  }

  async function importProfile() {
    const result = await SA.platform.importJson();
    if (!result || result.canceled) return { canceled: true };
    SA.store.dispatch({
      label: 'import profile',
      areas: ['project'],
      do(project) {
        project.dataset = result.data;
        if (!project.meta.title || project.meta.title === 'Untitled') {
          project.meta.title = (result.data.profile && (result.data.profile.displayName || result.data.profile.handle)) || project.meta.title;
        }
      },
    });
    return { canceled: false, dataset: result.data };
  }

  function newProject(context) {
    SA.store.load(SA.project.create(context || {}));
  }

  async function exportSrt(project, includeFx) {
    const text = SA.srt.stringify(project.script.cues || [], { includeFx: !!includeFx });
    return SA.platform.saveFile({
      bytes: new TextEncoder().encode(text),
      name: `${sanitizeName(project.meta && project.meta.title)}.srt`,
      mime: 'application/x-subrip',
    });
  }

  async function exportLyrics(project, format, options) {
    const opts = options || {};
    const kind = SA.lyricsFile.extension(format);
    const cues = (project.script && project.script.cues) || [];
    const text =
      kind === 'srt'
        ? SA.lyricsFile.stringify(cues, kind, { includeFx: !!opts.includeFx })
        : SA.lyricsFile.stringify(cues, kind, { meta: opts.meta, unit: opts.unit, title: project.meta && project.meta.title });
    const mime = kind === 'json' ? 'application/json' : kind === 'lrc' ? 'text/plain' : 'application/x-subrip';
    return SA.platform.saveFile({
      bytes: new TextEncoder().encode(text),
      name: `${sanitizeName(project.meta && project.meta.title)}.${kind}`,
      mime,
    });
  }

  async function loadAutosave() {
    const stored = await SA.platform.readAutosave();
    if (!stored) return null;
    try {
      return loadFromObject(stored);
    } catch {
      return null;
    }
  }

  async function saveAutosave(project) {
    if (!project) return;
    await SA.platform.writeAutosave(project);
    SA.store.markClean();
  }

  function startAutosave(getProject, intervalSeconds) {
    stopAutosave();
    const intervalMs = Math.max(5, intervalSeconds || 30) * 1000;
    autosaveTimer = setInterval(() => {
      if (!SA.store.isDirty()) return;
      const project = getProject();
      if (project) saveAutosave(project).catch(() => {});
    }, intervalMs);
    const flush = () => {
      if (!SA.store.isDirty()) return;
      const project = getProject();
      if (project) saveAutosave(project).catch(() => {});
    };
    window.addEventListener('visibilitychange', flush);
    window.addEventListener('beforeunload', flush);
  }

  function stopAutosave() {
    if (autosaveTimer) clearInterval(autosaveTimer);
    autosaveTimer = null;
  }

  return { save, open, loadFromObject, importSrt, readSrt, readLyrics, importProfile, newProject, exportSrt, exportLyrics, loadAutosave, saveAutosave, startAutosave, stopAutosave, fileName };
})();
