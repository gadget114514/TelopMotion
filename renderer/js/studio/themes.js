window.SA = window.SA || {};

SA.themes = (() => {
  'use strict';

  const LS_THEMES = 'sa.themes';
  // a theme owns exactly these groups; applying one replaces them instead of merging
  const THEME_GROUPS = ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'background', 'color', 'bgShape', 'bgFill', 'bgEdge', 'bgMotion'];
  const CAPTURE_GROUPS = THEME_GROUPS.filter((group) => group !== 'background').concat('text');

  function t(key, vars) {
    return SA.i18n.t(key, vars);
  }

  function project() {
    return SA.store.state.project;
  }

  function newId() {
    return `t_${Math.random().toString(16).slice(2, 10)}`;
  }

  function builtinThemes() {
    // the staged looks (pack 'pro') are complete performances, so the theme list
    // shows them next to the classic presets
    return SA.presets.list({ packs: 'all' }).map((preset) => ({
      id: `builtin:${preset.id}`,
      name: SA.presets.labelFor(preset),
      builtin: true,
      axes: null,
      style: preset.style,
    }));
  }

  function userThemes() {
    let stored = [];
    try {
      stored = JSON.parse(localStorage.getItem(LS_THEMES) || '[]');
    } catch {
      stored = [];
    }
    if (!Array.isArray(stored)) return [];
    return stored
      .filter((entry) => entry && entry.id && entry.style && typeof entry.style === 'object')
      .map((entry) => ({ ...entry, builtin: false }));
  }

  function saveUserThemes(list) {
    try {
      localStorage.setItem(LS_THEMES, JSON.stringify(list));
    } catch {
      /* ignore */
    }
  }

  function list() {
    return [...builtinThemes(), ...userThemes()];
  }

  function get(themeId) {
    return list().find((entry) => entry.id === themeId) || null;
  }

  // the effect layer plus the typography: text style and transform stay with the project
  function capture() {
    const doc = project();
    if (!doc) return {};
    const style = {};
    for (const group of CAPTURE_GROUPS) {
      if (doc.style[group] !== undefined) style[group] = SA.store.clone(doc.style[group]);
    }
    return style;
  }

  // the project's axes with the UI defaults for weird, smartness and fear:
  // themes store the axes the editor drew with, so opening one restores them
  function currentAxes() {
    const doc = project();
    const mode = doc && doc.styleMode;
    if (!mode || !mode.axes || !SA.moods) return null;
    return { ...SA.moods.normalizeAxes(mode.axes), weird: SA.moods.projectWeird(doc), smartness: SA.moods.projectSmartness(doc), fear: SA.moods.projectFear(doc) };
  }

  function apply(themeId, scope) {
    const theme = get(themeId);
    const doc = project();
    if (!theme || !doc) return null;
    const cueId = scope && scope.cueId ? scope.cueId : null;
    SA.store.dispatch({
      label: 'apply theme',
      areas: ['style'],
      do(projectDoc) {
        let container = projectDoc.style;
        if (cueId) container = projectDoc.cueStyles[cueId] || (projectDoc.cueStyles[cueId] = {});
        for (const group of THEME_GROUPS) delete container[group];
        const merged = SA.project.mergeDeep(container, theme.style);
        // backgrounds live on the background track now, not in the style
        delete merged.background;
        if (cueId) projectDoc.cueStyles[cueId] = merged;
        else projectDoc.style = merged;
      },
    });
    return theme;
  }

  function save(name, style, axes, genre, profile) {
    const entry = {
      id: newId(),
      name: String(name || t('studio.themes.untitled')),
      builtin: false,
      axes: axes || null,
      genre: genre || null,
      style: style || capture(),
      profile: profile || null,
      updatedAt: new Date().toISOString(),
    };
    const userList = userThemes();
    userList.push(entry);
    saveUserThemes(userList);
    return entry;
  }

  function update(themeId, patch) {
    const userList = userThemes();
    const entry = userList.find((item) => item.id === themeId);
    if (!entry) return null;
    Object.assign(entry, patch || {}, { updatedAt: new Date().toISOString() });
    saveUserThemes(userList);
    return entry;
  }

  function remove(themeId) {
    saveUserThemes(userThemes().filter((entry) => entry.id !== themeId));
  }

  function duplicate(themeId) {
    const theme = get(themeId);
    if (!theme) return null;
    return save(t('studio.themes.copyName', { name: theme.name }), SA.store.clone(theme.style), theme.axes || null, theme.genre || null, SA.store.clone(theme.profile || null));
  }

  async function exportFile() {
    const payload = { kind: 'telopmotion-themes', version: 1, themes: userThemes() };
    const bytes = new TextEncoder().encode(JSON.stringify(payload, null, 2));
    return SA.platform.saveFile({ bytes, name: 'telopmotion-themes.json', mime: 'application/json' });
  }

  async function importFile() {
    const picked = await SA.platform.readFile('.json,application/json');
    if (!picked) return { canceled: true, count: 0 };
    let incoming = [];
    try {
      const parsed = JSON.parse(new TextDecoder().decode(picked.bytes));
      incoming = Array.isArray(parsed) ? parsed : parsed && Array.isArray(parsed.themes) ? parsed.themes : [];
    } catch {
      return { canceled: false, count: 0, error: 'invalid' };
    }
    const userList = userThemes();
    let count = 0;
    for (const entry of incoming) {
      if (!entry || !entry.style || typeof entry.style !== 'object') continue;
      userList.push({
        id: newId(),
        name: String(entry.name || t('studio.themes.untitled')),
        builtin: false,
        axes: entry.axes || null,
        genre: entry.genre || null,
        style: entry.style,
        profile: entry.profile || null,
      });
      count += 1;
    }
    saveUserThemes(userList);
    return { canceled: false, count };
  }

  function dialog() {
    const root = document.getElementById('dialog-root');
    if (!root) return;
    root.innerHTML = '';
    const dialog = document.createElement('div');
    dialog.className = 'dialog';
    const title = document.createElement('h3');
    title.textContent = t('studio.themes.title');
    const hint = document.createElement('p');
    hint.className = 'dialog-hint';
    hint.textContent = t('studio.themes.hint');
    const listNode = document.createElement('div');
    listNode.className = 'theme-list';
    dialog.appendChild(title);
    dialog.appendChild(hint);
    dialog.appendChild(listNode);

    const makeButton = (row, key, onClick, primary) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = primary ? 'btn btn-mini btn-primary' : 'btn btn-mini';
      button.textContent = t(key);
      button.addEventListener('click', onClick);
      row.appendChild(button);
      return button;
    };

    const renderList = () => {
      listNode.innerHTML = '';
      for (const theme of list()) {
        const row = document.createElement('div');
        row.className = 'theme-row';
        const badge = document.createElement('span');
        badge.className = 'theme-badge';
        badge.textContent = theme.builtin ? t('studio.themes.builtin') : t('studio.themes.mine');
        const name = document.createElement('span');
        name.className = 'theme-name';
        name.textContent = theme.name;
        row.appendChild(badge);
        row.appendChild(name);
        makeButton(
          row,
          'studio.themes.apply',
          () => {
            const applied = apply(theme.id);
            if (applied) {
              SA.studio.toast('studio.toast.themeApplied', { name: applied.name });
              root.hidden = true;
            }
          },
          true
        );
        makeButton(row, 'studio.themes.edit', () => {
          root.hidden = true;
          SA.themeEditor.open(theme.id);
        });
        if (theme.builtin) {
          makeButton(row, 'studio.themes.duplicate', () => {
            duplicate(theme.id);
            renderList();
          });
        } else {
          makeButton(row, 'studio.themes.update', () => {
            update(theme.id, { style: capture(), axes: currentAxes() || theme.axes || null });
            renderList();
          });
          makeButton(row, 'studio.themes.duplicate', () => {
            duplicate(theme.id);
            renderList();
          });
          makeButton(row, 'studio.themes.rename', () => {
            const next = window.prompt(t('studio.themes.name'), theme.name);
            if (!next) return;
            update(theme.id, { name: next });
            renderList();
          });
          makeButton(row, 'studio.themes.remove', () => {
            remove(theme.id);
            renderList();
          });
        }
        listNode.appendChild(row);
      }
    };
    renderList();

    const actions = document.createElement('div');
    actions.className = 'dialog-actions';
    const createButton = document.createElement('button');
    createButton.type = 'button';
    createButton.className = 'btn btn-mini btn-primary';
    createButton.textContent = t('studio.themes.create');
    createButton.addEventListener('click', () => {
      root.hidden = true;
      SA.themeEditor.open(null);
    });
    const saveButton = document.createElement('button');
    saveButton.type = 'button';
    saveButton.className = 'btn btn-mini';
    saveButton.textContent = t('studio.themes.save');
    saveButton.addEventListener('click', () => {
      const name = window.prompt(t('studio.themes.name'), t('studio.themes.untitled'));
      if (!name) return;
      const entry = save(name, capture(), currentAxes(), ((project() || {}).styleMode || {}).genre || null);
      SA.studio.toast('studio.toast.themeSaved', { name: entry.name });
      renderList();
    });
    const importButton = document.createElement('button');
    importButton.type = 'button';
    importButton.className = 'btn btn-mini';
    importButton.textContent = t('studio.themes.import');
    importButton.addEventListener('click', async () => {
      const result = await importFile();
      if (!result.canceled) renderList();
    });
    const exportButton = document.createElement('button');
    exportButton.type = 'button';
    exportButton.className = 'btn btn-mini';
    exportButton.textContent = t('studio.themes.export');
    exportButton.addEventListener('click', () => {
      exportFile();
    });
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'btn btn-primary btn-mini';
    closeButton.textContent = t('studio.themes.close');
    closeButton.addEventListener('click', () => {
      root.hidden = true;
    });
    actions.appendChild(createButton);
    actions.appendChild(saveButton);
    actions.appendChild(importButton);
    actions.appendChild(exportButton);
    actions.appendChild(closeButton);
    dialog.appendChild(actions);

    root.appendChild(dialog);
    root.hidden = false;
  }

  return { list, get, userThemes, capture, currentAxes, apply, save, update, remove, duplicate, exportFile, importFile, dialog, THEME_GROUPS };
})();
