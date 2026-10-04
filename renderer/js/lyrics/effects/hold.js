(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./registry'), require('../easing'));
  else {
    root.SA = root.SA || {};
    factory(root.SA.fx, root.SA.easing);
  }
})(typeof self !== 'undefined' ? self : this, function (fx, easing) {
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
      // genre profiles may ask for 'audio' (the song tempo), as heartbeat does
      let bpm = 120;
      if (params.bpm === 'audio') {
        bpm = info && info.audioFeatures && Number(info.audioFeatures.bpm) > 0 ? Number(info.audioFeatures.bpm) : 120;
      } else if (Number(params.bpm) > 0) {
        bpm = Number(params.bpm);
      }
      const scale = 1 + amount * (0.5 + 0.5 * Math.cos(TAU * (bpm / 60) * h)) * env;
      state.scaleX *= scale;
      state.scaleY *= scale;
    },
  });

  fx.register({
    group: 'hold',
    type: 'opacityPulse',
    tags: ['basic'],
    params: [
      { key: 'min', kind: 'number', min: 0, max: 1, step: 0.05, default: 0.35, random: [0.15, 0.6] },
      { key: 'period', kind: 'number', min: 0.2, max: 6, step: 0.1, default: 1.6, random: [0.8, 3] },
      { key: 'speed', kind: 'number', min: 0.1, max: 4, step: 0.05, default: 0.8 },
    ],
    cpu(state, h, env, params) {
      const min = clamp01(params.min == null ? 0.35 : params.min);
      const period = Math.max(0.2, params.period == null ? 1.6 : params.period);
      const speed = params.speed == null ? 0.8 : params.speed;
      const wave = 0.5 - 0.5 * Math.cos((TAU * speed * h) / period);
      const level = min + (1 - min) * wave;
      state.opacity *= 1 - env * (1 - level);
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

  // 円運動: every letter rides one shared circle around its layout place, a
  // step apart (spread), so the whole line drifts round instead of pulsing in
  // place. `tilt` flattens the circle (90° is a straight line, 0° a full
  // circle) and `spin` turns each glyph with its own orbital phase.
  fx.register({
    group: 'hold',
    type: 'orbit2D',
    tags: ['basic'],
    params: [
      { key: 'radius', kind: 'number', min: 0, max: 0.3, step: 0.005, default: 0.04, random: [0.015, 0.09] },
      { key: 'speed', kind: 'number', min: 0.1, max: 3, step: 0.05, default: 0.5, random: [0.3, 1] },
      { key: 'spread', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.06 },
      { key: 'tilt', kind: 'number', min: 0, max: 90, step: 1, default: 0, random: [0, 45] },
      { key: 'spin', kind: 'bool', default: false },
    ],
    cpu(state, h, env, params, rng, info) {
      const radius = (params.radius == null ? 0.04 : params.radius) * info.shortSide;
      const speed = params.speed == null ? 0.5 : params.speed;
      const spread = params.spread == null ? 0.06 : params.spread;
      const flatten = Math.cos(((params.tilt == null ? 0 : params.tilt) * Math.PI) / 180);
      const angle = TAU * (speed * h + info.i * spread);
      state.x += radius * Math.cos(angle) * env;
      state.y += radius * Math.sin(angle) * flatten * env;
      if (params.spin) state.rot += (angle * 180) / Math.PI * env;
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

  function bump(phase, center, width) {
    const t = (phase - center) / width;
    return Math.exp(-t * t * 4);
  }

  fx.register({
    group: 'hold',
    type: 'heartbeat',
    params: [
      { key: 'amount', kind: 'number', min: 0, max: 0.2, step: 0.005, default: 0.06, random: [0.04, 0.08] },
      { key: 'bpm', kind: 'text', default: '72' },
    ],
    cpu(state, h, env, params, rng, info) {
      const amount = params.amount == null ? 0.06 : params.amount;
      const option = params.bpm;
      let bpm = 72;
      if (option === 'audio') {
        bpm = info && info.audioFeatures && Number(info.audioFeatures.bpm) > 0 ? Number(info.audioFeatures.bpm) : 72;
      } else if (Number.isFinite(Number(option)) && Number(option) > 0) {
        bpm = Number(option);
      }
      const time = info && info.local != null ? info.local : h;
      const phase = (((time * bpm) / 60) % 1 + 1) % 1;
      const scale = 1 + amount * (bump(phase, 0, 0.1) + 0.6 * bump(phase, 0.18, 0.1)) * env;
      state.scaleX *= scale;
      state.scaleY *= scale;
    },
  });

  fx.register({
    group: 'hold',
    type: 'shiver',
    params: [
      { key: 'amount', kind: 'number', min: 0, max: 2, step: 0.05, default: 0.6, random: [0.4, 1] },
      { key: 'interval', kind: 'number', min: 0.5, max: 10, step: 0.1, default: 3, random: [2, 5] },
    ],
    cpu(state, h, env, params, rng, info) {
      const amount = params.amount == null ? 0.6 : params.amount;
      const interval = Math.max(0.5, params.interval == null ? 3 : params.interval);
      const size = info.shortSide;
      const i = info.i;
      state.x += amount * (noise1(Math.floor(h * 30), i) - 0.5) * size * 0.01 * env;
      state.y += amount * (noise1(Math.floor(h * 30), i + 13.7) - 0.5) * size * 0.01 * env;
      const n = Math.floor(h / interval);
      const tn = n * interval + noise1(n, i + 2.3) * interval * 0.8;
      if (h >= tn && h <= tn + 0.08) {
        state.x += size * 0.08 * (noise1(n, i + 5.1) < 0.5 ? -1 : 1) * env;
        state.rot += 6 * (noise1(n, i + 8.9) * 2 - 1) * env;
      }
    },
  });

  // --- dynamic font size / font deformation (pack 'font') ----------------------
  // `zoomBlock` is the block-space size primitive: it scales the whole text
  // block around its centre, so the letters grow *and* the gaps between them
  // grow with them — what a font-size animation looks like. The per-letter
  // scale of pulse / kenBurns only inflates each glyph in place, so the text
  // can never fill the frame. The deformation codes live in warp.js.

  function sizeWave(mode, h, rate) {
    if (mode === 'grow') return clamp01(h * rate);
    if (mode === 'shrink') return 1 - clamp01(h * rate);
    return 0.5 - 0.5 * Math.cos(TAU * rate * h);
  }

  function sizeEase(mode, ease, value) {
    return mode === 'pulse' ? value : easing.get(ease || 'easeInOutSine')(clamp01(value));
  }

  function sizeRate(info, sync, period) {
    if (sync === 'beat' && info && info.audioFeatures) {
      const bpm = Number(info.audioFeatures.bpm);
      if (bpm > 0) return bpm / 60;
    }
    return 1 / Math.max(0.05, period);
  }

  function pushBlockScale(state, factor) {
    const amount = factor - 1;
    if (!Number.isFinite(amount) || Math.abs(amount) < 0.0001) return;
    state.deform.push({ type: 'zoomBlock', amount, time: 0, param: 0 });
  }

  fx.register({
    group: 'hold',
    type: 'fontSize',
    tags: ['deform', 'size'],
    pack: 'font',
    cost: 2,
    params: [
      { key: 'from', kind: 'number', min: 0.05, max: 12, step: 0.05, default: 1, random: [0.6, 1.2] },
      { key: 'to', kind: 'number', min: 0.05, max: 12, step: 0.05, default: 2.4, random: [1.4, 4] },
      { key: 'period', kind: 'number', min: 0.1, max: 10, step: 0.1, default: 2, random: [0.8, 3] },
      { key: 'mode', kind: 'select', options: ['pulse', 'grow', 'shrink'], default: 'pulse' },
      { key: 'ease', kind: 'ease', default: 'easeInOutSine' },
      { key: 'sync', kind: 'select', options: ['free', 'beat'], default: 'free' },
    ],
    cpu(state, h, env, params, rng, info) {
      const from = params.from == null ? 1 : Number(params.from);
      const to = params.to == null ? 2.4 : Number(params.to);
      const rate = sizeRate(info, params.sync, params.period == null ? 2 : Number(params.period));
      const wave = sizeEase(params.mode, params.ease, sizeWave(params.mode, h, rate));
      pushBlockScale(state, from + (to - from) * wave * env);
    },
  });

  fx.register({
    group: 'hold',
    type: 'fillScreen',
    tags: ['deform', 'size'],
    pack: 'font',
    cost: 2,
    params: [
      { key: 'fill', kind: 'number', min: 0.2, max: 1.2, step: 0.01, default: 0.95, random: [0.6, 1.1] },
      { key: 'max', kind: 'number', min: 1, max: 30, step: 0.5, default: 12 },
      { key: 'period', kind: 'number', min: 0.1, max: 10, step: 0.1, default: 2.4, random: [1, 4] },
      { key: 'mode', kind: 'select', options: ['pulse', 'grow', 'shrink'], default: 'pulse' },
      { key: 'ease', kind: 'ease', default: 'easeInOutCubic' },
      { key: 'sync', kind: 'select', options: ['free', 'beat'], default: 'free' },
    ],
    cpu(state, h, env, params, rng, info) {
      const bbox = info && info.blockBBox;
      if (!bbox) return;
      const width = Math.max(1, Number(bbox.x2) - Number(bbox.x1));
      const height = Math.max(1, Number(bbox.y2) - Number(bbox.y1));
      const frame = info.frame || { width: 1920, height: 1080 };
      const fill = params.fill == null ? 0.95 : Number(params.fill);
      const cap = Math.max(1, params.max == null ? 12 : Number(params.max));
      // the factor that makes the block span the requested part of the frame
      const target = Math.min(cap, (fill * Math.min(frame.width / width, frame.height / height)) || 1);
      const rate = sizeRate(info, params.sync, params.period == null ? 2.4 : Number(params.period));
      const wave = sizeEase(params.mode, params.ease, sizeWave(params.mode, h, rate));
      pushBlockScale(state, 1 + (target - 1) * wave * env);
    },
  });

  fx.register({
    group: 'hold',
    type: 'squashStretch',
    tags: ['deform'],
    pack: 'font',
    cost: 1,
    params: [
      { key: 'amount', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.2, random: [0.08, 0.35] },
      { key: 'speed', kind: 'number', min: 0.1, max: 4, step: 0.05, default: 0.7 },
      { key: 'phase', kind: 'number', min: 0, max: 1, step: 0.01, default: 0 },
    ],
    cpu(state, h, env, params, rng, info) {
      const amount = (params.amount == null ? 0.2 : params.amount) * env;
      if (amount < 0.0001) return;
      const phase = (params.phase || 0) * ((info && info.i) || 0);
      state.deform.push({ type: 'stretch', amount, time: (h + phase) * (params.speed || 0.7), param: 1 });
    },
  });

  fx.register({
    group: 'hold',
    type: 'swirl',
    tags: ['deform'],
    pack: 'font',
    cost: 1,
    params: [
      { key: 'angle', kind: 'number', min: -180, max: 180, step: 1, default: 45, random: [-70, 70] },
      { key: 'freq', kind: 'number', min: 0.1, max: 4, step: 0.1, default: 1 },
      { key: 'speed', kind: 'number', min: 0.1, max: 4, step: 0.05, default: 0.6 },
    ],
    cpu(state, h, env, params, rng, info) {
      const amount = (params.angle == null ? 45 : params.angle) * env;
      if (Math.abs(amount) < 0.001) return;
      state.deform.push({ type: 'swirl', amount, time: h * (params.speed || 0.6), param: params.freq == null ? 1 : params.freq });
    },
  });

  fx.register({
    group: 'hold',
    type: 'dissolve',
    tags: ['dissolve'],
    params: [
      { key: 'speed', kind: 'number', min: 0.1, max: 4, step: 0.1, default: 1.5 },
      { key: 'intensity', kind: 'number', min: 0, max: 1, step: 0.05, default: 0.3, random: [0.1, 0.5] },
    ],
    cpu(state, h, env, params, rng, info) {
      const intensity = params.intensity == null ? 0.3 : params.intensity;
      const speed = params.speed == null ? 1.5 : params.speed;
      const threshold = rng() * 0.85;
      const cycle = (h * speed) % 1.0;
      let alpha = 1.0;
      if (cycle < threshold) {
        alpha = cycle / Math.max(threshold, 0.0001);
      } else {
        alpha = 1 - (1 - cycle) * 0.15;
      }
      state.opacity *= 1 - (1 - alpha) * intensity * env;
    },
  });

  return fx;
});
