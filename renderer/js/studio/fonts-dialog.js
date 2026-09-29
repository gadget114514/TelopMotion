window.SA = window.SA || {};

// Settings → Fonts…: three tiers of typefaces.
//   default set   the bundled fonts (used when the project has no set)
//   loaded fonts  font files the user read in; kept in the font library of
//                 this browser profile and available to every project
//   project set   the ordered list this project renders with (first = main)
SA.fontsDialog = (() => {
  'use strict';

  const ACCEPT = '.ttf,.otf,.woff';

  function t(key, vars) {
    return SA.i18n.t(key, vars);
  }

  function button(label, onClick, className, title) {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = className || 'btn btn-mini';
    node.textContent = label;
    if (title) node.title = title;
    node.addEventListener('click', onClick);
    return node;
  }

  function heading(text) {
    const node = document.createElement('h4');
    node.className = 'fonts-heading';
    node.textContent = text;
    return node;
  }

  function hint(text) {
    const node = document.createElement('p');
    node.className = 'dialog-hint';
    node.textContent = text;
    return node;
  }

  // Makes a library font parseable before it is drawn or rendered.
  async function ensureRegistered(meta) {
    if (!SA.fontSet.isUserId(meta.id) || SA.lyricsFont.hasUserFont(meta.id)) return true;
    const record = await SA.platform.fontLibrary.get(meta.id);
    if (!record || !record.bytes) return false;
    await SA.lyricsFont.registerUserFont({ ...record.meta, ...meta }, record.bytes);
    return true;
  }

  function sampleCanvas(meta) {
    const canvas = document.createElement('canvas');
    const ratio = window.devicePixelRatio || 1;
    canvas.className = 'font-sample';
    canvas.width = Math.round(150 * ratio);
    canvas.height = Math.round(30 * ratio);
    (async () => {
      if (!(await ensureRegistered(meta).catch(() => false))) return;
      const entry = await SA.lyricsFont.load(meta.id).catch(() => null);
      if (!entry || !entry.font) return;
      const ctx = canvas.getContext('2d');
      const text = meta.cjk ? 'Aa あア永' : 'Aa Bb 123';
      const size = 20 * ratio;
      const scale = size / (entry.font.unitsPerEm || 1000);
      const fill = getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#e8ecf4';
      // glyph by glyph, like the engine: font.getPath shapes the text and
      // opentype.js rejects some GSUB lookups
      let x = 4 * ratio;
      for (const character of Array.from(text)) {
        const glyph = entry.font.charToGlyph(character);
        const path = glyph.getPath(x, 22 * ratio, size);
        path.fill = fill;
        path.draw(ctx);
        x += (glyph.advanceWidth || 0) * scale;
      }
    })();
    return canvas;
  }

  function describe(meta) {
    const parts = [];
    if (meta.subfamily && !/^regular$/i.test(meta.subfamily)) parts.push(meta.subfamily);
    else if ((meta.weight || 400) >= 600) parts.push('Bold');
    if (meta.cjk) parts.push(t('fonts.cjk'));
    return parts.join(' · ');
  }

  function fontRow(meta, extra) {
    const row = document.createElement('div');
    row.className = 'font-row';
    row.appendChild(sampleCanvas(meta));
    const name = document.createElement('div');
    name.className = 'font-name';
    name.textContent = meta.family || meta.id;
    const sub = document.createElement('small');
    sub.textContent = describe(meta);
    name.appendChild(sub);
    row.appendChild(name);
    const tools = document.createElement('div');
    tools.className = 'font-tools';
    for (const node of extra) tools.appendChild(node);
    row.appendChild(tools);
    return row;
  }

  function builtinMeta(entry) {
    return { id: entry.id, family: entry.family, weight: entry.weight, cjk: entry.cjk, subfamily: entry.weight >= 600 ? 'Bold' : 'Regular' };
  }

  async function open() {
    const doc = SA.store.state.project;
    const root = document.getElementById('dialog-root');
    if (!doc || !root) return;

    const known = new Map(); // id → meta for every font the dialog can show
    for (const entry of SA.lyricsFont.builtins()) known.set(entry.id, builtinMeta(entry));
    for (const meta of (doc.media && doc.media.fonts) || []) if (meta && meta.id) known.set(meta.id, { ...meta, missing: true });
    let library = await SA.platform.fontLibrary.list();
    for (const meta of library) known.set(meta.id, meta);

    const current = SA.fontSet.normalize(doc.fontSet);
    const draft = { exclusive: SA.fontSet.isActive(current) ? current.exclusive : true, fonts: current.fonts.map((entry) => ({ ...entry })) };

    root.innerHTML = '';
    const dialog = document.createElement('div');
    dialog.className = 'dialog dialog-wide fonts-dialog';
    dialog.innerHTML = `<h3>${t('fonts.title')}</h3>`;
    const body = document.createElement('div');
    body.className = 'fonts-body';
    const available = document.createElement('section');
    available.className = 'fonts-col';
    const project = document.createElement('section');
    project.className = 'fonts-col';
    body.appendChild(available);
    body.appendChild(project);
    dialog.appendChild(body);
    const actions = document.createElement('div');
    actions.className = 'dialog-actions';
    dialog.appendChild(actions);
    root.appendChild(dialog);
    root.hidden = false;

    const inSet = (id) => draft.fonts.some((entry) => entry.id === id);
    const addToSet = (id) => {
      if (!inSet(id)) draft.fonts.push({ id, fontClass: null });
      render();
    };

    async function importFiles() {
      SA.studio.toast('fonts.importNotice', null, 8000);
      const files = await SA.platform.readFiles(ACCEPT);
      const failed = [];
      for (const file of files) {
        try {
          const facts = SA.lyricsFont.inspectFont(file.bytes, file.name);
          const hash = await SA.platform.fontLibrary.hashOf(file.bytes);
          const meta = { id: SA.fontSet.userId(hash), fileName: file.name, hash, size: file.bytes.byteLength, ...facts };
          await SA.platform.fontLibrary.put({ meta, bytes: file.bytes });
          await SA.lyricsFont.registerUserFont(meta, file.bytes);
          known.set(meta.id, meta);
        } catch {
          failed.push(file.name);
        }
      }
      if (failed.length) SA.studio.toast('fonts.parseFailed', { names: failed.join(', ') });
      library = await SA.platform.fontLibrary.list();
      render();
    }

    async function removeFromLibrary(meta) {
      await SA.platform.fontLibrary.remove(meta.id);
      library = await SA.platform.fontLibrary.list();
      // a font the project still uses keeps rendering until the studio reloads
      if (!inSet(meta.id)) SA.lyricsFont.unregisterUserFont(meta.id);
      if (inSet(meta.id)) known.set(meta.id, { ...meta, missing: true });
      render();
    }

    function renderAvailable() {
      available.innerHTML = '';
      available.appendChild(heading(t('fonts.available')));

      available.appendChild(heading(t('fonts.defaultSet')));
      const builtinList = document.createElement('div');
      builtinList.className = 'font-list';
      for (const entry of SA.lyricsFont.builtins()) {
        const meta = known.get(entry.id);
        builtinList.appendChild(fontRow(meta, [button('+', () => addToSet(entry.id), 'btn btn-mini', t('fonts.addToProject'))]));
        if (inSet(entry.id)) builtinList.lastChild.classList.add('is-used');
      }
      available.appendChild(builtinList);

      const loadedHead = heading(t('fonts.loaded'));
      loadedHead.appendChild(button(t('fonts.import'), importFiles, 'btn btn-mini fonts-import'));
      available.appendChild(loadedHead);
      const loadedList = document.createElement('div');
      loadedList.className = 'font-list';
      if (!library.length) loadedList.appendChild(hint(t('fonts.loadedEmpty')));
      for (const meta of library) {
        const row = fontRow(meta, [
          button('+', () => addToSet(meta.id), 'btn btn-mini', t('fonts.addToProject')),
          button('🗑', () => removeFromLibrary(meta), 'btn btn-mini', t('fonts.removeFromLibrary')),
        ]);
        if (inSet(meta.id)) row.classList.add('is-used');
        loadedList.appendChild(row);
      }
      available.appendChild(loadedList);
      available.appendChild(hint(t('fonts.loadedHint')));
    }

    function classSelect(entry) {
      const select = document.createElement('select');
      const options = [['', t('fonts.classAuto')], ...SA.fontSet.CLASSES.map((cls) => [cls, t(`fonts.class.${cls}`)])];
      for (const [value, label] of options) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        select.appendChild(option);
      }
      select.value = entry.fontClass || '';
      select.title = t('fonts.classHint');
      select.addEventListener('change', () => {
        entry.fontClass = select.value || null;
      });
      return select;
    }

    function move(index, delta) {
      const target = index + delta;
      if (target < 0 || target >= draft.fonts.length) return;
      const [entry] = draft.fonts.splice(index, 1);
      draft.fonts.splice(target, 0, entry);
      render();
    }

    function renderProject() {
      project.innerHTML = '';
      project.appendChild(heading(t('fonts.projectSet')));
      const exclusive = document.createElement('label');
      exclusive.className = 'fonts-exclusive';
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = draft.exclusive;
      check.addEventListener('change', () => {
        draft.exclusive = check.checked;
      });
      exclusive.appendChild(check);
      exclusive.appendChild(document.createTextNode(t('fonts.exclusive')));
      if (draft.fonts.length) project.appendChild(exclusive);

      const list = document.createElement('div');
      list.className = 'font-list';
      if (!draft.fonts.length) list.appendChild(hint(t('fonts.projectEmpty')));
      draft.fonts.forEach((entry, index) => {
        const meta = known.get(entry.id) || { id: entry.id, family: entry.id, missing: true };
        const row = fontRow(meta, [
          classSelect(entry),
          button('↑', () => move(index, -1), 'btn btn-mini', t('fonts.up')),
          button('↓', () => move(index, 1), 'btn btn-mini', t('fonts.down')),
          button('×', () => {
            draft.fonts.splice(index, 1);
            render();
          }, 'btn btn-mini', t('fonts.remove')),
        ]);
        const badge = document.createElement('span');
        badge.className = 'font-badge';
        if (meta.missing && SA.fontSet.isUserId(entry.id) && !library.some((item) => item.id === entry.id)) {
          badge.textContent = t('fonts.missingBadge');
          badge.classList.add('is-missing');
        } else if (index === 0) badge.textContent = t('fonts.main');
        else badge.textContent = String(index + 1);
        row.insertBefore(badge, row.firstChild);
        list.appendChild(row);
      });
      project.appendChild(list);
      if (draft.fonts.length) {
        project.appendChild(button(t('fonts.useDefault'), () => {
          draft.fonts = [];
          render();
        }));
      }
      project.appendChild(hint(t('fonts.projectHint')));
    }

    function render() {
      renderAvailable();
      renderProject();
    }

    actions.appendChild(button(t('fonts.cancel'), () => {
      root.hidden = true;
    }));
    actions.appendChild(button(t('fonts.apply'), () => {
      const set = draft.fonts.length ? { exclusive: draft.exclusive, fonts: draft.fonts.map((entry) => ({ id: entry.id, fontClass: entry.fontClass || null })) } : null;
      const media = [];
      for (const entry of set ? set.fonts : []) {
        if (!SA.fontSet.isUserId(entry.id)) continue;
        const meta = { ...(known.get(entry.id) || { id: entry.id }) };
        delete meta.missing;
        media.push(meta);
      }
      SA.store.commands.setFontSet(set, media);
      root.hidden = true;
    }, 'btn btn-primary btn-mini'));
    render();
  }

  return { open };
})();
