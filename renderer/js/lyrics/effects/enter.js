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

  return fx;
});
