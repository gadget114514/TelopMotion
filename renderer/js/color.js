(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.SA = root.SA || {};
    root.SA.color = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function clamp01(value) {
    if (Number.isNaN(value)) return 0;
    return value < 0 ? 0 : value > 1 ? 1 : value;
  }

  function hexDigit(value) {
    const clamped = clamp01(value);
    return Math.round(clamped * 255)
      .toString(16)
      .padStart(2, '0');
  }

  function parseChannel(text) {
    const raw = String(text).trim();
    if (raw.endsWith('%')) return clamp01(Number.parseFloat(raw) / 100);
    const value = Number.parseFloat(raw);
    if (Number.isNaN(value)) return 0;
    return clamp01(value / 255);
  }

  function hslToRgb(h, s, l) {
    const hue = ((h % 360) + 360) % 360;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0;
    let g = 0;
    let b = 0;
    if (hue < 60) [r, g, b] = [c, x, 0];
    else if (hue < 120) [r, g, b] = [x, c, 0];
    else if (hue < 180) [r, g, b] = [0, c, x];
    else if (hue < 240) [r, g, b] = [0, x, c];
    else if (hue < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    return { r: r + m, g: g + m, b: b + m };
  }

  function parse(value) {
    const fallback = { r: 0, g: 0, b: 0, a: 1 };
    if (typeof value !== 'string') return fallback;
    const text = value.trim().toLowerCase();
    if (!text) return fallback;

    if (text.startsWith('#')) {
      const hex = text.slice(1);
      if (hex.length === 3 || hex.length === 4) {
        const r = Number.parseInt(hex[0] + hex[0], 16);
        const g = Number.parseInt(hex[1] + hex[1], 16);
        const b = Number.parseInt(hex[2] + hex[2], 16);
        const a = hex.length === 4 ? Number.parseInt(hex[3] + hex[3], 16) / 255 : 1;
        if ([r, g, b].some(Number.isNaN)) return fallback;
        return { r: r / 255, g: g / 255, b: b / 255, a };
      }
      if (hex.length === 6 || hex.length === 8) {
        const r = Number.parseInt(hex.slice(0, 2), 16);
        const g = Number.parseInt(hex.slice(2, 4), 16);
        const b = Number.parseInt(hex.slice(4, 6), 16);
        const a = hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1;
        if ([r, g, b, hex.length === 8 ? a * 255 : 1].some(Number.isNaN)) return fallback;
        return { r: r / 255, g: g / 255, b: b / 255, a };
      }
      return fallback;
    }

    const match = text.match(/^(rgba?|hsla?)\(([^)]+)\)$/);
    if (!match) return fallback;
    const parts = match[2]
      .split(/[,/\s]+/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length < 3) return fallback;

    if (match[1].startsWith('hsl')) {
      const h = Number.parseFloat(parts[0]) || 0;
      const s = clamp01((Number.parseFloat(parts[1]) || 0) / 100);
      const l = clamp01((Number.parseFloat(parts[2]) || 0) / 100);
      const alpha = parts.length > 3 ? (parts[3].endsWith('%') ? Number.parseFloat(parts[3]) / 100 : Number.parseFloat(parts[3])) : 1;
      const rgb = hslToRgb(h, s, l);
      return { ...rgb, a: clamp01(alpha) };
    }

    const r = parseChannel(parts[0]);
    const g = parseChannel(parts[1]);
    const b = parseChannel(parts[2]);
    const alpha = parts.length > 3 ? (parts[3].endsWith('%') ? Number.parseFloat(parts[3]) / 100 : Number.parseFloat(parts[3])) : 1;
    return { r, g, b, a: clamp01(alpha) };
  }

  function toHex(rgba) {
    const color = rgba || { r: 0, g: 0, b: 0, a: 1 };
    const base = `#${hexDigit(color.r)}${hexDigit(color.g)}${hexDigit(color.b)}`;
    if (color.a == null || color.a >= 1) return base;
    return `${base}${hexDigit(color.a)}`;
  }

  function rgbToHsv(rgba) {
    const r = rgba.r;
    const g = rgba.g;
    const b = rgba.b;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    let h = 0;
    if (delta !== 0) {
      if (max === r) h = ((g - b) / delta) % 6;
      else if (max === g) h = (b - r) / delta + 2;
      else h = (r - g) / delta + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return { h, s: max === 0 ? 0 : delta / max, v: max, a: rgba.a == null ? 1 : rgba.a };
  }

  function hsvToRgb(hsv) {
    const h = ((hsv.h % 360) + 360) % 360;
    const s = clamp01(hsv.s);
    const v = clamp01(hsv.v);
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    let r = 0;
    let g = 0;
    let b = 0;
    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    return { r: r + m, g: g + m, b: b + m, a: hsv.a == null ? 1 : hsv.a };
  }

  function srgbToLinear(value) {
    return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  }

  function linearToSrgb(value) {
    return value <= 0.0031308 ? value * 12.92 : 1.055 * Math.pow(value, 1 / 2.4) - 0.055;
  }

  function rgbToOklab(rgba) {
    const r = srgbToLinear(clamp01(rgba.r));
    const g = srgbToLinear(clamp01(rgba.g));
    const b = srgbToLinear(clamp01(rgba.b));
    const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
    const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
    const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
    const l_ = Math.cbrt(l);
    const m_ = Math.cbrt(m);
    const s_ = Math.cbrt(s);
    return {
      L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
      a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
      b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
      alpha: rgba.a == null ? 1 : rgba.a,
    };
  }

  function oklabToRgb(lab) {
    const l_ = lab.L + 0.3963377774 * lab.a + 0.2158037573 * lab.b;
    const m_ = lab.L - 0.1055613458 * lab.a - 0.0638541728 * lab.b;
    const s_ = lab.L - 0.0894841775 * lab.a - 1.291485548 * lab.b;
    const l = l_ * l_ * l_;
    const m = m_ * m_ * m_;
    const s = s_ * s_ * s_;
    const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    const b = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
    return { r: clamp01(linearToSrgb(r)), g: clamp01(linearToSrgb(g)), b: clamp01(linearToSrgb(b)), a: lab.alpha == null ? 1 : lab.alpha };
  }

  function mixRgba(a, b, t) {
    const left = rgbToOklab(a);
    const right = rgbToOklab(b);
    const blended = oklabToRgb({
      L: left.L + (right.L - left.L) * t,
      a: left.a + (right.a - left.a) * t,
      b: left.b + (right.b - left.b) * t,
      alpha: (a.a == null ? 1 : a.a) + ((b.a == null ? 1 : b.a) - (a.a == null ? 1 : a.a)) * t,
    });
    return blended;
  }

  function mix(a, b, t, space) {
    const left = typeof a === 'string' ? parse(a) : a;
    const right = typeof b === 'string' ? parse(b) : b;
    const amount = clamp01(t);
    if (space === 'rgb') {
      return {
        r: left.r + (right.r - left.r) * amount,
        g: left.g + (right.g - left.g) * amount,
        b: left.b + (right.b - left.b) * amount,
        a: (left.a == null ? 1 : left.a) + ((right.a == null ? 1 : right.a) - (left.a == null ? 1 : left.a)) * amount,
      };
    }
    return mixRgba(left, right, amount);
  }

  function withAlpha(rgba, alpha) {
    if (alpha == null) return { ...rgba };
    return { ...rgba, a: clamp01(alpha) * (rgba.a == null ? 1 : rgba.a) };
  }

  function normalizeStop(stop) {
    if (!stop) return { pos: 0, rgba: { r: 0, g: 0, b: 0, a: 1 } };
    if (stop.rgba) return { pos: clamp01(stop.pos || 0), rgba: withAlpha(stop.rgba, stop.alpha) };
    return { pos: clamp01(stop.pos || 0), rgba: withAlpha(parse(stop.color), stop.alpha) };
  }

  function sampleGradient(stops, pos) {
    const list = (stops || []).map(normalizeStop).sort((a, b) => a.pos - b.pos);
    if (!list.length) return { r: 0, g: 0, b: 0, a: 1 };
    if (list.length === 1) return { ...list[0].rgba };
    const t = clamp01(pos);
    if (t <= list[0].pos) return { ...list[0].rgba };
    const last = list[list.length - 1];
    if (t >= last.pos) return { ...last.rgba };
    for (let i = 0; i < list.length - 1; i += 1) {
      const start = list[i];
      const end = list[i + 1];
      if (t >= start.pos && t <= end.pos) {
        const span = end.pos - start.pos;
        const local = span <= 0 ? 1 : (t - start.pos) / span;
        return mixRgba(start.rgba, end.rgba, local);
      }
    }
    return { ...last.rgba };
  }

  function isSolid(value) {
    return !!value && value.kind === 'solid' && value.rgba;
  }

  function lerpColorValue(a, b, t) {
    const amount = clamp01(t);
    if (isSolid(a) && isSolid(b)) {
      return { kind: 'solid', rgba: mixRgba(a.rgba, b.rgba, amount) };
    }
    const leftStops = a && a.kind === 'gradient' ? a.stops || [] : null;
    const rightStops = b && b.kind === 'gradient' ? b.stops || [] : null;
    if (leftStops && rightStops && leftStops.length === rightStops.length && leftStops.length >= 2) {
      const stops = leftStops.map((stop, index) => {
        const other = rightStops[index];
        return {
          pos: (stop.pos || 0) + ((other.pos || 0) - (stop.pos || 0)) * amount,
          rgba: mixRgba(normalizeStop(stop).rgba, normalizeStop(other).rgba, amount),
        };
      });
      return {
        kind: 'gradient',
        type: b.type || a.type || 'linear',
        angle: (a.angle || 0) + ((b.angle || 0) - (a.angle || 0)) * amount,
        space: b.space || a.space || 'element',
        stops,
      };
    }
    return amount < 0.5 ? a : b;
  }

  function localColors(context) {
    const local = context && (context.localPalette || context.palette);
    if (local && Array.isArray(local.colors) && local.colors.length) return local.colors;
    return null;
  }

  function paletteColors(context, paletteId) {
    const list = (context && context.palettes) || [];
    if (paletteId) {
      const listed = list.find((entry) => entry.id === paletteId);
      if (listed && Array.isArray(listed.colors) && listed.colors.length) return listed.colors;
    }
    const local = localColors(context);
    if (local) return local;
    const first = list.find((entry) => Array.isArray(entry.colors) && entry.colors.length);
    return first ? first.colors : [];
  }

  function resolve(value, ctx) {
    const context = ctx || {};
    if (!value) return { kind: 'solid', rgba: { r: 0, g: 0, b: 0, a: 1 } };
    if (value.kind === 'gradient') {
      const colors = localColors(context) || paletteColors(context, value.paletteId);
      const stops = (value.stops || []).map((stop) => {
        if (!stop || stop.paletteIndex == null || !colors.length) return stop;
        const index = Math.abs(Math.floor(stop.paletteIndex)) % colors.length;
        return { ...stop, color: colors[index] };
      });
      // animated gradients: angleSpeed rotates the direction, shiftSpeed pans
      // the gradient across the element (both driven by context.t)
      const animate = value.animate || {};
      const time = Number(context.t) || 0;
      const angle = (value.angle == null ? 90 : value.angle) + (Number(animate.angleSpeed) || 0) * time;
      const shift = (Number(animate.shiftSpeed) || 0) * time;
      return {
        kind: 'gradient',
        type: value.type || 'linear',
        angle,
        shift,
        space: value.space || 'element',
        stops: stops.map((stop) => normalizeStop(stop)),
      };
    }
    if (value.kind === 'palette') {
      const colors = paletteColors(context, value.paletteId);
      const index = colors.length ? Math.abs(Math.floor(value.index || 0)) % colors.length : 0;
      return { kind: 'solid', rgba: parse(colors[index] || '#ffffff') };
    }
    if (value.kind === 'category') {
      const entry = (context.categoryColors || {})[context.category];
      const hex = entry ? (value.which === 'tint2' ? entry.tint2 : entry.tint) : null;
      return { kind: 'solid', rgba: parse(hex || '#ff8a3d') };
    }
    return { kind: 'solid', rgba: withAlpha(parse(value.value), value.alpha) };
  }

  // Accepts an rgba array, a hex string or a ColorValue (solid / palette /
  // category) and returns an [r, g, b, a] array. Used by the effect uniforms so
  // color parameters can reference the scoped palette.
  function relativeLuminance(rgba) {
    const channel = (value) => (value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4));
    const source = Array.isArray(rgba) ? rgba : rgba || {};
    const r = Array.isArray(source) ? source[0] || 0 : source.r || 0;
    const g = Array.isArray(source) ? source[1] || 0 : source.g || 0;
    const b = Array.isArray(source) ? source[2] || 0 : source.b || 0;
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  }

  function contrastRatio(a, b) {
    const first = relativeLuminance(a);
    const second = relativeLuminance(b);
    const high = Math.max(first, second);
    const low = Math.min(first, second);
    return (high + 0.05) / (low + 0.05);
  }

  // Nudges the value of `fg` until it clears `target` against `bg`, trying both
  // a darker and a lighter version and keeping the better one.
  function ensureContrast(fg, bg, target) {
    const minimum = target == null ? 4.5 : target;
    const front = typeof fg === 'string' ? parse(fg) : { ...fg };
    const back = typeof bg === 'string' ? parse(bg) : bg;
    if (contrastRatio(front, back) >= minimum) return toHex(front);
    const hsv = rgbToHsv(front);
    let best = toHex(front);
    let bestRatio = contrastRatio(front, back);
    for (const direction of [-1, 1]) {
      for (let step = 1; step <= 20; step += 1) {
        const value = clamp01(hsv.v + direction * step * 0.05);
        const candidate = hsvToRgb({ h: hsv.h, s: hsv.s, v: value, a: 1 });
        const ratio = contrastRatio(candidate, back);
        if (ratio > bestRatio) {
          bestRatio = ratio;
          best = toHex(candidate);
        }
        if (ratio >= minimum) return toHex(candidate);
      }
    }
    return best;
  }

  // Moves `fg` (a hex or rgba) away from every colour in `others` until it
  // clears `target` against all of them: the value is stepped both ways and
  // the smallest change that works wins, so the hue and most of the character
  // survive. When no brightness clears it, the best minimum ratio is kept.
  // Lightening also drops saturation so a vivid colour can reach near-white
  // (the old 0.3 floor kept vivid pinks pink and forced the dark side to win,
  // which read as palette-blind black on stage).
  function separateFrom(fg, others, target) {
    const minimum = target == null ? 3 : target;
    const list = (others || []).map((entry) => (typeof entry === 'string' ? parse(entry) : entry)).filter(Boolean);
    const front = typeof fg === 'string' ? parse(fg) : { ...fg };
    const worst = (rgba) => (list.length ? Math.min(...list.map((other) => contrastRatio(rgba, other))) : Infinity);
    if (worst(front) >= minimum) return toHex({ ...front, a: 1 });
    const hsv = rgbToHsv(front);
    let best = toHex({ ...front, a: 1 });
    let bestRatio = worst(front);
    for (let step = 1; step <= 40; step += 1) {
      for (const direction of [-1, 1]) {
        const value = hsv.v + direction * step * 0.025;
        if (value < 0 || value > 1) continue;
        // a very light colour also loses saturation so it can reach near-white
        const saturation = direction > 0 && value > 0.85 ? hsv.s * Math.max(0.04, 1 - (value - 0.85) * 6) : hsv.s;
        const candidate = hsvToRgb({ h: hsv.h, s: saturation, v: value, a: 1 });
        const ratio = worst(candidate);
        if (ratio >= minimum) return toHex({ ...candidate, a: 1 });
        if (ratio > bestRatio) {
          bestRatio = ratio;
          best = toHex({ ...candidate, a: 1 });
        }
      }
    }
    return best;
  }

  function toRgba(value, fallback, ctx) {
    if (Array.isArray(value) && value.length >= 3) return [value[0], value[1], value[2], value[3] == null ? 1 : value[3]];
    if (value == null || value === '') return fallback;
    if (typeof value === 'object' && value.kind) {
      const rgba = resolve(value, ctx).rgba;
      return [rgba.r, rgba.g, rgba.b, rgba.a == null ? 1 : rgba.a];
    }
    const rgba = parse(String(value));
    return [rgba.r, rgba.g, rgba.b, rgba.a == null ? 1 : rgba.a];
  }

  return {
    parse,
    toHex,
    rgbToHsv,
    hsvToRgb,
    hslToRgb,
    rgbToOklab,
    oklabToRgb,
    mix,
    mixRgba,
    sampleGradient,
    lerpColorValue,
    resolve,
    toRgba,
    relativeLuminance,
    contrastRatio,
    ensureContrast,
    separateFrom,
  };
});
