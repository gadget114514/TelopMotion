(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./weird'));
  else {
    root.SA = root.SA || {};
    root.SA.genParams = factory(root.SA.weird);
  }
})(typeof self !== 'undefined' ? self : this, function (weird) {
  'use strict';

  // The automatic direction's tunable parameters. Every key has a derived
  // value read from the eight axes (`derive`) and an optional manual override
  // (`styleMode.params`, stored only for the keys the user fixed). `resolve`
  // overlays the fixed keys on the derived ones and clamps them to the
  // parameter's own range, so a project without manual values (and weird 0)
  // reproduces the classic generator exactly.
  //
  // `kind` tells the consumers (and the theme dialog) what the number means:
  //   chance  a probability, 0..1. Drawn with `roll`.
  //   weight  a share of its group; the group is normalized before the draw
  //           (`pickWeighted`). A missing key counts as 0.
  //   amount  a quantity, not a draw: it scales or shapes another draw.
  //
  // `tab` / `group` only order the Studio's theme dialog.

  const AXIS_DEFAULTS = { speed: 0.5, energy: 0.5, softness: 0.5, density: 0.5, brightness: 0.5, weird: 0, smartness: 0, fear: 0 };

  function clamp01(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.max(0, Math.min(1, number));
  }

  function axisValue(axes, key) {
    const value = axes ? axes[key] : undefined;
    if (value == null || value === '' || !Number.isFinite(Number(value))) return AXIS_DEFAULTS[key] == null ? 0.5 : AXIS_DEFAULTS[key];
    return clamp01(value);
  }

  // The derived formulas read these channels. `w` is the raw weird axis (the
  // same value every generator reads); `t` is the tamed text channel (0.7
  // scale, the same value `ctx.w` carries) and `b` the backdrop channel that
  // saturates at raw 0.4 (the old `wWidth`). softness / brightness keep their
  // full name via `soft` / `bright`.
  function axisView(axes) {
    const rawW = weird && typeof weird.raw === 'function' ? weird.raw(axes && axes.weird) : clamp01(axes && axes.weird);
    return {
      speed: axisValue(axes, 'speed'),
      e: axisValue(axes, 'energy'),
      soft: axisValue(axes, 'softness'),
      d: axisValue(axes, 'density'),
      bright: axisValue(axes, 'brightness'),
      w: rawW,
      t: weird && typeof weird.text === 'function' ? weird.text(rawW) : 0.7 * rawW,
      b: weird && typeof weird.bg === 'function' ? weird.bg(rawW) : Math.min(1, rawW / 0.4),
      s: axisValue(axes, 'smartness'),
      fear: axisValue(axes, 'fear'),
    };
  }

  // The parameter table. `min` / `max` clamp both the manual value and the
  // slider; `chance` rows are always 0..1 and `weight` rows are group shares.
  // `derive` is the automatic value the axes produce.
  const PARAMS = [
    // font sizes
    { key: 'sizeChange', kind: 'chance', tab: 'font', group: 'size', min: 0, max: 1, step: 0.05, derive: (a, axes) => weird.sizeChange(axes) },
    { key: 'sizeCenter', kind: 'amount', tab: 'font', group: 'size', min: 0, max: 1, step: 0.05, derive: (a) => 0.5 + 0.1 * Math.min(1, a.w / 0.6) + 0.1 * (a.e - 0.5) },
    { key: 'sizeSpread', kind: 'amount', tab: 'font', group: 'size', min: 0, max: 0.6, step: 0.01, derive: (a) => 0.18 + 0.22 * a.w },
    { key: 'sizeFollow', kind: 'amount', tab: 'font', group: 'size', min: 0, max: 1, step: 0.05, derive: (a) => 0.2 * a.b },
    // the readable floor of the size ladder, as a multiplier: weird 0 keeps the
    // legibility minimum (1), weird 0.6 doubles it and weird 1 reaches 2.67, so
    // a weird song never whispers
    { key: 'sizeFloor', kind: 'amount', tab: 'font', group: 'size', min: 1, max: 4, step: 0.05, derive: (a) => 1 + a.w / 0.6 },
    { key: 'heroScale', kind: 'amount', tab: 'font', group: 'size', min: 1, max: 2.5, step: 0.05, derive: (a) => 1 + 0.3 * a.w },
    // stroke variety: how often an outline / shape layer stroke leaves its
    // recommended width for an extreme one (hairline or very heavy). Weird
    // drives it through weird.strokeVariety (0 at weird 0, 1 at weird 0.6).
    { key: 'strokeVariety', kind: 'chance', tab: 'font', group: 'stroke', min: 0, max: 1, step: 0.05, derive: (a, axes) => weird.strokeVariety(axes) },
    // foreground fill weights; `boldChance` is the chance a cue's body is 700
    { key: 'fgSolid', kind: 'weight', tab: 'font', group: 'fg', min: 0, max: 3, step: 0.05, derive: () => 1 },
    { key: 'fgVivid', kind: 'weight', tab: 'font', group: 'fg', min: 0, max: 3, step: 0.05, derive: (a) => 1.2 * a.w },
    { key: 'fgGradient', kind: 'weight', tab: 'font', group: 'fg', min: 0, max: 3, step: 0.05, derive: (a) => 1.0 * a.w },
    { key: 'fgEffect', kind: 'weight', tab: 'font', group: 'fg', min: 0, max: 3, step: 0.05, derive: (a) => 0.6 * a.w * (0.5 + a.e) },
    // a pattern fill (stripes / checker / diamond / hatch) drawn straight from
    // the readable pattern fills, not through the mood pool, so it shows up well
    // before the weird gate of the pool's own fill effects
    { key: 'fgPattern', kind: 'weight', tab: 'font', group: 'fg', min: 0, max: 3, step: 0.05, derive: (a) => 0.5 * a.w },
    { key: 'boldChance', kind: 'chance', tab: 'font', group: 'fg', min: 0, max: 1, step: 0.05, derive: (a) => 0.25 + 0.5 * a.e },
    // surrounding decoration weights; outline leads so a weird project keeps a
    // separation even before the repair pass runs
    { key: 'decoNone', kind: 'weight', tab: 'font', group: 'deco', min: 0, max: 3, step: 0.05, derive: () => 1 },
    { key: 'decoOutline', kind: 'weight', tab: 'font', group: 'deco', min: 0, max: 3, step: 0.05, derive: (a) => 2.2 * a.w },
    { key: 'decoShadow', kind: 'weight', tab: 'font', group: 'deco', min: 0, max: 3, step: 0.05, derive: (a) => 1.6 * a.w },
    { key: 'decoExtrude', kind: 'weight', tab: 'font', group: 'deco', min: 0, max: 3, step: 0.05, derive: (a) => 0.9 * a.w * (1 - a.soft) },
    { key: 'decoLongShadow', kind: 'weight', tab: 'font', group: 'deco', min: 0, max: 3, step: 0.05, derive: (a) => 0.7 * a.w * (1 - a.soft) },
    { key: 'decoDouble', kind: 'weight', tab: 'font', group: 'deco', min: 0, max: 3, step: 0.05, derive: (a) => 0.6 * a.w * (0.4 + 0.6 * a.soft) },
    { key: 'decoGlow', kind: 'weight', tab: 'font', group: 'deco', min: 0, max: 3, step: 0.05, derive: (a) => 0.9 * a.w * (1 - a.bright) },
    // a template without a graphic may gain a shape layer (compose mode)
    { key: 'graphicChance', kind: 'chance', tab: 'font', group: 'graphic', min: 0, max: 1, step: 0.05, derive: (a) => 0.3 + 0.4 * a.w },
    // text treatment: one cue-level font draw and the per-beat follow-ups
    { key: 'fontChance', kind: 'chance', tab: 'font', group: 'font', min: 0, max: 1, step: 0.05, derive: (a) => Math.min(1, 0.9 * a.t) },
    { key: 'beatFontChance', kind: 'chance', tab: 'font', group: 'font', min: 0, max: 1, step: 0.05, derive: (a) => Math.min(1, 0.7 * a.t) },
    { key: 'beatBoldChance', kind: 'chance', tab: 'font', group: 'font', min: 0, max: 1, step: 0.05, derive: (a) => 0.3 * a.t },
    { key: 'spacingChance', kind: 'chance', tab: 'font', group: 'font', min: 0, max: 1, step: 0.05, derive: (a) => a.t },
    { key: 'spacingRange', kind: 'amount', tab: 'font', group: 'font', min: 0, max: 1, step: 0.05, derive: (a) => a.t },
    { key: 'alignChance', kind: 'chance', tab: 'font', group: 'font', min: 0, max: 1, step: 0.05, derive: (a) => 0.3 * a.t },
    { key: 'widthChance', kind: 'chance', tab: 'font', group: 'font', min: 0, max: 1, step: 0.05, derive: (a) => 0.5 * a.t },
    // beat colour / fill / mask
    { key: 'accentColorChance', kind: 'chance', tab: 'font', group: 'fg', min: 0, max: 1, step: 0.05, derive: (a) => 0.5 * a.t },
    { key: 'gradientColorChance', kind: 'chance', tab: 'font', group: 'fg', min: 0, max: 1, step: 0.05, derive: (a) => 0.3 * a.t },
    { key: 'fillEffectChance', kind: 'chance', tab: 'font', group: 'fg', min: 0, max: 1, step: 0.05, derive: (a) => 0.3 * a.t },
    { key: 'patternFillChance', kind: 'chance', tab: 'font', group: 'fg', min: 0, max: 1, step: 0.05, derive: (a) => 0.3 * a.t },
    { key: 'beatDecoChance', kind: 'chance', tab: 'font', group: 'deco', min: 0, max: 1, step: 0.05, derive: (a) => 0.3 * a.t },
    { key: 'maskChance', kind: 'chance', tab: 'font', group: 'mask', min: 0, max: 1, step: 0.05, derive: (a) => 0.3 * a.t },
    // text background and ornaments: presence, placement weights and the
    // small variants. `bgEnclose` picks the enclose placement; a square drawn
    // there is the definition background (a per-letter cell square), while
    // accent / underlay and every other shape are text ornaments. The keys
    // stay as they are for saved profile compatibility.
    { key: 'textBgChance', kind: 'chance', tab: 'font', group: 'textBg', min: 0, max: 1, step: 0.05, derive: (a) => Math.min(1, 0.4 * (0.08 + 0.22 * a.d + 0.5 * a.t)) },
    { key: 'bgEnclose', kind: 'weight', tab: 'font', group: 'textBg', min: 0, max: 3, step: 0.05, derive: () => 0.55 },
    { key: 'bgAccent', kind: 'weight', tab: 'font', group: 'textBg', min: 0, max: 3, step: 0.05, derive: () => 0.25 },
    { key: 'bgUnderlay', kind: 'weight', tab: 'font', group: 'textBg', min: 0, max: 3, step: 0.05, derive: () => 0.2 },
    { key: 'bgVaryChance', kind: 'chance', tab: 'font', group: 'textBg', min: 0, max: 1, step: 0.05, derive: (a) => 0.3 + 0.7 * a.t },
    { key: 'bgEdgeChance', kind: 'chance', tab: 'font', group: 'textBg', min: 0, max: 1, step: 0.05, derive: () => 0.4 },
    // how far the ornament marks scatter from their letter: centre offset,
    // size and colour (0 = every mark sits centred, letter-sized, one colour; the size scatter
    // also spreads the look's base size from 0.65x to 1.7x of the letter)
    { key: 'bgOffsetScatter', kind: 'amount', tab: 'font', group: 'textBg', min: 0, max: 1, step: 0.05, derive: () => 0 },
    { key: 'bgSizeScatter', kind: 'amount', tab: 'font', group: 'textBg', min: 0, max: 1, step: 0.05, derive: () => 0.5 },
    { key: 'bgColorScatter', kind: 'amount', tab: 'font', group: 'textBg', min: 0, max: 1, step: 0.05, derive: (a) => 0.3 * a.t },
    // palette / backdrop
    { key: 'colorChange', kind: 'chance', tab: 'palette', group: 'color', min: 0, max: 1, step: 0.05, derive: (a, axes) => weird.colorChange(axes) },
    { key: 'paletteSwitchChance', kind: 'chance', tab: 'palette', group: 'color', min: 0, max: 1, step: 0.05, derive: (a) => a.w },
    { key: 'paletteInvertChance', kind: 'chance', tab: 'palette', group: 'color', min: 0, max: 1, step: 0.05, derive: (a) => a.w / 3 },
    { key: 'schemeRange', kind: 'amount', tab: 'palette', group: 'color', min: 0, max: 1, step: 0.05, derive: (a) => (a.w < 0.8 ? 0.2 : 1) },
    { key: 'planes1', kind: 'weight', tab: 'palette', group: 'planes', min: 0, max: 2, step: 0.01, derive: (a) => 1 - 0.7 * a.b },
    { key: 'planes2', kind: 'weight', tab: 'palette', group: 'planes', min: 0, max: 2, step: 0.01, derive: (a) => 1.2 * a.b },
    { key: 'planes3', kind: 'weight', tab: 'palette', group: 'planes', min: 0, max: 2, step: 0.01, derive: (a) => 0.8 * Math.min(1, a.w / 0.5) },
    { key: 'planes4', kind: 'weight', tab: 'palette', group: 'planes', min: 0, max: 2, step: 0.01, derive: (a) => Math.max(0, (a.w - 0.75) / 0.25) },
    // motion: tilt / location / repeat / clones / hold
    { key: 'tiltChance', kind: 'chance', tab: 'axis', group: 'motion', min: 0, max: 1, step: 0.05, derive: (a) => 0.4 * a.t },
    { key: 'tiltRange', kind: 'amount', tab: 'axis', group: 'motion', min: 0, max: 1, step: 0.05, derive: (a) => a.t },
    { key: 'locationChance', kind: 'chance', tab: 'axis', group: 'motion', min: 0, max: 1, step: 0.05, derive: (a) => 0.5 * a.t },
    { key: 'locationRange', kind: 'amount', tab: 'axis', group: 'motion', min: 0, max: 0.5, step: 0.01, derive: (a) => 0.25 * a.t },
    { key: 'floatChance', kind: 'chance', tab: 'axis', group: 'motion', min: 0, max: 1, step: 0.05, derive: (a) => (a.t >= 0.6 ? 0.3 * a.t : 0) },
    { key: 'repeatChance', kind: 'chance', tab: 'axis', group: 'motion', min: 0, max: 1, step: 0.05, derive: (a) => 0.35 * a.t },
    { key: 'clonesChance', kind: 'chance', tab: 'axis', group: 'motion', min: 0, max: 1, step: 0.05, derive: (a) => 0.5 * a.t },
    { key: 'holdChance', kind: 'chance', tab: 'axis', group: 'motion', min: 0, max: 1, step: 0.05, derive: (a) => 0.45 * a.t },
    { key: 'pulseChance', kind: 'chance', tab: 'axis', group: 'motion', min: 0, max: 1, step: 0.05, derive: () => 0.1 },
    { key: 'motionChance', kind: 'chance', tab: 'axis', group: 'motion', min: 0, max: 1, step: 0.05, derive: (a) => 0.3 * a.t },
    // figures / post
    { key: 'figureDensity', kind: 'amount', tab: 'axis', group: 'figure', min: 0, max: 1, step: 0.05, derive: (a) => Math.max(0, Math.min(1, 0.25 + 0.6 * a.e + 0.2 * a.b)) },
    { key: 'figureBoldChance', kind: 'chance', tab: 'axis', group: 'figure', min: 0, max: 1, step: 0.05, derive: (a) => Math.min(1, a.b) * (1 - 0.5 * a.s) },
    { key: 'postBlurChance', kind: 'chance', tab: 'axis', group: 'figure', min: 0, max: 1, step: 0.05, derive: (a) => Math.max(0, (a.w - 0.75) / 0.25) },
  ];

  const BY_KEY = new Map(PARAMS.map((def) => [def.key, def]));

  // The keys of a weight group, in table order. The consumers pass them to
  // `pickWeighted` so the draw order is stable.
  function keysOf(group) {
    return PARAMS.filter((def) => def.kind === 'weight' && def.group === group).map((def) => def.key);
  }

  const FG_KEYS = keysOf('fg');
  const DECO_KEYS = keysOf('deco');
  const PLANE_KEYS = keysOf('planes');
  const TEXT_BG_KEYS = keysOf('textBg');

  // The display form of a value: three decimals (the UI only).
  function display(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number * 1000) / 1000 : 0;
  }

  function derive(axes) {
    const a = axisView(axes);
    const out = {};
    for (const def of PARAMS) {
      const value = def.derive(a, axes);
      out[def.key] = Number.isFinite(value) ? value : 0;
    }
    return out;
  }

  function clampTo(def, value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    return Math.max(def.min, Math.min(def.max, number));
  }

  // The final values for one run: derived overlaid with the manual keys of the
  // source (`styleMode` or `{ axes, params }`), each clamped to its range.
  function resolve(source) {
    const input = source || {};
    const auto = derive(input.axes || {});
    const manual = input.params || {};
    const out = {};
    for (const def of PARAMS) {
      const fixed = clampTo(def, manual[def.key]);
      out[def.key] = fixed == null ? auto[def.key] : fixed;
    }
    return out;
  }

  function isPinned(styleMode, key) {
    const params = styleMode && styleMode.params;
    if (!params || !BY_KEY.has(key)) return false;
    return clampTo(BY_KEY.get(key), params[key]) != null;
  }

  // One chance draw. A chance of 0 (or an unusable value) consumes no random,
  // so a zeroed parameter never shifts the stream.
  function roll(random, chance) {
    if (!(Number(chance) > 0)) return false;
    return random() < Number(chance);
  }

  // The widest stroke swing: an extreme width is `base * factor` (heavy) or
  // `base / factor` (hairline) with the factor drawn from exp(ln(K) * u). Both
  // ends land on K when u = 1; u = 0 is the base itself. A variety of 0 is the
  // identity and consumes no random, so weird 0 keeps every existing draw.
  const EXTREME_K = 8;

  function extremeFactor(random) {
    return Math.exp(Math.log(EXTREME_K) * Math.max(0, Math.min(1, random())));
  }

  // Re-rolls `base` into an extreme stroke with probability `variety`. Thin and
  // heavy are 50:50, and the result is clamped to the parameter's own range.
  function extremeStroke(random, base, min, max, variety) {
    if (!(Number(variety) > 0)) return base;
    if (!(random() < Number(variety))) return base;
    const factor = extremeFactor(random);
    const heavy = random() < 0.5;
    const value = heavy ? base * factor : base / factor;
    const lo = Number.isFinite(Number(min)) ? Number(min) : 0;
    const hi = Number.isFinite(Number(max)) ? Number(max) : value;
    return Math.max(lo, Math.min(hi, value));
  }

  // Normalizes a weight group to a probability distribution. Returns null when
  // every weight is 0 (nothing to draw). Missing keys count as 0.
  function normalizeChances(obj, keys) {
    if (!Array.isArray(keys) || !keys.length) return null;
    const out = {};
    let total = 0;
    for (const key of keys) {
      const value = Number(obj && obj[key]);
      const weight = Number.isFinite(value) && value > 0 ? value : 0;
      out[key] = weight;
      total += weight;
    }
    if (!(total > 0)) return null;
    for (const key of keys) out[key] /= total;
    return out;
  }

  // One weighted draw from a group: one random, the group normalized exactly
  // like `normalizeChances`, null when the whole group is 0 (no random).
  function pickWeighted(random, weights, keys) {
    const chances = normalizeChances(weights, keys);
    if (!chances) return null;
    let rollValue = random();
    let last = null;
    for (const key of keys) {
      last = key;
      rollValue -= chances[key];
      if (rollValue <= 0) return key;
    }
    return last;
  }

  // The weight of one effect type: 1 unless the profile says otherwise.
  function typeWeight(styleMode, group, type) {
    const groups = styleMode && styleMode.typeWeights;
    const table = groups && group ? groups[group] : null;
    const value = table && type != null ? table[type] : null;
    if (value == null || !Number.isFinite(Number(value))) return 1;
    return Math.max(0, Number(value));
  }

  // The smallest type weight a style's instances carry: a look built around a
  // weighted-out type has to drop it.
  const LOOK_GROUPS = ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'background', 'bgShape', 'bgFill', 'bgEdge', 'bgMotion', 'ornShape', 'ornFill', 'ornEdge', 'ornMotion', 'repeat'];

  function lookTypeWeight(styleMode, style) {
    if (!styleMode || !styleMode.typeWeights || !style || typeof style !== 'object') return 1;
    let min = 1;
    for (const group of LOOK_GROUPS) {
      const value = style[group];
      if (!value) continue;
      const list = Array.isArray(value) ? value : [value];
      for (const instance of list) {
        if (!instance || !instance.type) continue;
        min = Math.min(min, typeWeight(styleMode, group, instance.type));
      }
    }
    return min;
  }

  return {
    AXIS_DEFAULTS,
    PARAMS,
    FG_KEYS,
    DECO_KEYS,
    PLANE_KEYS,
    TEXT_BG_KEYS,
    EXTREME_K,
    keysOf,
    axisView,
    display,
    derive,
    resolve,
    isPinned,
    roll,
    extremeFactor,
    extremeStroke,
    pickWeighted,
    typeWeight,
    lookTypeWeight,
    normalizeChances,
  };
});
