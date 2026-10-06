window.SA = window.SA || {};

SA.controls = (() => {
  'use strict';

  function t(key, vars) {
    return SA.i18n.t(key, vars);
  }

  function prettify(name) {
    return String(name || '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .replace(/^\w/, (char) => char.toUpperCase());
  }

  function labelFor(key) {
    const translated = t(`fx.param.${key}`);
    return translated === `fx.param.${key}` ? prettify(key) : translated;
  }

  // The four-step smartness mark appended to an effect's label: ● refined,
  // ◕ good, ◔ plain, ○ tacky. Groups without ratings read as the neutral ◕.
  function smartnessMark(group, type) {
    if (typeof SA === 'undefined' || !SA.smartness || !SA.moods || type == null) return '';
    const base = typeof SA.fx !== 'undefined' && SA.fx && SA.fx.baseOf ? SA.fx.baseOf(group) : group;
    const rating = SA.smartness.rate(base, type);
    if (rating >= 0.75) return '●';
    if (rating >= 0.5) return '◕';
    if (rating >= 0.25) return '◔';
    return '○';
  }

  // The full 8-axis evaluation of an effect, as a multi-line tooltip. Empty
  // while fx-axes is unavailable.
  function axisTooltip(group, type) {
    if (typeof SA === 'undefined' || !SA.fxAxes || type == null) return '';
    const vector = SA.fxAxes.of(group, type);
    return SA.fxAxes.AXES.map((axis) => {
      const label = t(`studio.themeEditor.axis.${axis}`);
      const shown = label === `studio.themeEditor.axis.${axis}` ? axis : label;
      return `${shown}: ${Number(vector[axis]).toFixed(2)}`;
    }).join('\n');
  }

  function typeLabel(group, type) {
    const base = typeof SA !== 'undefined' && SA.fx && SA.fx.baseOf ? SA.fx.baseOf(group) : group;
    const key = `fx.${base}.${type}`;
    const translated = t(key);
    const label = translated === key ? prettify(type) : translated;
    const mark = smartnessMark(group, type);
    return mark ? `${label} · ${mark}` : label;
  }

  function valueLabel(value) {
    const key = `fx.value.${value}`;
    const translated = t(key);
    return translated === key ? prettify(value) : translated;
  }

  function clampNumber(value, param) {
    let number = Number(value);
    if (!Number.isFinite(number)) number = param.default == null ? 0 : param.default;
    if (param.min != null) number = Math.max(param.min, number);
    if (param.max != null) number = Math.min(param.max, number);
    return number;
  }

  function row(container, param) {
    const node = document.createElement('div');
    node.className = 'ctrl-row';
    node.dataset.prop = param.propPath || param.key;
    const label = document.createElement('label');
    label.className = 'ctrl-label';
    label.textContent = labelFor(param.key);
    node.appendChild(label);
    node.appendChild(param.control);
    container.appendChild(node);
    return node;
  }

  // --- numbers -----------------------------------------------------------------

  // Figure line width: a preset name (hair..heavy) or a free multiplier
  // 0.1..256. The select keeps the old presets, the number + slider edit the
  // resolved factor; a preset pick stores the name, a numeric edit stores the
  // number so old projects keep drawing identically.
  function strokeControl(param, value, onChange) {
    const presets = (typeof SA !== 'undefined' && SA.figures && SA.figures.STROKES) || { hair: 0.4, thin: 0.7, med: 1.3, bold: 2.2, heavy: 3.2 };
    const min = param.min != null ? param.min : 0.1;
    const max = param.max != null ? param.max : 256;
    const step = param.step != null ? param.step : 0.1;
    const isPreset = typeof value === 'string' && presets[value] != null;
    let factor = isPreset ? presets[value] : Number(value);
    if (!Number.isFinite(factor)) factor = presets[param.default] != null ? presets[param.default] : 1;
    factor = Math.max(min, Math.min(max, factor));
    const wrap = document.createElement('div');
    wrap.className = 'ctrl-stroke';
    const select = document.createElement('select');
    const presetOptions = param.options && param.options.length ? param.options : Object.keys(presets);
    for (const name of presetOptions) {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = valueLabel(name);
      select.appendChild(option);
    }
    const custom = document.createElement('option');
    custom.value = '__custom';
    custom.textContent = `${valueLabel('custom')} (${factor})`;
    select.appendChild(custom);
    select.value = isPreset ? String(value) : '__custom';
    select.addEventListener('keydown', (event) => event.stopPropagation());
    select.addEventListener('change', () => {
      if (select.value === '__custom') {
        onChange(Math.round(factor * 100) / 100);
        return;
      }
      onChange(select.value);
    });
    wrap.appendChild(select);
    const numericParam = { min, max, step, default: factor };
    const number = numberControl(numericParam, factor, (next) => {
      const clamped = Math.max(min, Math.min(max, Number(next)));
      const rounded = Math.round(clamped * 100) / 100;
      custom.textContent = `${valueLabel('custom')} (${rounded})`;
      onChange(rounded);
    });
    wrap.appendChild(number);
    return wrap;
  }

  function numberControl(param, value, onChange, options) {
    const opts = options || {};
    const wrap = document.createElement('div');
    wrap.className = 'ctrl-number';
    const input = document.createElement('input');
    input.type = 'number';
    input.step = param.step == null ? 0.01 : param.step;
    if (param.min != null) input.min = String(param.min);
    if (param.max != null) input.max = String(param.max);
    input.value = Number.isFinite(Number(value)) ? String(Number(value)) : '';
    input.addEventListener('keydown', (event) => event.stopPropagation());
    input.addEventListener('change', () => onChange(clampNumber(input.value, param)));
    wrap.appendChild(input);
    if (param.min != null && param.max != null && !opts.noSlider) {
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = String(param.min);
      slider.max = String(param.max);
      slider.step = String(param.step == null ? 0.01 : param.step);
      slider.value = String(Number.isFinite(Number(value)) ? Number(value) : param.default);
      const endSlider = () => {
        if (typeof SA !== 'undefined' && SA.store && SA.store.endTransaction) SA.store.endTransaction();
      };
      slider.addEventListener('input', () => {
        input.value = slider.value;
      });
      slider.addEventListener('change', () => {
        onChange(clampNumber(slider.value, param));
        endSlider();
      });
      slider.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
        if (typeof SA !== 'undefined' && SA.store && SA.store.beginTransaction) SA.store.beginTransaction('edit value');
      });
      // change may land before or after pointerup depending on the platform;
      // both close the transaction, and an empty one is simply discarded
      slider.addEventListener('pointerup', endSlider);
      slider.addEventListener('pointercancel', () => {
        if (typeof SA !== 'undefined' && SA.store && SA.store.cancelTransaction) SA.store.cancelTransaction();
      });
      wrap.appendChild(slider);
    }
    return wrap;
  }

  // --- selects / bools ---------------------------------------------------------

  function selectControl(param, value, onChange, entries) {
    const select = document.createElement('select');
    for (const entry of entries) {
      const option = document.createElement('option');
      option.value = entry.value;
      option.textContent = entry.label;
      select.appendChild(option);
    }
    select.value = value == null ? '' : String(value);
    select.addEventListener('change', () => onChange(select.value));
    select.addEventListener('keydown', (event) => event.stopPropagation());
    return select;
  }

  function boolControl(value, onChange) {
    const wrap = document.createElement('label');
    wrap.className = 'ctrl-bool';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !!value;
    input.addEventListener('change', () => onChange(input.checked));
    wrap.appendChild(input);
    return wrap;
  }

  function vec2Control(value, onChange, param) {
    const wrap = document.createElement('div');
    wrap.className = 'ctrl-vec2';
    const current = value && typeof value === 'object' ? value : { x: 0, y: 0 };
    for (const axis of ['x', 'y']) {
      const input = document.createElement('input');
      input.type = 'number';
      input.step = param && param.step != null ? param.step : 0.01;
      input.value = String(Number(current[axis]) || 0);
      input.title = axis.toUpperCase();
      input.addEventListener('keydown', (event) => event.stopPropagation());
      input.addEventListener('change', () => {
        onChange({ ...current, [axis]: Number(input.value) || 0 });
      });
      wrap.appendChild(input);
    }
    return wrap;
  }

  // Color parameters accept a hex string or a ColorValue:
  // { kind: 'solid', value, alpha } / { kind: 'palette', index } / { kind: 'category' }.
  function colorControl(value, onChange, options) {
    const opts = options || {};
    const paletteColors = opts.palette && Array.isArray(opts.palette.colors) ? opts.palette.colors : [];
    const wrap = document.createElement('div');
    wrap.className = 'ctrl-color';
    const stopColor = (stop) => {
      if (!stop) return '#ffffff';
      if (stop.paletteIndex != null && paletteColors.length) return paletteColors[Math.abs(Math.floor(stop.paletteIndex)) % paletteColors.length];
      if (typeof stop.color === 'string' && /^#/.test(stop.color)) {
        if (stop.alpha != null && stop.alpha < 1) {
          try {
            return SA.color.toHex({ ...SA.color.parse(stop.color), a: Number(stop.alpha) });
          } catch {
            return stop.color;
          }
        }
        return stop.color;
      }
      return '#ffffff';
    };
    const fullHexOf = (raw, alpha) => {
      try {
        const parsed = SA.color.parse(raw);
        const a = alpha == null ? parsed.a : Number(alpha);
        if (a == null || !(a < 1)) return SA.color.toHex({ ...parsed, a: 1 });
        return SA.color.toHex({ ...parsed, a });
      } catch {
        return typeof raw === 'string' ? raw : '#ffffff';
      }
    };
    const resolveParts = (next) => {
      if (next && typeof next === 'object' && next.kind === 'palette') {
        const index = Math.abs(Math.floor(next.index || 0));
        const resolved = paletteColors.length ? paletteColors[index % paletteColors.length] : null;
        const hex = resolved || '#ffffff';
        let alpha = 1;
        try {
          alpha = SA.color.parse(hex).a == null ? 1 : SA.color.parse(hex).a;
        } catch {
          alpha = 1;
        }
        return { hex, alpha, ref: `P${index + 1}` };
      }
      if (next && typeof next === 'object' && next.kind === 'category') {
        return { hex: '#ff8a3d', alpha: 1, ref: opts.categoryLabel || 'Cat' };
      }
      if (next && typeof next === 'object' && next.kind === 'gradient') {
        const colors = (next.stops || []).map(stopColor);
        return { hex: colors[0] || '#ffffff', alpha: 1, ref: null, gradient: colors.length > 1 ? colors : null };
      }
      if (next && typeof next === 'object' && (next.kind === 'solid' || next.value != null || next.color != null)) {
        const raw = next.value || next.color;
        if (typeof raw === 'string' && /^#/.test(raw)) {
          const alpha = next.alpha == null ? (() => { try { return SA.color.parse(raw).a; } catch { return 1; } })() : Number(next.alpha);
          return { hex: fullHexOf(raw, alpha), alpha: alpha == null ? 1 : alpha, ref: null };
        }
        return { hex: '#ffffff', alpha: 1, ref: null };
      }
      const inner = next && typeof next === 'object' ? next.value || next.color : next;
      if (typeof inner === 'string' && /^#/.test(inner)) {
        let alpha = 1;
        try {
          alpha = SA.color.parse(inner).a == null ? 1 : SA.color.parse(inner).a;
        } catch {
          alpha = 1;
        }
        return { hex: fullHexOf(inner, alpha), alpha, ref: null };
      }
      return { hex: '#ffffff', alpha: 1, ref: null };
    };
    const paintSwatch = (el, hex) => {
      if (typeof SA !== 'undefined' && SA.colors && typeof SA.colors.paintSwatch === 'function') SA.colors.paintSwatch(el, hex);
      else el.style.background = hex;
    };
    const swatchBackground = (resolved) =>
      resolved.gradient
        ? `linear-gradient(90deg, ${resolved.gradient.map((color, index) => `${color} ${Math.round((index / Math.max(1, resolved.gradient.length - 1)) * 100)}%`).join(', ')})`
        : resolved.hex;
    let parts = resolveParts(value);
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'ctrl-swatch';
    if (parts.gradient) swatch.style.background = swatchBackground(parts);
    else paintSwatch(swatch, parts.hex);
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'ctrl-hex';
    input.value = parts.ref || parts.hex;
    input.addEventListener('keydown', (event) => event.stopPropagation());
    const paint = (next) => {
      parts = resolveParts(next);
      if (parts.gradient) {
        swatch.style.backgroundImage = '';
        swatch.style.background = swatchBackground(parts);
      } else paintSwatch(swatch, parts.hex);
      input.value = parts.ref || parts.hex;
    };
    const commitHex = () => {
      const next = input.value.trim();
      onChange(next || null);
      paint(next);
    };
    input.addEventListener('change', commitHex);
    swatch.addEventListener('click', () => {
      if (typeof SA === 'undefined' || !SA.colors) {
        input.focus();
        return;
      }
      SA.colors.openPicker({
        value: parts.hex,
        alpha: parts.alpha,
        anchor: swatch,
        slots: paletteColors,
        slotLabel: opts.slotLabel,
        onSlot(index) {
          const next = { kind: 'palette', index };
          onChange(next);
          paint(next);
        },
        onChange(next) {
          onChange(next);
          paint(next);
        },
      });
    });
    wrap.appendChild(swatch);
    wrap.appendChild(input);
    return wrap;
  }

  function gradientControl(value, onChange, anchor) {
    const wrap = document.createElement('div');
    wrap.className = 'ctrl-color';
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'ctrl-swatch ctrl-gradient';
    const stops = value && value.kind === 'gradient' && value.stops ? value.stops : [];
    swatch.style.background = stops.length
      ? `linear-gradient(90deg, ${stops.map((stop) => `${stop.color || '#ffffff'} ${Math.round((stop.pos || 0) * 100)}%`).join(', ')})`
      : 'linear-gradient(90deg, #ffffff, #ff8a3d)';
    const label = document.createElement('span');
    label.className = 'ctrl-points-preview';
    label.textContent = value && value.kind === 'gradient' ? `${value.type} ${value.angle == null ? 90 : value.angle}° · ${stops.length} stops` : '—';
    swatch.addEventListener('click', () => {
      if (typeof SA === 'undefined' || !SA.colors) return;
      SA.colors.openGradient({
        value,
        anchor: anchor || swatch,
        onChange(next) {
          onChange(next);
          const nextStops = next.stops || [];
          swatch.style.background = `linear-gradient(90deg, ${nextStops.map((stop) => `${stop.color} ${Math.round((stop.pos || 0) * 100)}%`).join(', ')})`;
          label.textContent = `${next.type} ${next.angle == null ? 90 : next.angle}° · ${nextStops.length} stops`;
        },
      });
    });
    wrap.appendChild(swatch);
    wrap.appendChild(label);
    return wrap;
  }

  // A list of hex colors (used by the background variation palette and the
  // clone colours). Each entry is a plain `#RRGGBB` / `#RRGGBBAA` string
  // edited through the shared swatch picker, so the alpha rides along.
  const HEX6_OR_8 = /^#([0-9a-f]{6}|[0-9a-f]{8})$/i;
  function colorsControl(value, onChange) {
    const wrap = document.createElement('div');
    wrap.className = 'ctrl-colors';
    let list = Array.isArray(value) ? [...value] : [];
    const commit = () => onChange([...list]);
    const paintChip = (el, hex) => {
      if (typeof SA !== 'undefined' && SA.colors && typeof SA.colors.paintSwatch === 'function') SA.colors.paintSwatch(el, hex);
      else el.style.background = hex;
    };
    const toStoredHex = (next, fallback) => {
      if (typeof SA !== 'undefined' && SA.colors && typeof SA.colors.pickerValueToHex === 'function') {
        return SA.colors.pickerValueToHex(next) || fallback;
      }
      if (typeof next === 'string') return next;
      return (next && next.value) || fallback;
    };
    const render = () => {
      wrap.innerHTML = '';
      list.forEach((hex, index) => {
        const item = document.createElement('span');
        item.className = 'ctrl-color-chip';
        const swatch = document.createElement('button');
        swatch.type = 'button';
        swatch.className = 'ctrl-swatch';
        paintChip(swatch, HEX6_OR_8.test(hex) ? hex : '#ffffff');
        swatch.title = hex;
        swatch.addEventListener('click', () => {
          if (typeof SA === 'undefined' || !SA.colors) return;
          SA.colors.openPicker({
            value: HEX6_OR_8.test(hex) ? hex : '#ffffff',
            anchor: swatch,
            onChange(next) {
              list[index] = toStoredHex(next, list[index] || '#ffffff');
              commit();
              render();
            },
          });
        });
        item.appendChild(swatch);
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'ctrl-hex';
        input.value = hex;
        input.addEventListener('keydown', (event) => event.stopPropagation());
        input.addEventListener('change', () => {
          const next = input.value.trim();
          if (!HEX6_OR_8.test(next)) {
            input.value = list[index];
            return;
          }
          list[index] = next;
          commit();
          render();
        });
        item.appendChild(input);
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'btn btn-mini';
        remove.textContent = '✕';
        remove.addEventListener('click', () => {
          list = list.filter((entry, i) => i !== index);
          commit();
          render();
        });
        item.appendChild(remove);
        wrap.appendChild(item);
      });
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'btn btn-mini';
      add.textContent = '＋';
      add.addEventListener('click', () => {
        list.push(list[list.length - 1] || '#ffffff');
        commit();
        render();
      });
      wrap.appendChild(add);
    };
    render();
    return wrap;
  }

  function multiselectControl(value, onChange, param) {
    const wrap = document.createElement('div');
    wrap.className = 'ctrl-multiselect';
    const selected = new Set(Array.isArray(value) ? value : []);
    for (const option of (param && param.options) || []) {
      const label = document.createElement('label');
      label.className = 'ctrl-bool-row';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = selected.has(option);
      box.addEventListener('change', () => {
        if (box.checked) selected.add(option);
        else selected.delete(option);
        onChange([...selected]);
      });
      const text = document.createElement('span');
      text.textContent = valueLabel(option);
      label.appendChild(box);
      label.appendChild(text);
      wrap.appendChild(label);
    }
    return wrap;
  }

  function textControl(value, onChange, options) {
    const wrapper = document.createElement(options && options.multiline ? 'textarea' : 'input');
    if (!options || !options.multiline) wrapper.type = 'text';
    wrapper.className = 'ctrl-text';
    wrapper.value = value == null ? '' : String(value);
    wrapper.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !(options && options.multiline)) wrapper.blur();
      event.stopPropagation();
    });
    wrapper.addEventListener('change', () => onChange(wrapper.value));
    return wrapper;
  }

  function easeControl(value, onChange) {
    const names = SA.easing.names.concat(['cubic-bezier', 'spring', 'steps', 'hold']);
    const current = SA.easing.canonical ? SA.easing.canonical(value) : value;
    return selectControl(
      { default: 'linear' },
      current,
      onChange,
      names.map((name) => ({ value: name, label: name.startsWith('ease') ? name : prettify(name) }))
    );
  }

  function pointsControl(value, onChange) {
    const wrap = document.createElement('div');
    wrap.className = 'ctrl-points';
    const points = Array.isArray(value) ? value : [];
    const preview = document.createElement('span');
    preview.className = 'ctrl-points-preview';
    preview.textContent = points.map((point) => `${Math.round(point.x * 100)},${Math.round(point.y * 100)}`).join(' ');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-mini';
    button.textContent = t('studio.inspector.editPoints');
    button.addEventListener('click', () => {
      SA.overlay.beginPathEdit(points, onChange);
    });
    wrap.appendChild(preview);
    wrap.appendChild(button);
    return wrap;
  }

  // --- generic descriptor form -------------------------------------------------

  // Nine-point origin picker (textenter2 §2.3): tl/t/tr/l/c/r/bl/b/br plus a
  // baseline button. Used for pivotAnchor / scaleOriginAnchor.
  function anchorGridControl(value, onChange) {
    const wrap = document.createElement('div');
    wrap.className = 'ctrl-anchor-grid';
    const current = value || 'c';
    const grid = document.createElement('div');
    grid.className = 'ctrl-anchor-cells';
    for (const key of ['tl', 't', 'tr', 'l', 'c', 'r', 'bl', 'b', 'br']) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = `btn btn-mini${key === current ? ' is-active' : ''}`;
      cell.textContent = key === 'c' ? '＋' : '·';
      cell.title = key;
      cell.setAttribute('aria-label', key);
      cell.addEventListener('click', () => onChange(key));
      grid.appendChild(cell);
    }
    wrap.appendChild(grid);
    const base = document.createElement('button');
    base.type = 'button';
    base.className = `btn btn-mini${current === 'baseline' ? ' is-active' : ''}`;
    base.textContent = '―';
    base.title = 'baseline';
    base.setAttribute('aria-label', 'baseline');
    base.addEventListener('click', () => onChange('baseline'));
    wrap.appendChild(base);
    return wrap;
  }

  const CONTROL_FOR = {
    number: (param, value, onChange) => numberControl(param, value, onChange),
    int: (param, value, onChange) => numberControl(param, value, (next) => onChange(Math.round(next))),
    stroke: (param, value, onChange) => strokeControl(param, value, onChange),
    select: (param, value, onChange) =>
      selectControl(param, value, onChange, (param.options || []).map((option) => ({ value: option, label: valueLabel(option) }))),
    bool: (param, value, onChange) => boolControl(value, onChange),
    color: (param, value, onChange, options) => colorControl(value, onChange, options),
    vec2: (param, value, onChange) => vec2Control(value, onChange, param),
    ease: (param, value, onChange) => easeControl(value, onChange),
    points: (param, value, onChange) => pointsControl(value, onChange),
    text: (param, value, onChange) => textControl(value, onChange),
    font: (param, value, onChange) =>
      selectControl(
        param,
        value,
        onChange,
        fontChoices()
      ),
    gradient: (param, value, onChange) => gradientControl(value, onChange),
    colors: (param, value, onChange) => colorsControl(value, onChange),
    multiselect: (param, value, onChange) => multiselectControl(value, onChange, param),
  };

  // The project font set (or, without one, the default set plus loaded fonts).
  function fontChoices() {
    if (SA.lyricsFont.choices) return SA.lyricsFont.choices();
    return (SA.lyricsFont.builtins ? SA.lyricsFont.builtins() : []).map((entry) => ({ value: entry.id, label: entry.family }));
  }

  function paramControl(group, param, value, onChange, options) {
    // textenter2 §2.3: the pivot anchor renders as a 3x3 point grid plus a
    // baseline button instead of a dropdown, wherever it appears
    if (param && (param.key === 'pivotAnchor' || param.key === 'scaleOriginAnchor') && param.kind === 'select') {
      return anchorGridControl(value, onChange);
    }
    const builder = CONTROL_FOR[param.kind] || CONTROL_FOR.text;
    return builder(param, value, onChange, options);
  }

  function paramEntries(descriptor) {
    return (descriptor && descriptor.params) || [];
  }

  return {
    prettify,
    labelFor,
    typeLabel,
    valueLabel,
    smartnessMark,
    axisTooltip,
    row,
    numberControl,
    selectControl,
    boolControl,
    vec2Control,
    colorControl,
    gradientControl,
    textControl,
    easeControl,
    pointsControl,
    colorsControl,
    multiselectControl,
    paramControl,
    paramEntries,
    fontChoices,
  };
})();
