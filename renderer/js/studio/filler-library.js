window.SA = window.SA || {};

// The user's own filler specs, stored next to the user themes in localStorage.
// The built-in library lives in lyrics/filler-presets.js; this module only owns
// the saved entries, their import / export and the change event the inspector
// listens to.
SA.fillerLibrary = (() => {
  'use strict';

  const LS_PRESETS = 'sa.fillerPresets';

  function t(key, vars) {
    return SA.i18n.t(key, vars);
  }

  function lang() {
    return SA.i18n && typeof SA.i18n.lang === 'function' ? SA.i18n.lang() : 'en';
  }

  function newId() {
    return `u_${Math.random().toString(16).slice(2, 10)}`;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function readUser() {
    let stored = [];
    try {
      stored = JSON.parse(localStorage.getItem(LS_PRESETS) || '[]');
    } catch {
      stored = [];
    }
    if (!Array.isArray(stored)) return [];
    return stored
      .filter((entry) => entry && entry.id && entry.spec && typeof entry.spec === 'object')
      .map((entry) => ({ ...entry, builtin: false }));
  }

  function writeUser(list) {
    try {
      localStorage.setItem(LS_PRESETS, JSON.stringify(list));
    } catch {
      /* ignore */
    }
  }

  function emit() {
    window.dispatchEvent(new CustomEvent('sa:filler-library'));
  }

  // The preset id of a saved entry is never part of its own spec.
  function stripRuntime(spec) {
    if (!spec || typeof spec !== 'object') return spec;
    delete spec.pinned;
    const params = spec.params;
    if (params && typeof params === 'object') {
      delete params.beats;
      if (Array.isArray(params.list)) params.list = params.list.map(stripRuntime);
    }
    return spec;
  }

  function sanitize(spec) {
    return stripRuntime(clone(spec || {}));
  }

  function builtins() {
    if (!SA.fillerPresets) return [];
    const language = lang();
    return SA.fillerPresets.list().map((preset) => ({
      id: preset.id,
      name: SA.fillerPresets.labelFor(preset, language),
      group: preset.group,
      spec: clone(preset.spec),
      builtin: true,
    }));
  }

  function userList() {
    return readUser().map((entry) => ({ ...entry, group: 'mine', builtin: false }));
  }

  function all() {
    return [...builtins(), ...userList()];
  }

  function get(id) {
    return all().find((entry) => entry.id === id) || null;
  }

  function specOf(id) {
    const entry = get(id);
    if (!entry) return null;
    const spec = clone(entry.spec);
    spec.presetId = id;
    return spec;
  }

  function save(name, spec) {
    if (!SA.fillerRender || typeof SA.fillerRender.validate !== 'function') return null;
    const clean = sanitize(spec);
    const validation = SA.fillerRender.validate(clean);
    if (!validation.ok) return null;
    const entry = {
      id: newId(),
      name: String(name || t('studio.themes.untitled')),
      spec: clean,
      createdAt: new Date().toISOString(),
    };
    const list = readUser();
    list.push(entry);
    writeUser(list);
    emit();
    return entry;
  }

  function rename(id, name) {
    const list = readUser();
    const entry = list.find((item) => item.id === id);
    if (!entry) return null;
    entry.name = String(name || entry.name);
    entry.updatedAt = new Date().toISOString();
    writeUser(list);
    emit();
    return entry;
  }

  function remove(id) {
    const list = readUser();
    const next = list.filter((entry) => entry.id !== id);
    writeUser(next);
    emit();
    return next.length !== list.length;
  }

  function exportJson(ids) {
    const wanted = Array.isArray(ids) && ids.length ? new Set(ids) : null;
    const items = all()
      .filter((entry) => !wanted || wanted.has(entry.id))
      .map((entry) => ({ name: entry.name, spec: sanitize(entry.spec) }));
    return JSON.stringify({ format: 'telopmotion.fillers', version: 1, items }, null, 2);
  }

  function importJson(text) {
    let parsed = null;
    try {
      parsed = JSON.parse(String(text || ''));
    } catch {
      return { added: 0, rejected: [], error: 'invalid' };
    }
    const incoming = Array.isArray(parsed) ? parsed : parsed && Array.isArray(parsed.items) ? parsed.items : [];
    const rejected = [];
    const added = [];
    for (const item of incoming) {
      const name = item && item.name ? String(item.name) : '';
      const spec = item && item.spec ? item.spec : item;
      const clean = sanitize(spec);
      const validation = SA.fillerRender.validate(clean);
      if (!validation.ok) {
        rejected.push({ name, errors: validation.errors });
        continue;
      }
      added.push({
        id: newId(),
        name: name || t('studio.themes.untitled'),
        spec: clean,
        createdAt: new Date().toISOString(),
      });
    }
    if (added.length) {
      const list = readUser();
      list.push(...added);
      writeUser(list);
      emit();
    }
    return { added: added.length, rejected };
  }

  // Export downloads a JSON file from a Blob; import reads a picked file with a
  // hidden input (the same browser-side approach the studio uses elsewhere).
  function exportFile(ids) {
    const text = exportJson(ids);
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'my-fillers.telopmotion-fillers.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function importFile() {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.style.display = 'none';
      document.body.appendChild(input);
      input.addEventListener('change', () => {
        const file = input.files && input.files[0];
        input.remove();
        if (!file) {
          resolve({ added: 0, rejected: [], canceled: true });
          return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve(importJson(reader.result));
        reader.onerror = () => resolve({ added: 0, rejected: [], error: 'invalid' });
        reader.readAsText(file);
      });
      input.click();
    });
  }

  return { builtins, userList, all, get, specOf, save, rename, remove, exportJson, importJson, exportFile, importFile };
})();
