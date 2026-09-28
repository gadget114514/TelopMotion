(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.SA = root.SA || {};
    root.SA.patternVariants = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // A deterministic library of backdrop pattern kinds. The `pattern` effect
  // draws one of thirteen modes; each mode is varied along the two dimensions
  // that stay readable at any frame size: the element size (log 1.4 steps, §2
  // of doc/repeat-design.md) and the number of elements (integer steps of 1.3x
  // or more). mode x size x count is 1404 distinguishable looks, enough for an
  // 800-demo run (and any song) to play without repeating one.
  const MODES = ['grid', 'dots', 'stripes', 'rings', 'triangles', 'diamonds', 'hexes', 'rain', 'checks', 'polka', 'sineCurve', 'waves', 'randomFill'];
  const SIZE_STOPS = [0.2, 0.28, 0.39, 0.55, 0.77, 1.08, 1.51, 2.11, 2.95];
  const COUNT_STOPS = [4, 6, 8, 11, 15, 20, 27, 36, 49, 66, 90, 120];
  // extra life inside a look: the exact speed and opacity do not change the
  // signature, they only keep neighbouring variants from feeling identical.
  // No entry is 0, so a backdrop pattern always animates.
  const SPEED_STOPS = [0.25, 0.5, 0.9, 1.6];
  const OPACITY_STOPS = [0.35, 0.5, 0.7];
  const TOTAL = MODES.length * SIZE_STOPS.length * COUNT_STOPS.length;

  function clampIndex(index) {
    const number = Number(index);
    if (!Number.isFinite(number)) return 0;
    const rounded = Math.floor(number) % TOTAL;
    return rounded < 0 ? rounded + TOTAL : rounded;
  }

  // Consecutive indices change the mode, then the size, then the count, so a
  // per-cue backdrop never shows the same dimension twice in a row.
  function at(index) {
    const i = clampIndex(index);
    const mode = MODES[i % MODES.length];
    const size = SIZE_STOPS[Math.floor(i / MODES.length) % SIZE_STOPS.length];
    const count = COUNT_STOPS[Math.floor(i / (MODES.length * SIZE_STOPS.length)) % COUNT_STOPS.length];
    return {
      index: i,
      mode,
      size,
      count,
      speed: SPEED_STOPS[i % SPEED_STOPS.length],
      opacity: OPACITY_STOPS[Math.floor(i / SPEED_STOPS.length) % OPACITY_STOPS.length],
      key: `${mode}|${size}|${count}`,
    };
  }

  const VARIANTS = Array.from({ length: TOTAL }, (_, i) => at(i));

  function keyOf(variant) {
    const value = variant || {};
    return `${value.mode}|${value.size}|${value.count}`;
  }

  return {
    MODES,
    SIZE_STOPS,
    COUNT_STOPS,
    SPEED_STOPS,
    OPACITY_STOPS,
    count: () => TOTAL,
    at,
    variants: () => VARIANTS.map((variant) => ({ ...variant })),
    keyOf,
  };
});
