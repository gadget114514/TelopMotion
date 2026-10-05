(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else {
    root.SA = root.SA || {};
    root.SA.letterVary = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Shared per-letter variation coefficient: k in [-1, 1] for letter i of n.
  // Used by the clone perLetter shift and by the letter strike-through.
  function value(vary, i, n, rng, freq) {
    if (vary === 'alternate') return i % 2 ? 1 : -1;
    if (vary === 'random') return (typeof rng === 'function' ? rng() : Math.random()) * 2 - 1;
    if (vary === 'wave') return Math.sin((i / Math.max(1, n)) * Math.PI * 2 * (freq || 1));
    if (vary === 'ramp') return n <= 1 ? 0 : (i / (n - 1)) * 2 - 1;
    return 0; // none / cycle
  }

  // range=[min,max] -> k=-1 gives min, k=1 gives max
  function lerpRange(range, k) {
    const list = Array.isArray(range) ? range : [0, 0];
    const a = Number(list[0]) || 0;
    const b = Number(list[1]) || 0;
    return a + (b - a) * (k + 1) / 2;
  }

  // colour / font selection for letter i with coefficient k
  function pickList(list, vary, i, k) {
    if (!list || !list.length) return null;
    if (vary === 'random' || vary === 'wave' || vary === 'ramp') {
      return list[Math.min(list.length - 1, Math.floor((k + 1) / 2 * list.length))];
    }
    return list[i % list.length]; // alternate / cycle / none
  }

  // perLetter -> one variant per letter: { k, dx, dy, opacity, skew, rotate,
  // color, font }. `rngs` carries one rng per axis for independent `random`
  // streams ({ dx, dy, opacity, skew, rotate, pick }); a single function is
  // used for every axis when the caller passes one.
  function planLetterVariants(count, perLetter, rngs) {
    const p = perLetter || {};
    const vary = p.vary || 'alternate';
    const shared = typeof rngs === 'function' ? rngs : null;
    const stream = (key) => {
      if (shared) return shared;
      if (rngs && typeof rngs[key] === 'function') return rngs[key];
      return null;
    };
    const out = [];
    for (let i = 0; i < count; i += 1) {
      const k = value(vary, i, count, stream('pick'), p.waveFreq);
      out.push({
        k,
        dx: lerpRange(p.dx, value(vary, i, count, stream('dx'), p.waveFreq)),
        dy: lerpRange(p.dy, value(vary, i, count, stream('dy'), p.waveFreq)),
        opacity: lerpRange(p.opacity || [1, 1], value(vary, i, count, stream('opacity'), p.waveFreq)),
        skew: lerpRange(p.skew, value(vary, i, count, stream('skew'), p.waveFreq)),
        rotate: lerpRange(p.rotate, value(vary, i, count, stream('rotate'), p.waveFreq)),
        color: pickList(p.colors, vary, i, k),
        font: pickList(p.fonts, vary, i, k),
      });
    }
    return out;
  }

  return { value, lerpRange, pickList, planLetterVariants };
});
