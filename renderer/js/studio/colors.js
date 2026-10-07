window.SA = window.SA || {};

SA.colors = (() => {
  'use strict';

  const LS_RECENT = 'sa.colors.recent';
  const LS_PALETTES = 'sa.palettes';
  // The 10 fixed palette slots (see lyrics/palette-roles.js): 0..3 mid
  // planes, 4..7 text fill / accent / edge / text background, 8..9 figures.
  // The main text (index 4) keeps >= 4.5:1 against the main background
  // (index 0), so every preset reads as-is without a contrast repair.
  const BUILTIN_PALETTES = [
    { id: 'sunoDark', name: 'Suno Dark', builtin: true, colors: ['#0b0d12', '#151924', '#1b2130', '#252c3d', '#8d96ab', '#e9ecf4', '#ff8a3d', '#ff4d8d', '#0b0d12', '#151924'] },
    { id: 'neon', name: 'Neon', builtin: true, colors: ['#0d0221', '#ff2a6d', '#05d9e8', '#d1f7ff', '#7700ff', '#f9f002', '#0d0221', '#ff2a6d', '#05d9e8', '#d1f7ff'] },
    { id: 'pastel', name: 'Pastel', builtin: true, colors: ['#ffd9e8', '#c8e7ff', '#d9ffd6', '#fff3c4', '#9080b9', '#ec84a6', '#b1bace', '#ffffff', '#ffb190', '#70e3fe'] },
    { id: 'mono', name: 'Mono', builtin: true, colors: ['#0b0d12', '#2c3242', '#59617a', '#8d96ab', '#c3cad8', '#eef1f8', '#0b0d12', '#2c3242', '#59617a', '#8d96ab'] },
    { id: 'gold', name: 'Gold', builtin: true, colors: ['#2b1d05', '#7a4f12', '#cd7f32', '#ffc247', '#ffe9a8', '#fff8e0', '#2b1d05', '#7a4f12', '#cd7f32', '#ffc247'] },
    { id: 'category', name: 'Category', builtin: true, colors: ['#4d8dff', '#5fd44d', '#ff5c8a', '#ffc247', '#b06bff', '#4dc8ff', '#ff5cd0', '#7c8cff', '#2ee6c0', '#4d8dff'] },
    { id: 'midnight', name: 'Midnight', builtin: true, colors: ['#0a1128', '#14213d', '#1b2a4a', '#24365e', '#e8edf7', '#5fc8ff', '#ff5c8a', '#060a18', '#ff9f1c', '#80ffdb'] },
    { id: 'deepOcean', name: 'Deep Ocean', builtin: true, colors: ['#062032', '#0a344e', '#0d4563', '#0f5578', '#e6f4f1', '#4de3c2', '#ffb454', '#04141f', '#ff6b6b', '#ffd166'] },
    { id: 'forestNight', name: 'Forest Night', builtin: true, colors: ['#0c1f16', '#143324', '#1a4530', '#21543c', '#eef5e9', '#a3e635', '#fbbf24', '#08130d', '#5eead4', '#f472b6'] },
    { id: 'espresso', name: 'Espresso', builtin: true, colors: ['#1c1410', '#2c1f18', '#3a2a20', '#4a3628', '#f5ebe0', '#e0a458', '#d95f4b', '#120c08', '#8fd0c2', '#e8c547'] },
    { id: 'crimsonNight', name: 'Crimson Night', builtin: true, colors: ['#1a0a12', '#2b0f1c', '#3d1428', '#521a34', '#fbe8ee', '#ff5c8a', '#ffb3c6', '#0f0509', '#ffb454', '#7ce3c2'] },
    { id: 'indigo', name: 'Indigo', builtin: true, colors: ['#141231', '#1f1c4e', '#2a2668', '#372f85', '#eceaff', '#8f7bff', '#ff7ad9', '#0b0a1e', '#5ce1e6', '#ffc247'] },
    { id: 'charcoalPop', name: 'Charcoal Pop', builtin: true, colors: ['#17181c', '#23252c', '#2e313b', '#3a3e4a', '#f2f3f5', '#f9f002', '#ff2a6d', '#0e0f12', '#05d9e8', '#ff8a3d'] },
    { id: 'sakuraNight', name: 'Sakura Night', builtin: true, colors: ['#201019', '#33202e', '#4a2f43', '#61405a', '#fdf0f5', '#ff8fb3', '#ffd6e3', '#140a10', '#c084fc', '#5eead4'] },
    { id: 'matchaNight', name: 'Matcha Night', builtin: true, colors: ['#101c12', '#1a2e1e', '#24402a', '#2f5336', '#f0f7e8', '#b8e62e', '#ffcf3f', '#0a120b', '#5fd4a5', '#ff8a5c'] },
    { id: 'blood', name: 'Blood', builtin: true, colors: ['#0d0305', '#1d060a', '#330a10', '#4d0f16', '#f5e6c8', '#ff2a2a', '#8a0f1a', '#080102', '#ff8a3d', '#e8c547'] },
    { id: 'ash', name: 'Ash', builtin: true, colors: ['#141712', '#20241d', '#2c332a', '#3a4536', '#e8ebe0', '#a8b89a', '#5c6b58', '#0c0e0a', '#d9c27a', '#7a9ab8'] },
    { id: 'festival', name: 'Festival', builtin: true, colors: ['#1a0b2e', '#2c1248', '#411a66', '#571f85', '#fff3d6', '#ffd21f', '#ff4d8d', '#0f0618', '#00e5ff', '#7cff6b'] },
    { id: 'cyber', name: 'Cyber', builtin: true, colors: ['#050510', '#0d0d2b', '#151545', '#1e1e60', '#e8f6ff', '#00f0ff', '#ff2a6d', '#03030a', '#f9f002', '#ff8a3d'] },
    { id: 'retro', name: 'Retro', builtin: true, colors: ['#10312e', '#1a4a45', '#25655e', '#318074', '#fdf3e3', '#ffb454', '#ff6b4a', '#0a1f1d', '#5fc8ff', '#f9f002'] },
    { id: 'aurora', name: 'Aurora', builtin: true, colors: ['#0a1a2f', '#10294a', '#163a66', '#1e4d85', '#e8f4ff', '#5eead4', '#c084fc', '#060f1c', '#a3e635', '#ff8fb3'] },
    { id: 'sunset', name: 'Sunset', builtin: true, colors: ['#1e0e2e', '#3a1548', '#5c1a5c', '#7a2060', '#ffe8d6', '#ff8a3d', '#ffd166', '#120818', '#ff5c8a', '#5ce1e6'] },
    { id: 'rose', name: 'Rose', builtin: true, colors: ['#220f1e', '#3a162e', '#521d40', '#6b2452', '#fdeef4', '#ff6b9d', '#ffb3c6', '#150a12', '#ffc247', '#7ce3c2'] },
    { id: 'warm', name: 'Warm', builtin: true, colors: ['#201309', '#33200f', '#4a2d16', '#61401e', '#fdf1e0', '#ffb454', '#ff7a45', '#140c05', '#ff5c8a', '#5fc8ff'] },
    { id: 'ocean', name: 'Ocean', builtin: true, colors: ['#082032', '#0e3a53', '#14506e', '#1a688c', '#e8f6f5', '#2ee6c0', '#ffd166', '#04141f', '#ff6b6b', '#c084fc'] },
    { id: 'paper', name: 'Paper', builtin: true, colors: ['#f5f3ee', '#e8e4da', '#dcd6c8', '#d0c9b8', '#1c1a17', '#c2410c', '#8d96ab', '#ffffff', '#1d4ed8', '#0d9488'] },
    { id: 'cream', name: 'Cream', builtin: true, colors: ['#faf3e3', '#f0e4c8', '#e5d3a8', '#d9c28e', '#3a2c18', '#b45309', '#8d96ab', '#fffdf5', '#9a3412', '#1d7a6e'] },
    { id: 'skyLight', name: 'Sky Light', builtin: true, colors: ['#dcefff', '#c2e2ff', '#a8d4ff', '#8fc4f5', '#14324a', '#0e63b3', '#8d96ab', '#ffffff', '#e05c7a', '#0d9488'] },
    { id: 'mintLight', name: 'Mint Light', builtin: true, colors: ['#d9f5e3', '#bdebcb', '#a0dfb3', '#82d09a', '#123c28', '#0e7a4d', '#8d96ab', '#ffffff', '#c2410c', '#1d4ed8'] },
    { id: 'lavenderMist', name: 'Lavender Mist', builtin: true, colors: ['#e6e1ff', '#cfc6f5', '#b8abe8', '#a08fd8', '#2e2450', '#6d28d9', '#8d96ab', '#ffffff', '#db2777', '#0d9488'] },
    { id: 'peachMilk', name: 'Peach Milk', builtin: true, colors: ['#ffe6d5', '#ffd3b8', '#ffbf9e', '#ffab85', '#4a2410', '#c2410c', '#8d96ab', '#fffaf5', '#1d4ed8', '#0e7a4d'] },
    { id: 'lemon', name: 'Lemon', builtin: true, colors: ['#fff6c9', '#f5e99a', '#e8d86e', '#d9c44a', '#3a3208', '#8a6d00', '#8d96ab', '#fffdf0', '#c2410c', '#1d6fb8'] },
    { id: 'blush', name: 'Blush', builtin: true, colors: ['#ffe0e6', '#f5c2cd', '#e8a2b2', '#d98296', '#57182a', '#be123c', '#8d96ab', '#fff5f7', '#7c3aed', '#0d7a6e'] },
    { id: 'rainLight', name: 'Rain Light', builtin: true, colors: ['#dfe7ee', '#c3d2de', '#a7bdcd', '#8ba5b8', '#1c2b3a', '#0e63b3', '#8d96ab', '#ffffff', '#be123c', '#0e7a4d'] },
    { id: 'monoLight', name: 'Mono Light', builtin: true, colors: ['#f2f3f5', '#e2e4e9', '#d0d3da', '#b8bdc7', '#17181c', '#3a3e4a', '#8d96ab', '#ffffff', '#b45309', '#1d4ed8'] },
    { id: 'warmPaper', name: 'Warm Paper', builtin: true, colors: ['#f7efe2', '#eadfc6', '#dccda6', '#cdbb86', '#2c2114', '#92400e', '#8d96ab', '#fffaf0', '#1d4ed8', '#0e7a4d'] },
    { id: 'candy', name: 'Candy', builtin: true, colors: ['#2b0a3d', '#4a1060', '#6b1585', '#8f1fa8', '#ffe8f5', '#ff5cd0', '#05d9e8', '#1a0626', '#f9f002', '#5eead4'] },
    { id: 'tropical', name: 'Tropical', builtin: true, colors: ['#07332b', '#0b5044', '#0f6e5e', '#14907a', '#fff7e0', '#ffd21f', '#ff6b4a', '#041f1a', '#ff5c8a', '#5fc8ff'] },
    { id: 'matsuri', name: 'Matsuri', builtin: true, colors: ['#1c0a0a', '#3d0f0f', '#611414', '#871a1a', '#fff5e8', '#ffb454', '#ff3d3d', '#100404', '#5fc8ff', '#f9f002'] },
    { id: 'aquaPop', name: 'Aqua Pop', builtin: true, colors: ['#062a33', '#0a4a5c', '#0e6a85', '#1290ae', '#e8fbff', '#2ee6c0', '#f9f002', '#03171d', '#ff6b6b', '#c084fc'] },
  ];

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
      for (const color of (entry.colors || []).slice(0, 10)) {
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
