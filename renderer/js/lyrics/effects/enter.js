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
      { key: 'spread', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.2, random: [0, 0.6] },
      { key: 'strength', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.15, random: [0, 0.5] },
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
          spread: params.spread == null ? 0.2 : params.spread,
          strength: params.strength == null ? 0.15 : params.strength,
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
      const progress = clamp01(p);
      // the noise field lives in the text pass; `edgeWidth` is the hot rim
      state.dissolve = { scale: params.scale == null ? 12 : params.scale, progress, edge: params.edgeWidth == null ? 0.1 : params.edgeWidth };
      if (progress > 0.001 && progress < 0.999) {
        state.scaleX *= 0.92 + 0.08 * progress;
        state.scaleY *= 0.92 + 0.08 * progress;
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
    params: [
      { key: 'scale', kind: 'number', min: 1, max: 64, step: 1, default: 10 },
      { key: 'edge', kind: 'number', min: 0.01, max: 0.6, step: 0.01, default: 0.16 },
    ],
    cpu(state, p, params) {
      // the text pass cuts the glyph against a noise field (state row 22.yzw),
      // so the letters come apart cell by cell instead of one opacity ramp
      const progress = clamp01(p);
      state.dissolve = { scale: params.scale == null ? 10 : params.scale, progress, edge: params.edge == null ? 0.16 : params.edge };
      // the cells arrive a touch under size and settle, so the reveal has weight
      if (progress > 0.001 && progress < 0.999) {
        state.scaleX *= 0.94 + 0.06 * progress;
        state.scaleY *= 0.94 + 0.06 * progress;
      }
    },
  });

  // --- PowerPoint-compatible basics + AE-style entrances (Phase 1) ---------------
  fx.register({
    group: 'enter', type: 'appear', tags: ['basic'],
    params: [],
    cpu(state, p) { if (clamp01(p) < 0.999) state.visibleFrac = 0; },
  });

  fx.register({
    group: 'enter', type: 'wipe', tags: ['basic', 'mask'],
    params: [
      { key: 'dir', kind: 'select', options: ['left', 'right', 'up', 'down'], default: 'left', random: 'any' },
      { key: 'soft', kind: 'number', min: 0, max: 0.5, step: 0.01, default: 0.05 },
      { key: 'fade', kind: 'bool', default: false },
    ],
    cpu(state, p, params) {
      const map = { left: 0, right: 1, up: 2, down: 3 };
      state.wipeMode = map[params.dir] == null ? 0 : map[params.dir];
      state.wipeSoft = params.soft == null ? 0.05 : params.soft;
      state.visibleFrac = Math.min(state.visibleFrac == null ? 1 : state.visibleFrac, clamp01(p));
      if (params.fade) state.opacity *= 0.3 + 0.7 * clamp01(p);
    },
  });

  fx.register({
    group: 'enter', type: 'blind', tags: ['basic', 'mask'],
    params: [
      { key: 'count', kind: 'int', min: 2, max: 16, step: 1, default: 6, random: [3, 10] },
      { key: 'dir', kind: 'select', options: ['horizontal', 'vertical'], default: 'horizontal' },
      { key: 'soft', kind: 'number', min: 0, max: 0.5, step: 0.01, default: 0.08 },
    ],
    cpu(state, p, params, rng, info) {
      const count = Math.max(2, params.count == null ? 6 : params.count);
      state.wipeMode = params.dir === 'vertical' ? 2 : 0;
      state.wipeSoft = params.soft == null ? 0.08 : params.soft;
      const lane = (info ? info.i : 0) % count;
      const local = clamp01(clamp01(p) * count - lane * 0.35);
      state.visibleFrac = Math.min(state.visibleFrac == null ? 1 : state.visibleFrac, clamp01(local));
    },
  });

  fx.register({
    group: 'enter', type: 'box', tags: ['basic', 'mask'],
    params: [{ key: 'soft', kind: 'number', min: 0, max: 0.5, step: 0.01, default: 0.06 }],
    cpu(state, p, params) {
      state.wipeMode = 4;
      state.wipeSoft = params.soft == null ? 0.06 : params.soft;
      state.visibleFrac = Math.min(state.visibleFrac == null ? 1 : state.visibleFrac, clamp01(p));
    },
  });

  fx.register({
    group: 'enter', type: 'checkerboard', tags: ['basic', 'mask'],
    params: [
      { key: 'cells', kind: 'int', min: 2, max: 8, step: 1, default: 4 },
      { key: 'soft', kind: 'number', min: 0, max: 0.5, step: 0.01, default: 0.05 },
    ],
    cpu(state, p, params, rng, info) {
      const cells = Math.max(2, params.cells == null ? 4 : params.cells);
      const i = info ? info.i : 0;
      const parity = (i % 2) + ((Math.floor(i / cells) % 2) * 0.5);
      state.wipeMode = (i % 2 === 0) ? 0 : 2;
      state.wipeSoft = params.soft == null ? 0.05 : params.soft;
      const local = clamp01(clamp01(p) * 2 - parity * 0.5);
      state.visibleFrac = Math.min(state.visibleFrac == null ? 1 : state.visibleFrac, clamp01(local));
      const k = 1 - clamp01(local);
      state.scaleX *= 1 - 0.12 * k;
      state.scaleY *= 1 - 0.12 * k;
    },
  });

  fx.register({
    group: 'enter', type: 'stretch', tags: ['basic'],
    params: [
      { key: 'axis', kind: 'select', options: ['x', 'y', 'both'], default: 'x' },
      { key: 'amount', kind: 'number', min: 0, max: 3, step: 0.05, default: 1.5, random: [0.8, 2.2] },
    ],
    cpu(state, p, params) {
      const k = 1 - clamp01(p);
      const amount = params.amount == null ? 1.5 : params.amount;
      const f = 1 + amount * k;
      if (params.axis === 'y') state.scaleY *= f;
      else if (params.axis === 'both') { state.scaleX *= f; state.scaleY *= f; }
      else state.scaleX *= f;
      state.opacity *= clamp01(p * 1.2);
    },
  });

  fx.register({
    group: 'enter', type: 'split', tags: ['lively'],
    params: [
      { key: 'axis', kind: 'select', options: ['horizontal', 'vertical'], default: 'horizontal' },
      { key: 'distance', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.25, unit: 'frame' },
    ],
    cpu(state, p, params, rng, info) {
      const k = 1 - clamp01(p);
      const dist = (params.distance == null ? 0.25 : params.distance) * info.shortSide;
      const dx = info.letterX - info.blockCenter.x;
      const dy = info.letterY - info.blockCenter.y;
      const len = Math.hypot(dx, dy) || 1;
      if (params.axis === 'vertical') state.y += (dy / len) * dist * k;
      else state.x += (dx / len) * dist * k;
      state.opacity *= clamp01(p * 1.5);
    },
  });

  fx.register({
    group: 'enter', type: 'peekIn', tags: ['lively'],
    params: [
      { key: 'dir', kind: 'select', options: ['up', 'down', 'left', 'right'], default: 'down', random: 'any' },
      { key: 'distance', kind: 'number', min: 0, max: 0.5, step: 0.01, default: 0.12, unit: 'frame' },
    ],
    cpu(state, p, params, rng, info) {
      const k = 1 - clamp01(p);
      const dist = (params.distance == null ? 0.12 : params.distance) * info.shortSide;
      const off = { up: [0, -dist], down: [0, dist], left: [-dist, 0], right: [dist, 0] }[params.dir || 'down'] || [0, 0];
      state.x += off[0] * k;
      state.y += off[1] * k;
      state.wipeMode = params.dir === 'up' ? 2 : params.dir === 'down' ? 3 : params.dir === 'left' ? 0 : 1;
      state.wipeSoft = 0.1;
      state.visibleFrac = Math.min(state.visibleFrac == null ? 1 : state.visibleFrac, clamp01(p * 1.1));
    },
  });

  fx.register({
    group: 'enter', type: 'riseUp', tags: ['lively'],
    params: [
      { key: 'distance', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.2, unit: 'frame' },
      { key: 'fade', kind: 'bool', default: true },
    ],
    cpu(state, p, params, rng, info) {
      const k = 1 - clamp01(p);
      const dist = (params.distance == null ? 0.2 : params.distance) * info.shortSide;
      state.y += dist * k * k;
      state.scaleY *= 1 - 0.1 * k;
      if (params.fade !== false) state.opacity *= clamp01(p * 1.4);
    },
  });

  fx.register({
    group: 'enter', type: 'spiralIn', tags: ['gorgeous'],
    params: [
      { key: 'turns', kind: 'number', min: 0.25, max: 4, step: 0.25, default: 1.25, random: [0.75, 2] },
      { key: 'radius', kind: 'number', min: 0, max: 1.5, step: 0.01, default: 0.5, unit: 'frame' },
    ],
    cpu(state, p, params, rng, info) {
      const k = 1 - clamp01(p);
      const turns = params.turns == null ? 1.25 : params.turns;
      const radius = (params.radius == null ? 0.5 : params.radius) * info.shortSide;
      const ang = k * turns * Math.PI * 2 + (info.i * 0.35);
      state.x += Math.cos(ang) * radius * k;
      state.y += Math.sin(ang) * radius * k;
      state.rot += k * 180 * Math.sign(turns || 1);
      state.scaleX *= 1 - 0.4 * k;
      state.scaleY *= 1 - 0.4 * k;
      state.opacity *= clamp01(p * 2);
    },
  });

  fx.register({
    group: 'enter', type: 'radialIn', tags: ['gorgeous'],
    params: [{ key: 'spread', kind: 'number', min: 0, max: 2, step: 0.05, default: 1 }],
    cpu(state, p, params, rng, info) {
      const k = 1 - clamp01(p);
      const spread = params.spread == null ? 1 : params.spread;
      state.x += (info.blockCenter.x - info.letterX) * k * spread;
      state.y += (info.blockCenter.y - info.letterY) * k * spread;
      state.scaleX *= clamp01(p * 1.5) || 0.001;
      state.scaleY *= clamp01(p * 1.5) || 0.001;
      state.opacity *= clamp01(p * 1.5);
    },
  });

  fx.register({
    group: 'enter', type: 'floatIn', tags: ['gorgeous'],
    params: [
      { key: 'amp', kind: 'number', min: 0, max: 0.3, step: 0.005, default: 0.05 },
      { key: 'distance', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.2, unit: 'frame' },
    ],
    cpu(state, p, params, rng, info) {
      const k = 1 - clamp01(p);
      const dist = (params.distance == null ? 0.2 : params.distance) * info.shortSide;
      const amp = (params.amp == null ? 0.05 : params.amp) * info.shortSide;
      state.y += dist * k;
      state.x += Math.sin(clamp01(p) * Math.PI * 2 + info.i * 0.5) * amp * k;
      state.opacity *= clamp01(p * 1.3);
    },
  });

  fx.register({
    group: 'enter', type: 'boomerang', tags: ['gorgeous'],
    params: [
      { key: 'distance', kind: 'number', min: 0, max: 1.5, step: 0.01, default: 0.6, unit: 'frame' },
      { key: 'arc', kind: 'number', min: -1, max: 1, step: 0.01, default: 0.3, unit: 'frame' },
    ],
    cpu(state, p, params, rng, info) {
      const k = 1 - clamp01(p);
      const dist = (params.distance == null ? 0.6 : params.distance) * info.shortSide;
      const arc = (params.arc == null ? 0.3 : params.arc) * info.shortSide;
      state.x += dist * k * k;
      state.y -= Math.sin(clamp01(p) * Math.PI) * arc;
      state.rot += k * 120;
      state.opacity *= clamp01(p * 1.6);
    },
  });

  fx.register({
    group: 'enter', type: 'slideBlur', tags: ['lively'],
    params: [
      { key: 'dir', kind: 'select', options: ['up', 'down', 'left', 'right'], default: 'right', random: 'any' },
      { key: 'distance', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.35, unit: 'frame' },
      { key: 'blur', kind: 'number', min: 0, max: 40, step: 0.5, default: 10 },
    ],
    cpu(state, p, params, rng, info) {
      const k = 1 - clamp01(p);
      const dist = (params.distance == null ? 0.35 : params.distance) * info.shortSide;
      const off = { up: [0, -dist], down: [0, dist], left: [-dist, 0], right: [dist, 0] }[params.dir || 'right'] || [0, 0];
      state.x += off[0] * k;
      state.y += off[1] * k;
      state.blur = Math.max(state.blur || 0, (params.blur == null ? 10 : params.blur) * k);
      state.opacity *= clamp01(p * 1.4);
    },
  });

  fx.register({
    group: 'enter', type: 'lightReveal', tags: ['lively'],
    params: [{ key: 'glow', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.8 }],
    cpu(state, p, params) {
      const k = clamp01(p);
      state.opacity *= k;
      state.flash = Math.max(state.flash || 0, (params.glow == null ? 0.8 : params.glow) * Math.sin(k * Math.PI));
      state.blur = Math.max(state.blur || 0, 8 * (1 - k));
    },
  });

  fx.register({
    group: 'enter', type: 'jaggyIn', tags: ['lively'],
    params: [
      { key: 'levels', kind: 'int', min: 2, max: 8, step: 1, default: 4 },
      { key: 'jitter', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.3 },
    ],
    cpu(state, p, params, rng, info) {
      const levels = Math.max(2, Math.round(params.levels == null ? 4 : params.levels));
      const step = Math.floor(clamp01(p) * levels) / levels;
      state.opacity *= clamp01(step + 0.2);
      const wob = (params.jitter == null ? 0.3 : params.jitter) * info.shortSide * 0.01 * (1 - clamp01(p));
      state.x += (rng() * 2 - 1) * wob;
      const s = 0.7 + 0.3 * clamp01(p);
      state.scaleX *= s; state.scaleY *= s;
    },
  });

  fx.register({
    group: 'enter', type: 'maskReveal', tags: ['basic', 'mask'],
    params: [
      { key: 'dir', kind: 'select', options: ['left', 'right', 'up', 'down'], default: 'right', random: 'any' },
      { key: 'soft', kind: 'number', min: 0, max: 0.5, step: 0.01, default: 0.12 },
      { key: 'slope', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.3 },
    ],
    cpu(state, p, params, rng, info) {
      const map = { left: 0, right: 1, up: 2, down: 3 };
      state.wipeMode = map[params.dir] == null ? 1 : map[params.dir];
      state.wipeSoft = params.soft == null ? 0.12 : params.soft;
      const slope = params.slope == null ? 0.3 : params.slope;
      const local = clamp01(clamp01(p) * (1 + slope) - (info.i / Math.max(1, info.N)) * slope);
      state.visibleFrac = Math.min(state.visibleFrac == null ? 1 : state.visibleFrac, clamp01(local));
    },
  });

  fx.register({
    group: 'enter', type: 'depthBlurIn', tags: ['lively'],
    params: [
      { key: 'blur', kind: 'number', min: 0, max: 40, step: 0.5, default: 14 },
      { key: 'from', kind: 'number', min: 0, max: 3, step: 0.05, default: 1.6 },
    ],
    cpu(state, p, params) {
      const k = 1 - clamp01(p);
      state.blur = Math.max(state.blur || 0, (params.blur == null ? 14 : params.blur) * k);
      const from = params.from == null ? 1.6 : params.from;
      const s = 1 + (from - 1) * k;
      state.scaleX *= s; state.scaleY *= s;
      state.opacity *= clamp01(p * 1.4);
    },
  });

  // --- textenter2 (doc/textenter2.md): 16 enter animations + shared pivot /
  // tilted-axis scale infrastructure. All 16 go through registerEnter so the
  // same cpu serves A (beat) and B (scoped substring); only info/origin differ.
  const DEG2 = Math.PI / 180;

  function hash01(i, salt) {
    const value = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
    return value - Math.floor(value);
  }

  function easeOutCubic2(t) {
    const u = t <= 0 ? 0 : t >= 1 ? 1 : t;
    return 1 - Math.pow(1 - u, 3);
  }

  function easeInOutSine2(t) {
    const u = t <= 0 ? 0 : t >= 1 ? 1 : t;
    return 0.5 - 0.5 * Math.cos(Math.PI * u);
  }

  function easeInOutCubic2(t) {
    const u = t <= 0 ? 0 : t >= 1 ? 1 : t;
    return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
  }

  function easeOutBack2(t, overshoot) {
    const u = t <= 0 ? 0 : t >= 1 ? 1 : t;
    const s = overshoot == null ? 1.70158 : overshoot;
    return 1 + (s + 1) * Math.pow(u - 1, 3) + s * Math.pow(u - 1, 2);
  }

  function springScale2(t, damping, freq) {
    const damp = damping == null ? 5 : damping;
    const fr = freq == null ? 1.5 : freq;
    if (t >= 1) return 0;
    return Math.exp(-damp * t) * Math.cos(fr * Math.PI * 2 * t);
  }

  function lerp2(a, b, t) {
    return a + (b - a) * t;
  }

  // Origin of a pivot/scale deformation in screen px (§2.3). `base` is
  // pivot/scaleOrigin, `anchor` the 9 points + baseline, `offset` the fine
  // adjust, `z` the depth for X/Y rotation.
  function resolveOrigin(state, info, base, anchor, offset, z) {
    const half = (info && info.blockHalf) || { x: 100, y: 50 };
    const center = (info && info.blockCenter) || { x: state.x, y: state.y };
    let C = { x: center.x, y: center.y };
    let H = { x: Math.max(1, half.x || 100), y: Math.max(1, half.y || 50) };
    if (base === 'letter') {
      C = { x: state.x, y: state.y };
      const lw = info && info.letter && Number(info.letter.advance) > 0 ? Number(info.letter.advance) : 24;
      const lh = info && info.letter && Number(info.letter.size) > 0 ? Number(info.letter.size) : 48;
      const sx = Math.abs(state.scaleX || 1);
      const sy = Math.abs(state.scaleY || 1);
      H = { x: Math.max(1, (lw * sx) / 2), y: Math.max(1, (lh * sy) / 2) };
    } else if (base === 'line' && info && info.lineBox) {
      C = { x: info.lineBox.center.x, y: info.lineBox.center.y };
      H = { x: Math.max(1, info.lineBox.half.x), y: Math.max(1, info.lineBox.half.y) };
    }
    const map = {
      tl: [-1, -1], t: [0, -1], tr: [1, -1],
      l: [-1, 0], c: [0, 0], r: [1, 0],
      bl: [-1, 1], b: [0, 1], br: [1, 1],
    };
    let ax = 0;
    let ay = 0;
    if (anchor === 'baseline') {
      ax = 0;
      ay = 0.6;
    } else if (map[anchor]) {
      ax = map[anchor][0];
      ay = map[anchor][1];
    }
    const ox = offset && Number.isFinite(Number(offset.x)) ? Number(offset.x) : 0;
    const oy = offset && Number.isFinite(Number(offset.y)) ? Number(offset.y) : 0;
    return {
      x: C.x + ax * H.x + ox * 2 * H.x,
      y: C.y + ay * H.y + oy * 2 * H.y,
      z: (Number(z) || 0) * 2 * H.x,
      hx: H.x,
      hy: H.y,
    };
  }

  function originOf(state, info, params, purpose) {
    if (purpose === 'scale' && params && params.scaleOriginSeparate) {
      return resolveOrigin(state, info, params.scaleOrigin || 'letter', params.scaleOriginAnchor || 'c', params.scaleOriginOffset || { x: 0, y: 0 }, 0);
    }
    return resolveOrigin(
      state, info,
      (params && params.pivot) || 'letter',
      (params && params.pivotAnchor) || 'c',
      (params && params.pivotOffset) || { x: 0, y: 0 },
      (params && params.pivotZ) || 0
    );
  }

  // Deformation around O: scale/rotate/skew the glyph and move its centre the
  // same way, so O acts as the origin (§2.1). skew is degrees; state.skewX is
  // the shear coefficient, hence the tan conversion.
  function applyPivot(state, O, t) {
    const sx = t.sx == null ? 1 : t.sx;
    const sy = t.sy == null ? 1 : t.sy;
    const rot = t.rot || 0;
    const skew = t.skew || 0;
    state.scaleX *= sx;
    state.scaleY *= sy;
    state.rot += rot;
    state.skewX += Math.tan(skew * DEG2);
    let dx = (state.x - O.x) * sx;
    let dy = (state.y - O.y) * sy;
    dx += dy * Math.tan(skew * DEG2);
    const r = rot * DEG2;
    const cos = Math.cos(r);
    const sin = Math.sin(r);
    state.x = O.x + dx * cos - dy * sin;
    state.y = O.y + dx * sin + dy * cos;
  }

  // Tilted-axis start scale shared by all 16 types (§2.2): A = R(θ)·diag·R(-θ)
  // composed with the type's own M0, then re-decomposed to rot/scale/skew.
  function applyScaleFrom(state, p, params, info) {
    const fx0 = params && params.scaleFromX != null ? Number(params.scaleFromX) : 1;
    const fy0 = params && params.scaleFromY != null ? Number(params.scaleFromY) : 1;
    if (!(fx0 !== 1 || fy0 !== 1)) return;
    const easeName = (params && params.scaleEase) || 'easeOutCubic';
    const ee = easing.get(easeName) || easing.get('easeOutCubic');
    const e = ee(clamp01(p));
    const sx = Math.max(0.001, lerp2(fx0, 1, e));
    const sy = Math.max(0.001, lerp2(fy0, 1, e));
    let theta = Number((params && params.scaleAxis) || 0);
    if (params && params.scaleAxisTo != null && params.scaleAxisTo !== '') {
      theta = lerp2(Number(params.scaleAxis) || 0, Number(params.scaleAxisTo), e);
    }
    const th = theta * DEG2;
    const cos = Math.cos(th);
    const sin = Math.sin(th);
    // resolve the origin before rewriting the glyph factors (letter pivot
    // measures H from the current size)
    const O = originOf(state, info, params, 'scale');
    const ox = state.x - O.x;
    const oy = state.y - O.y;
    // A = R(θ)·diag(sx,sy)·R(-θ)
    const A = [
      [cos * cos * sx + sin * sin * sy, cos * sin * (sx - sy)],
      [cos * sin * (sx - sy), sin * sin * sx + cos * cos * sy],
    ];
    // M0 = R(rot)·Sh(skew)·diag(scaleX,scaleY)
    const rot0 = (state.rot || 0) * DEG2;
    const sk0 = state.skewX || 0;
    const sX0 = state.scaleX == null ? 1 : state.scaleX;
    const sY0 = state.scaleY == null ? 1 : state.scaleY;
    const c0 = Math.cos(rot0);
    const s0 = Math.sin(rot0);
    const a11 = c0 * sX0;
    const a12 = c0 * sk0 * sY0 - s0 * sY0;
    const a21 = s0 * sX0;
    const a22 = s0 * sk0 * sY0 + c0 * sY0;
    // M = A·M0
    const a = A[0][0] * a11 + A[0][1] * a21;
    const b = A[0][0] * a12 + A[0][1] * a22;
    const c = A[1][0] * a11 + A[1][1] * a21;
    const d = A[1][0] * a12 + A[1][1] * a22;
    const det = a * d - b * c;
    if (!Number.isFinite(det) || Math.abs(det) < 1e-9) return;
    const r = Math.hypot(a, c);
    if (!(r > 1e-9)) return;
    state.rot = Math.atan2(c, a) / DEG2;
    state.scaleX = r;
    state.scaleY = det / r;
    state.skewX = (a * b + c * d) / (r * state.scaleY);
    // move the centre around the scale origin by the same A
    state.x = O.x + A[0][0] * ox + A[0][1] * oy;
    state.y = O.y + A[1][0] * ox + A[1][1] * oy;
  }

  const COMMON_ENTER_PARAMS = [
    { key: 'pivot', kind: 'select', options: ['letter', 'line', 'block'], default: 'letter', section: 'pivot' },
    { key: 'pivotAnchor', kind: 'select', options: ['tl', 't', 'tr', 'l', 'c', 'r', 'bl', 'b', 'br', 'baseline'], default: 'c', section: 'pivot' },
    { key: 'pivotOffset', kind: 'vec2', default: { x: 0, y: 0 }, section: 'pivot' },
    { key: 'pivotZ', kind: 'number', min: -2, max: 2, step: 0.05, default: 0, section: 'pivot' },
    { key: 'scaleFromX', kind: 'number', min: 0, max: 10, step: 0.05, default: 1, section: 'scaleFrom' },
    { key: 'scaleFromY', kind: 'number', min: 0, max: 10, step: 0.05, default: 1, section: 'scaleFrom' },
    { key: 'scaleAxis', kind: 'number', min: -180, max: 180, step: 1, default: 0, section: 'scaleFrom' },
    { key: 'scaleAxisTo', kind: 'number', min: -180, max: 180, step: 1, default: 0, optional: true, section: 'scaleFrom' },
    { key: 'scaleEase', kind: 'ease', default: 'easeOutCubic', section: 'scaleFrom' },
    { key: 'scaleOriginSeparate', kind: 'bool', default: false, section: 'scaleFrom' },
    { key: 'scaleOrigin', kind: 'select', options: ['letter', 'line', 'block'], default: 'letter', section: 'scaleFrom' },
    { key: 'scaleOriginAnchor', kind: 'select', options: ['tl', 't', 'tr', 'l', 'c', 'r', 'bl', 'b', 'br', 'baseline'], default: 'c', section: 'scaleFrom' },
    { key: 'scaleOriginOffset', kind: 'vec2', default: { x: 0, y: 0 }, section: 'scaleFrom' },
  ];

  function registerEnter(descriptor) {
    const body = descriptor.cpu;
    fx.register({
      ...descriptor,
      params: [...(descriptor.params || []), ...COMMON_ENTER_PARAMS.map((param) => ({ ...param }))],
      cpu(state, p, params, rng, info) {
        if (!info) info = {};
        if (!info.origin) {
          try {
            info = { ...info, origin: originOf(state, info, params, 'motion') };
          } catch { /* keep info as-is */ }
        }
        body(state, p, params, rng, info);
        applyScaleFrom(state, p, params, info);
      },
    });
  }

  // #1: one-by-one grow with overshoot
  registerEnter({
    group: 'enter', type: 'charGrowIn', tags: ['basic'],
    params: [
      { key: 'from', kind: 'number', min: 0, max: 1, step: 0.01, default: 0 },
      { key: 'overshoot', kind: 'number', min: 1, max: 2, step: 0.01, default: 1.25 },
      { key: 'peak', kind: 'number', min: 0.3, max: 0.9, step: 0.01, default: 0.65 },
    ],
    cpu(state, p, params, rng, info) {
      const t = clamp01(p);
      const from = params.from == null ? 0 : Number(params.from);
      const over = params.overshoot == null ? 1.25 : Number(params.overshoot);
      const peak = Math.min(0.9, Math.max(0.3, params.peak == null ? 0.65 : Number(params.peak)));
      const s = t < peak ? lerp2(from, over, easeOutCubic2(t / peak))
        : lerp2(over, 1, easeInOutSine2((t - peak) / (1 - peak)));
      applyPivot(state, info.origin, { sx: Math.max(0.001, s), sy: Math.max(0.001, s) });
      state.opacity *= clamp01(t * 3);
    },
  });

  // #2: stretch vertically then settle with one spring bounce
  registerEnter({
    group: 'enter', type: 'stretchYIn', tags: ['deform'],
    params: [
      { key: 'amount', kind: 'number', min: 0, max: 3, step: 0.05, default: 1.4 },
      { key: 'thin', kind: 'number', min: 0.05, max: 1, step: 0.01, default: 0.35 },
      { key: 'split', kind: 'number', min: 0.2, max: 0.8, step: 0.01, default: 0.45 },
      { key: 'rise', kind: 'number', min: 0, max: 0.5, step: 0.005, default: 0.06, unit: 'frame' },
    ],
    cpu(state, p, params, rng, info) {
      const t = clamp01(p);
      const amount = params.amount == null ? 1.4 : Number(params.amount);
      const thin = params.thin == null ? 0.35 : Number(params.thin);
      const split = Math.min(0.8, Math.max(0.2, params.split == null ? 0.45 : Number(params.split)));
      const rise = (params.rise == null ? 0.06 : Number(params.rise)) * info.shortSide;
      let sx;
      let sy;
      if (t < split) {
        const u = t / split;
        sy = lerp2(0, 1 + amount, easeOutCubic2(u));
        sx = thin;
        state.y += rise * (1 - u);
      } else {
        const v = (t - split) / (1 - split);
        sy = 1 + amount * springScale2(v, 5, 1.5);
        sx = 1 + (thin - 1) * springScale2(v, 5, 1.5);
      }
      applyPivot(state, info.origin, { sx: Math.max(0.001, sx), sy: Math.max(0.001, sy) });
      state.opacity *= clamp01(t * 4);
    },
  });

  // #3: horizontal variant of #2
  registerEnter({
    group: 'enter', type: 'stretchXIn', tags: ['deform'],
    params: [
      { key: 'amount', kind: 'number', min: 0, max: 3, step: 0.05, default: 1.4 },
      { key: 'thin', kind: 'number', min: 0.05, max: 1, step: 0.01, default: 0.35 },
      { key: 'split', kind: 'number', min: 0.2, max: 0.8, step: 0.01, default: 0.45 },
      { key: 'slide', kind: 'number', min: 0, max: 0.5, step: 0.005, default: 0.06, unit: 'frame' },
    ],
    cpu(state, p, params, rng, info) {
      const t = clamp01(p);
      const amount = params.amount == null ? 1.4 : Number(params.amount);
      const thin = params.thin == null ? 0.35 : Number(params.thin);
      const split = Math.min(0.8, Math.max(0.2, params.split == null ? 0.45 : Number(params.split)));
      const slide = (params.slide == null ? 0.06 : Number(params.slide)) * info.shortSide;
      let sx;
      let sy;
      if (t < split) {
        const u = t / split;
        sx = lerp2(0, 1 + amount, easeOutCubic2(u));
        sy = thin;
        state.x += slide * (1 - u);
      } else {
        const v = (t - split) / (1 - split);
        sx = 1 + amount * springScale2(v, 5, 1.5);
        sy = 1 + (thin - 1) * springScale2(v, 5, 1.5);
      }
      applyPivot(state, info.origin, { sx: Math.max(0.001, sx), sy: Math.max(0.001, sy) });
      state.opacity *= clamp01(t * 4);
    },
  });

  // #4: plate first, glyph rides on after plateLead
  registerEnter({
    group: 'enter', type: 'plateIn', tags: ['decor'],
    params: [
      { key: 'plateLead', kind: 'number', min: 0, max: 0.6, step: 0.01, default: 0.25 },
      { key: 'from', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.6 },
    ],
    companion: {
      bgShape: { type: 'square', params: { width: 1.1, height: 1.1, radius: 0.2 } },
      bgMotion: { type: 'stamp', params: {} },
    },
    cpu(state, p, params) {
      const lead = params.plateLead == null ? 0.25 : Number(params.plateLead);
      const from = params.from == null ? 0.6 : Number(params.from);
      const t = clamp01((clamp01(p) - lead) / Math.max(0.001, 1 - lead));
      const s = lerp2(from, 1, easeOutBack2(t, 1.2));
      state.scaleX *= Math.max(0.001, s);
      state.scaleY *= Math.max(0.001, s);
      state.opacity *= t;
    },
  });

  // #5: rubber volume-preserving wobble + jelly
  registerEnter({
    group: 'enter', type: 'rubberIn', tags: ['deform'],
    params: [
      { key: 'amp', kind: 'number', min: 0, max: 1.5, step: 0.01, default: 0.6 },
      { key: 'damping', kind: 'number', min: 0.5, max: 10, step: 0.1, default: 4 },
      { key: 'freq', kind: 'number', min: 0.5, max: 8, step: 0.1, default: 3 },
    ],
    cpu(state, p, params, rng, info) {
      const t = clamp01(p);
      const k = 1 - t;
      const amp = params.amp == null ? 0.6 : Number(params.amp);
      const damping = params.damping == null ? 4 : Number(params.damping);
      const freq = params.freq == null ? 3 : Number(params.freq);
      const s = 1 + amp * Math.exp(-damping * t) * Math.sin(freq * 2 * Math.PI * t + Math.PI / 2) * k;
      applyPivot(state, info.origin, { sx: Math.max(0.001, 1 / s), sy: Math.max(0.001, s) });
      state.deform.push({ type: 'jelly', amount: amp * k, time: t, param: freq });
      state.opacity *= clamp01(t * 4);
    },
  });

  // #6: per-letter jitter + flash; channel split rides in post.rgbShift
  registerEnter({
    group: 'enter', type: 'chromaIn', tags: ['glitch'],
    params: [
      { key: 'split', kind: 'number', min: 0, max: 0.15, step: 0.005, default: 0.04, unit: 'frame' },
      { key: 'jitter', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
      { key: 'angle', kind: 'number', min: -180, max: 180, step: 1, default: 0 },
    ],
    companion: {
      post: [{ type: 'rgbShift', params: { amount: 3, angle: 0 } }],
    },
    cpu(state, p, params, rng, info) {
      const k = 1 - clamp01(p);
      const split = (params.split == null ? 0.04 : Number(params.split)) * info.shortSide;
      const jitter = params.jitter == null ? 0.5 : Number(params.jitter);
      const angle = ((params.angle == null ? 0 : Number(params.angle)) * DEG2);
      const jx = (rng() * 2 - 1) * jitter;
      const jy = (rng() * 2 - 1) * jitter * 0.4;
      state.x += Math.cos(angle) * split * k * jx;
      state.y += Math.sin(angle) * split * k * jx + split * k * jy * 0.4;
      state.flash = Math.max(state.flash || 0, 0.3 * k);
      state.opacity *= clamp01(p * 2);
    },
  });

  // #7: stack (repeat companion) or converge (cloneSpread)
  registerEnter({
    group: 'enter', type: 'multiIn', tags: ['lively'],
    params: [
      { key: 'arrange', kind: 'select', options: ['stack', 'converge'], default: 'stack' },
      { key: 'layout', kind: 'select', options: ['stackV', 'rowH', 'diagonal'], default: 'stackV' },
      { key: 'copies', kind: 'int', min: 1, max: 3, step: 1, default: 2 },
      { key: 'cascade', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.35 },
      { key: 'copyOpacity', kind: 'select', options: ['flat', 'fade'], default: 'fade' },
      { key: 'gap', kind: 'select', options: ['tight', 'normal', 'wide'], default: 'normal' },
    ],
    companion: {
      repeat: { type: 'stackV', params: { copies: 2, sequence: 'cascade', copyOpacity: 'fade', gap: 'normal' } },
    },
    cpu(state, p, params) {
      const k = 1 - clamp01(p);
      state.cloneSpread = k;
      state.opacity *= clamp01(p * 1.5);
      state.y += 0;
    },
  });

  // #8: lean in with rotation + skew
  registerEnter({
    group: 'enter', type: 'leanIn', tags: ['lively'],
    params: [
      { key: 'angle', kind: 'number', min: -90, max: 90, step: 0.5, default: -25 },
      { key: 'skew', kind: 'number', min: -60, max: 60, step: 0.5, default: 20 },
      { key: 'distance', kind: 'number', min: 0, max: 0.5, step: 0.005, default: 0.08, unit: 'frame' },
    ],
    cpu(state, p, params, rng, info) {
      const k = 1 - clamp01(p);
      const angle = params.angle == null ? -25 : Number(params.angle);
      const skew = params.skew == null ? 20 : Number(params.skew);
      const distance = (params.distance == null ? 0.08 : Number(params.distance)) * info.shortSide;
      applyPivot(state, info.origin, { sx: 1, sy: 1, rot: angle * k, skew: skew * k });
      state.x += -Math.sign(angle || 1) * distance * k;
      state.opacity *= clamp01(p * 1.5);
    },
  });

  // #9: appear, then keep a tilt (the only non-identity at p = 1)
  registerEnter({
    group: 'enter', type: 'tiltSettleIn', tags: ['lively'],
    params: [
      { key: 'tilt', kind: 'number', min: -45, max: 45, step: 0.5, default: 8 },
      { key: 'appear', kind: 'number', min: 0.2, max: 0.9, step: 0.01, default: 0.55 },
      { key: 'alternate', kind: 'bool', default: false },
    ],
    cpu(state, p, params, rng, info) {
      const t = clamp01(p);
      const tilt = params.tilt == null ? 8 : Number(params.tilt);
      const appear = Math.min(0.9, Math.max(0.2, params.appear == null ? 0.55 : Number(params.appear)));
      const signed = params.alternate && info.i % 2 ? -tilt : tilt;
      if (t < appear) {
        const u = t / appear;
        const s = lerp2(0.9, 1, easeOutCubic2(u));
        state.scaleX *= Math.max(0.001, s);
        state.scaleY *= Math.max(0.001, s);
        state.opacity *= u;
        return;
      }
      const v = (t - appear) / (1 - appear);
      applyPivot(state, info.origin, { sx: 1, sy: 1, rot: signed * easeOutBack2(v, 1.2) });
      state.opacity *= 1;
    },
  });

  // #10: shake with decaying oscillation
  registerEnter({
    group: 'enter', type: 'shakeIn', tags: ['lively'],
    params: [
      { key: 'amp', kind: 'number', min: 0, max: 0.1, step: 0.002, default: 0.02, unit: 'frame' },
      { key: 'rotAmp', kind: 'number', min: 0, max: 30, step: 0.5, default: 6 },
      { key: 'freq', kind: 'number', min: 1, max: 30, step: 0.5, default: 10 },
    ],
    cpu(state, p, params, rng, info) {
      const t = clamp01(p);
      const k = 1 - t;
      const amp = (params.amp == null ? 0.02 : Number(params.amp)) * info.shortSide;
      const rotAmp = params.rotAmp == null ? 6 : Number(params.rotAmp);
      const freq = params.freq == null ? 10 : Number(params.freq);
      const h = hash01(info.i, 1) * 2 * Math.PI;
      const e = Math.sqrt(k);
      state.x += Math.sin(t * freq * 2 * Math.PI + h) * amp * e;
      state.y += Math.sin(t * freq * 2 * Math.PI * 1.3 + h * 2) * amp * 0.6 * e;
      state.rot += Math.sin(t * freq * 2 * Math.PI * 0.9 + h * 3) * rotAmp * e;
      state.opacity *= clamp01(p * 2);
    },
  });

  // #11/#12: radial gather + shapeLayer circle (+burst) companions
  registerEnter({
    group: 'enter', type: 'circleIn', tags: ['decor'],
    params: [
      { key: 'spread', kind: 'number', min: 0, max: 2, step: 0.01, default: 0.6 },
      { key: 'circleScale', kind: 'number', min: 0.5, max: 3, step: 0.05, default: 1.3 },
      { key: 'shapeUnit', kind: 'select', options: ['block', 'char'], default: 'block' },
    ],
    companion: {
      post: [{ type: 'shapeLayer', params: { shape: 'circle', followText: 'block', enterAnim: 'expand' } }],
    },
    cpu(state, p, params, rng, info) {
      const t = clamp01(p);
      const k = 1 - t;
      const spread = params.spread == null ? 0.6 : Number(params.spread);
      const cx = info.blockCenter ? info.blockCenter.x : state.x;
      const cy = info.blockCenter ? info.blockCenter.y : state.y;
      state.x += (state.x - cx) * k * spread;
      state.y += (state.y - cy) * k * spread;
      const s = 0.5 + 0.5 * t;
      state.scaleX *= Math.max(0.001, s);
      state.scaleY *= Math.max(0.001, s);
      state.opacity *= clamp01(p * 1.5);
    },
  });

  registerEnter({
    group: 'enter', type: 'circleBurstIn', tags: ['decor'],
    params: [
      { key: 'spread', kind: 'number', min: 0, max: 2, step: 0.01, default: 0.6 },
      { key: 'circleScale', kind: 'number', min: 0.5, max: 3, step: 0.05, default: 1.3 },
      { key: 'burstDelay', kind: 'number', min: 0, max: 0.5, step: 0.01, default: 0.15 },
      { key: 'shapeUnit', kind: 'select', options: ['block', 'char'], default: 'block' },
    ],
    companion: {
      post: [
        { type: 'shapeLayer', params: { shape: 'circle', followText: 'block', enterAnim: 'expand' } },
        { type: 'shapeLayer', params: { shape: 'burst', followText: 'block', enterAnim: 'draw' } },
      ],
    },
    cpu(state, p, params, rng, info) {
      const t = clamp01(p);
      const k = 1 - t;
      const spread = params.spread == null ? 0.6 : Number(params.spread);
      const cx = info.blockCenter ? info.blockCenter.x : state.x;
      const cy = info.blockCenter ? info.blockCenter.y : state.y;
      state.x += (state.x - cx) * k * spread;
      state.y += (state.y - cy) * k * spread;
      const s = 0.5 + 0.5 * t;
      state.scaleX *= Math.max(0.001, s);
      state.scaleY *= Math.max(0.001, s);
      state.opacity *= clamp01(p * 1.5);
    },
  });

  const VARY_RECIPES = ['stretchY', 'stretchX', 'rubber', 'lean', 'flip', 'spin'];

  function varyRecipeBody(name, state, p, params, rng, info) {
    const t = clamp01(p);
    const k = 1 - t;
    if (name === 'stretchY') {
      const sy = 1 + 1.4 * k;
      applyPivot(state, info.origin, { sx: Math.max(0.001, 1 - 0.5 * k), sy: Math.max(0.001, sy) });
    } else if (name === 'stretchX') {
      const sx = 1 + 1.4 * k;
      applyPivot(state, info.origin, { sx: Math.max(0.001, sx), sy: Math.max(0.001, 1 - 0.5 * k) });
    } else if (name === 'rubber') {
      const s = 1 + 0.6 * k * Math.sin(t * Math.PI * 2);
      applyPivot(state, info.origin, { sx: Math.max(0.001, 1 / s), sy: Math.max(0.001, s) });
    } else if (name === 'lean') {
      applyPivot(state, info.origin, { sx: 1, sy: 1, rot: -25 * k, skew: 20 * k });
    } else if (name === 'flip') {
      state.tiltY += 90 * k;
      state.opacity *= clamp01(p * 2);
      return;
    } else {
      state.rot += 180 * k;
    }
    state.opacity *= clamp01(p * 2);
  }

  // #13: a different deformation per letter
  registerEnter({
    group: 'enter', type: 'varyDeformIn', tags: ['deform'],
    params: [
      { key: 'recipes', kind: 'text', default: 'stretchY,stretchX,rubber,lean,flip,spin' },
      { key: 'mode', kind: 'select', options: ['cycle', 'random'], default: 'random' },
    ],
    cpu(state, p, params, rng, info) {
      const raw = params.recipes == null ? '' : String(params.recipes);
      const list = raw.split(',').map((s) => s.trim()).filter((s) => VARY_RECIPES.includes(s));
      const recipes = list.length ? list : [...VARY_RECIPES];
      const mode = params.mode || 'random';
      const pick = mode === 'cycle' ? info.i % recipes.length : Math.floor(hash01(info.i, 13) * recipes.length) % recipes.length;
      varyRecipeBody(recipes[pick], state, p, params, rng, info);
    },
  });

  // #14: per-letter blink frequencies
  registerEnter({
    group: 'enter', type: 'blinkVaryIn', tags: ['glow'],
    params: [
      { key: 'minHz', kind: 'number', min: 1, max: 20, step: 0.5, default: 3 },
      { key: 'maxHz', kind: 'number', min: 1, max: 30, step: 0.5, default: 9 },
      { key: 'duty', kind: 'number', min: 0.1, max: 0.9, step: 0.01, default: 0.4 },
      { key: 'dim', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.05 },
    ],
    cpu(state, p, params, rng, info) {
      const t = clamp01(p);
      if (t >= 0.999) {
        state.opacity *= 1;
        return;
      }
      const minHz = params.minHz == null ? 3 : Number(params.minHz);
      const maxHz = params.maxHz == null ? 9 : Number(params.maxHz);
      const duty = params.duty == null ? 0.4 : Number(params.duty);
      const dim = params.dim == null ? 0.05 : Number(params.dim);
      const f = minHz + (maxHz - minHz) * hash01(info.i, 14);
      const phi = hash01(info.i, 15);
      const d = duty + (1 - duty) * t;
      const frac = (t * f + phi) % 1;
      state.opacity *= frac < d ? 1 : dim;
    },
  });

  // #15: twist in and release (x/y/z axes, letter or block pivot)
  registerEnter({
    group: 'enter', type: 'twistIn', tags: ['deform', '3d'],
    params: [
      { key: 'axis', kind: 'select', options: ['x', 'y', 'z'], default: 'x' },
      { key: 'angle', kind: 'number', min: -720, max: 720, step: 1, default: 180 },
      { key: 'direction', kind: 'select', options: ['forward', 'reverse'], default: 'forward' },
      { key: 'phase', kind: 'select', options: ['in', 'inOut'], default: 'inOut' },
      { key: 'peak', kind: 'number', min: 0.1, max: 0.9, step: 0.01, default: 0.4 },
      { key: 'bounce', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.3 },
      { key: 'backface', kind: 'select', options: ['show', 'hide', 'dim'], default: 'dim' },
      { key: 'depth', kind: 'number', min: 0, max: 2, step: 0.05, default: 1 },
    ],
    cpu(state, p, params, rng, info) {
      const t = clamp01(p);
      const k = 1 - t;
      const sgn = params.direction === 'reverse' ? -1 : 1;
      const angle = sgn * (params.angle == null ? 180 : Number(params.angle));
      const phase = params.phase || 'inOut';
      const peak = Math.min(0.9, Math.max(0.1, params.peak == null ? 0.4 : Number(params.peak)));
      const bounce = params.bounce == null ? 0.3 : Number(params.bounce);
      let a;
      if (phase === 'in') a = angle * k;
      else if (t < peak) a = angle * easeOutCubic2(t / peak);
      else a = angle * (1 - easeOutBack2((t - peak) / (1 - peak), bounce * 2));
      if (t >= 0.999) a = 0;
      const axis = params.axis || 'x';
      const pivot = params.pivot || 'letter';
      const backface = params.backface || 'dim';
      const depth = params.depth == null ? 1 : Number(params.depth);
      const P = 1200 * depth;
      const O = info.origin;
      const applyBackface = (cosA) => {
        if (cosA >= 0) return;
        if (backface === 'hide') state.opacity *= 0;
        else if (backface === 'dim') state.opacity *= 0.35;
      };
      if (axis === 'z') {
        if (pivot === 'letter') {
          state.deform.push({ type: 'twist', amount: a, time: t, seed: info.i });
        } else {
          state.deform.push({ type: 'twistBlock', amount: a / 180, time: t, seed: info.i });
        }
      } else if (axis === 'x') {
        if (pivot === 'letter') {
          state.deform.push({ type: 'twist3D', amount: a, param: 0, time: t, seed: info.i });
        } else {
          const hx = Math.max(1, (O && O.hx) || 100);
          const ai = (a * (state.x - O.x)) / (2 * hx);
          const d = state.y - O.y;
          const rad = ai * DEG2;
          const z = d * Math.sin(rad);
          const w = P / (P + z);
          state.y = O.y + d * Math.cos(rad) * w;
          state.tiltX += ai;
          state.scaleX *= w;
          state.scaleY *= w;
          applyBackface(Math.cos(rad));
        }
      } else {
        if (pivot === 'letter') {
          state.deform.push({ type: 'twist3D', amount: a, param: 1, time: t, seed: info.i });
        } else {
          const hy = Math.max(1, (O && O.hy) || 50);
          const ai = (a * (state.y - O.y)) / (2 * hy);
          const d = state.x - O.x;
          const rad = ai * DEG2;
          const z = d * Math.sin(rad);
          const w = P / (P + z);
          state.x = O.x + d * Math.cos(rad) * w;
          state.tiltY += ai;
          state.scaleX *= w;
          state.scaleY *= w;
          applyBackface(Math.cos(rad));
        }
      }
      state.opacity *= clamp01(t * 3);
    },
  });

  // #16: spin a substring (or the whole beat) as one board around x/y/z
  registerEnter({
    group: 'enter', type: 'spinPartIn', tags: ['3d'],
    params: [
      { key: 'axis', kind: 'select', options: ['x', 'y', 'z'], default: 'y' },
      { key: 'turns', kind: 'number', min: 0, max: 4, step: 0.05, default: 1 },
      { key: 'direction', kind: 'select', options: ['forward', 'reverse'], default: 'forward' },
      { key: 'phase', kind: 'select', options: ['in', 'inOut'], default: 'in' },
      { key: 'peak', kind: 'number', min: 0.1, max: 0.9, step: 0.01, default: 0.5 },
      { key: 'settle', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.2 },
      { key: 'backface', kind: 'select', options: ['show', 'hide', 'dim'], default: 'show' },
      { key: 'depth', kind: 'number', min: 0, max: 2, step: 0.05, default: 1 },
    ],
    cpu(state, p, params, rng, info) {
      const t = clamp01(p);
      const sgn = params.direction === 'reverse' ? -1 : 1;
      const turns = params.turns == null ? 1 : Number(params.turns);
      const phase = params.phase || 'in';
      const peak = Math.min(0.9, Math.max(0.1, params.peak == null ? 0.5 : Number(params.peak)));
      const settle = params.settle == null ? 0.2 : Number(params.settle);
      let theta;
      if (phase === 'inOut') {
        theta = t < peak
          ? sgn * 360 * turns * easeInOutCubic2(t / peak)
          : sgn * 360 * turns * (1 - easeOutBack2((t - peak) / (1 - peak), settle * 2));
      } else {
        theta = sgn * 360 * turns * (1 - easeOutBack2(t, settle * 2));
      }
      if (t >= 0.999) theta = 0;
      const axis = params.axis || 'y';
      const pivot = params.pivot || 'block';
      const backface = params.backface || 'show';
      const depth = params.depth == null ? 1 : Number(params.depth);
      const P = 1200 * depth;
      const O = info.origin;
      if (pivot === 'letter') {
        if (axis === 'z') state.rot += theta;
        else if (axis === 'y') state.tiltY += theta;
        else state.tiltX += theta;
        if (axis !== 'z' && Math.cos(theta * DEG2) < 0) {
          if (backface === 'hide') state.opacity *= 0;
          else if (backface === 'dim') state.opacity *= 0.35;
        }
      } else if (axis === 'z') {
        applyPivot(state, O, { sx: 1, sy: 1, rot: theta });
      } else if (axis === 'y') {
        const d = state.x - O.x;
        const rad = theta * DEG2;
        const oz = O.z || 0;
        const u = d * Math.cos(rad) + oz * Math.sin(rad);
        const z = oz + d * Math.sin(rad) - oz * Math.cos(rad);
        const w = P / (P + z);
        state.x = O.x + u * w;
        state.tiltY += theta;
        state.scaleX *= w;
        state.scaleY *= w;
        if (Math.cos(rad) < 0) {
          if (backface === 'hide') state.opacity *= 0;
          else if (backface === 'dim') state.opacity *= 0.35;
        }
      } else {
        const d = state.y - O.y;
        const rad = theta * DEG2;
        const oz = O.z || 0;
        const u = d * Math.cos(rad) + oz * Math.sin(rad);
        const z = oz + d * Math.sin(rad) - oz * Math.cos(rad);
        const w = P / (P + z);
        state.y = O.y + u * w;
        state.tiltX += theta;
        state.scaleX *= w;
        state.scaleY *= w;
        if (Math.cos(rad) < 0) {
          if (backface === 'hide') state.opacity *= 0;
          else if (backface === 'dim') state.opacity *= 0.35;
        }
      }
      state.opacity *= clamp01(t * 2);
    },
  });

  return fx;
});
