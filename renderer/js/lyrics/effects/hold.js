(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./registry'));
  else {
    root.SA = root.SA || {};
    factory(root.SA.fx);
  }
})(typeof self !== 'undefined' ? self : this, function (fx) {
  'use strict';

  const TAU = Math.PI * 2;

  function clamp01(value) {
    return value <= 0 ? 0 : value >= 1 ? 1 : value;
  }

  function noise1(a, b) {
    const value = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
    return value - Math.floor(value);
  }

  fx.register({
    group: 'hold',
    type: 'none',
    tags: ['basic'],
    params: [],
    cpu() {},
  });

  fx.register({
    group: 'hold',
    type: 'floatBob',
    tags: ['basic'],
    params: [
      { key: 'amp', kind: 'number', min: 0, max: 0.3, step: 0.005, default: 0.02, random: [0.01, 0.05] },
      { key: 'speed', kind: 'number', min: 0.1, max: 3, step: 0.05, default: 0.5, random: [0.3, 1] },
    ],
    cpu(state, h, env, params, rng, info) {
      const amp = (params.amp == null ? 0.02 : params.amp) * info.shortSide;
      state.y += amp * Math.sin(TAU * (params.speed || 0.5) * h + info.i * 0.4) * env;
    },
  });

  fx.register({
    group: 'hold',
    type: 'sineWave',
    params: [
      { key: 'amp', kind: 'number', min: 0, max: 0.3, step: 0.005, default: 0.03, random: [0.01, 0.06] },
      { key: 'freq', kind: 'number', min: 0.0005, max: 0.02, step: 0.0005, default: 0.004 },
      { key: 'speed', kind: 'number', min: 0.1, max: 3, step: 0.05, default: 0.6 },
    ],
    cpu(state, h, env, params, rng, info) {
      const amp = (params.amp == null ? 0.03 : params.amp) * info.shortSide;
      const freq = params.freq == null ? 0.004 : params.freq;
      state.y += amp * Math.sin(TAU * (params.speed || 0.6) * h + info.letterX * freq) * env;
    },
  });

  fx.register({
    group: 'hold',
    type: 'jitter',
    params: [
      { key: 'amp', kind: 'number', min: 0, max: 0.1, step: 0.002, default: 0.008, random: [0.003, 0.02] },
      { key: 'rate', kind: 'number', min: 1, max: 30, step: 1, default: 12 },
    ],
    cpu(state, h, env, params, rng, info) {
      const amp = (params.amp == null ? 0.008 : params.amp) * info.shortSide;
      const rate = params.rate || 12;
      const step = Math.floor(h * rate);
      state.x += (noise1(step, info.i) * 2 - 1) * amp * env;
      state.y += (noise1(step + 7.1, info.i) * 2 - 1) * amp * env;
      state.rot += (noise1(step + 3.3, info.i) * 2 - 1) * 1.5 * env;
    },
  });

  fx.register({
    group: 'hold',
    type: 'pulse',
    tags: ['basic'],
    params: [
      { key: 'amount', kind: 'number', min: 0, max: 0.5, step: 0.005, default: 0.06, random: [0.02, 0.15] },
      { key: 'bpm', kind: 'number', min: 40, max: 240, step: 1, default: 120 },
    ],
    cpu(state, h, env, params, rng, info) {
      const amount = params.amount == null ? 0.06 : params.amount;
      const bpm = params.bpm || 120;
      const scale = 1 + amount * (0.5 + 0.5 * Math.cos(TAU * (bpm / 60) * h)) * env;
      state.scaleX *= scale;
      state.scaleY *= scale;
    },
  });

  fx.register({
    group: 'hold',
    type: 'kenBurns',
    params: [
      { key: 'zoom', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.15, random: [0.05, 0.35] },
      { key: 'pan', kind: 'vec2', default: { x: 0.05, y: 0 }, random: 'any' },
    ],
    cpu(state, h, env, params, rng, info) {
      const progress = clamp01(h / Math.max(0.001, info.beatDuration));
      const zoom = 1 + (params.zoom == null ? 0.15 : params.zoom) * progress * env;
      state.scaleX *= zoom;
      state.scaleY *= zoom;
      const pan = params.pan || { x: 0.05, y: 0 };
      state.x += (pan.x || 0) * info.frame.width * progress * env;
      state.y += (pan.y || 0) * info.frame.height * progress * env;
    },
  });

  fx.register({
    group: 'hold',
    type: 'drift',
    params: [
      { key: 'vx', kind: 'number', min: -1, max: 1, step: 0.01, default: 0.05, random: [-0.2, 0.2] },
      { key: 'vy', kind: 'number', min: -1, max: 1, step: 0.01, default: 0, random: [-0.2, 0.2] },
    ],
    cpu(state, h, env, params, rng, info) {
      state.x += (params.vx || 0) * info.shortSide * 0.1 * h * env;
      state.y += (params.vy || 0) * info.shortSide * 0.1 * h * env;
    },
  });

  fx.register({
    group: 'hold',
    type: 'sway',
    params: [
      { key: 'angle', kind: 'number', min: 0, max: 45, step: 0.5, default: 3, random: [1, 8] },
      { key: 'speed', kind: 'number', min: 0.1, max: 3, step: 0.05, default: 0.7 },
    ],
    cpu(state, h, env, params) {
      state.rot += (params.angle == null ? 3 : params.angle) * Math.sin(h * (params.speed || 0.7)) * env;
    },
  });

  fx.register({
    group: 'hold',
    type: 'marquee',
    params: [{ key: 'speed', kind: 'number', min: 0.05, max: 1, step: 0.01, default: 0.25 }],
    cpu(state, h, env, params, rng, info) {
      const speed = params.speed == null ? 0.25 : params.speed;
      const span = info.frame.width * 1.6;
      const offset = ((speed * info.shortSide * h) % span) - info.frame.width * 0.3;
      state.x += offset * env;
    },
  });

  fx.register({
    group: 'hold',
    type: 'jelly',
    tags: ['deform'],
    params: [
      { key: 'amount', kind: 'number', min: 0, max: 0.5, step: 0.01, default: 0.12, random: [0.05, 0.25] },
      { key: 'freq', kind: 'number', min: 0.5, max: 6, step: 0.1, default: 2 },
    ],
    cpu(state, h, env, params, rng, info) {
      state.deform.push({ type: 'jelly', amount: (params.amount == null ? 0.12 : params.amount) * env, freq: params.freq == null ? 2 : params.freq, time: h, seed: info.i });
    },
  });

  fx.register({
    group: 'hold',
    type: 'wobbleWarp',
    tags: ['deform'],
    params: [
      { key: 'amount', kind: 'number', min: 0, max: 0.5, step: 0.01, default: 0.06, random: [0.02, 0.15] },
      { key: 'scale', kind: 'number', min: 0.5, max: 8, step: 0.1, default: 2 },
      { key: 'speed', kind: 'number', min: 0.1, max: 4, step: 0.05, default: 0.8 },
    ],
    cpu(state, h, env, params, rng, info) {
      state.deform.push({ type: 'wobbleWarp', amount: (params.amount == null ? 0.06 : params.amount) * env, scale: params.scale == null ? 2 : params.scale, time: h * (params.speed || 0.8), seed: info.i });
    },
  });

  fx.register({
    group: 'hold',
    type: 'twist',
    tags: ['deform'],
    params: [{ key: 'angle', kind: 'number', min: -90, max: 90, step: 1, default: 12, random: [-30, 30] }],
    cpu(state, h, env, params, rng, info) {
      state.deform.push({ type: 'twist', amount: (params.angle == null ? 12 : params.angle) * env, time: h, seed: info.i });
    },
  });

  fx.register({
    group: 'hold',
    type: 'breathing',
    tags: ['deform'],
    params: [{ key: 'amount', kind: 'number', min: 0, max: 0.4, step: 0.005, default: 0.03, random: [0.01, 0.08] }],
    cpu(state, h, env, params, rng, info) {
      state.deform.push({ type: 'breathing', amount: (params.amount == null ? 0.03 : params.amount) * env, time: h, seed: info.i });
    },
  });

  fx.register({
    group: 'hold',
    type: 'orbit3D',
    params: [
      { key: 'tilt', kind: 'number', min: 0, max: 60, step: 1, default: 14, random: [5, 30] },
      { key: 'speed', kind: 'number', min: 0.1, max: 3, step: 0.05, default: 0.5 },
    ],
    cpu(state, h, env, params) {
      const tilt = params.tilt == null ? 14 : params.tilt;
      const speed = params.speed || 0.5;
      state.tiltX += tilt * Math.cos(speed * h) * env;
      state.tiltY += tilt * Math.sin(speed * h) * env;
    },
  });

  fx.register({
    group: 'hold',
    type: 'pathFollow',
    params: [
      { key: 'points', kind: 'points', default: [{ x: 0.2, y: 0.5 }, { x: 0.5, y: 0.42 }, { x: 0.8, y: 0.5 }] },
      { key: 'speed', kind: 'number', min: 0.02, max: 0.5, step: 0.01, default: 0.1 },
    ],
    cpu(state, h, env, params, rng, info) {
      const points = Array.isArray(params.points) && params.points.length >= 2 ? params.points : [{ x: 0.2, y: 0.5 }, { x: 0.8, y: 0.5 }];
      const speed = params.speed == null ? 0.1 : params.speed;
      const u = clamp01((speed * h) % 1);
      const segments = points.length - 1;
      const position = u * segments;
      const index = Math.min(segments - 1, Math.floor(position));
      const local = position - index;
      const a = points[index];
      const b = points[index + 1];
      const x = (a.x + (b.x - a.x) * local) * info.frame.width;
      const y = (a.y + (b.y - a.y) * local) * info.frame.height;
      state.x += (x - info.blockCenter.x) * env;
      state.y += (y - info.blockCenter.y) * env;
    },
  });

  return fx;
});
