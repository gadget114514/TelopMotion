window.SA = window.SA || {};

// The theme editor defines the probabilities the automatic direction draws
// from: the axes, the palette lottery, the text size / decoration weights and
// the per-type effect weights. A value the user moves is pinned (stored in
// `styleMode.params` / `typeWeights`); the ↺ button returns it to the axes.
SA.themeEditor = (() => {
  'use strict';

  const TABS = ['axis', 'palette', 'font', 'fx', 'colors'];
  const AXES = ['speed', 'energy', 'softness', 'density', 'brightness', 'weird', 'smartness', 'fear'];
  const FX_GROUPS = ['enter', 'exit', 'hold', 'fill', 'edge', 'post', 'layout', 'animation'];
  const FX_GROUP_LABEL = {
    enter: 'studio.inspector.enter',
    exit: 'studio.inspector.exit',
    hold: 'studio.inspector.hold',
    fill: 'studio.inspector.fill',
    edge: 'studio.inspector.edge',
    post: 'studio.inspector.post',
    layout: 'studio.inspector.layout',
    animation: 'studio.inspector.animation',
  };
  const UI_PACKS = { packs: [null, 'font', 'pro'] };
  // The group headings of the parameter table (`def.group`); a group without a
  // label is rendered without a heading.
  const GROUP_LABEL = {
    size: 'studio.themeEditor.group.size',
    fg: 'studio.themeEditor.group.fg',
    deco: 'studio.themeEditor.group.deco',
    graphic: 'studio.themeEditor.group.graphic',
    font: 'studio.themeEditor.group.font',
    mask: 'studio.themeEditor.group.mask',
    textBg: 'studio.themeEditor.group.textBg',
    color: 'studio.themeEditor.group.color',
    planes: 'studio.themeEditor.group.planes',
    motion: 'studio.themeEditor.group.motion',
    scoped: 'studio.themeEditor.group.scoped',
    figure: 'studio.themeEditor.group.figure',
    stroke: 'studio.themeEditor.group.stroke',
  };

  let draft = null;
  let root = null;
  let autoRows = [];
  let sizeBars = [];
  // one entry per weight group on screen: { keys, nodes: Map<key, node> }
  let weightGroups = [];
  // combined-dialog embedding: when set, render() draws the editor into
  // embedHost (right pane) instead of building a standalone dialog
  let embedHost = null;
  let onSaved = null;

  function t(key, vars) {
    return SA.i18n.t(key, vars);
  }

  function project() {
    return SA.store.state.project;
  }

  function seedNow() {
    return Math.floor(Math.random() * 900000) + 1000;
  }

  // The display form of a value follows the organized `kind`:
  //   chance  a probability, shown as a percentage
  //   weight  a share of its group; the raw weight is shown, plus the
  //           normalized percentage the draw actually uses
  //   amount  a quantity, shown with three decimals
  function fmtNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? String(SA.genParams.display(number)) : '0';
  }

  function fmt(def, value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '0';
    if (def && def.kind === 'chance') return `${Math.round(number * 100)}%`;
    return fmtNumber(number);
  }

  function defaultAxes() {
    return { speed: 0.5, energy: 0.5, softness: 0.6, density: 0.5, brightness: 0.6, weird: SA.moods.WEIRD_DEFAULT, smartness: SA.moods.SMART_DEFAULT, fear: SA.moods.projectFear(null) };
  }

  // weird, smartness and fear are the user's choices: a genre, the music or a
  // jitter never sets them, so those keep the values the sliders hold
  function keepWeird(axes) {
    return { ...SA.moods.normalizeAxes(axes), weird: SA.moods.weirdOf(draft.axes), smartness: SA.moods.smartOf(draft.axes), fear: SA.moods.fearOf(draft.axes) };
  }

  function kwFromDoc(doc) {
    const cfg = (doc && doc.styleMode && doc.styleMode.keywords) || {};
    const join = (value) => (Array.isArray(value) ? value.join(', ') : String(value || ''));
    return { enabled: cfg.enabled !== false, extra: join(cfg.extra), exclude: join(cfg.exclude) };
  }

  function deriveAll() {
    return SA.genParams ? SA.genParams.derive(draft.axes) : {};
  }

  function resolveAll() {
    return SA.genParams ? SA.genParams.resolve({ axes: draft.axes, params: draft.params }) : {};
  }

  function profileOf() {
    return {
      params: { ...draft.params },
      typeWeights: SA.store.clone(draft.typeWeights),
      usePalettes: SA.store.clone(draft.usePalettes),
      embedded: SA.store.clone(draft.embedded || {}),
    };
  }

  // --- common widgets ----------------------------------------------------------

  // Hover text for the palette tab: every visible label carries a `title`
  // so the meaning is one hover away. Missing keys fall back to '' (no
  // tooltip) so other tabs keep their current behaviour.
  const HEADING_HINT = {
    'studio.themeEditor.palette': 'studio.themeEditor.hint.palette',
    'studio.themeEditor.paletteSet': 'studio.themeEditor.hint.paletteSet',
    'studio.themeEditor.usePalettes.title': 'studio.themeEditor.hint.usePalettesTitle',
  };
  const GROUP_HINT = {
    color: 'studio.themeEditor.hint.groupColor',
    planes: 'studio.themeEditor.hint.groupPlanes',
  };

  function hintText(key) {
    const value = t(key);
    return value === key ? '' : value;
  }

  function heading(container, key, className) {
    const node = document.createElement('div');
    node.className = className || 'insp-section-title';
    node.textContent = t(key);
    const hintKey = HEADING_HINT[key];
    if (hintKey) {
      const hint = hintText(hintKey);
      if (hint) node.title = hint;
    }
    container.appendChild(node);
    return node;
  }

  function smallButton(label, onClick, primary, title) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = primary ? 'btn btn-mini btn-primary' : 'btn btn-mini';
    button.textContent = label;
    if (title) {
      const hint = title.indexOf('studio.') === 0 ? hintText(title) : title;
      if (hint) button.title = hint;
    }
    button.addEventListener('click', onClick);
    return button;
  }

  // A parameter row: label, slider, value, the auto / fixed chip and ↺. The
  // state lives in `draft.params` (a missing key = automatic). The organized
  // `kind` decides the readout: chances show a percentage, weights add their
  // normalized share of the group, amounts keep three decimals.
  function paramRow(def) {
    const auto = deriveAll()[def.key];
    const pinned = draft.params[def.key] != null;
    const current = pinned ? draft.params[def.key] : auto;
    const row = document.createElement('div');
    row.className = `param-row param-${def.kind}`;
    const paramHint = hintText(`studio.themeEditor.hint.${def.key}`);
    row.title = paramHint || t(`studio.themeEditor.kind.${def.kind}`);
    const label = document.createElement('span');
    label.className = 'param-label';
    label.textContent = t(`studio.themeEditor.param.${def.key}`);
    if (paramHint) label.title = paramHint;
    row.appendChild(label);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(def.min);
    input.max = String(def.max);
    input.step = String(def.step);
    input.value = String(current);
    input.dataset.param = def.key;
    if (paramHint) input.title = paramHint;
    row.appendChild(input);
    const value = document.createElement('span');
    value.className = 'param-value';
    value.textContent = fmt(def, current);
    row.appendChild(value);
    const percent = document.createElement('span');
    percent.className = 'param-percent';
    percent.title = t('studio.themeEditor.share');
    row.appendChild(percent);
    if (def.kind === 'weight') percent.dataset.weight = def.key;
    const chip = document.createElement('span');
    chip.className = `param-chip${pinned ? ' is-pinned' : ''}`;
    chip.textContent = t(pinned ? 'studio.themeEditor.pinned' : 'studio.themeEditor.auto');
    row.appendChild(chip);
    const reset = smallButton('↺', () => {
      delete draft.params[def.key];
      const next = deriveAll()[def.key];
      input.value = String(next);
      value.textContent = fmt(def, next);
      chip.textContent = t('studio.themeEditor.auto');
      chip.classList.remove('is-pinned');
      refreshAuto();
    });
    reset.classList.add('param-reset');
    reset.title = t('studio.themeEditor.auto');
    row.appendChild(reset);
    input.addEventListener('input', () => {
      draft.params[def.key] = Number(input.value);
      value.textContent = fmt(def, input.value);
      chip.textContent = t('studio.themeEditor.pinned');
      chip.classList.add('is-pinned');
      refreshAuto();
    });
    autoRows.push({
      key: def.key,
      get: () => draft.params[def.key],
      update: (next) => {
        input.value = String(next);
        value.textContent = fmt(def, next);
      },
    });
    return { row, percent };
  }

  // The parameter groups of one tab, in table order: a heading per group (when
  // the group has a label) and the rows straight from the organized PARAMS
  // table. Weight groups register their normalized percentages for
  // `refreshAuto`, so the dialog never hard-codes a key list again.
  function buildParamGroups(container, tab) {
    const groups = [];
    for (const def of SA.genParams.PARAMS) {
      if (def.tab !== tab) continue;
      let group = groups.find((entry) => entry.id === def.group);
      if (!group) {
        group = { id: def.group, defs: [] };
        groups.push(group);
      }
      group.defs.push(def);
    }
    for (const group of groups) {
      if (GROUP_LABEL[group.id]) {
        const head = heading(container, GROUP_LABEL[group.id], 'insp-section-title');
        const groupHint = GROUP_HINT[group.id] ? hintText(GROUP_HINT[group.id]) : '';
        if (groupHint) head.title = groupHint;
      }
      const keys = SA.genParams.keysOf(group.id);
      const nodes = new Map();
      for (const def of group.defs) {
        const { row, percent } = paramRow(def);
        container.appendChild(row);
        if (def.kind === 'weight') nodes.set(def.key, percent);
      }
      if (nodes.size) weightGroups.push({ keys, nodes });
    }
  }

  // The type weight row used by the effect tab: a 0..2 slider over the profile
  // weight plus the automatic "how likely" bar (moods.score × genre affinity,
  // normalized inside the group).
  function typeRow(group, type, autoShare) {
    const stored = draft.typeWeights[group] ? draft.typeWeights[group][type] : undefined;
    const pinned = stored != null;
    const current = pinned ? Number(stored) : 1;
    const row = document.createElement('div');
    row.className = 'param-row fx-type-row';
    const label = document.createElement('span');
    label.className = 'param-label';
    label.textContent = SA.controls.typeLabel(group, type);
    row.appendChild(label);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = '2';
    input.step = '0.05';
    input.value = String(current);
    row.appendChild(input);
    const value = document.createElement('span');
    value.className = 'param-value';
    value.textContent = fmtNumber(current);
    row.appendChild(value);
    const bar = document.createElement('span');
    bar.className = 'chance-bar';
    const fill = document.createElement('i');
    fill.style.width = `${Math.round(autoShare * 100)}%`;
    bar.appendChild(fill);
    row.appendChild(bar);
    const chip = document.createElement('span');
    chip.className = `param-chip${pinned ? ' is-pinned' : ''}`;
    chip.textContent = t(pinned ? 'studio.themeEditor.pinned' : 'studio.themeEditor.auto');
    row.appendChild(chip);
    const reset = smallButton('↺', () => {
      if (draft.typeWeights[group]) {
        delete draft.typeWeights[group][type];
        if (!Object.keys(draft.typeWeights[group]).length) delete draft.typeWeights[group];
      }
      input.value = '1';
      value.textContent = '1';
      chip.textContent = t('studio.themeEditor.auto');
      chip.classList.remove('is-pinned');
      refreshAuto();
    });
    reset.classList.add('param-reset');
    row.appendChild(reset);
    input.addEventListener('input', () => {
      const table = draft.typeWeights[group] || (draft.typeWeights[group] = {});
      table[type] = Number(input.value);
      value.textContent = fmtNumber(input.value);
      chip.textContent = t('studio.themeEditor.pinned');
      chip.classList.add('is-pinned');
    });
    return row;
  }

  // --- tabs --------------------------------------------------------------------

  function axisTab() {
    const wrap = document.createElement('div');
    const grid = document.createElement('div');
    grid.className = 'axis-grid';
    for (const axis of AXES) {
      const row = document.createElement('label');
      row.className = 'axis-row';
      const label = document.createElement('span');
      label.textContent = t(`studio.themeEditor.axis.${axis}`);
      const input = document.createElement('input');
      input.type = 'range';
      input.min = '0';
      input.max = '1';
      input.step = '0.05';
      input.value = String(draft.axes[axis]);
      const value = document.createElement('span');
      value.className = 'axis-value';
      value.textContent = fmtNumber(draft.axes[axis]);
      input.addEventListener('input', () => {
        draft.axes[axis] = Number(input.value);
        value.textContent = fmtNumber(input.value);
        refreshAuto();
      });
      row.title = t(`studio.themeEditor.axisHint.${axis}`);
      row.appendChild(label);
      row.appendChild(input);
      row.appendChild(value);
      grid.appendChild(row);
    }
    wrap.appendChild(grid);

    const tools = document.createElement('div');
    tools.className = 'insp-actions';
    tools.appendChild(
      smallButton(t('studio.themeEditor.randomAxes'), () => {
        const r = Math.random;
        const next = {};
        for (const axis of SA.moods.MATCH_AXES) next[axis] = Math.max(0, Math.min(1, Number(draft.axes[axis] == null ? 0.5 : draft.axes[axis]) + (r() * 2 - 1) * 0.12));
        draft.axes = keepWeird(next);
        draft.features = null;
        render();
      })
    );
    tools.appendChild(
      smallButton(t('studio.themeEditor.fromAudio'), () => {
        const analysis = SA.preview.getAudioAnalysis ? SA.preview.getAudioAnalysis() : null;
        if (!analysis) {
          SA.studio.toast('studio.themeEditor.noAudio');
          return;
        }
        draft.axes = keepWeird(SA.moods.axesFromAudio(SA.audioAnalysis.features(analysis)));
        draft.direction = 'horizontal';
        draft.features = SA.audioAnalysis.features(analysis);
        render();
      })
    );
    wrap.appendChild(tools);
    if (draft.features) {
      const info = document.createElement('div');
      info.className = 'theme-editor-info';
      const percent = (value) => `${Math.round((Number(value) || 0) * 100)}%`;
      info.textContent = t('studio.themeEditor.detected', {
        bpm: draft.features.bpm ? draft.features.bpm : '—',
        energy: percent(draft.features.energy),
        brightness: percent(draft.features.brightness),
      });
      wrap.appendChild(info);
    }
    if (SA.keywords && SA.keywords.globallyEnabled()) wrap.appendChild(keywordsBlock());

    heading(wrap, 'studio.themeEditor.other', 'insp-inherit');
    buildParamGroups(wrap, 'axis');
    return wrap;
  }

  function keywordsBlock() {
    const node = document.createElement('div');
    node.className = 'axis-grid';
    const enabledRow = document.createElement('label');
    enabledRow.className = 'ctrl-bool-row';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = draft.keywords.enabled !== false;
    box.addEventListener('change', () => {
      draft.keywords.enabled = box.checked;
    });
    const text = document.createElement('span');
    text.textContent = t('studio.themeEditor.keywords.enabled');
    enabledRow.appendChild(box);
    enabledRow.appendChild(text);
    node.appendChild(enabledRow);
    for (const key of ['extra', 'exclude']) {
      const row = document.createElement('div');
      row.className = 'ctrl-row';
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = t(`studio.themeEditor.keywords.${key}`);
      input.value = draft.keywords[key];
      input.addEventListener('input', () => {
        draft.keywords[key] = input.value;
      });
      input.addEventListener('keydown', (event) => event.stopPropagation());
      row.appendChild(input);
      node.appendChild(row);
    }
    node.title = t('studio.themeEditor.keywords.hint');
    return node;
  }

  // --- decorative colours tab --------------------------------------------------
  // The Theme's embedded colours (fire/metal/chrome ramps, lights, figure
  // tones, effect pairs, filler tones): auto rows follow the palette and the
  // weird axis through SA.themeColors; a set row pins that colour on
  // styleMode.embedded and the render path prefers it over the derived table.

  function autoColorsTable() {
    if (!SA.themeColors || typeof SA.themeColors.embeddedFor !== 'function') return null;
    const colors = draft && draft.palette && Array.isArray(draft.palette.colors) ? draft.palette.colors : [];
    if (!colors.length) return null;
    try {
      return SA.themeColors.embeddedFor(colors, (draft.axes && draft.axes.weird) || 0);
    } catch {
      return null;
    }
  }

  function normalizeHex(value) {
    if (typeof value !== 'string') return null;
    const hex = value.trim().toLowerCase();
    if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/.test(hex)) return hex.slice(0, 7);
    return null;
  }

  // Drop overrides identical to the auto table so redundant pins neither
  // bloat saved documents nor freeze a colour across palette re-rolls.
  function pruneEmbedded(over, table) {
    const out = {};
    if (!over || typeof over !== 'object') return out;
    const sameList = (key) => {
      const auto = table && Array.isArray(table[key]) ? table[key] : null;
      const list = Array.isArray(over[key]) ? over[key] : null;
      if (!list || !auto || list.length !== auto.length) return false;
      return list.every((hex, i) => normalizeHex(hex) === auto[i]);
    };
    for (const key of ['ember', 'metal', 'chrome', 'stone']) {
      if (Array.isArray(over[key]) && over[key].length && !sameList(key)) out[key] = over[key].slice();
    }
    for (const key of ['flare', 'flash', 'streak', 'shape']) {
      const hex = normalizeHex(over[key]);
      if (hex && (!table || table[key] !== hex)) out[key] = hex;
    }
    if (Array.isArray(over.figEmbed) && over.figEmbed.length && !sameList('figEmbed')) out.figEmbed = over.figEmbed.slice();
    if (Array.isArray(over.fxPairs) && over.fxPairs.length === 3) {
      const auto = table && table.fxPairs;
      const same = auto && over.fxPairs.every((pair, i) => Array.isArray(pair) && pair.length === 2 &&
        pair.every((hex, j) => normalizeHex(hex) === (auto[i] && auto[i][j])));
      if (!same) out.fxPairs = over.fxPairs.map((pair) => pair.slice());
    }
    if (over.filler && typeof over.filler === 'object') {
      const kinds = {};
      for (const [kind, hex] of Object.entries(over.filler)) {
        const clean = normalizeHex(hex);
        if (!clean) continue;
        const auto = table && typeof table.fillerFor === 'function' ? table.fillerFor(kind) : null;
        if (auto !== clean) kinds[kind] = clean;
      }
      if (Object.keys(kinds).length) out.filler = kinds;
    }
    return out;
  }

  function colorsTab() {
    const wrap = document.createElement('div');
    wrap.className = 'theme-colors-tab';
    heading(wrap, 'studio.themeEditor.colors.title', 'insp-inherit');
    const note = document.createElement('div');
    note.className = 'insp-inherit';
    note.textContent = t('studio.themeEditor.colors.hint');
    wrap.appendChild(note);
    const table = autoColorsTable();
    const over = draft.embedded && typeof draft.embedded === 'object'
      ? draft.embedded
      : (draft.embedded = {});
    const autoList = (key, fallbackCount) => {
      const list = table && Array.isArray(table[key]) ? table[key] : null;
      if (list && list.length) return list;
      return Array.from({ length: fallbackCount }, () => '#888888');
    };
    const autoHex = (key) => (table && typeof table[key] === 'string' ? table[key] : '#888888');

    const well = (hex, title, onPick) => {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'palette-dot palette-dot-edit';
      if (SA.colors && typeof SA.colors.paintSwatch === 'function') SA.colors.paintSwatch(swatch, hex);
      else swatch.style.background = hex;
      swatch.title = title || hex;
      swatch.addEventListener('click', () => {
        if (!SA.colors || typeof SA.colors.openPicker !== 'function') return;
        SA.colors.openPicker({
          value: hex,
          anchor: swatch,
          onChange(next) {
            const raw = (SA.colors.pickerValueToHex && SA.colors.pickerValueToHex(next))
              || (typeof next === 'string' ? next : next && next.value ? next.value : null);
            const value = normalizeHex(raw);
            if (!value) return;
            onPick(value);
            render();
          },
        });
      });
      return swatch;
    };

    const listRow = (labelKey, key, count) => {
      const row = document.createElement('div');
      row.className = 'palette-set-row';
      const label = document.createElement('span');
      label.className = 'palette-role';
      label.textContent = t(`studio.themeEditor.colors.${labelKey}`);
      row.appendChild(label);
      const swatches = document.createElement('span');
      swatches.className = 'palette-swatches';
      const auto = autoList(key, count);
      for (let i = 0; i < count; i += 1) {
        const fallback = auto[i] || '#888888';
        const current = Array.isArray(over[key]) ? over[key][i] : null;
        const shown = normalizeHex(current) || fallback;
        swatches.appendChild(well(shown, `${shown} · ${t('studio.themeEditor.colors.auto')}: ${fallback}`, (value) => {
          const next = Array.isArray(over[key]) ? over[key].slice() : [];
          while (next.length < count) next.push(auto[next.length] || '#888888');
          next[i] = value;
          over[key] = next;
        }));
      }
      row.appendChild(swatches);
      const reset = smallButton('↻', () => {
        delete over[key];
        render();
      });
      reset.title = t('studio.themeEditor.colors.resetRow');
      row.appendChild(reset);
      return row;
    };

    const singleRow = (labelKey, key) => {
      const row = document.createElement('div');
      row.className = 'palette-set-row';
      const label = document.createElement('span');
      label.className = 'palette-role';
      label.textContent = t(`studio.themeEditor.colors.${labelKey}`);
      row.appendChild(label);
      const swatches = document.createElement('span');
      swatches.className = 'palette-swatches';
      const fallback = autoHex(key);
      const shown = normalizeHex(over[key]) || fallback;
      swatches.appendChild(well(shown, `${shown} · ${t('studio.themeEditor.colors.auto')}: ${fallback}`, (value) => {
        over[key] = value;
      }));
      row.appendChild(swatches);
      const reset = smallButton('↻', () => {
        delete over[key];
        render();
      });
      reset.title = t('studio.themeEditor.colors.resetRow');
      row.appendChild(reset);
      return row;
    };

    const group = (labelKey) => heading(wrap, `studio.themeEditor.colors.${labelKey}`, 'insp-inherit');
    group('fire');
    wrap.appendChild(listRow('fire', 'ember', 4));
    group('metal');
    wrap.appendChild(listRow('metal', 'metal', 3));
    group('chrome');
    wrap.appendChild(listRow('chrome', 'chrome', 3));
    wrap.appendChild(listRow('stone', 'stone', 2));
    group('lights');
    for (const key of ['flare', 'flash', 'streak', 'shape']) wrap.appendChild(singleRow(key, key));
    group('figures');
    wrap.appendChild(listRow('figures', 'figEmbed', 5));
    group('pairs');
    for (let i = 0; i < 3; i += 1) {
      const row = document.createElement('div');
      row.className = 'palette-set-row';
      const label = document.createElement('span');
      label.className = 'palette-role';
      label.textContent = `${t('studio.themeEditor.colors.pairs')} ${i + 1}`;
      row.appendChild(label);
      const swatches = document.createElement('span');
      swatches.className = 'palette-swatches';
      const auto = (table && table.fxPairs && table.fxPairs[i]) || ['#888888', '#888888'];
      const current = Array.isArray(over.fxPairs) ? over.fxPairs[i] : null;
      for (let j = 0; j < 2; j += 1) {
        const fallback = auto[j] || '#888888';
        const shown = (current && normalizeHex(current[j])) || fallback;
        swatches.appendChild(well(shown, `${shown} · ${t('studio.themeEditor.colors.auto')}: ${fallback}`, (value) => {
          const next = Array.isArray(over.fxPairs) ? over.fxPairs.map((pair) => pair.slice()) : [];
          while (next.length < 3) {
            const seed = (table && table.fxPairs && table.fxPairs[next.length]) || ['#888888', '#888888'];
            next.push(seed.slice());
          }
          next[i][j] = value;
          over.fxPairs = next;
        }));
      }
      row.appendChild(swatches);
      const reset = smallButton('↻', () => {
        if (Array.isArray(over.fxPairs)) {
          delete over.fxPairs;
          if (!Object.keys(over).length) draft.embedded = {};
        }
        render();
      });
      reset.title = t('studio.themeEditor.colors.resetRow');
      row.appendChild(reset);
      wrap.appendChild(row);
    }
    group('fillers');
    const kinds = (SA.themeColors && SA.themeColors.FILLER_KINDS) || ['spectrum', 'waveform', 'sineWave', 'particles', 'shapes', 'pattern', 'timer', 'text'];
    for (const kind of kinds) {
      const row = document.createElement('div');
      row.className = 'palette-set-row';
      const label = document.createElement('span');
      label.className = 'palette-role';
      label.textContent = kind;
      row.appendChild(label);
      const swatches = document.createElement('span');
      swatches.className = 'palette-swatches';
      const fallback = (table && typeof table.fillerFor === 'function' && table.fillerFor(kind)) || '#888888';
      const shown = (over.filler && normalizeHex(over.filler[kind])) || fallback;
      swatches.appendChild(well(shown, `${shown} · ${t('studio.themeEditor.colors.auto')}: ${fallback}`, (value) => {
        over.filler = { ...(over.filler || {}) };
        over.filler[kind] = value;
      }));
      row.appendChild(swatches);
      const reset = smallButton('↻', () => {
        if (over.filler) {
          delete over.filler[kind];
          if (!Object.keys(over.filler).length) delete over.filler;
        }
        render();
      });
      reset.title = t('studio.themeEditor.colors.resetRow');
      row.appendChild(reset);
      wrap.appendChild(row);
    }
    const all = document.createElement('div');
    all.className = 'insp-actions';
    all.appendChild(smallButton(t('studio.themeEditor.colors.resetAll'), () => {
      draft.embedded = {};
      render();
    }));
    wrap.appendChild(all);
    return wrap;
  }

  // The swatch strip of one extra palette of the set: a fixed colour count,
  // click to edit. Editing a colour or re-rolling claims the palette as the
  // user's own (the auto marker drops, so a generated run keeps it).
  function swatchRow(entry, index, set) {
    const row = document.createElement('div');
    row.className = 'palette-set-row';
    const label = document.createElement('span');
    label.className = 'palette-role';
    label.textContent = `#${index + 2}`;
    const extraHint = hintText('studio.themeEditor.hint.extraPalette');
    if (extraHint) label.title = extraHint;
    row.appendChild(label);
    const swatches = document.createElement('span');
    swatches.className = 'palette-swatches';
    (entry.colors || []).forEach((hex, colorIndex) => {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'palette-dot palette-dot-edit';
      if (SA.colors && typeof SA.colors.paintSwatch === 'function') SA.colors.paintSwatch(swatch, hex);
      else swatch.style.background = hex;
      swatch.title = `${hex} — ${t('studio.inspector.paletteEdit')}`;
      swatch.addEventListener('click', () => {
        SA.colors.openPicker({
          value: hex,
          anchor: swatch,
          onChange(next) {
            const value = (SA.colors.pickerValueToHex && SA.colors.pickerValueToHex(next))
              || (typeof next === 'string' ? next : next && next.value ? next.value : null);
            if (!value) return;
            entry.colors[colorIndex] = value;
            delete entry.auto;
            render();
          },
        });
      });
      swatches.appendChild(swatch);
    });
    row.appendChild(swatches);
    // ↻ keeps the palette's theme (a colour variant of it), 🎲 draws a new one
    const spin = smallButton('↻', () => {
      const edgeIndex = SA.moods && typeof SA.moods.edgeIndexOf === 'function' ? SA.moods.edgeIndexOf(entry.colors) : -1;
      const jittered = SA.moods.jitterPalette(Math.random, { colors: entry.colors }, draft.axes, 2.5, null, { edgeIndex });
      if (jittered && Array.isArray(jittered.colors)) entry.colors = jittered.colors;
      delete entry.auto;
      render();
    });
    spin.title = t('studio.themeEditor.paletteSpin');
    row.appendChild(spin);
    const reroll = smallButton('🎲', () => {
      const next = SA.colors.randomPalette((entry.colors || []).length || (draft.palette.colors || []).length);
      entry.colors = next.colors;
      if (entry.id == null) entry.id = next.id;
      if (entry.name == null) entry.name = next.name;
      delete entry.auto;
      render();
    });
    reroll.title = t('studio.themeEditor.paletteRandom');
    row.appendChild(reroll);
    const fix = smallButton('◐', () => {
      if (SA.paletteDialog && typeof SA.paletteDialog.fixContrast === 'function') {
        for (let index = 1; index < entry.colors.length; index += 1) SA.paletteDialog.fixContrast(entry.colors, index);
      }
      delete entry.auto;
      render();
    });
    fix.title = t('palette.contrastFix');
    row.appendChild(fix);
    const remove = smallButton('✕', () => {
      set.extra.splice(index, 1);
      render();
    });
    remove.title = t('studio.themeEditor.usePalettes.remove');
    row.appendChild(remove);
    return row;
  }

  function paletteTab() {
    const wrap = document.createElement('div');
    heading(wrap, 'studio.themeEditor.palette');
    const editor = SA.paletteDialog && typeof SA.paletteDialog.editorNode === 'function'
      ? SA.paletteDialog.editorNode(draft.palette, () => {})
      : null;
    if (editor) wrap.appendChild(editor);
    const actions = document.createElement('div');
    actions.className = 'insp-actions';
    actions.appendChild(
      smallButton(`🎲 ${t('studio.themeEditor.paletteRandom')}`, () => {
        const next = SA.colors.randomPalette((draft.palette.colors || []).length);
        draft.palette = { id: next.id, name: next.name, colors: next.colors };
        draft.paletteReplace = true;
        render();
      }, false, 'studio.themeEditor.hint.paletteRandom')
    );
    actions.appendChild(
      smallButton(`↻ ${t('studio.themeEditor.paletteSpin')}`, () => {
        const edgeIndex = SA.moods && typeof SA.moods.edgeIndexOf === 'function' ? SA.moods.edgeIndexOf(draft.palette.colors) : -1;
        const jittered = SA.moods.jitterPalette(Math.random, draft.palette, draft.axes, 2.5, null, { edgeIndex });
        if (jittered && Array.isArray(jittered.colors)) draft.palette = { ...draft.palette, colors: jittered.colors.slice() };
        draft.paletteReplace = true;
        render();
      }, false, 'studio.themeEditor.hint.paletteSpin')
    );
    const fromSelect = SA.controls.selectControl({}, '', (value) => {
      if (!value) return;
      const entry = SA.colors.allPalettes().find((item) => item.id === value);
      if (!entry) return;
      draft.palette = { id: entry.id, name: entry.name, colors: [...entry.colors] };
      draft.paletteReplace = true;
      render();
    }, [
      { value: '', label: t('studio.themeEditor.paletteFrom') },
      ...SA.colors.allPalettes().map((entry) => ({ value: entry.id, label: entry.name })),
    ]);
    if (fromSelect && fromSelect.title !== undefined) {
      const fromHint = hintText('studio.themeEditor.hint.paletteFrom');
      if (fromHint) fromSelect.title = fromHint;
    }
    actions.appendChild(fromSelect);
    // the visual preset browser next to the library select: ~40 entries are
    // hard to scan in a dropdown, so this opens the strip + name list
    actions.appendChild(
      smallButton(`✦ ${t('studio.inspector.selectPreset')}`, (event) => {
        if (!SA.colors || typeof SA.colors.openPresetPicker !== 'function') return;
        SA.colors.openPresetPicker({
          anchor: event && event.currentTarget ? event.currentTarget : null,
          selectedId: draft.palette && draft.palette.id,
          onPick(entry) {
            draft.palette = { id: entry.id, name: entry.name, colors: [...entry.colors] };
            draft.paletteReplace = true;
            render();
          },
        });
      }, false, t('studio.themeEditor.paletteFrom'))
    );
    wrap.appendChild(actions);

    // palette-only apply: its own row so the crowded lottery row stays readable
    const applyRow = document.createElement('div');
    applyRow.className = 'insp-actions';
    applyRow.appendChild(
      smallButton(t('studio.themeEditor.paletteApplyOnly'), () => {
        applyPaletteOnly();
      }, true, 'studio.themeEditor.hint.paletteApplyOnly')
    );
    wrap.appendChild(applyRow);

    // the palette set: #1 above plus up to `max - 1` extra palettes, the
    // per-beat switch chance and the role-invert chance
    heading(wrap, 'studio.themeEditor.paletteSet');
    const set = draft.paletteSet || (draft.paletteSet = { max: 5, change: 0.5, invert: 0.2, extra: [] });
    const setHint = document.createElement('div');
    setHint.className = 'insp-inherit';
    setHint.textContent = t('studio.themeEditor.paletteSetHint');
    wrap.appendChild(setHint);
    const numberRow = (labelKey, key, def) => {
      const row = document.createElement('label');
      row.className = 'axis-row';
      const label = document.createElement('span');
      label.textContent = t(labelKey);
      const rowHintKey = key === 'max' ? 'studio.themeEditor.hint.paletteMax' : key === 'change' ? 'studio.themeEditor.hint.paletteChange' : key === 'invert' ? 'studio.themeEditor.hint.paletteInvert' : '';
      const rowHint = rowHintKey ? hintText(rowHintKey) : '';
      if (rowHint) {
        label.title = rowHint;
        row.title = rowHint;
      }
      row.appendChild(label);
      row.appendChild(
        SA.controls.numberControl(def, set[key], (value) => {
          set[key] = value;
          if (key === 'max') {
            // the stored extras are never cut here: lowering the maximum keeps
            // every palette (only the first max - 1 are in play), so raising it
            // again brings them back instead of losing a user's edit
            set.max = Math.max(1, Math.min(8, Math.round(value)));
            render();
          }
        })
      );
      return row;
    };
    wrap.appendChild(numberRow('studio.themeEditor.paletteMax', 'max', { min: 1, max: 8, step: 1, default: 5 }));
    wrap.appendChild(numberRow('studio.themeEditor.paletteChange', 'change', { min: 0, max: 1, step: 0.05, default: 0.5 }));
    wrap.appendChild(numberRow('studio.themeEditor.paletteInvert', 'invert', { min: 0, max: 1, step: 0.05, default: 0.2 }));
    set.extra.forEach((entry, index) => {
      if (!entry || !Array.isArray(entry.colors)) return;
      wrap.appendChild(swatchRow(entry, index, set));
    });
    const addRow = document.createElement('div');
    addRow.className = 'insp-actions';
    const add = smallButton(t('studio.themeEditor.paletteAdd'), () => {
      const next = SA.moods.generatePalette(Math.random, draft.axes);
      const colors = next.colors.slice(0, SA.paletteRoles.SIZE);
      set.extra.push({ id: next.id, name: next.name, colors });
      render();
    }, false, 'studio.themeEditor.hint.paletteAdd');
    add.disabled = set.extra.length >= set.max - 1;
    addRow.appendChild(add);
    wrap.appendChild(addRow);

    // use-palettes: the automatic direction draws the cue palettes from these
    heading(wrap, 'studio.themeEditor.usePalettes.title', 'insp-inherit');
    if (!draft.usePalettes.length) {
      const empty = document.createElement('div');
      empty.className = 'insp-inherit';
      empty.textContent = t('studio.themeEditor.usePalettes.empty');
      const poolHint = hintText('studio.themeEditor.hint.usePalettesTitle');
      if (poolHint) empty.title = poolHint;
      wrap.appendChild(empty);
    }
    const cards = document.createElement('div');
    cards.className = 'use-palette-list';
    draft.usePalettes.forEach((entry, index) => {
      const card = document.createElement('div');
      card.className = 'use-palette-card';
      card.title = (entry.colors || []).join(', ');
      const strip = document.createElement('span');
      strip.className = 'use-palette-strip';
      for (const color of (entry.colors || []).slice(0, (typeof SA !== 'undefined' && SA.paletteRoles && SA.paletteRoles.SIZE) || 12)) {
        const dot = document.createElement('i');
        dot.style.background = color;
        strip.appendChild(dot);
      }
      card.appendChild(strip);
      const name = document.createElement('span');
      name.className = 'use-palette-name';
      name.textContent = entry.name || entry.id || 'palette';
      card.appendChild(name);
      const remove = smallButton('✕', () => {
        draft.usePalettes.splice(index, 1);
        render();
      });
      remove.title = t('studio.themeEditor.usePalettes.remove');
      card.appendChild(remove);
      cards.appendChild(card);
    });
    wrap.appendChild(cards);
    const useActions = document.createElement('div');
    useActions.className = 'insp-actions';
    useActions.appendChild(
      smallButton(t('studio.themeEditor.usePalettes.addCurrent'), () => {
        draft.usePalettes.push({ id: draft.palette.id, name: draft.palette.name, colors: draft.palette.colors.slice() });
        render();
      }, false, 'studio.themeEditor.hint.usePalettesTitle')
    );
    useActions.appendChild(
      smallButton(t('studio.themeEditor.usePalettes.addCandidates'), () => {
        for (let i = 0; i < 4; i += 1) {
          const next = SA.colors.randomPalette((draft.palette.colors || []).length);
          draft.usePalettes.push({ id: next.id, name: next.name, colors: next.colors });
        }
        render();
      }, false, 'studio.themeEditor.hint.usePalettesTitle')
    );
    useActions.appendChild(
      SA.controls.selectControl({}, '', (value) => {
        if (!value) return;
        const entry = SA.colors.allPalettes().find((item) => item.id === value);
        if (!entry) return;
        draft.usePalettes.push({ id: entry.id, name: entry.name, colors: [...entry.colors] });
        render();
      }, [
        { value: '', label: t('studio.themeEditor.usePalettes.addLibrary') },
        ...SA.colors.allPalettes().map((entry) => ({ value: entry.id, label: entry.name })),
      ])
    );
    useActions.appendChild(
      smallButton(`✦ ${t('studio.inspector.selectPreset')}`, (event) => {
        if (!SA.colors || typeof SA.colors.openPresetPicker !== 'function') return;
        SA.colors.openPresetPicker({
          anchor: event && event.currentTarget ? event.currentTarget : null,
          onPick(entry) {
            draft.usePalettes.push({ id: entry.id, name: entry.name, colors: [...entry.colors] });
            render();
          },
        });
      }, false, t('studio.themeEditor.usePalettes.addLibrary'))
    );
    wrap.appendChild(useActions);

    // colour probabilities + backdrop planes: straight from the parameter table
    buildParamGroups(wrap, 'palette');
    return wrap;
  }

  function fontTab() {
    const wrap = document.createElement('div');
    heading(wrap, 'studio.themeEditor.sizeCurve');
    const curve = document.createElement('div');
    curve.className = 'size-curve';
    sizeBars = [];
    for (let k = 0; k < 10; k += 1) {
      const bar = document.createElement('i');
      curve.appendChild(bar);
      sizeBars.push(bar);
    }
    wrap.appendChild(curve);
    buildParamGroups(wrap, 'font');
    const actions = document.createElement('div');
    actions.className = 'insp-actions';
    actions.appendChild(smallButton(t('fonts.title'), () => SA.fontsDialog.open()));
    wrap.appendChild(actions);
    return wrap;
  }

  // The automatic share of a type: moods.score × the genre affinity, divided by
  // the group maximum (0..1).
  function autoShares(group) {
    const pool = SA.moods.poolFor(group, draft.axes) || {};
    const genre = draft.genre && SA.genres ? SA.genres.get(draft.genre) : null;
    const scores = {};
    let max = 0;
    for (const [type, traits] of Object.entries(pool)) {
      if (!Array.isArray(traits)) continue;
      let score = 1;
      try {
        score = Number(SA.moods.score(traits, draft.axes, group, type)) || 0;
      } catch {
        score = 0;
      }
      const affinity = SA.genres && typeof SA.genres.affinity === 'function' ? Math.max(0, Number(SA.genres.affinity(genre, group, type)) || 0) : 1;
      const value = score * affinity;
      scores[type] = value;
      if (value > max) max = value;
    }
    const out = {};
    for (const [type, value] of Object.entries(scores)) out[type] = max > 0 ? value / max : 0;
    return out;
  }

  function fxTab() {
    const wrap = document.createElement('div');
    const hint = document.createElement('div');
    hint.className = 'insp-inherit';
    hint.textContent = t('studio.themeEditor.paramHint.weights');
    wrap.appendChild(hint);
    for (const group of FX_GROUPS) {
      const details = document.createElement('details');
      details.className = 'theme-group';
      const summary = document.createElement('summary');
      summary.textContent = t(FX_GROUP_LABEL[group]);
      details.appendChild(summary);
      const body = document.createElement('div');
      body.className = 'theme-group-body';
      const shares = autoShares(group);
      const types = SA.fx.list(group, UI_PACKS).map((descriptor) => descriptor.type);
      for (const type of types) body.appendChild(typeRow(group, type, shares[type] == null ? 0 : shares[type]));
      details.appendChild(body);
      wrap.appendChild(details);
    }
    return wrap;
  }

  // --- refresh -----------------------------------------------------------------

  function refreshAuto() {
    if (!draft || !SA.genParams) return;
    const auto = deriveAll();
    for (const entry of autoRows) {
      if (entry.get() != null) continue;
      if (auto[entry.key] != null) entry.update(auto[entry.key]);
    }
    const resolved = resolveAll();
    if (sizeBars.length) {
      const weights = SA.weird.sizeWeights(10, resolved.sizeCenter, resolved.sizeSpread);
      const max = Math.max(...weights);
      sizeBars.forEach((bar, index) => {
        bar.style.height = `${Math.max(4, Math.round((weights[index] / max) * 100))}%`;
      });
    }
    for (const group of weightGroups) {
      const chances = SA.genParams.normalizeChances(resolved, group.keys) || {};
      for (const [key, node] of group.nodes) {
        node.textContent = `${Math.round((chances[key] || 0) * 100)}%`;
      }
    }
  }

  // --- render ------------------------------------------------------------------

  // Editor content shared by the standalone dialog and the combined
  // Theme-dialog right pane. `embedded` omits the outer .dialog frame and
  // the Close button (the combined dialog owns them).
  function buildEditorContent(embedded) {
    const dialog = document.createElement('div');
    dialog.className = embedded ? 'theme-editor-inner' : 'dialog dialog-wide theme-editor';

    // header: name, seed, new seed
    const tools = document.createElement('div');
    tools.className = 'theme-editor-tools';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'theme-name-input';
    nameInput.value = draft.name;
    nameInput.addEventListener('input', () => {
      draft.name = nameInput.value;
    });
    const seedInput = document.createElement('input');
    seedInput.type = 'number';
    seedInput.className = 'theme-seed-input';
    seedInput.value = String(draft.seed);
    seedInput.title = t('studio.random.seed');
    seedInput.addEventListener('change', () => {
      draft.seed = Number(seedInput.value) || draft.seed;
    });
    const reroll = smallButton(t('studio.themeEditor.reroll'), () => {
      draft.seed = seedNow();
      seedInput.value = String(draft.seed);
    });
    tools.appendChild(nameInput);
    tools.appendChild(seedInput);
    tools.appendChild(reroll);
    dialog.appendChild(tools);

    // tabs
    const tabs = document.createElement('div');
    tabs.className = 'theme-tabs';
    for (const id of TABS) {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = `btn btn-mini theme-tab${draft.tab === id ? ' is-active' : ''}`;
      tab.textContent = t(`studio.themeEditor.tab.${id}`);
      if (id === 'palette') {
        const tabHint = hintText('studio.themeEditor.hint.tab');
        if (tabHint) tab.title = tabHint;
      }
      tab.addEventListener('click', () => {
        draft.tab = id;
        render();
      });
      tabs.appendChild(tab);
    }
    dialog.appendChild(tabs);

    const body = document.createElement('div');
    body.className = 'theme-editor-body';
    if (draft.tab === 'palette') body.appendChild(paletteTab());
    else if (draft.tab === 'font') body.appendChild(fontTab());
    else if (draft.tab === 'fx') body.appendChild(fxTab());
    else if (draft.tab === 'colors') body.appendChild(colorsTab());
    else body.appendChild(axisTab());
    dialog.appendChild(body);

    // footer actions
    const actions = document.createElement('div');
    actions.className = 'dialog-actions';
    actions.appendChild(smallButton(t('studio.themes.apply'), () => applyDraft(), true));
    actions.appendChild(smallButton(t('studio.themeEditor.save'), () => saveDraft()));
    actions.appendChild(smallButton(t('studio.themeEditor.reset'), () => resetDraft()));
    if (!embedded) {
      actions.appendChild(smallButton(t('studio.themes.close'), () => {
        if (root) root.hidden = true;
      }));
    }
    dialog.appendChild(actions);

    return dialog;
  }

  function render() {
    if (!draft) return;
    autoRows = [];
    sizeBars = [];
    weightGroups = [];
    // combined dialog: draw into the right pane, keep the list visible
    if (embedHost) {
      embedHost.innerHTML = '';
      embedHost.appendChild(buildEditorContent(true));
      refreshAuto();
      return;
    }
    if (!root) return;
    root.innerHTML = '';
    root.hidden = false;
    root.appendChild(buildEditorContent(false));
    refreshAuto();
  }

  // --- actions -----------------------------------------------------------------

  // Palette-only apply: the base palette reaches every cue/beat at once
  // (propagate unifies cue/beat-owned palettes), but nothing is locked:
  // cues/beats keep inheriting the project palette, so later draws can
  // still vary them.
  function applyPaletteOnly() {
    const doc = project();
    if (!doc || !draft || !draft.palette || !Array.isArray(draft.palette.colors) || !draft.palette.colors.length) return false;
    SA.store.commands.setPalette(
      'project',
      { id: draft.palette.id, name: draft.palette.name, colors: draft.palette.colors.slice() },
      { label: 'apply theme palette only', propagate: true }
    );
    draft.paletteReplace = false;
    SA.studio.toast('studio.toast.presetApplied', { name: draft.palette.name || draft.palette.id });
    return true;
  }

  function applyDraft() {
    const doc = project();
    if (!doc) return false;
    const profile = profileOf();
    const current = (doc.style && doc.style.palette && doc.style.palette.colors) || [];
    const paletteReplaced = !!draft.paletteReplace;
    const colorsDiffer = JSON.stringify(current) !== JSON.stringify(draft.palette.colors);
    if (paletteReplaced || colorsDiffer) {
      SA.store.commands.setPalette(
        'project',
        { id: draft.palette.id, name: draft.palette.name, colors: draft.palette.colors.slice() },
        // manual full replacement unifies every cue; a mere swatch tweak keeps
        // per-cue variation
        paletteReplaced ? { label: 'apply theme palette', propagate: true } : { label: 'apply theme palette' }
      );
    }
    draft.paletteReplace = false;
    SA.store.dispatch({
      label: 'apply profile',
      areas: ['style'],
      do(projectDoc) {
        const mode = projectDoc.styleMode || (projectDoc.styleMode = {});
        mode.axes = SA.moods.normalizeAxes(draft.axes);
        mode.direction = draft.direction;
        mode.genre = draft.genre || null;
        mode.seed = draft.seed;
        mode.keywords = {
          enabled: draft.keywords.enabled !== false,
          extra: SA.keywords.cleanList(draft.keywords.extra),
          exclude: SA.keywords.cleanList(draft.keywords.exclude),
        };
        if (Object.keys(profile.params).length) mode.params = { ...profile.params };
        else delete mode.params;
        const prunedEmbedded = pruneEmbedded(draft.embedded, autoColorsTable());
        if (Object.keys(prunedEmbedded).length) mode.embedded = SA.store.clone(prunedEmbedded);
        else delete mode.embedded;
        draft.embedded = prunedEmbedded;
        if (Object.keys(profile.typeWeights).length) mode.typeWeights = SA.store.clone(profile.typeWeights);
        else delete mode.typeWeights;
        if (profile.usePalettes.length) mode.usePalettes = SA.store.clone(profile.usePalettes);
        else delete mode.usePalettes;
        // the palette set lives on the style the run reads
        const source = { paletteSet: draft.paletteSet };
        const set = SA.paletteRoles && typeof SA.paletteRoles.paletteSetOf === 'function'
          ? SA.paletteRoles.paletteSetOf(source)
          : { max: 5, change: 0.5, invert: 0.2, extra: [] };
        projectDoc.style = projectDoc.style || {};
        projectDoc.style.paletteSet = {
          max: set.max,
          change: set.change,
          invert: set.invert,
          extra: SA.store.clone(Array.isArray(set.extra) ? set.extra : []),
        };
        // Values configured in Theme dialogue take precedence over existing preset styles
        if (SA.genParams && typeof SA.genParams.filterStyle === 'function') {
          projectDoc.style = SA.genParams.filterStyle(projectDoc.style, mode);
          if (draft.style) {
            const filtered = SA.genParams.filterStyle(draft.style, mode);
            projectDoc.style = SA.project.mergeDeep(projectDoc.style, filtered);
          }
          if (projectDoc.cueStyles) {
            for (const cueId of Object.keys(projectDoc.cueStyles)) {
              if (projectDoc.cueStyles[cueId]) {
                projectDoc.cueStyles[cueId] = SA.genParams.filterStyle(projectDoc.cueStyles[cueId], mode);
              }
            }
          }
        }
      },
    });
    SA.studio.toast('studio.toast.themeApplied', { name: draft.name });
    return true;
  }

  function saveDraft() {
    const doc = project();
    const profile = profileOf();
    const mode = { ...profile, axes: draft.axes };
    let style = doc && doc.style ? SA.store.clone(doc.style) : {};
    if (draft.style && SA.project && typeof SA.project.mergeDeep === 'function') {
      style = SA.project.mergeDeep(style, draft.style);
    }
    if (SA.genParams && typeof SA.genParams.filterStyle === 'function') {
      style = SA.genParams.filterStyle(style, mode);
    }
    style.paletteSet = SA.store.clone(draft.paletteSet || { max: 5, change: 0.5, invert: 0.2, extra: [] });
    const entry = draft.id
      ? SA.themes.update(draft.id, {
          name: draft.name,
          style,
          axes: { ...draft.axes },
          seed: draft.seed,
          direction: draft.direction,
          genre: draft.genre,
          profile,
        })
      : SA.themes.save(draft.name, style, { ...draft.axes }, draft.genre, profile);
    if (entry) {
      draft.id = entry.id;
      SA.studio.toast('studio.toast.themeSaved', { name: entry.name });
      if (typeof onSaved === 'function') {
        try {
          onSaved(entry);
        } catch {
          /* ignore listener errors */
        }
      }
    }
  }

  function resetDraft() {
    const axes = defaultAxes();
    const currentTab = draft ? draft.tab : 'axis';
    const defaultPalette = SA.moods && typeof SA.moods.generatePalette === 'function'
      ? SA.moods.generatePalette(Math.random, axes, 'theme')
      : { id: 'p_default', name: 'Default', colors: ['#101018', '#1b2130', '#2a3348', '#3a4356', '#f5f7ff', '#6d8cff', '#2a3348', '#101018', '#9db2ff', '#ffd7a8'] };
    draft = {
      id: null,
      name: t('studio.themes.untitled'),
      genre: null,
      direction: 'horizontal',
      axes,
      seed: seedNow(),
      params: {},
      typeWeights: {},
      palette: { id: defaultPalette.id, name: defaultPalette.name, colors: defaultPalette.colors ? defaultPalette.colors.slice() : [] },
      paletteReplace: false,
      paletteSet: {
        max: 5,
        change: 0.5,
        invert: 0.2,
        extra: [],
      },
      usePalettes: [],
      embedded: {},
      keywords: { enabled: true, extra: '', exclude: '' },
      style: null,
      tab: currentTab,
      features: null,
    };
    if (SA.studio && typeof SA.studio.toast === 'function') {
      SA.studio.toast('studio.toast.themeEditorReset');
    }
    render();
  }

  function initDraft(themeId) {
    const existing = themeId ? SA.themes.get(themeId) : null;
    const doc = project();
    const mode = (doc && doc.styleMode) || {};
    const projectAxes = mode.axes
      ? { ...SA.moods.normalizeAxes(mode.axes), weird: SA.moods.projectWeird(doc), smartness: SA.moods.projectSmartness(doc), fear: SA.moods.projectFear(doc) }
      : null;
    const axes = existing && existing.axes
      ? SA.moods.normalizeAxes({ weird: SA.moods.projectWeird(doc), smartness: SA.moods.projectSmartness(doc), fear: SA.moods.projectFear(doc), ...existing.axes })
      : projectAxes || defaultAxes();
    const seed = existing && existing.seed ? existing.seed : seedNow();
    const style = doc && doc.style ? doc.style : {};
    const currentPalette = style.palette && Array.isArray(style.palette.colors) && style.palette.colors.length
      ? SA.store.clone(style.palette)
      : SA.moods.generatePalette(Math.random, axes, 'theme');
    const profile = (existing && existing.profile) || {};
    const setSource = style.paletteSet;
    const setInfo = SA.paletteRoles && typeof SA.paletteRoles.paletteSetOf === 'function'
      ? SA.paletteRoles.paletteSetOf({ paletteSet: setSource })
      : { max: 5, change: 0.5, invert: 0.2, extra: [] };
    draft = {
      id: existing && !existing.builtin ? existing.id : null,
      name: existing ? existing.name : t('studio.themes.untitled'),
      genre: existing ? existing.genre || null : mode.genre || null,
      direction: (existing && existing.direction) || mode.direction || 'horizontal',
      axes,
      seed,
      params: { ...(profile.params || mode.params || {}) },
      typeWeights: SA.store.clone(profile.typeWeights || mode.typeWeights || {}),
      palette: { id: currentPalette.id, name: currentPalette.name, colors: currentPalette.colors.slice() },
      paletteReplace: false,
      paletteSet: {
        max: setInfo.max,
        change: setInfo.change,
        invert: setInfo.invert,
        extra: (setInfo.extra || []).map((entry) => SA.store.clone(entry)),
      },
      usePalettes: SA.store.clone(profile.usePalettes || mode.usePalettes || []),
      embedded: SA.store.clone(profile.embedded || mode.embedded || {}),
      keywords: { enabled: true, extra: '', exclude: '', ...kwFromDoc(doc) },
      style: existing && existing.style ? SA.store.clone(existing.style) : null,
      tab: draft && draft.tab ? draft.tab : 'axis',
      features: null,
    };
  }

  function open(themeId) {
    // unified dialog: the Theme list (left) + editor (right) live together
    if (SA.themes && typeof SA.themes.dialog === 'function') {
      SA.themes.dialog(themeId);
      return;
    }
    root = document.getElementById('dialog-root');
    if (!root) return;
    embedHost = null;
    onSaved = null;
    initDraft(themeId);
    render();
  }

  // Reload the editor (standalone or right pane) from another theme / project
  function load(themeId) {
    initDraft(themeId);
    render();
  }

  // Draw the editor into a host node owned by the combined dialog
  function embed(host, themeId, opts) {
    root = document.getElementById('dialog-root');
    embedHost = host || null;
    onSaved = opts && typeof opts.onSaved === 'function' ? opts.onSaved : null;
    initDraft(themeId);
    render();
  }

  function detach() {
    embedHost = null;
    onSaved = null;
  }

  return { open, load, embed, detach, getDraft: () => draft, resetDraft, applyDraft, saveDraft };
})();
