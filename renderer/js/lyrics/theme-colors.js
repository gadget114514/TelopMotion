(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../color'), require('./palette-roles'));
  else {
    root.SA = root.SA || {};
    root.SA.themeColors = factory(root.SA.color, root.SA.paletteRoles);
  }
})(typeof self !== 'undefined' ? self : this, function (color, paletteRoles) {
  'use strict';

  // Theme-derived decorative colours: every hard-coded fallback colour in the
  // render path resolves through here instead of a literal, so one Theme
  // (palette + weird axis) drives them all.
  //
  //   - weird > 0 rotates the hues and pushes the saturation ("strange colours")
  //   - a mono Theme (low mean saturation over the accent/text/figure/glow
  //     roles) collapses every ramp onto a black/white grey ladder
  //
  // Explicit effect params always win: this module only answers the "no
  // colour was set" question. Without a full palette there is no Theme, so
  // callers keep their classic literals (and the tests pin them).

  const SIZE = (paletteRoles && paletteRoles.SIZE) || 12;
  const SLOT = (paletteRoles && paletteRoles.SLOT) || {
    MID_A: 0, MID_B: 1, MID_C: 2, MID_D: 3, TEXT_FILL: 4, TEXT_FILL2: 5,
    TEXT_EDGE: 6, TEXT_BG: 7, FIG_A: 8, FIG_B: 9, MID_E: 10, GLOW: 11,
  };

  // Mean saturation below this over the expressive roles reads as a mono
  // Theme (the built-in Mono sits at ~0.13, the muted Suno Dark at ~0.21).
  const MONO_SATURATION = 0.16;

  function clamp01(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.max(0, Math.min(1, number));
  }

  function weirdOf(axes) {
    if (typeof axes === 'number') return clamp01(axes);
    if (!axes) return 0;
    return clamp01(axes.weird);
  }

  function hsvOf(hex) {
    try {
      return color.rgbToHsv(color.parse(hex));
    } catch {
      return { h: 0, s: 0, v: 0.5, a: 1 };
    }
  }

  function hexOf(h, s, v) {
    const rgb = color.hsvToRgb({ h: ((h % 360) + 360) % 360, s: clamp01(s), v: clamp01(v), a: 1 });
    return color.toHex({ r: rgb.r, g: rgb.g, b: rgb.b, a: 1 });
  }

  function greyOf(v) {
    return hexOf(0, 0, v);
  }

  function fullPalette(paletteColors) {
    const list = Array.isArray(paletteColors) ? paletteColors : [];
    if (list.length < SIZE) return null;
    for (const hex of list) {
      if (typeof hex !== 'string' || !/^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/i.test(hex)) return null;
    }
    return list;
  }

  // Any non-empty palette grown to the full SIZE roles (short palettes are
  // derived, never stored). Null when there is nothing to grow.
  function upgrade(paletteColors) {
    const list = Array.isArray(paletteColors) ? paletteColors.slice() : [];
    if (!list.length) return null;
    if (paletteRoles && typeof paletteRoles.upgradeColors === 'function') {
      try {
        return paletteRoles.upgradeColors(list);
      } catch {
        return list;
      }
    }
    while (list.length < SIZE) list.push(list[list.length - 1] || '#888888');
    return list.slice(0, SIZE);
  }

  // True when the Theme is monochrome: the accent, text, figure and glow
  // roles carry almost no saturation. A mono Theme renders every decorative
  // ramp as a black/white ladder.
  function isMono(paletteColors) {
    const list = fullPalette(paletteColors);
    if (!list) return false;
    const roles = [SLOT.TEXT_FILL, SLOT.TEXT_FILL2, SLOT.FIG_A, SLOT.FIG_B, SLOT.GLOW];
    let sum = 0;
    for (const index of roles) sum += hsvOf(list[index]).s;
    return sum / roles.length < MONO_SATURATION;
  }

  function lightBg(paletteColors) {
    const list = fullPalette(paletteColors);
    if (!list) return false;
    return hsvOf(list[SLOT.MID_A]).v >= 0.5;
  }

  // Shift a hex in HSV space (hue degrees, multiplicative saturation, additive
  // value). Pure helper so callers can stay in hex strings.
  function shift(hex, hueDelta, satScale, valueDelta) {
    const hsv = hsvOf(hex);
    return hexOf(hsv.h + hueDelta, hsv.s * (satScale == null ? 1 : satScale), hsv.v + (valueDelta || 0));
  }

  // Grey ladder between lo and hi (inclusive ends, n stops).
  function ladder(lo, hi, n) {
    const out = [];
    for (let i = 0; i < n; i += 1) {
      const t = n <= 1 ? 1 : i / (n - 1);
      out.push(greyOf(lo + (hi - lo) * t));
    }
    return out;
  }

  const memo = new Map();

  // The Theme's decorative table for one palette + weird value. Every entry
  // is a lowercase #rrggbb hex (ramps are arrays, deep first):
  //
  //   ember      fire ramp (deep, mid, hot, pale)
  //   metal      gold ramp (deep, mid, hot)
  //   chrome     chrome env (hi, mid, lo)
  //   stone      marble veins (hi, lo)
  //   flare      post light colour (lens flare / leaks / sparkles / sweep)
  //   flash      full-frame flash (strobe)
  //   streak     anamorphic tint
  //   shape      shape-layer underline
  //   figEmbed   five figure tones (accent, accent+40, fig, fig complement, text)
  //   fxPairs    three effect pairs (objfx-style A/B stages)
  //   fillerFor  kind -> hex for filler clips without their own colour
  //
  // Returns null without a full palette (callers keep their literals).
  function embeddedFor(paletteColors, axes) {
    const list = upgrade(paletteColors);
    if (!list) return null;
    const weird = weirdOf(axes);
    const key = `${list.join(',').toLowerCase()}|${weird.toFixed(2)}`;
    const hit = memo.get(key);
    if (hit) return hit;
    const table = build(list, weird);
    memo.set(key, table);
    if (memo.size > 64) {
      const first = memo.keys().next();
      if (!first.done) memo.delete(first.value);
    }
    return table;
  }

  function build(list, weird) {
    const mono = isMono(list);
    const accent = list[SLOT.TEXT_FILL2];
    const fig = list[SLOT.FIG_A];
    const text = list[SLOT.TEXT_FILL];
    const glow = list[SLOT.GLOW];
    const rot = mono ? 0 : weird * 130;
    const boost = mono ? 0 : 1 + Math.min(0.9, weird * 0.9);

    const accentHsv = hsvOf(accent);
    const ember = mono
      ? ladder(0.1, 0.93, 4)
      : [0.14, 0.42, 0.7, 0.94].map((v, i) =>
        hexOf(accentHsv.h + rot + [-24, -12, 0, 14][i], Math.min(1, accentHsv.s * boost * 1.1 + 0.1), v));
    const metal = mono
      ? ladder(0.28, 0.93, 3)
      : [0.3, 0.62, 0.95].map((v, i) =>
        hexOf(accentHsv.h + rot + [0, 8, 16][i], Math.min(1, accentHsv.s * boost + 0.08), v));
    const textHsv = hsvOf(text);
    const chrome = mono
      ? [greyOf(Math.min(1, textHsv.v + 0.12)), greyOf(textHsv.v), greyOf(Math.max(0.07, textHsv.v - 0.45))]
      : [
        hexOf(textHsv.h + rot, textHsv.s * 0.5 * boost, Math.min(1, textHsv.v + 0.12)),
        hexOf(textHsv.h + rot, Math.min(1, textHsv.s * boost), textHsv.v),
        hexOf(textHsv.h + rot, Math.min(1, textHsv.s * boost), Math.max(0.07, textHsv.v - 0.45)),
      ];
    // marble veins stay neutral stone, tinted towards the accent on weird runs
    const stone = mono || !(weird > 0)
      ? [greyOf(0.93), greyOf(0.45)]
      : [mixHex(greyOf(0.93), accent, weird * 0.35), mixHex(greyOf(0.45), accent, weird * 0.35)];

    const figHsv = hsvOf(fig);
    const figEmbed = mono
      ? ladder(0.15, 0.9, 5)
      : [
        hexOf(accentHsv.h + rot, Math.min(1, accentHsv.s * boost), accentHsv.v),
        hexOf(accentHsv.h + rot + 40, Math.min(1, accentHsv.s * boost), accentHsv.v),
        hexOf(figHsv.h + rot, Math.min(1, figHsv.s * boost), figHsv.v),
        hexOf(figHsv.h + rot + 180, Math.min(1, figHsv.s * boost), figHsv.v),
        hexOf(textHsv.h + rot, Math.min(1, textHsv.s * boost), textHsv.v),
      ];
    const fxPairs = mono
      ? [[greyOf(0.75), greyOf(0.45)], [greyOf(0.6), greyOf(0.35)], [greyOf(0.85), greyOf(0.3)]]
      : [0, 60, 140].map((step) => [
        hexOf(accentHsv.h + rot + step, Math.min(1, accentHsv.s * boost + 0.05), Math.min(1, accentHsv.v + 0.05)),
        hexOf(figHsv.h + rot + step, Math.min(1, figHsv.s * boost + 0.05), figHsv.v),
      ]);

    // filler clip kinds keep their hues apart on one family: the figure hue
    // stepped per kind, text kinds on the text tone.
    const KIND_STEPS = {
      spectrum: 0, waveform: 45, sineWave: 90, sine: 90, particles: 135,
      shapes: 180, pattern: 225, timer: 270, note: 270, audio: 45,
    };
    const GREY_KINDS = [0.8, 0.55, 0.9, 0.65, 0.75, 0.5, 0.85, 0.6];
    const kindOrder = Object.keys(KIND_STEPS);
    const fillerFor = (kind) => {
      if (kind === 'text' || kind === 'credits') return text;
      const step = KIND_STEPS[kind] != null ? KIND_STEPS[kind] : 0;
      if (mono) {
        const at = kindOrder.indexOf(kind) % GREY_KINDS.length;
        const v = GREY_KINDS[(at + GREY_KINDS.length) % GREY_KINDS.length];
        return lightBg(list) ? greyOf(1 - v) : greyOf(v);
      }
      return hexOf(figHsv.h + rot + step, Math.min(1, Math.max(0.35, figHsv.s) * boost), Math.min(1, Math.max(0.45, figHsv.v)));
    };

    return {
      mono, weird,
      ember, metal, chrome, stone,
      flare: glow,
      flash: text,
      streak: glow,
      shape: accent,
      figEmbed, fxPairs, fillerFor,
    };
  }

  function mixHex(aHex, bHex, t) {
    try {
      const mixed = color.mix(aHex, bHex, Math.max(0, Math.min(1, t)), 'rgb');
      return color.toHex(mixed);
    } catch {
      return aHex;
    }
  }

  // Read the Theme table out of an effect context (`palette` + `weird`), or
  // null when the context carries no full palette. `context.embedded`
  // carries user overrides (the Edit Theme colors tab stores them on
  // `styleMode.embedded`); valid entries win over the derived table.
  function themeOf(context) {
    if (!context) return null;
    const direct = context.palette && Array.isArray(context.palette.colors) ? context.palette.colors : null;
    const listed = Array.isArray(context.palettes)
      ? (context.palettes.find((entry) => entry && Array.isArray(entry.colors) && entry.colors.length) || {}).colors
      : null;
    const colors = direct && direct.length ? direct : listed;
    if (!colors) return null;
    const weird = context.weird != null ? context.weird : weirdOf(context.axes);
    const table = embeddedFor(colors, weird);
    if (!table) return null;
    return applyOverrides(table, context.embedded);
  }

  const HEX6 = /^#[0-9a-f]{6}$/i;

  function cleanHex(value) {
    return typeof value === 'string' && HEX6.test(value) ? value.toLowerCase() : null;
  }

  function cleanList(value, length) {
    if (!Array.isArray(value) || value.length !== length) return null;
    const out = [];
    for (const entry of value) {
      const hex = cleanHex(entry);
      if (!hex) return null;
      out.push(hex);
    }
    return out;
  }

  function applyOverrides(table, embedded) {
    if (!embedded || typeof embedded !== 'object') return table;
    const out = { ...table };
    let touched = false;
    for (const key of ['ember', 'metal', 'chrome', 'stone']) {
      const list = cleanList(embedded[key], table[key].length);
      if (list) {
        out[key] = list;
        touched = true;
      }
    }
    for (const key of ['flare', 'flash', 'streak', 'shape']) {
      const hex = cleanHex(embedded[key]);
      if (hex) {
        out[key] = hex;
        touched = true;
      }
    }
    const figs = cleanList(embedded.figEmbed, 5);
    if (figs) {
      out.figEmbed = figs;
      touched = true;
    }
    if (Array.isArray(embedded.fxPairs) && embedded.fxPairs.length === 3) {
      const pairs = [];
      let ok = true;
      for (const pair of embedded.fxPairs) {
        const clean = cleanList(pair, 2);
        if (!clean) {
          ok = false;
          break;
        }
        pairs.push(clean);
      }
      if (ok) {
        out.fxPairs = pairs;
        touched = true;
      }
    }
    if (embedded.filler && typeof embedded.filler === 'object') {
      const kinds = {};
      let any = false;
      for (const [kind, hex] of Object.entries(embedded.filler)) {
        const clean = cleanHex(hex);
        if (clean) {
          kinds[kind] = clean;
          any = true;
        }
      }
      if (any) {
        const base = table.fillerFor;
        out.fillerFor = (kind) => kinds[kind] || base(kind);
        touched = true;
      }
    }
    return touched ? out : table;
  }

  return {
    SIZE, SLOT, MONO_SATURATION,
    FILLER_KINDS: ['spectrum', 'waveform', 'sineWave', 'particles', 'shapes', 'pattern', 'timer', 'text'],
    weirdOf, isMono, lightBg, shift, upgrade,
    embeddedFor, themeOf,
  };
});
