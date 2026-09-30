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
  //
  // Every function maps 0 to a no-op value, so weird 0 keeps every existing
  // draw byte-identical and consumes no extra random.

  const TEXT_SCALE = 0.7;
  const BG_REVEAL = 0.4;

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
  // the ten size levels. Weird drives it outright; energy adds a lively song's
  // own churn. 0 keeps one size for the whole song. (density is not used here:
  // it sets letter spacing, see direct.js densitySpacing.)
  function sizeChange(axes) {
    const a = axes || {};
    return clamp01(1 - (1 - raw(a.weird)) * (1 - clamp01(a.energy)));
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

  return {
    TEXT_SCALE,
    BG_REVEAL,
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
  };
});
