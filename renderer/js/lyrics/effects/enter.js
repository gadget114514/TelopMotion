(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./registry'), require('../easing'));
  else {
    root.SA = root.SA || {};
    factory(root.SA.fx, root.SA.easing);
  }
})(typeof self !== 'undefined' ? self : this, function (fx, easing) {
  'use strict';

  function clamp01(value) {
    return value <= 0 ? 0 : value >= 1 ? 1 : value;
  }

  // The plain opacity fade. `softness` bends the ramp towards smoothstep and
  // `glow` flashes the glyph as it appears, which is the per-letter half of the
  // fade shader in shader-fx.js (post.fade).
  fx.register({
    group: 'enter',
    type: 'fade',
    tags: ['basic'],
    params: [
      { key: 'softness', kind: 'number', min: 0, max: 1, step: 0.01, default: 0 },
      { key: 'glow', kind: 'number', min: 0, max: 1, step: 0.01, default: 0, random: [0, 0.5] },
    ],
    cost: 0,
    cpu(state, p, params) {
      const soft = params && Number(params.softness) > 0 ? Math.min(1, Number(params.softness)) : 0;
      const glow = params && Number(params.glow) > 0 ? Math.min(1, Number(params.glow)) : 0;
      const k = clamp01(p);
      const level = soft > 0 ? k + (k * k * (3 - 2 * k) - k) * soft : k;
      state.opacity *= level;
      if (glow > 0) state.flash = Math.max(state.flash || 0, glow * (1 - Math.abs(level * 2 - 1)));
    },
  });

  fx.register({
    group: 'enter',
    type: 'typewriter',
    tags: ['basic', 'text'],
    params: [
      { key: 'cursor', kind: 'bool', default: false },
      { key: 'cursorColor', kind: 'color', default: null },
      { key: 'cursorShape', kind: 'select', options: ['bar', 'block', 'underscore'], default: 'bar' },
      { key: 'blink', kind: 'number', min: 0, max: 2, step: 0.05, default: 0.5 },
      { key: 'cursorAfter', kind: 'select', options: ['hide', 'blink', 'stay'], default: 'blink' },
    ],
    cpu(state, p) {
      if (p < 0.999) state.visibleFrac = 0;
    },
  });

  fx.register({
    group: 'enter',
    type: 'slide',
    tags: ['basic'],
    params: [
      { key: 'dir', kind: 'select', options: ['up', 'down', 'left', 'right'], default: 'up', random: 'any' },
      { key: 'distance', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.25, unit: 'frame', random: [0.1, 0.5] },
    ],
    cpu(state, p, params, rng, info) {
      const distance = (params.distance == null ? 0.25 : params.distance) * info.shortSide;
      const offset = { up: [0, -distance], down: [0, distance], left: [-distance, 0], right: [distance, 0] }[params.dir || 'up'] || [0, 0];
      state.x += (1 - clamp01(p)) * offset[0];
      state.y += (1 - clamp01(p)) * offset[1];
    },
  });

  fx.register({
    group: 'enter',
    type: 'dropBounce',
    tags: ['basic'],
    params: [{ key: 'height', kind: 'number', min: 0, max: 2, step: 0.05, default: 0.5, unit: 'frame', random: [0.2, 1] }],
    cpu(state, p, params, rng, info) {
      const height = (params.height == null ? 0.5 : params.height) * info.shortSide;
      state.y -= (1 - easing.get('bounceOut')(clamp01(p))) * height;
    },
  });

  fx.register({
    group: 'enter',
    type: 'zoomIn',
    params: [{ key: 'from', kind: 'number', min: 0, max: 3, step: 0.05, default: 0.4, random: [0, 1] }],
    cpu(state, p, params) {
      const from = params.from == null ? 0.4 : params.from;
      const scale = from + (1 - from) * clamp01(p);
      state.scaleX *= scale;
      state.scaleY *= scale;
    },
  });

  fx.register({
    group: 'enter',
    type: 'blurIn',
    params: [{ key: 'radius', kind: 'number', min: 0, max: 40, step: 0.5, default: 12, random: [4, 20] }],
    cpu(state, p, params) {
      state.blur = Math.max(state.blur || 0, (params.radius == null ? 12 : params.radius) * (1 - clamp01(p)));
    },
  });

  fx.register({
    group: 'enter',
    type: 'flip3D',
    params: [
      { key: 'axis', kind: 'select', options: ['x', 'y'], default: 'x' },
      { key: 'angle', kind: 'number', min: -180, max: 180, step: 5, default: 90, random: [45, 180] },
    ],
    cpu(state, p, params) {
      const angle = (params.angle == null ? 90 : params.angle) * (1 - clamp01(p));
      if (params.axis === 'y') state.tiltY += angle;
      else state.tiltX += angle;
    },
  });

  fx.register({
    group: 'enter',
    type: 'rotateIn',
    params: [{ key: 'angle', kind: 'number', min: -360, max: 360, step: 5, default: 90, random: [-180, 180] }],
    cpu(state, p, params) {
      state.rot += (params.angle == null ? 90 : params.angle) * (1 - clamp01(p));
    },
  });

  fx.register({
    group: 'enter',
    type: 'scatterIn',
    params: [{ key: 'spread', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.35, random: [0.15, 0.6] }],
    cpu(state, p, params, rng, info) {
      const k = 1 - clamp01(p);
      const spread = (params.spread == null ? 0.35 : params.spread) * info.shortSide;
      state.x += (rng() * 2 - 1) * spread * k;
      state.y += (rng() * 2 - 1) * spread * k;
      state.rot += (rng() * 2 - 1) * 40 * k;
    },
  });

  fx.register({
    group: 'enter',
    type: 'waveRise',
    params: [{ key: 'amp', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.12, random: [0.05, 0.3] }],
    cpu(state, p, params, rng, info) {
      const amp = (params.amp == null ? 0.12 : params.amp) * info.shortSide;
      state.y += (1 - clamp01(p)) * amp * Math.sin(info.i * 0.7);
      state.rot += (1 - clamp01(p)) * Math.sin(info.i * 0.7) * 8;
    },
  });

  fx.register({
    group: 'enter',
    type: 'elasticPop',
    params: [],
    cpu(state, p) {
      const scale = easing.get('elasticOut')(clamp01(p));
      state.scaleX *= scale;
      state.scaleY *= scale;
      state.opacity *= Math.min(1, clamp01(p) * 4);
    },
  });

  fx.register({
    group: 'enter',
    type: 'scramble',
    tags: ['glitch'],
    params: [
      { key: 'charset', kind: 'select', options: ['latin', 'katakana', 'digits', 'symbols'], default: 'latin' },
      { key: 'rate', kind: 'number', min: 0.1, max: 4, step: 0.1, default: 1.4 },
    ],
    cpu(state, p, params, rng, info) {
      const threshold = 0.15 + rng() * 0.5;
      if (clamp01(p) < threshold) {
        const jitter = info.shortSide * 0.015;
        state.x += Math.sin(clamp01(p) * 90 + info.i) * jitter;
        state.opacity *= Math.sin(clamp01(p) * 40 + info.i * 2) > -0.2 ? 0.75 : 0.25;
      }
    },
  });

  fx.register({
    group: 'enter',
    type: 'glitchIn',
    tags: ['glitch'],
    params: [{ key: 'intensity', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.5, random: [0.2, 0.8] }],
    cpu(state, p, params, rng, info) {
      const k = 1 - clamp01(p);
      const intensity = (params.intensity == null ? 0.5 : params.intensity) * info.shortSide * 0.05;
      state.x += Math.sin(clamp01(p) * 90 + info.i * 1.7) * intensity * k;
      state.y += (rng() * 2 - 1) * intensity * 0.2 * k;
      state.opacity *= 0.55 + 0.45 * clamp01(p * 3);
    },
  });

  fx.register({
    group: 'enter',
    type: 'neonFlicker',
    tags: ['glow'],
    params: [{ key: 'flickers', kind: 'int', min: 1, max: 12, step: 1, default: 5, random: [3, 9] }],
    cpu(state, p, params, rng, info) {
      const flickers = params.flickers == null ? 5 : params.flickers;
      const step = Math.floor(clamp01(p) * flickers * 4);
      const value = Math.sin((step + 1) * 12.9898 + info.i * 7.233) * 43758.5453;
      const fraction = value - Math.floor(value);
      state.opacity *= fraction < 0.28 ? 0.1 : 1;
    },
  });

  fx.register({
    group: 'enter',
    type: 'flickerIn',
    params: [{ key: 'flickers', kind: 'int', min: 1, max: 10, step: 1, default: 4, random: [4, 8] }],
    cpu(state, p, params, rng, info) {
      const flickers = params.flickers == null ? 4 : params.flickers;
      const progress = clamp01(p);
      const step = Math.floor(progress * flickers * 3);
      const value = Math.sin(step * 12.9898 + info.i * 7.233) * 43758.5453;
      const fraction = value - Math.floor(value);
      const on = progress >= 0.999 ? 1 : fraction < 0.25 + 0.75 * progress ? 1 : 0.08;
      state.opacity *= on;
    },
  });

  fx.register({
    group: 'enter',
    type: 'strokeDrawOn',
    tags: ['stroke'],
    params: [
      { key: 'width', kind: 'number', min: 0.5, max: 20, step: 0.5, default: 4 },
      { key: 'fillDelay', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
    ],
    cpu(state, p) {
      state.visibleFrac = Math.min(state.visibleFrac == null ? 1 : state.visibleFrac, clamp01(p));
      if (clamp01(p) < 0.999) {
        state.represent = 'stroke';
        state.reprProgress = clamp01(p);
      }
    },
  });

  fx.register({
    group: 'enter',
    type: 'particlesAssemble',
    tags: ['particles'],
    cost: 2,
    params: [
      { key: 'count', kind: 'int', min: 4, max: 64, step: 1, default: 16 },
      { key: 'spread', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.5, random: [0.2, 0.8] },
      { key: 'turbulence', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.3 },
    ],
    cpu(state, p, params, rng, info) {
      const k = 1 - clamp01(p);
      const spread = (params.spread == null ? 0.5 : params.spread) * info.shortSide;
      if (clamp01(p) < 0.999) {
        state.represent = 'particles';
        state.reprProgress = clamp01(p);
      }
      state.x += (rng() * 2 - 1) * spread * k;
      state.y += (rng() * 2 - 1) * spread * k;
      state.opacity *= Math.min(1, clamp01(p) * 3);
      state.scaleX *= 0.6 + 0.4 * clamp01(p);
      state.scaleY *= 0.6 + 0.4 * clamp01(p);
    },
  });

  // The exit sandCrumble played backwards: grains rise and settle into the
  // glyph, which is revealed from the bottom up.
  fx.register({
    group: 'enter',
    type: 'sandGather',
    tags: ['particles', 'dissolve'],
    cost: 3,
    params: [
      { key: 'wind', kind: 'number', min: -1, max: 1, step: 0.01, default: 0.25, random: [-0.6, 0.6] },
      { key: 'gravity', kind: 'number', min: 0, max: 12, step: 0.1, default: 5 },
      { key: 'grain', kind: 'number', min: 1, max: 6, step: 0.1, default: 2.4 },
      { key: 'pile', kind: 'bool', default: true },
    ],
    cpu(state, p, params) {
      const k = 1 - clamp01(p);
      if (k > 0.001 && k < 0.999) {
        state.represent = 'sand';
        state.reprProgress = 1 - k;
        state.wipeMode = 2;
        state.wipeSoft = 0.04;
        state.visibleFrac = 1 - clamp01(k / 0.72);
        state.sand = {
          wind: params.wind == null ? 0.25 : params.wind,
          gravity: params.gravity == null ? 5 : params.gravity,
          grain: params.grain == null ? 2.4 : params.grain,
          pile: params.pile !== false,
        };
      }
      const head = clamp01(k > 0.88 ? (k - 0.88) / 0.12 : 0);
      state.opacity *= 1 - head * head * (3 - 2 * head);
    },
  });

  fx.register({
    group: 'enter',
    type: 'shatterRebuild',
    tags: ['pieces'],
    cost: 2,
    params: [
      { key: 'spread', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.4, random: [0.2, 0.7] },
      { key: 'spin', kind: 'number', min: 0, max: 360, step: 5, default: 120 },
    ],
    cpu(state, p, params, rng, info) {
      const k = 1 - clamp01(p);
      const spread = (params.spread == null ? 0.4 : params.spread) * info.shortSide;
      if (clamp01(p) < 0.999) {
        state.represent = 'pieces';
        state.reprProgress = clamp01(p);
      }
      state.x += (rng() * 2 - 1) * spread * k;
      state.y += (rng() * 2 - 1) * spread * k;
      state.rot += (rng() * 2 - 1) * (params.spin == null ? 120 : params.spin) * k;
      state.opacity *= Math.min(1, clamp01(p) * 2.5);
    },
  });

  fx.register({
    group: 'enter',
    type: 'morphFromPrevious',
    tags: ['morph', 'overlap'],
    cost: 2,
    params: [{ key: 'points', kind: 'int', min: 512, max: 4096, step: 128, default: 1024 }],
    cpu(state, p) {
      state.opacity *= Math.min(1, clamp01(p) * 2);
      state.scaleX *= 0.96 + 0.04 * clamp01(p);
      state.scaleY *= 0.96 + 0.04 * clamp01(p);
      if (clamp01(p) < 0.999) {
        state.represent = 'particles';
        state.reprProgress = clamp01(p);
      }
    },
  });

  fx.register({
    group: 'enter',
    type: 'noiseDissolveIn',
    tags: ['dissolve'],
    cost: 2,
    params: [
      { key: 'scale', kind: 'number', min: 1, max: 64, step: 1, default: 12 },
      { key: 'edgeColor', kind: 'color', default: null },
      { key: 'edgeWidth', kind: 'number', min: 0, max: 0.5, step: 0.01, default: 0.1 },
    ],
    cpu(state, p, params, rng) {
      const threshold = rng() * 0.8;
      const progress = clamp01(p);
      if (progress < threshold) {
        state.opacity = 0;
      } else {
        state.opacity *= clamp01((progress - threshold) / 0.2);
        state.scaleX *= 0.92 + 0.08 * clamp01((progress - threshold) / 0.2);
        state.scaleY *= 0.92 + 0.08 * clamp01((progress - threshold) / 0.2);
      }
    },
  });

  // Block-space size entrance: the text starts at a screen-filling scale and
  // settles to its layout size (the camera pulls back through the letters).
  // `zoomIn` scales each glyph in place, so it cannot start bigger than itself.
  fx.register({
    group: 'enter',
    type: 'megaZoomIn',
    tags: ['deform', 'size'],
    pack: 'font',
    cost: 2,
    params: [
      { key: 'from', kind: 'number', min: 0.05, max: 30, step: 0.05, default: 6, random: [2, 10] },
      { key: 'fade', kind: 'bool', default: true },
    ],
    cpu(state, p, params) {
      const from = params.from == null ? 6 : Number(params.from);
      const progress = clamp01(p);
      const amount = (from - 1) * (1 - progress);
      if (Math.abs(amount) > 0.0001) state.deform.push({ type: 'zoomBlock', amount, time: 0, param: 0 });
      if (params.fade !== false) state.opacity *= clamp01(progress * 1.5);
    },
  });

  fx.register({
    group: 'enter',
    type: 'dissolve',
    tags: ['dissolve'],
    params: [{ key: 'scale', kind: 'number', min: 1, max: 64, step: 1, default: 10 }],
    cpu(state, p, params, rng) {
      const threshold = rng() * 0.85;
      const progress = clamp01(p);
      if (progress < threshold) state.opacity *= progress / Math.max(threshold, 0.0001);
      else state.opacity *= 1 - (1 - progress) * 0.15;
    },
  });

  return fx;
});
