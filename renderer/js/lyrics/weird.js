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
  };
});
