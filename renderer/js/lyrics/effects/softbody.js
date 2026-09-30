(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./registry'));
  else {
    root.SA = root.SA || {};
    root.SA.softbody = factory(root.SA.fx);
  }
})(typeof self !== 'undefined' ? self : this, function (fx) {
  'use strict';

  // Soft body primitives: the letter carries a 5x5 lattice that is integrated
  // by lyrics/physics.js. A descriptor with a `physics(params, phase)` hook
  // provides the simulation config; motion.js evaluates it and writes
  // `state.softLattice` / `state.physActive`. The cpu is a no-op by contract
  // (the physics hook replaces it) — the cpu exists so the hold stack keeps
  // the instance and the inspector shows the parameters.

  const DRIVES = ['pressure', 'muscle', 'pulse', 'tremor', 'shapeTarget'];
  const TARGETS = ['bend', 'bulge', 'squash', 'stretch', 'twist'];

  function clamp(value, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return min;
    return number < min ? min : number > max ? max : number;
  }

  function num(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  fx.register({
    group: 'hold',
    type: 'softBody',
    tags: ['deform', 'physics', 'pro'],
    pack: 'pro',
    cost: 3,
    params: [
      { key: 'drive', kind: 'select', options: DRIVES, default: 'pressure', section: 'physics' },
      { key: 'strength', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.25, random: [0.1, 0.4] },
      { key: 'freq', kind: 'number', min: 0.1, max: 6, step: 0.05, default: 1.2, random: [0.6, 2.5] },
      { key: 'sync', kind: 'select', options: ['free', 'beat'], default: 'free' },
      { key: 'stiffness', kind: 'number', min: 0.05, max: 1, step: 0.01, default: 0.7 },
      { key: 'damping', kind: 'number', min: 0, max: 0.5, step: 0.01, default: 0.05 },
      { key: 'inertia', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.35 },
      { key: 'gravity', kind: 'number', min: 0, max: 40, step: 0.5, default: 0, random: [0, 8] },
      { key: 'floor', kind: 'number', min: 0, max: 2, step: 0.05, default: 0.35 },
      { key: 'beatKick', kind: 'number', min: 0, max: 1.5, step: 0.05, default: 0, random: [0, 0.6] },
      { key: 'target', kind: 'select', options: TARGETS, default: 'bend' },
    ],
    normalize(params) {
      return {
        ...params,
        drive: DRIVES.includes(params.drive) ? params.drive : 'pressure',
        target: TARGETS.includes(params.target) ? params.target : 'bend',
        strength: clamp(params.strength == null ? 0.25 : params.strength, 0, 1),
        freq: clamp(params.freq == null ? 1.2 : params.freq, 0.1, 6),
        stiffness: clamp(params.stiffness == null ? 0.7 : params.stiffness, 0.05, 1),
        damping: clamp(params.damping == null ? 0.05 : params.damping, 0, 0.5),
        inertia: clamp(params.inertia == null ? 0.35 : params.inertia, 0, 1),
        gravity: clamp(params.gravity == null ? 0 : params.gravity, 0, 40),
        floor: clamp(params.floor == null ? 0.35 : params.floor, 0, 2),
        beatKick: clamp(params.beatKick == null ? 0 : params.beatKick, 0, 1.5),
      };
    },
    cpu() {},
    physics(params, phase) {
      if (phase !== 'hold') return null;
      return {
        grid: 5,
        drive: DRIVES.includes(params.drive) ? params.drive : 'pressure',
        target: TARGETS.includes(params.target) ? params.target : 'bend',
        strength: clamp(num(params.strength, 0.25), 0, 2),
        freq: clamp(num(params.freq, 1.2), 0.05, 12),
        sync: params.sync === 'beat' ? 'beat' : 'free',
        stiffness: clamp(num(params.stiffness, 0.7), 0.05, 1),
        damping: clamp(num(params.damping, 0.05), 0, 0.6),
        inertia: clamp(num(params.inertia, 0.35), 0, 1),
        gravity: clamp(num(params.gravity, 0), 0, 60),
        floor: clamp(num(params.floor, 0.35), 0, 2),
        beatKick: clamp(num(params.beatKick, 0), 0, 2),
        restitution: 0.25,
        friction: 0.35,
        areaStiffness: 0.9,
      };
    },
  });

  // A letter pinned by its top row, hanging under gravity and following the
  // rigid acceleration (a banner / a sign).
  fx.register({
    group: 'hold',
    type: 'gravityHang',
    tags: ['deform', 'physics', 'pro'],
    pack: 'pro',
    cost: 2,
    params: [
      { key: 'gravity', kind: 'number', min: 1, max: 60, step: 1, default: 20, random: [10, 35] },
      { key: 'stiffness', kind: 'number', min: 0.05, max: 1, step: 0.01, default: 0.45 },
      { key: 'damping', kind: 'number', min: 0, max: 0.5, step: 0.01, default: 0.08 },
      { key: 'inertia', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
    ],
    normalize(params) {
      return {
        ...params,
        gravity: clamp(params.gravity == null ? 20 : params.gravity, 1, 60),
        stiffness: clamp(params.stiffness == null ? 0.45 : params.stiffness, 0.05, 1),
        damping: clamp(params.damping == null ? 0.08 : params.damping, 0, 0.5),
        inertia: clamp(params.inertia == null ? 0.5 : params.inertia, 0, 1),
      };
    },
    cpu() {},
    physics(params, phase) {
      if (phase !== 'hold') return null;
      return {
        grid: 5,
        drive: 'none',
        pinTop: true,
        stiffness: clamp(num(params.stiffness, 0.45), 0.05, 1),
        damping: clamp(num(params.damping, 0.08), 0, 0.5),
        inertia: clamp(num(params.inertia, 0.5), 0, 1),
        gravity: clamp(num(params.gravity, 20), 1, 60),
        areaStiffness: 0.6,
        restitution: 0.2,
        friction: 0.3,
      };
    },
  });

  // The letter falls from `height` above its place onto the rest position and
  // squashes on impact. The physics hook replaces the enter cpu; the enter
  // holds the letter at the start position until its own enter time.
  fx.register({
    group: 'enter',
    type: 'gravityDrop',
    tags: ['physical', 'deform', 'pro'],
    pack: 'pro',
    cost: 2,
    params: [
      { key: 'height', kind: 'number', min: 0.1, max: 2, step: 0.05, default: 0.6, random: [0.3, 1] },
      { key: 'gravity', kind: 'number', min: 10, max: 160, step: 5, default: 70, random: [40, 110] },
      { key: 'restitution', kind: 'number', min: 0, max: 0.9, step: 0.05, default: 0.25 },
      { key: 'squash', kind: 'number', min: 0, max: 1, step: 0.05, default: 0.4, random: [0.2, 0.7] },
    ],
    normalize(params) {
      return {
        ...params,
        height: clamp(params.height == null ? 0.6 : params.height, 0.1, 2),
        gravity: clamp(params.gravity == null ? 70 : params.gravity, 10, 160),
        restitution: clamp(params.restitution == null ? 0.25 : params.restitution, 0, 0.9),
        squash: clamp(params.squash == null ? 0.4 : params.squash, 0, 1),
      };
    },
    cpu() {},
    physics(params, phase) {
      if (phase !== 'enter') return null;
      const squash = clamp(num(params.squash, 0.4), 0, 1);
      return {
        grid: 5,
        drive: 'none',
        height: clamp(num(params.height, 0.6), 0.1, 2),
        gravity: clamp(num(params.gravity, 70), 10, 160),
        restitution: clamp(num(params.restitution, 0.25), 0, 0.9),
        friction: 0.4,
        stiffness: clamp(0.9 - squash * 0.35, 0.3, 1),
        damping: 0.06,
        inertia: 0.2,
        floor: 'rest',
        areaStiffness: 0.9,
      };
    },
  });

  // --- presets -----------------------------------------------------------------

  const PRESETS = [
    { group: 'hold', primitive: 'softBody', type: 'breathe', params: { drive: 'pressure', strength: 0.12, freq: 0.45, stiffness: 0.8, damping: 0.08, inertia: 0.2, gravity: 0, floor: 0.4, beatKick: 0 } },
    { group: 'hold', primitive: 'softBody', type: 'crawl', params: { drive: 'muscle', strength: 0.16, freq: 0.7, stiffness: 0.5, damping: 0.12, inertia: 0.5 } },
    { group: 'hold', primitive: 'softBody', type: 'heartThrob', params: { drive: 'pulse', strength: 0.5, freq: 1.4, sync: 'beat', beatKick: 0.35, stiffness: 0.75, damping: 0.1 } },
    { group: 'hold', primitive: 'softBody', type: 'quiver', params: { drive: 'tremor', strength: 0.05, freq: 7, stiffness: 0.9, damping: 0.06, inertia: 0.3 } },
    { group: 'hold', primitive: 'softBody', type: 'jellyFollow', params: { drive: 'shapeTarget', target: 'bulge', strength: 0.35, freq: 0.6, stiffness: 0.55, damping: 0.1, inertia: 0.6 } },
    { group: 'hold', primitive: 'softBody', type: 'beatBounce', params: { drive: 'none', strength: 0.1, stiffness: 0.6, damping: 0.05, inertia: 0.9, gravity: 10, floor: 0.15, beatKick: 0.9, sync: 'beat' } },
    { group: 'exit', primitive: 'gravityFall', type: 'fallLinear', params: { floor: 'none' }, motion: { out: { duration: 0.7, ease: 'linear' } } },
  ];

  const registered = [];
  for (const preset of PRESETS) {
    const entry = fx.registerPreset(preset);
    if (entry) registered.push(entry.type);
  }

  return { DRIVES, TARGETS, PRESETS, registered };
});
