(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else {
    root.SA = root.SA || {};
    root.SA.weird = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // The per-channel view of the sixth axis. `styleMode.axes.weird` stays the raw
  // 0..1 value the UI stores; each consumer derives its own scale here:
  //
  //   text    0.7 * raw    the text side is tamed, so raw 1 draws the amount the
  //                        raw 0.7 used to (and stays legible)
  //   bg      raw / 0.4    the backdrop reaches its full character at raw 0.4
  //   palette 4.5..7       text-vs-background contrast climbs with the axis
  //   glow    1..0.55      neon / inner glow shrink as the axis rises
  //   palettes 1..max      the number of theme palettes in rotation (weird 1
  //                        reaches the set's maximum)
  //
  // Every function maps 0 to a no-op value, so weird 0 keeps every existing
  // draw byte-identical and consumes no extra random.

  const TEXT_SCALE = 0.7;
  const BG_REVEAL = 0.4;
  const PALETTE_MAX = 5;
  const STROKE_VARIETY_SPAN = 0.6;
  const REPEAT_CHANCE_SPAN = 0.6;

  function clamp01(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.max(0, Math.min(1, number));
  }

  function raw(value) {
    return clamp01(value);
  }

  function text(value) {
    return clamp01(value) * TEXT_SCALE;
  }

  function bg(value) {
    return Math.min(1, clamp01(value) / BG_REVEAL);
  }

  function paletteContrast(value) {
    return 4.5 + 2.5 * raw(value);
  }

  function backdropContrast(value) {
    return 3 + 2.5 * raw(value);
  }

  function glowScale(value) {
    return 1 - 0.45 * raw(value);
  }

  // The size ladder's change rate: how often the next beat moves to another of
  // the ten size levels. Weird drives it outright; above 0, energy adds a
  // lively song's own churn. Weird 0 keeps one size for the whole song: the
  // size variation belongs to this axis alone, so energy never moves the
  // ladder there. (density is not used here: it sets letter spacing, see
  // direct.js densitySpacing.)
  function sizeChange(axes) {
    const a = axes || {};
    const w = raw(a.weird);
    if (w <= 0) return 0;
    return clamp01(1 - (1 - w) * (1 - clamp01(a.energy)));
  }

  // The colour development rides the same raw axis as two chances:
  //   basePaletteChance: a cue keeps the base palette (weird 0: every cue;
  //                      weird 1: no cue)
  //   colorChange:       the next beat moves to another scheme of its cue's
  //                      palette (weird 0: never; weird 1: every beat)
  function basePaletteChance(axes) {
    const a = axes || {};
    return 1 - raw(a.weird);
  }

  function colorChange(axes) {
    const a = axes || {};
    return raw(a.weird);
  }

  // The number of palettes of the theme's palette set the song uses: weird 0
  // keeps the single #1, weird 1 reaches `max` (clamped to 1..8).
  function paletteCount(axes, max) {
    // a missing maximum falls back to the default; an explicit 0 clamps to 1
    const limit = max == null || max === '' ? NaN : Number(max);
    const m = Math.max(1, Math.min(8, Math.round(Number.isFinite(limit) ? limit : PALETTE_MAX)));
    return 1 + Math.round((m - 1) * raw((axes || {}).weird));
  }

  // How often a stroke leaves its recommended width for an extreme (hairline
  // or very heavy) one. Weird drives it like sizeChange / colorChange: 0 keeps
  // the classic draw and consumes no random, and the chance reaches 1 at weird
  // 0.6 (the adjustment anchor); above that it stays 1.
  function strokeVariety(axes) {
    const a = axes || {};
    return Math.min(1, raw(a.weird) / STROKE_VARIETY_SPAN);
  }

  // How often the repeat arrangement (parallel repeated text) appears across
  // cues. Weird drives it like strokeVariety: 0 keeps the classic draw and
  // consumes no random, and the chance reaches 1 at weird 0.6 (the adjustment anchor);
  // above that it stays 1.
  function repeatChance(axes) {
    const a = axes || {};
    return Math.min(1, raw(a.weird) / REPEAT_CHANCE_SPAN);
  }

  // The size ladder's level weights: a Gaussian curve over the ten levels, the
  // centre 0..1 (0 = the legible floor, 1 = the screen-filling end) and the
  // spread in level units. The result sums to 1, so the ladder's weighted pick
  // always has a candidate.
  //
  // A spread of 0 is the honest delta: the whole share lands on the level
  // nearest the centre (100% on one level, 0% on the rest). The Gaussian cannot
  // do it - `(u - c) ** 2 / 0` is NaN on the peak and 0 everywhere else - and a
  // per-level floor would cap the peak below 1 no matter how narrow the spread
  // got (0.02 x 9 leftovers left at most 1 / 1.18). The ladder needs nothing
  // more than the delta: its candidate filter keeps the levels above a tenth of
  // the peak, so one real level means every beat holds it. A missing spread
  // still falls back to the old 0.28.
  function sizeWeights(n, center, spread) {
    const count = Math.max(2, Math.min(64, Math.round(Number(n) || 10)));
    const c = clamp01(center == null ? 0.5 : center);
    const raw = spread == null || spread === '' ? 0.28 : Number(spread);
    const sp = Number.isFinite(raw) ? Math.max(0, raw) : 0.28;
    // the level the centre sits on: the delta's peak, and the fallback when the
    // Gaussian underflows to zero on every level (a spread far below the 1 /
    // (count - 1) grid step)
    const peak = Math.round(c * (count - 1));
    const delta = () => {
      const out = [];
      for (let k = 0; k < count; k += 1) out.push(k === peak ? 1 : 0);
      return out;
    };
    if (sp <= 0) return delta();
    const out = [];
    for (let k = 0; k < count; k += 1) {
      const u = k / (count - 1);
      out.push(Math.exp(-((u - c) ** 2) / (2 * sp * sp)));
    }
    const total = out.reduce((sum, value) => sum + value, 0);
    if (!(total > 0)) return delta();
    return out.map((value) => value / total);
  }

  return {
    TEXT_SCALE,
    BG_REVEAL,
    PALETTE_MAX,
    STROKE_VARIETY_SPAN,
    REPEAT_CHANCE_SPAN,
    clamp01,
    raw,
    text,
    bg,
    paletteContrast,
    backdropContrast,
    glowScale,
    sizeChange,
    basePaletteChance,
    colorChange,
    strokeVariety,
    repeatChance,
    paletteCount,
    sizeWeights,
  };
});
