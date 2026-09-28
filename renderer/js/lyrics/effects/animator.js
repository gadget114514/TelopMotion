(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./registry'));
  else {
    root.SA = root.SA || {};
    root.SA.animator = factory(root.SA.fx);
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

  // One deterministic wiggle value per letter: the cycle is interpolated with a
  // smoothstep so the movement reads as a hand-made boil, not as noise.
  function wiggle(seed, t) {
    const index = Math.floor(t);
    const phase = t - index;
    const a = Math.sin((index + seed * 17.13) * 12.9898) * 43758.5453;
    const b = Math.sin((index + 1 + seed * 17.13) * 12.9898) * 43758.5453;
    const va = (a - Math.floor(a)) * 2 - 1;
    const vb = (b - Math.floor(b)) * 2 - 1;
    return va + (vb - va) * (phase * phase * (3 - 2 * phase));
  }

  function beatRate(info) {
    const bpm = info && info.audioFeatures && Number(info.audioFeatures.bpm);
    return bpm > 0 ? bpm / 60 : 2;
  }

  function emOf(info) {
    const size = info && info.letter && Number(info.letter.size);
    if (size > 0) return size;
    return (info && info.shortSide ? info.shortSide : 1080) * 0.06;
  }

  // The animator also animates the skew / tilt fields, which the state texture
  // already carries; `axis` selects which 3D axis the tilt angle uses.
  function applyTilt(state, axis, angle) {
    if (axis === 'x') state.tiltX += angle;
    else state.tiltY += angle;
  }

  // --- registry hooks ----------------------------------------------------------

  const TRANSFORM_PARAMS = [
    { key: 'dx', kind: 'number', min: -6, max: 6, step: 0.05, default: 0, unit: 'em', random: [-1.2, 1.2], section: 'animator' },
    { key: 'dy', kind: 'number', min: -6, max: 6, step: 0.05, default: 0, unit: 'em', random: [-1.2, 1.2], section: 'animator' },
    { key: 'scale', kind: 'number', min: 0, max: 3, step: 0.02, default: 1, random: [0.3, 1.4], section: 'animator' },
    { key: 'rotate', kind: 'number', min: -360, max: 360, step: 5, default: 0, random: [-35, 35], section: 'animator' },
    { key: 'skew', kind: 'number', min: -60, max: 60, step: 1, default: 0, section: 'animator' },
    { key: 'opacity', kind: 'number', min: 0, max: 1, step: 0.01, default: 0, random: [0, 0.5], section: 'animator' },
    { key: 'blur', kind: 'number', min: 0, max: 40, step: 0.5, default: 0, random: [4, 20], section: 'animator' },
    { key: 'flash', kind: 'number', min: 0, max: 1, step: 0.01, default: 0, section: 'animator' },
    { key: 'tilt', kind: 'number', min: -180, max: 180, step: 5, default: 0, random: [-60, 60], section: 'animator' },
    { key: 'axis', kind: 'select', options: ['x', 'y'], default: 'y', section: 'animator' },
  ];

  function normalizeTransform(params) {
    return {
      ...params,
      dx: clamp(params.dx == null ? 0 : params.dx, -6, 6),
      dy: clamp(params.dy == null ? 0 : params.dy, -6, 6),
      scale: clamp(params.scale == null ? 1 : params.scale, 0, 3),
      rotate: clamp(params.rotate == null ? 0 : params.rotate, -360, 360),
      skew: clamp(params.skew == null ? 0 : params.skew, -60, 60),
      opacity: clamp01(params.opacity == null ? 0 : params.opacity),
      blur: clamp(params.blur == null ? 0 : params.blur, 0, 40),
      flash: clamp01(params.flash == null ? 0 : params.flash),
      tilt: clamp(params.tilt == null ? 0 : params.tilt, -180, 180),
      axis: params.axis === 'x' ? 'x' : 'y',
    };
  }

  // Shared entrance / exit interpolation. `k` is the eased progress of the
  // group (0 = off screen, 1 = final); the amount factor moves every property
  // back to `params`.
  function transformAt(state, k, params, info, mode) {
    const t = mode === 'out' ? clamp01(k) : 1 - clamp01(k);
    if (t <= 0.0001) return;
    const p = normalizeTransform(params);
    const em = emOf(info);
    state.x += p.dx * em * t;
    state.y += p.dy * em * t;
    const scale = 1 + (p.scale - 1) * t;
    state.scaleX *= scale;
    state.scaleY *= scale;
    state.rot += p.rotate * t;
    state.skewX += p.skew * t;
    state.opacity *= 1 + (p.opacity - 1) * t;
    if (p.blur > 0) state.blur = Math.max(state.blur || 0, p.blur * t);
    if (p.flash > 0) state.flash = Math.max(state.flash || 0, p.flash * t);
    if (p.tilt) applyTilt(state, p.axis, p.tilt * t);
  }

  fx.register({
    group: 'enter',
    type: 'animator',
    tags: ['pro', 'animator', 'text'],
    pack: 'pro',
    cost: 1,
    params: TRANSFORM_PARAMS,
    defaults: { motion: { in: { duration: 0.6, ease: 'easeOutCubic' } } },
    normalize: normalizeTransform,
    cpu(state, p, params, rng, info) {
      transformAt(state, p, params, info, 'in');
    },
  });

  fx.register({
    group: 'exit',
    type: 'animator',
    tags: ['pro', 'animator', 'text'],
    pack: 'pro',
    cost: 1,
    params: TRANSFORM_PARAMS,
    defaults: { motion: { out: { duration: 0.5, ease: 'easeInCubic' } } },
    normalize: normalizeTransform,
    cpu(state, p, params, rng, info) {
      transformAt(state, p, params, info, 'out');
    },
  });

  // --- hold animator -----------------------------------------------------------

  const HOLD_MODES = ['sine', 'wiggle', 'pulse', 'float'];
  const HOLD_PARAMS = [
    { key: 'mode', kind: 'select', options: HOLD_MODES, default: 'sine', section: 'animator' },
    { key: 'dx', kind: 'number', min: -6, max: 6, step: 0.01, default: 0, unit: 'em', section: 'animator' },
    { key: 'dy', kind: 'number', min: -6, max: 6, step: 0.01, default: 0.08, unit: 'em', random: [0.02, 0.15], section: 'animator' },
    { key: 'scale', kind: 'number', min: 0, max: 1, step: 0.005, default: 0, random: [0, 0.06], section: 'animator' },
    { key: 'rotate', kind: 'number', min: -45, max: 45, step: 0.1, default: 0, random: [0, 3], section: 'animator' },
    { key: 'opacity', kind: 'number', min: 0, max: 1, step: 0.01, default: 0, random: [0, 0.12], section: 'animator' },
    { key: 'blur', kind: 'number', min: 0, max: 20, step: 0.1, default: 0, section: 'animator' },
    { key: 'freq', kind: 'number', min: 0.05, max: 8, step: 0.05, default: 0.4, section: 'animator' },
    { key: 'phase', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.25, section: 'animator' },
    { key: 'sync', kind: 'select', options: ['free', 'beat'], default: 'free', section: 'animator' },
  ];

  function normalizeHold(params) {
    return {
      ...params,
      mode: HOLD_MODES.includes(params.mode) ? params.mode : 'sine',
      dx: clamp(params.dx == null ? 0 : params.dx, -6, 6),
      dy: clamp(params.dy == null ? 0.08 : params.dy, -6, 6),
      scale: clamp(params.scale == null ? 0 : params.scale, 0, 1),
      rotate: clamp(params.rotate == null ? 0 : params.rotate, -45, 45),
      opacity: clamp01(params.opacity == null ? 0 : params.opacity),
      blur: clamp(params.blur == null ? 0 : params.blur, 0, 20),
      freq: clamp(params.freq == null ? 0.4 : params.freq, 0.05, 8),
      phase: clamp01(params.phase == null ? 0.25 : params.phase),
      sync: params.sync === 'beat' ? 'beat' : 'free',
    };
  }

  fx.register({
    group: 'hold',
    type: 'animator',
    tags: ['pro', 'animator', 'text'],
    pack: 'pro',
    cost: 1,
    params: HOLD_PARAMS,
    normalize: normalizeHold,
    cpu(state, h, env, params, rng, info) {
      const p = normalizeHold(params || {});
      const amount = clamp01(env);
      const rate = p.sync === 'beat' ? beatRate(info) : clamp(p.freq, 0.05, 8);
      const index = info && Number.isFinite(info.i) ? info.i : 0;
      const phase = p.phase * index * TAU;
      const em = emOf(info);
      const t = h * rate;
      let wave;
      if (p.mode === 'wiggle') wave = wiggle(index * 0.37, t * 1.4 + index * 0.13);
      else if (p.mode === 'pulse') wave = Math.abs(Math.sin(t * TAU * 0.5 + phase));
      else if (p.mode === 'float') wave = Math.sin(t * TAU * 0.35 + phase) * 0.7 + Math.sin(t * TAU * 0.13 + phase * 1.7) * 0.3;
      else wave = Math.sin(t * TAU + phase);
      wave *= amount;
      if (Math.abs(wave) < 0.0001) return;
      state.x += p.dx * em * wave;
      state.y += p.dy * em * wave;
      if (p.scale) {
        const scale = 1 + p.scale * wave;
        state.scaleX *= scale;
        state.scaleY *= scale;
      }
      if (p.rotate) state.rot += p.rotate * wave;
      if (p.opacity) state.opacity *= 1 - p.opacity * Math.max(0, wave);
      if (p.blur && wave > 0) state.blur = Math.max(state.blur || 0, p.blur * wave);
    },
  });

  return {
    transformAt,
    normalizeTransform,
    normalizeHold,
    wiggle,
    HOLD_MODES,
  };
});
