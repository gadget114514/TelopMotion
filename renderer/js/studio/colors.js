window.SA = window.SA || {};

SA.colors = (() => {
  'use strict';

  const LS_RECENT = 'sa.colors.recent';
  const LS_PALETTES = 'sa.palettes';
  // The 12 fixed palette slots (see lyrics/palette-roles.js): 0..3 mid
  // planes, 4..7 text fill / accent / edge / text background, 8..9 figures,
  // 10 backdrop spare, 11 glow.
  // The main text (index 4) keeps >= 4.5:1 against the main background
  // (index 0), so every preset reads as-is without a contrast repair.
  // The library lives in renderer/data/palettes.json; the generated UMD
  // mirror (renderer/js/studio/palettes-data.js, loaded before this file)
  // exposes it synchronously as SA.palettesData. Edit the JSON, then run
  // `node scripts/palettes-build.js` to refresh the mirror. Under Node (tests,
  // build scripts) the mirror is required directly, mirroring fx-axes.js.
  function loadBuiltinPalettes() {
    let data = (typeof SA !== 'undefined' && SA.palettesData) || null;
    if ((!data || !Array.isArray(data.palettes)) && typeof require === 'function') {
      try {
        data = require('./palettes-data.js');
      } catch {
        data = null;
      }
    }
    const list = data && Array.isArray(data.palettes) ? data.palettes : [];
    return list.map((entry) => ({ id: entry.id, name: entry.name, builtin: true, colors: [...entry.colors] }));
  }
  const BUILTIN_PALETTES = loadBuiltinPalettes();

  let popover = null;
  let onChangeHandler = null;
  // candidate palettes are deduplicated by id, and several may be drawn in the
  // same millisecond, so the serial keeps every random palette distinct
  let randomSerial = 0;

  function t(key, vars) {
    return SA.i18n.t(key, vars);
  }

  function project() {
    return SA.store.state.project;
  }

  function allPalettes() {
    const doc = project();
    const projectList = (doc && doc.palettes) || [];
    const merged = new Map();
    for (const entry of BUILTIN_PALETTES) merged.set(entry.id, { ...entry });
    for (const entry of customPalettes()) merged.set(entry.id, { ...entry, builtin: false });
    for (const entry of projectList) merged.set(entry.id, { ...entry, builtin: false });
    return [...merged.values()];
  }

  function customPalettes() {
    let stored = [];
    try {
      stored = JSON.parse(localStorage.getItem(LS_PALETTES) || '[]');
    } catch {
      stored = [];
    }
    return Array.isArray(stored) ? stored : [];
  }

  function saveCustomPalettes(list) {
    try {
      localStorage.setItem(LS_PALETTES, JSON.stringify(list));
    } catch {
      /* ignore */
    }
  }

  function recents() {
    try {
      return JSON.parse(localStorage.getItem(LS_RECENT) || '[]');
    } catch {
      return [];
    }
  }

  function pushRecent(hex) {
    if (!/^#[0-9a-f]{3,8}$/i.test(String(hex || ''))) return;
    const list = recents().filter((entry) => entry.toLowerCase() !== hex.toLowerCase());
    list.unshift(hex);
    try {
      localStorage.setItem(LS_RECENT, JSON.stringify(list.slice(0, 12)));
    } catch {
      /* ignore */
    }
  }

  function closePopover() {
    if (popover) popover.remove();
    popover = null;
    onChangeHandler = null;
  }

  function updateFromHex(hex) {
    const rgba = SA.color.parse(hex);
    return { hex: SA.color.toHex(rgba), rgba, hsv: SA.color.rgbToHsv(rgba) };
  }

  // A picker result ({ kind:'solid', value, alpha } or a plain hex string)
  // becomes the plain hex string the palette / layer / clip stores: the alpha
  // rides in the hex itself (`#RRGGBBAA`) so every plain-string slot keeps it.
  function pickerValueToHex(value) {
    if (typeof value === 'string') return value;
    if (value && typeof value.value === 'string') {
      const raw = SA.color.parse(value.value);
      const alpha = value.alpha == null ? raw.a : Number(value.alpha);
      if (alpha == null || !(alpha < 1)) return value.value;
      return SA.color.toHex({ ...raw, a: alpha });
    }
    return null;
  }

  // Paints a swatch button with a checkerboard behind translucent colours so
  // the alpha stays visible instead of blending into the panel.
  function paintSwatch(el, color) {
    if (!el) return;
    el.style.background = '';
    el.style.backgroundColor = '';
    el.style.backgroundImage = '';
    el.style.backgroundSize = '';
    el.style.backgroundPosition = '';
    let alpha = 1;
    try {
      alpha = SA.color.parse(color).a;
    } catch {
      alpha = 1;
    }
    if (alpha != null && alpha < 1) {
      el.style.backgroundImage = `linear-gradient(0deg, ${color}, ${color}), repeating-conic-gradient(#3a4050 0% 25%, #22262f 0% 50%)`;
      el.style.backgroundSize = 'auto, 8px 8px';
      el.style.backgroundPosition = '0 0, 50% 50%';
    } else {
      el.style.background = color;
    }
  }

  // --- color picker ------------------------------------------------------------

  function openPicker(options) {
    const opts = options || {};
    closePopover();
    const current = updateFromHex(opts.value || '#ffffff');
    popover = document.createElement('div');
    popover.className = 'color-popover';
    const sv = document.createElement('canvas');
    sv.width = 180;
    sv.height = 120;
    sv.className = 'color-sv';
    const hue = document.createElement('canvas');
    hue.width = 180;
    hue.height = 14;
    hue.className = 'color-hue';
    const alpha = document.createElement('input');
    alpha.type = 'range';
    alpha.min = '0';
    alpha.max = '1';
    alpha.step = '0.01';
    alpha.value = String(opts.alpha == null ? (current.rgba.a == null ? 1 : current.rgba.a) : opts.alpha);
    const hexRow = document.createElement('div');
    hexRow.className = 'color-hex-row';
    const hexInput = document.createElement('input');
    hexInput.type = 'text';
    hexInput.className = 'ctrl-hex';
    hexInput.value = current.hex;
    const rgbLabel = document.createElement('span');
    rgbLabel.className = 'color-rgb';
    const recentRow = document.createElement('div');
    recentRow.className = 'color-swatches';
    const paletteRow = document.createElement('div');
    paletteRow.className = 'color-swatches';
    const categoryRow = document.createElement('div');
    categoryRow.className = 'color-swatches';
    const buttons = document.createElement('div');
    buttons.className = 'dialog-actions';
    const apply = document.createElement('button');
    apply.type = 'button';
    apply.className = 'btn btn-primary btn-mini';
    apply.textContent = t('color.apply');
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn-mini';
    cancel.textContent = t('color.cancel');
    buttons.appendChild(cancel);
    buttons.appendChild(apply);
    let hsv = current.hsv;
    let alphaValue = Number(alpha.value);
    let hex = current.hex;

    function drawSv() {
      const ctx = sv.getContext('2d');
      const width = sv.width;
      const height = sv.height;
      for (let x = 0; x < width; x += 2) {
        for (let y = 0; y < height; y += 2) {
          const rgb = SA.color.hsvToRgb({ h: hsv.h, s: x / width, v: 1 - y / height });
          ctx.fillStyle = `rgb(${Math.round(rgb.r * 255)}, ${Math.round(rgb.g * 255)}, ${Math.round(rgb.b * 255)})`;
          ctx.fillRect(x, y, 2, 2);
        }
      }
      const markerX = hsv.s * width;
      const markerY = (1 - hsv.v) * height;
      ctx.strokeStyle = '#0b0d12';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(markerX, markerY, 5, 0, Math.PI * 2);
      ctx.stroke();
    }

    function drawHue() {
      const ctx = hue.getContext('2d');
      const gradient = ctx.createLinearGradient(0, 0, hue.width, 0);
      for (let i = 0; i <= 6; i += 1) {
        const rgb = SA.color.hsvToRgb({ h: i / 6, s: 1, v: 1 });
        gradient.addColorStop(i / 6, `rgb(${Math.round(rgb.r * 255)}, ${Math.round(rgb.g * 255)}, ${Math.round(rgb.b * 255)})`);
      }
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, hue.width, hue.height);
      ctx.strokeStyle = '#e9ecf4';
      ctx.strokeRect(hsv.h * hue.width - 1, 0, 2, hue.height);
    }

    function refresh() {
      const rgba = SA.color.hsvToRgb(hsv);
      rgba.a = alphaValue;
      hex = SA.color.toHex(rgba);
      hexInput.value = hex;
      rgbLabel.textContent = `${Math.round(rgba.r * 255)}, ${Math.round(rgba.g * 255)}, ${Math.round(rgba.b * 255)} · α ${alphaValue.toFixed(2)}`;
      drawSv();
      drawHue();
    }

    function dragCanvas(canvas, handler) {
      const run = (event) => {
        const rect = canvas.getBoundingClientRect();
        handler((event.clientX - rect.left) / Math.max(1, rect.width), (event.clientY - rect.top) / Math.max(1, rect.height));
        refresh();
      };
      canvas.addEventListener('pointerdown', (event) => {
        run(event);
        const move = (moveEvent) => run(moveEvent);
        const up = () => {
          canvas.removeEventListener('pointermove', move);
          canvas.removeEventListener('pointerup', up);
          window.removeEventListener('pointerup', up);
        };
        canvas.addEventListener('pointermove', move);
        canvas.addEventListener('pointerup', up);
        window.addEventListener('pointerup', up);
      });
    }

    dragCanvas(sv, (x, y) => {
      hsv = { ...hsv, s: Math.max(0, Math.min(1, x)), v: Math.max(0, Math.min(1, 1 - y)) };
    });
    dragCanvas(hue, (x) => {
      hsv = { ...hsv, h: Math.max(0, Math.min(1, x)) };
    });
    alpha.addEventListener('input', () => {
      alphaValue = Number(alpha.value);
      refresh();
    });
    hexInput.addEventListener('change', () => {
      const parsed = updateFromHex(hexInput.value);
      hsv = parsed.hsv;
      alphaValue = parsed.rgba.a == null ? 1 : parsed.rgba.a;
      alpha.value = String(alphaValue);
      refresh();
    });
    for (const entry of recents()) {
      const swatch = swatchButton(entry, () => {
        const parsed = updateFromHex(entry);
        hsv = parsed.hsv;
        alphaValue = parsed.rgba.a == null ? 1 : parsed.rgba.a;
        alpha.value = String(alphaValue);
        refresh();
      });
      recentRow.appendChild(swatch);
    }
    for (const palette of allPalettes()) {
      for (const color of palette.colors.slice(0, 8)) {
        paletteRow.appendChild(
          swatchButton(color, () => {
            const parsed = updateFromHex(color);
            hsv = parsed.hsv;
            alphaValue = parsed.rgba.a == null ? 1 : parsed.rgba.a;
            alpha.value = String(alphaValue);
            refresh();
          })
        );
      }
    }
    for (const [name, entry] of Object.entries(SA.project.DEFAULT_CATEGORY_COLORS)) {
      const swatch = swatchButton(entry.tint, () => {
        const parsed = updateFromHex(entry.tint);
        hsv = parsed.hsv;
        alphaValue = parsed.rgba.a == null ? 1 : parsed.rgba.a;
        alpha.value = String(alphaValue);
        refresh();
      });
      swatch.title = name;
      categoryRow.appendChild(swatch);
    }
    const eyedrop = document.createElement('button');
    eyedrop.type = 'button';
    eyedrop.className = 'btn btn-mini';
    eyedrop.textContent = t('color.eyedropper');
    eyedrop.addEventListener('click', async () => {
      if (!window.EyeDropper) return;
      try {
        const result = await new window.EyeDropper().open();
        const parsed = updateFromHex(result.sRGBHex);
        hsv = parsed.hsv;
        refresh();
      } catch {
        /* canceled */
      }
    });
    buttons.insertBefore(eyedrop, cancel);
    apply.addEventListener('click', () => {
      const rgba = SA.color.hsvToRgb(hsv);
      rgba.a = alphaValue;
      const rgbHex = SA.color.toHex({ ...rgba, a: 1 });
      const fullHex = SA.color.toHex(rgba);
      pushRecent(fullHex);
      const value = opts.gradientStop ? fullHex : { kind: 'solid', value: rgbHex, alpha: alphaValue };
      if (opts.onChange) opts.onChange(value);
      closePopover();
    });
    cancel.addEventListener('click', closePopover);
    popover.appendChild(sv);
    popover.appendChild(hue);
    popover.appendChild(alpha);
    popover.appendChild(hexRow);
    hexRow.appendChild(hexInput);
    hexRow.appendChild(rgbLabel);
    const recentLabel = document.createElement('div');
    recentLabel.className = 'insp-inherit';
    recentLabel.textContent = t('color.recent');
    const paletteLabel = document.createElement('div');
    paletteLabel.className = 'insp-inherit';
    paletteLabel.textContent = t('color.palette');
    const categoryLabel = document.createElement('div');
    categoryLabel.className = 'insp-inherit';
    categoryLabel.textContent = t('color.category');
    popover.appendChild(recentLabel);
    popover.appendChild(recentRow);
    popover.appendChild(paletteLabel);
    popover.appendChild(paletteRow);
    popover.appendChild(categoryLabel);
    popover.appendChild(categoryRow);
    // optional palette-reference slots: picking one stores { kind: 'palette', index }
    const slots = Array.isArray(opts.slots) ? opts.slots : [];
    if (slots.length && typeof opts.onSlot === 'function') {
      const slotLabel = document.createElement('div');
      slotLabel.className = 'insp-inherit';
      slotLabel.textContent = opts.slotLabel || `${t('color.palette')} P1–P${slots.length}`;
      const slotRow = document.createElement('div');
      slotRow.className = 'color-swatches';
      slots.forEach((color, index) => {
        const swatch = swatchButton(color, () => {
          opts.onSlot(index);
          closePopover();
        });
        swatch.title = `${t('color.palette')} ${index + 1} · ${color}`;
        const badge = document.createElement('span');
        badge.className = 'color-slot-index';
        badge.textContent = String(index + 1);
        swatch.appendChild(badge);
        slotRow.appendChild(swatch);
      });
      popover.appendChild(slotLabel);
      popover.appendChild(slotRow);
    }
    popover.appendChild(buttons);
    document.body.appendChild(popover);
    const rect = opts.anchor ? opts.anchor.getBoundingClientRect() : null;
    popover.style.left = `${rect ? Math.min(window.innerWidth - 230, rect.left) : 40}px`;
    refresh();
    placeInViewport(popover, rect ? rect.bottom + 6 : 60);
    void onChangeHandler;
  }

  // keeps a fixed popover (and its Apply button) on screen: it opens below
  // the anchor, moves up when it would run off the bottom, and scrolls
  // inside itself when it is taller than the window
  function placeInViewport(node, preferredTop) {
    const margin = 8;
    node.style.maxHeight = `${window.innerHeight - margin * 2}px`;
    node.style.overflowY = 'auto';
    const height = node.getBoundingClientRect().height;
    node.style.top = `${Math.max(margin, Math.min(window.innerHeight - height - margin, preferredTop))}px`;
  }

  function swatchButton(color, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'color-swatch';
    paintSwatch(button, color);
    button.title = color;
    button.addEventListener('click', onClick);
    return button;
  }

  // --- gradient editor ---------------------------------------------------------

  function normalizeGradient(value) {
    if (value && value.kind === 'gradient') {
      return {
        kind: 'gradient',
        type: value.type || 'linear',
        angle: value.angle == null ? 90 : value.angle,
        space: value.space || 'element',
        stops: (value.stops || []).map((stop, index) => ({
          pos: stop.pos == null ? index / Math.max(1, (value.stops.length - 1)) : stop.pos,
          color: typeof stop.color === 'string' ? stop.color : stop.color && stop.color.value ? stop.color.value : '#ffffff',
          alpha: stop.alpha == null ? 1 : stop.alpha,
        })),
      };
    }
    return {
      kind: 'gradient',
      type: 'linear',
      angle: 90,
      space: 'element',
      stops: [
        { pos: 0, color: '#ffffff', alpha: 1 },
        { pos: 1, color: '#ff8a3d', alpha: 1 },
      ],
    };
  }

  function openGradient(options) {
    const opts = options || {};
    closePopover();
    const state = normalizeGradient(opts.value);
    let selected = 0;
    popover = document.createElement('div');
    popover.className = 'color-popover gradient-popover';
    const head = document.createElement('div');
    head.className = 'gradient-head';
    const typeSelect = SA.controls.selectControl({}, state.type, (value) => {
      state.type = value;
      renderBar();
    }, ['linear', 'radial', 'angular'].map((value) => ({ value, label: value })));
    const angleInput = SA.controls.numberControl({ min: -180, max: 180, step: 1, default: 90 }, state.angle, (value) => {
      state.angle = value;
      renderBar();
    });
    const spaceSelect = SA.controls.selectControl({}, state.space, (value) => {
      state.space = value;
      renderBar();
    }, ['element', 'line', 'screen'].map((value) => ({ value, label: value })));
    head.appendChild(typeSelect);
    head.appendChild(angleInput);
    head.appendChild(spaceSelect);
    const bar = document.createElement('div');
    bar.className = 'gradient-bar';
    const stopList = document.createElement('div');
    stopList.className = 'gradient-stops';
    const actions = document.createElement('div');
    actions.className = 'dialog-actions';
    const addStop = document.createElement('button');
    addStop.type = 'button';
    addStop.className = 'btn btn-mini';
    addStop.textContent = t('color.addStop');
    const reverse = document.createElement('button');
    reverse.type = 'button';
    reverse.className = 'btn btn-mini';
    reverse.textContent = t('color.reverse');
    const distribute = document.createElement('button');
    distribute.type = 'button';
    distribute.className = 'btn btn-mini';
    distribute.textContent = t('color.distribute');
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'btn btn-primary btn-mini';
    save.textContent = t('color.apply');
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn-mini';
    cancel.textContent = t('color.cancel');

    function cssGradient() {
      const stops = state.stops
        .map((stop) => `${stop.color} ${Math.round(stop.pos * 100)}%`)
        .join(', ');
      return `linear-gradient(90deg, ${stops})`;
    }

    function renderBar() {
      bar.style.background = cssGradient();
      stopList.innerHTML = '';
      state.stops.forEach((stop, index) => {
        const row = document.createElement('div');
        row.className = `gradient-stop${index === selected ? ' is-active' : ''}`;
        const swatch = swatchButton(stop.color, () => {
          selected = index;
          openPicker({
            value: stop.color,
            alpha: stop.alpha,
            gradientStop: true,
            onChange(hexValue) {
              const parsed = SA.color.parse(hexValue);
              stop.color = SA.color.toHex({ ...parsed, a: 1 });
              stop.alpha = parsed.a == null ? 1 : parsed.a;
              renderBar();
            },
          });
        });
        const pos = SA.controls.numberControl({ min: 0, max: 1, step: 0.01, default: stop.pos }, stop.pos, (value) => {
          stop.pos = Math.max(0, Math.min(1, value));
          renderBar();
        });
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'btn btn-mini';
        remove.textContent = '✕';
        remove.autocomplete = 'off';
        remove.addEventListener('click', () => {
          if (state.stops.length <= 2) return;
          state.stops.splice(index, 1);
          selected = 0;
          renderBar();
        });
        row.appendChild(swatch);
        row.appendChild(pos);
        row.appendChild(remove);
        stopList.appendChild(row);
      });
    }

    addStop.addEventListener('click', () => {
      const last = state.stops[state.stops.length - 1];
      state.stops.push({ pos: Math.min(1, (last ? last.pos : 1) * 0.5), color: last ? last.color : '#ffffff', alpha: 1 });
      selected = state.stops.length - 1;
      renderBar();
    });
    reverse.addEventListener('click', () => {
      state.stops.forEach((stop) => {
        stop.pos = 1 - stop.pos;
      });
      state.stops.sort((a, b) => a.pos - b.pos);
      renderBar();
    });
    distribute.addEventListener('click', () => {
      state.stops.forEach((stop, index) => {
        stop.pos = index / Math.max(1, state.stops.length - 1);
      });
      renderBar();
    });
    save.addEventListener('click', () => {
      if (opts.onChange) opts.onChange(JSON.parse(JSON.stringify(state)));
      closePopover();
    });
    cancel.addEventListener('click', closePopover);
    bar.addEventListener('click', (event) => {
      const rect = bar.getBoundingClientRect();
      const pos = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)));
      state.stops.push({ pos, color: '#ffffff', alpha: 1 });
      state.stops.sort((a, b) => a.pos - b.pos);
      selected = state.stops.findIndex((stop) => stop.pos === pos);
      renderBar();
    });
    actions.appendChild(addStop);
    actions.appendChild(reverse);
    actions.appendChild(distribute);
    actions.appendChild(cancel);
    actions.appendChild(save);
    popover.appendChild(head);
    popover.appendChild(bar);
    popover.appendChild(stopList);
    popover.appendChild(actions);
    document.body.appendChild(popover);
    const rect = opts.anchor ? opts.anchor.getBoundingClientRect() : null;
    popover.style.left = `${rect ? Math.min(window.innerWidth - 300, rect.left) : 40}px`;
    renderBar();
    placeInViewport(popover, rect ? rect.bottom + 6 : 60);
  }

  // --- palette dialog ----------------------------------------------------------
  // The full editor lives in studio/palette-dialog.js; this stays as the entry
  // point the menu and the inspector call.

  function paletteDialog() {
    if (typeof SA.paletteDialog !== 'undefined' && SA.paletteDialog) SA.paletteDialog.open('project');
  }

  // A visual preset browser for the library palettes: one row per entry with
  // its colour strip and name. The library selects are hard to scan once the
  // list grows to ~40, so the theme editor / inspector / palette dialog open
  // this next to them. It reuses the picker popover slot (never stacks with
  // the colour picker) and closes itself once a preset is picked.
  function openPresetPicker(options) {
    const opts = options || {};
    closePopover();
    popover = document.createElement('div');
    popover.className = 'color-popover preset-popover';
    const title = document.createElement('div');
    title.className = 'preset-title';
    title.textContent = t('palette.fromLibrary');
    popover.appendChild(title);
    const list = document.createElement('div');
    list.className = 'preset-list';
    for (const entry of allPalettes()) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `preset-card${opts.selectedId && entry.id === opts.selectedId ? ' is-selected' : ''}`;
      const strip = document.createElement('span');
      strip.className = 'preset-strip';
      for (const color of (entry.colors || []).slice(0, (typeof SA !== 'undefined' && SA.paletteRoles && SA.paletteRoles.SIZE) || 12)) {
        const dot = document.createElement('i');
        paintSwatch(dot, color);
        dot.title = color;
        strip.appendChild(dot);
      }
      const name = document.createElement('span');
      name.className = 'preset-name';
      name.textContent = entry.name || entry.id;
      card.appendChild(strip);
      card.appendChild(name);
      card.title = `${entry.name || entry.id} · ${(entry.colors || []).join(', ')}`;
      card.addEventListener('click', () => {
        if (typeof opts.onPick === 'function') opts.onPick(entry);
        closePopover();
      });
      list.appendChild(card);
    }
    popover.appendChild(list);
    const actions = document.createElement('div');
    actions.className = 'dialog-actions';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn btn-mini';
    close.textContent = t('palette.close');
    close.addEventListener('click', closePopover);
    actions.appendChild(close);
    popover.appendChild(actions);
    document.body.appendChild(popover);
    const rect = opts.anchor ? opts.anchor.getBoundingClientRect() : null;
    popover.style.left = `${rect ? Math.min(window.innerWidth - 340, rect.left) : 40}px`;
    placeInViewport(popover, rect ? rect.bottom + 6 : 60);
  }

  // A palette of plain random RGB colours: no axes, roles or contrast repair.
  function randomPalette(size) {
    const channel = () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
    const count = Math.max(1, Math.round(Number(size) || 5));
    randomSerial += 1;
    const id = `random-${Date.now().toString(36)}-${randomSerial.toString(36)}`;
    return { id, name: 'Random', colors: Array.from({ length: count }, () => `#${channel()}${channel()}${channel()}`) };
  }

  return {
    randomPalette,
    BUILTIN_PALETTES,
    allPalettes,
    customPalettes,
    saveCustomPalettes,
    openPicker,
    openGradient,
    paletteDialog,
    openPresetPicker,
    closePopover,
    recents,
    pickerValueToHex,
    paintSwatch,
  };
})();
