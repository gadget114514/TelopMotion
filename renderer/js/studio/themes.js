window.SA = window.SA || {};

SA.themes = (() => {
  'use strict';

  const LS_THEMES = 'sa.themes';
  // a theme owns exactly these groups; applying one replaces them instead of merging
  const THEME_GROUPS = ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'background', 'color', 'bgShape', 'bgFill', 'bgEdge', 'bgMotion', 'ornShape', 'ornFill', 'ornEdge', 'ornMotion'];
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
        // a stored theme may predate the background / ornament split
        let themeStyle = SA.textBg && typeof SA.textBg.splitStyle === 'function' ? SA.textBg.splitStyle(theme.style, { shadow: false }).style : theme.style;
        if (projectDoc.styleMode && SA.genParams && typeof SA.genParams.filterStyle === 'function') {
          themeStyle = SA.genParams.filterStyle(themeStyle, projectDoc.styleMode);
        }
        const merged = SA.project.mergeDeep(container, themeStyle);
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

  // Combined dialog: left = theme list, right = theme editor.
  // Left Apply applies to the timeline AND loads the theme into the right
  // editor. Each pane can be hidden so only one side shows.
  // The dialog is modeless: a floating window that leaves the Studio
  // behind it interactive (preview / timeline keep working while open).
  let combined = { selectedId: null, showLeft: true, showRight: true, dx: 0, dy: 0 };
  let modelessWrap = null;
  let modelessApi = null;

  function isOpen() {
    return !!(modelessWrap && modelessWrap.parentNode);
  }

  function closeDialog() {
    if (SA.themeEditor && typeof SA.themeEditor.detach === 'function') {
      try {
        SA.themeEditor.detach();
      } catch {
        /* ignore */
      }
    }
    if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function' && closeDialog._onKey) {
      document.removeEventListener('keydown', closeDialog._onKey);
      closeDialog._onKey = null;
    }
    if (modelessWrap && modelessWrap.parentNode) {
      try {
        modelessWrap.parentNode.removeChild(modelessWrap);
      } catch {
        /* ignore */
      }
    }
    modelessWrap = null;
    modelessApi = null;
  }

  function applyModelessOffset() {
    if (!modelessWrap) return;
    const dx = Number(combined.dx) || 0;
    const dy = Number(combined.dy) || 0;
    modelessWrap.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  function dialog(initialThemeId) {
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') return;
    // Reopen: bring to front instead of rebuilding, so a draft in progress survives.
    if (modelessWrap && modelessApi) {
      if (initialThemeId !== undefined) modelessApi.loadIntoEditor(initialThemeId || null, false);
      else if (typeof modelessApi.renderList === 'function') modelessApi.renderList();
      applyModelessOffset();
      const host = document.body || document.documentElement;
      if (host && modelessWrap.parentNode !== host) {
        try {
          host.appendChild(modelessWrap);
        } catch {
          /* ignore */
        }
      } else if (host) {
        // re-append moves it above other modeless siblings
        try {
          host.appendChild(modelessWrap);
        } catch {
          /* ignore */
        }
      }
      return;
    }
    const host = (document.body || document.documentElement);
    if (!host || typeof host.appendChild !== 'function') return;
    if (SA.themeEditor && typeof SA.themeEditor.detach === 'function') SA.themeEditor.detach();
    const wrap = document.createElement('div');
    wrap.className = 'theme-modeless';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-label', `${t('studio.themes.title')} / ${t('studio.themeEditor.title')}`);
    const dialog = document.createElement('div');
    dialog.className = 'dialog dialog-wide theme-dialog theme-combined';

    const head = document.createElement('div');
    head.className = 'theme-combined-head';
    const title = document.createElement('h3');
    title.textContent = `${t('studio.themes.title')} / ${t('studio.themeEditor.title')}`;
    head.appendChild(title);
    const toggleLeft = document.createElement('button');
    toggleLeft.type = 'button';
    toggleLeft.className = 'btn btn-mini';
    toggleLeft.textContent = t('studio.themes.title');
    const toggleRight = document.createElement('button');
    toggleRight.type = 'button';
    toggleRight.className = 'btn btn-mini';
    toggleRight.textContent = t('studio.themeEditor.title');
    head.appendChild(toggleLeft);
    head.appendChild(toggleRight);
    dialog.appendChild(head);

    const hint = document.createElement('p');
    hint.className = 'dialog-hint';
    hint.textContent = t('studio.themes.hint');
    dialog.appendChild(hint);

    const body = document.createElement('div');
    body.className = 'theme-combined-body';
    const left = document.createElement('div');
    left.className = 'theme-combined-left';
    const listNode = document.createElement('div');
    listNode.className = 'theme-list';
    left.appendChild(listNode);
    const leftActions = document.createElement('div');
    leftActions.className = 'dialog-actions theme-combined-left-actions';
    left.appendChild(leftActions);
    const right = document.createElement('div');
    right.className = 'theme-combined-right';
    const editorHost = document.createElement('div');
    editorHost.className = 'theme-combined-editor';
    right.appendChild(editorHost);
    body.appendChild(left);
    body.appendChild(right);
    dialog.appendChild(body);

    const applyLayout = () => {
      left.hidden = !combined.showLeft;
      right.hidden = !combined.showRight;
      dialog.classList.toggle('hide-left', !combined.showLeft);
      dialog.classList.toggle('hide-right', !combined.showRight);
      toggleLeft.classList.toggle('is-active', combined.showLeft);
      toggleRight.classList.toggle('is-active', combined.showRight);
    };
    toggleLeft.addEventListener('click', () => {
      if (combined.showLeft && !combined.showRight) return;
      combined.showLeft = !combined.showLeft;
      applyLayout();
    });
    toggleRight.addEventListener('click', () => {
      if (combined.showRight && !combined.showLeft) return;
      combined.showRight = !combined.showRight;
      applyLayout();
    });

    const closeCombined = () => {
      closeDialog();
    };

    const loadIntoEditor = (themeId, reveal) => {
      combined.selectedId = themeId || null;
      if (SA.themeEditor && typeof SA.themeEditor.load === 'function') {
        try {
          SA.themeEditor.load(themeId || null);
        } catch {
          /* ignore editor errors */
        }
      }
      if (reveal !== false && !combined.showRight && themeId) {
        combined.showRight = true;
        applyLayout();
      }
      renderList();
    };

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
        row.className = `theme-row${combined.selectedId === theme.id ? ' is-active' : ''}`;
        row.addEventListener('click', (event) => {
          if (event.target.closest('button')) return;
          loadIntoEditor(theme.id);
        });
        const badge = document.createElement('span');
        badge.className = 'theme-badge';
        badge.textContent = theme.builtin ? t('studio.themes.builtin') : t('studio.themes.mine');
        const name = document.createElement('span');
        name.className = 'theme-name';
        name.textContent = theme.name;
        name.title = theme.name;
        row.appendChild(badge);
        row.appendChild(name);
        makeButton(
          row,
          'studio.themes.apply',
          () => {
            const applied = apply(theme.id);
            if (applied) {
              SA.studio.toast('studio.toast.themeApplied', { name: applied.name });
              // reflect the applied theme in the timeline (above) and the editor
              loadIntoEditor(theme.id, false);
            }
          },
          true
        );
        makeButton(row, 'studio.themes.edit', () => {
          loadIntoEditor(theme.id);
        });
        if (theme.builtin) {
          makeButton(row, 'studio.themes.duplicate', () => {
            const entry = duplicate(theme.id);
            if (entry) combined.selectedId = entry.id;
            renderList();
          });
        } else {
          makeButton(row, 'studio.themes.update', () => {
            update(theme.id, { style: capture(), axes: currentAxes() || theme.axes || null });
            renderList();
          });
          makeButton(row, 'studio.themes.duplicate', () => {
            const entry = duplicate(theme.id);
            if (entry) combined.selectedId = entry.id;
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
            if (combined.selectedId === theme.id) combined.selectedId = null;
            renderList();
          });
        }
        listNode.appendChild(row);
      }
    };

    const miniButton = (key, onClick, primary) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = primary ? 'btn btn-mini btn-primary' : 'btn btn-mini';
      button.textContent = t(key);
      button.addEventListener('click', onClick);
      leftActions.appendChild(button);
      return button;
    };
    miniButton('studio.themes.create', () => {
      loadIntoEditor(null);
    }, true);
    miniButton('studio.themes.save', () => {
      const name = window.prompt(t('studio.themes.name'), t('studio.themes.untitled'));
      if (!name) return;
      const entry = save(name, capture(), currentAxes(), ((project() || {}).styleMode || {}).genre || null);
      SA.studio.toast('studio.toast.themeSaved', { name: entry.name });
      combined.selectedId = entry.id;
      renderList();
    });
    miniButton('studio.themes.reset', () => {
      SA.store.commands.resetTheme();
      SA.studio.toast('studio.toast.themeReset');
      if (SA.themeEditor && typeof SA.themeEditor.load === 'function') SA.themeEditor.load(null);
    });
    miniButton('studio.themes.import', async () => {
      const result = await importFile();
      if (!result.canceled) renderList();
    });
    miniButton('studio.themes.export', () => {
      exportFile();
    });

    combined.selectedId = initialThemeId || null;
    renderList();
    applyLayout();

    const actions = document.createElement('div');
    actions.className = 'dialog-actions';
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'btn btn-primary btn-mini';
    closeButton.textContent = t('studio.themes.close');
    closeButton.addEventListener('click', closeCombined);
    actions.appendChild(closeButton);
    dialog.appendChild(actions);

    wrap.appendChild(dialog);
    host.appendChild(wrap);
    modelessWrap = wrap;
    modelessApi = { renderList, loadIntoEditor, applyLayout };
    applyModelessOffset();

    // Drag the floating window by its header (buttons stay clickable).
    head.style.cursor = 'move';
    head.addEventListener('mousedown', (down) => {
      if (down.button !== 0) return;
      if (down.target && typeof down.target.closest === 'function' && down.target.closest('button')) return;
      const startX = down.clientX;
      const startY = down.clientY;
      const baseDx = Number(combined.dx) || 0;
      const baseDy = Number(combined.dy) || 0;
      const onMove = (move) => {
        combined.dx = baseDx + (move.clientX - startX);
        combined.dy = baseDy + (move.clientY - startY);
        applyModelessOffset();
      };
      const onUp = () => {
        if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
        }
      };
      if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      }
      if (typeof down.preventDefault === 'function') down.preventDefault();
    });

    // Escape closes the modeless dialog only when the focus is inside it,
    // so timeline / inspector shortcuts keep working behind the window.
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      const onKey = (event) => {
        if (!event || event.key !== 'Escape') return;
        const target = event.target;
        if (wrap.contains && target && wrap.contains(target)) {
          if (typeof event.stopPropagation === 'function') event.stopPropagation();
          closeDialog();
        }
      };
      document.addEventListener('keydown', onKey);
      closeDialog._onKey = onKey;
    }

    if (SA.themeEditor && typeof SA.themeEditor.embed === 'function') {
      SA.themeEditor.embed(editorHost, initialThemeId || null, {
        onSaved: (entry) => {
          if (entry && entry.id) combined.selectedId = entry.id;
          renderList();
        },
      });
    }
  }

  return { list, get, userThemes, capture, currentAxes, apply, save, update, remove, duplicate, exportFile, importFile, dialog, close: closeDialog, isOpen, THEME_GROUPS };
})();
