(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./registry'));
  else {
    root.SA = root.SA || {};
    root.SA.warp = factory(root.SA.fx);
  }
})(typeof self !== 'undefined' ? self : this, function (fx) {
  'use strict';

  const TAU = Math.PI * 2;

  function clamp(value, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return min;
    return number < min ? min : number > max ? max : number;
  }

  function clamp01(value) {
    return clamp(value, 0, 1);
  }

  // --- deformation codes -------------------------------------------------------
  // 1-19 deform the letter around its own centre (px relative to the bbox
  // centre), 20-39 warp the whole block (Illustrator-style warps). The GLSL in
  // gl/shaders.js switches on these codes; this table is the single source.
  //
  // `zoomBlock` (31) is the true "font size" primitive: it scales the whole
  // block around its centre, so the letters grow *and* the spacing between them
  // grows with them. A per-letter scale would only inflate each glyph in place.

  const LETTER_CODES = {
    jelly: 1,
    wobbleWarp: 2,
    twist: 3,
    breathing: 4,
    melt: 5,
    bend: 6,
    bulge: 7,
    pinch: 8,
    taper: 9,
    shearWave: 10,
    ripple: 11,
    squash: 12,
    flag: 13,
    zigzag: 14,
    stretch: 15,
    skew: 16,
    swirl: 17,
    twist3D: 18,
  };
  const BLOCK_CODES = {
    arc: 20,
    arch: 21,
    bulgeBlock: 22,
    flagBlock: 23,
    waveBlock: 24,
    fish: 25,
    rise: 26,
    fisheye: 27,
    inflate: 28,
    squeeze: 29,
    twistBlock: 30,
    zoomBlock: 31,
  };
  // the warp style dropdown should not offer the size primitive: it has no
  // `bend` semantics and its own effects (fontSize / fillScreen / megaZoom)
  const BLOCK_WARP_STYLES = Object.keys(BLOCK_CODES).filter((name) => name !== 'zoomBlock');
  const DEFORM_CODES = { ...LETTER_CODES, ...BLOCK_CODES };

  const NAME_BY_CODE = {};
  for (const [name, code] of Object.entries(DEFORM_CODES)) NAME_BY_CODE[code] = name;

  function codeOf(name) {
    return DEFORM_CODES[name] || 0;
  }

  function deformSpace(code) {
    return Number(code) >= 20 ? 'block' : 'letter';
  }

  function spaceOfName(name) {
    return LETTER_CODES[name] ? 'letter' : BLOCK_CODES[name] ? 'block' : null;
  }

  // --- block-warp distortion (the horizontal / vertical pair) ----------------
  // The horizontal / vertical distortion of the block warps share the single
  // `param` float: both -1..1 values are rounded to 0..99 and packed as
  // hDistort * 100 + vDistort.

  function encodeWarpParam(hDistort, vDistort) {
    const h = Math.round(((clamp(hDistort, -1, 1) + 1) / 2) * 99);
    const v = Math.round(((clamp(vDistort, -1, 1) + 1) / 2) * 99);
    return h * 100 + v;
  }

  function decodeWarpParam(param) {
    const value = Math.max(0, Number(param) || 0);
    const h = Math.floor(value / 100);
    const v = value - h * 100;
    return { hDistort: (h / 99) * 2 - 1, vDistort: (v / 99) * 2 - 1 };
  }

  // Packs a deform entry for the per-letter state texture. `param` is the
  // code's own frequency / distortion float.
  function deformEntry(type, amount, time, param) {
    return { type, amount, time, param: param == null ? 0 : param };
  }

  // --- animation helpers -------------------------------------------------------

  const ANIMATE_OPTIONS = ['static', 'pulse', 'sway', 'travel'];

  // the beat tempo in Hz (same convention as animator.beatRate)
  function beatRate(info) {
    const bpm = info && info.audioFeatures && Number(info.audioFeatures.bpm);
    return bpm > 0 ? bpm / 60 : 2;
  }

  // applies `animate` to the warp amount (and returns the time to pass on).
  // `phase` is an extra offset in radians, so a per-letter phase does not get
  // scaled by the rate.
  function animateWarp(animate, amount, speed, time, sync, info, phase) {
    const shift = Number.isFinite(phase) ? phase : 0;
    const rate = sync === 'beat' ? beatRate(info) : clamp(speed, 0.05, 8);
    if (animate === 'pulse') return { amount: amount * (0.5 + 0.5 * Math.sin(TAU * rate * time + shift)), time: time };
    if (animate === 'sway') return { amount: amount * Math.sin(TAU * rate * time + shift), time: time };
    // travel keeps the amplitude and moves the wave through the block
    if (animate === 'travel') return { amount, time: time * rate * TAU + shift };
    return { amount, time };
  }

  // --- registry hooks ----------------------------------------------------------

  const BLOCK_STYLE_OPTIONS = BLOCK_WARP_STYLES;
  const LETTER_STYLE_OPTIONS = ['bend', 'bulge', 'pinch', 'taper', 'shearWave', 'ripple', 'squash', 'flag', 'zigzag'];
  const ALL_STYLE_OPTIONS = ['none', ...Object.keys(DEFORM_CODES)];

  fx.register({
    group: 'hold',
    type: 'warp',
    tags: ['deform', 'pro'],
    pack: 'pro',
    cost: 2,
    params: [
      { key: 'style', kind: 'select', options: BLOCK_STYLE_OPTIONS, default: 'arc', section: 'warp' },
      { key: 'bend', kind: 'number', min: -1, max: 1, step: 0.01, default: 0.3, random: [0.15, 0.6], section: 'warp' },
      { key: 'hDistort', kind: 'number', min: -1, max: 1, step: 0.01, default: 0, section: 'warp' },
      { key: 'vDistort', kind: 'number', min: -1, max: 1, step: 0.01, default: 0, section: 'warp' },
      { key: 'animate', kind: 'select', options: ANIMATE_OPTIONS, default: 'static', section: 'warp' },
      { key: 'speed', kind: 'number', min: 0.05, max: 4, step: 0.05, default: 0.5, section: 'warp' },
      { key: 'sync', kind: 'select', options: ['free', 'beat'], default: 'free', section: 'warp' },
    ],
    normalize(params) {
      const style = BLOCK_CODES[params.style] ? params.style : 'arc';
      return {
        ...params,
        style,
        bend: clamp(params.bend, -1, 1),
        hDistort: clamp(params.hDistort, -1, 1),
        vDistort: clamp(params.vDistort, -1, 1),
      };
    },
    cpu(state, h, env, params, rng, info) {
      const style = BLOCK_CODES[params.style] ? params.style : 'arc';
      const bend = params.bend == null ? 0.3 : Number(params.bend);
      const animated = animateWarp(params.animate, bend, params.speed, h, params.sync, info);
      const amount = animated.amount * env;
      if (Math.abs(amount) < 0.0001) return;
      state.deform.push(
        deformEntry(style, amount, animated.time, encodeWarpParam(params.hDistort, params.vDistort))
      );
    },
  });

  fx.register({
    group: 'hold',
    type: 'letterWarp',
    tags: ['deform', 'pro'],
    pack: 'pro',
    cost: 2,
    params: [
      { key: 'style', kind: 'select', options: LETTER_STYLE_OPTIONS, default: 'ripple', section: 'warp' },
      { key: 'amount', kind: 'number', min: -2, max: 2, step: 0.01, default: 0.25, random: [0.1, 0.5], section: 'warp' },
      { key: 'freq', kind: 'number', min: 0.1, max: 8, step: 0.1, default: 2, section: 'warp' },
      { key: 'speed', kind: 'number', min: 0.05, max: 4, step: 0.05, default: 0.5, section: 'warp' },
      { key: 'animate', kind: 'select', options: ANIMATE_OPTIONS, default: 'static', section: 'warp' },
      { key: 'perLetterPhase', kind: 'number', min: 0, max: 1, step: 0.01, default: 0, section: 'warp' },
      { key: 'sync', kind: 'select', options: ['free', 'beat'], default: 'free', section: 'warp' },
    ],
    normalize(params) {
      return {
        ...params,
        style: LETTER_STYLE_OPTIONS.includes(params.style) ? params.style : 'ripple',
        amount: clamp(params.amount, -2, 2),
        freq: clamp(params.freq, 0.1, 8),
      };
    },
    cpu(state, h, env, params, rng, info) {
      const style = LETTER_STYLE_OPTIONS.includes(params.style) ? params.style : 'ripple';
      const base = params.amount == null ? 0.25 : Number(params.amount);
      const index = info && Number.isFinite(info.i) ? info.i : 0;
      // one cycle per letter at 1.0: the phase is passed in radians
      const phase = (params.perLetterPhase || 0) * index * TAU;
      const animated = animateWarp(params.animate, base, params.speed, h, params.sync, info, phase);
      const amount = animated.amount * env;
      if (Math.abs(amount) < 0.0001) return;
      state.deform.push(deformEntry(style, amount, animated.time, clamp(params.freq == null ? 2 : params.freq, 0.1, 8)));
    },
  });

  // The plain `hold.warpStyle` alias used by the animator: one entry per 25
  // styles is too much for the type list, so the animator exposes the whole
  // table through `warpStyle` on its own params instead.

  return {
    DEFORM_CODES,
    LETTER_CODES,
    BLOCK_CODES,
    NAME_BY_CODE,
    codeOf,
    deformSpace,
    spaceOfName,
    encodeWarpParam,
    decodeWarpParam,
    deformEntry,
    animateWarp,
    clamp01,
    ALL_STYLE_OPTIONS,
    BLOCK_STYLE_OPTIONS,
    LETTER_STYLE_OPTIONS,
    ANIMATE_OPTIONS,
  };
});
