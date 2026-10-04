(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./registry'));
  else {
    root.SA = root.SA || {};
    factory(root.SA.fx);
  }
})(typeof self !== 'undefined' ? self : this, function (fx) {
  'use strict';

  function clamp01(value) {
    return value <= 0 ? 0 : value >= 1 ? 1 : value;
  }

  // The plain opacity fade on the way out. `softness` bends the ramp towards
  // smoothstep and `glow` flashes the glyph as it goes, which is the
  // per-letter half of the fade shader in shader-fx.js (post.fade).
  fx.register({
    group: 'exit',
    type: 'fade',
    tags: ['basic'],
    params: [
      { key: 'softness', kind: 'number', min: 0, max: 1, step: 0.01, default: 0 },
      { key: 'glow', kind: 'number', min: 0, max: 1, step: 0.01, default: 0, random: [0, 0.5] },
    ],
    cpu(state, p, params) {
      const soft = params && Number(params.softness) > 0 ? Math.min(1, Number(params.softness)) : 0;
      const glow = params && Number(params.glow) > 0 ? Math.min(1, Number(params.glow)) : 0;
      const k = clamp01(p);
      const level = soft > 0 ? 1 - (k + (k * k * (3 - 2 * k) - k) * soft) : 1 - k;
      state.opacity *= clamp01(level);
      if (glow > 0) state.flash = Math.max(state.flash || 0, glow * (1 - Math.abs(level * 2 - 1)));
    },
  });

  fx.register({
    group: 'exit',
    type: 'slide',
    tags: ['basic'],
    params: [
      { key: 'dir', kind: 'select', options: ['up', 'down', 'left', 'right'], default: 'down', random: 'any' },
      { key: 'distance', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.3, unit: 'frame', random: [0.1, 0.6] },
    ],
    cpu(state, p, params, rng, info) {
      const distance = (params.distance == null ? 0.3 : params.distance) * info.shortSide;
      const offset = { up: [0, -distance], down: [0, distance], left: [-distance, 0], right: [distance, 0] }[params.dir || 'down'] || [0, 0];
      state.x += clamp01(p) * offset[0];
      state.y += clamp01(p) * offset[1];
      state.opacity *= 1 - clamp01(p) * 0.35;
    },
  });

  fx.register({
    group: 'exit',
    type: 'zoomOut',
    params: [{ key: 'to', kind: 'number', min: 0, max: 3, step: 0.05, default: 0.3, random: [0, 0.8] }],
    cpu(state, p, params) {
      const to = params.to == null ? 0.3 : params.to;
      const scale = 1 + (to - 1) * clamp01(p);
      state.scaleX *= scale;
      state.scaleY *= scale;
      state.opacity *= 1 - clamp01(p) * 0.5;
    },
  });

  fx.register({
    group: 'exit',
    type: 'blurOut',
    params: [{ key: 'radius', kind: 'number', min: 0, max: 40, step: 0.5, default: 14, random: [6, 24] }],
    cpu(state, p, params) {
      state.blur = Math.max(state.blur || 0, (params.radius == null ? 14 : params.radius) * clamp01(p));
    },
  });

  fx.register({
    group: 'exit',
    type: 'explode',
    tags: ['basic'],
    params: [
      { key: 'spread', kind: 'number', min: 0, max: 2, step: 0.05, default: 0.6, random: [0.3, 1.2] },
      { key: 'spin', kind: 'number', min: 0, max: 720, step: 10, default: 220 },
    ],
    cpu(state, p, params, rng, info) {
      const k = clamp01(p);
      const spread = (params.spread == null ? 0.6 : params.spread) * info.shortSide;
      const dx = info.letterX - info.blockCenter.x;
      const dy = info.letterY - info.blockCenter.y;
      const length = Math.hypot(dx, dy) || 1;
      state.x += (dx / length) * spread * k + (rng() * 2 - 1) * spread * 0.15 * k;
      state.y += (dy / length) * spread * k + (rng() * 2 - 1) * spread * 0.15 * k;
      state.rot += (rng() * 2 - 1) * (params.spin == null ? 220 : params.spin) * k;
      state.opacity *= 1 - k * 0.4;
    },
  });

  fx.register({
    group: 'exit',
    type: 'gravityFall',
    params: [
      { key: 'gravity', kind: 'number', min: 0.5, max: 6, step: 0.1, default: 2.4 },
      { key: 'spin', kind: 'number', min: 0, max: 720, step: 10, default: 160 },
      { key: 'floor', kind: 'select', options: ['none', 'ground'], default: 'none', optional: true, catalog: false },
      { key: 'restitution', kind: 'number', min: 0, max: 0.9, step: 0.05, default: 0.2, optional: true, catalog: false },
      { key: 'friction', kind: 'number', min: 0, max: 1, step: 0.05, default: 0.4, optional: true, catalog: false },
    ],
    normalize(params) {
      const out = { ...params, gravity: Math.max(0.5, Math.min(6, Number(params.gravity) || 2.4)) };
      if (params.restitution != null) out.restitution = Math.max(0, Math.min(0.9, Number(params.restitution) || 0));
      if (params.friction != null) out.friction = Math.max(0, Math.min(1, Number(params.friction) || 0));
      return out;
    },
    cpu(state, p, params, rng, info) {
      const k = clamp01(p);
      if (params.floor === 'ground') {
        // the fall is integrated in real time by the physics core (motion.js):
        // only the fade stays on the eased progress
        state.opacity *= 1 - Math.max(0, k - 0.55) / 0.45;
        return;
      }
      state.y += (params.gravity == null ? 2.4 : params.gravity) * k * k * info.shortSide * 0.5;
      state.rot += (rng() * 2 - 1) * (params.spin == null ? 160 : params.spin) * k;
      state.opacity *= 1 - Math.max(0, k - 0.55) / 0.45;
    },
    // `floor: 'ground'` releases the letter at the exit start and drops it onto
    // the bottom of the block; `none` keeps the legacy eased fall untouched
    physics(params, phase) {
      if (phase !== 'exit' || params.floor !== 'ground') return null;
      return {
        grid: 5,
        drive: 'none',
        gravity: (params.gravity == null ? 2.4 : Number(params.gravity)) * 4,
        restitution: params.restitution == null ? 0.2 : Number(params.restitution),
        friction: params.friction == null ? 0.4 : Number(params.friction),
        spin: params.spin == null ? 160 : Number(params.spin),
        // the ground sits one line height below the block bottom, so a
        // single-line block still has somewhere to fall to
        floor: 1,
        stiffness: 0.7,
        damping: 0.08,
        inertia: 0.25,
        areaStiffness: 0.9,
      };
    },
  });

  fx.register({
    group: 'exit',
    type: 'dissolve',
    tags: ['dissolve'],
    params: [{ key: 'scale', kind: 'number', min: 1, max: 64, step: 1, default: 10 }],
    cpu(state, p, params, rng) {
      const threshold = rng() * 0.85;
      const progress = clamp01(p);
      if (progress > threshold) state.opacity = 0;
      else state.opacity *= 1 - progress * 0.15;
    },
  });

  fx.register({
    group: 'exit',
    type: 'wipe',
    params: [{ key: 'dir', kind: 'select', options: ['left', 'right', 'up', 'down'], default: 'left' }],
    cpu(state, p) {
      state.visibleFrac = Math.min(state.visibleFrac == null ? 1 : state.visibleFrac, clamp01(1 - clamp01(p)));
    },
  });

  fx.register({
    group: 'exit',
    type: 'typewriterReverse',
    tags: ['text'],
    params: [],
    cpu(state, p) {
      if (clamp01(p) >= 0.999) state.visibleFrac = 0;
    },
  });

  fx.register({
    group: 'exit',
    type: 'shrinkToCenter',
    params: [],
    cpu(state, p, params, rng, info) {
      const k = clamp01(p);
      state.x += (info.blockCenter.x - info.letterX) * k;
      state.y += (info.blockCenter.y - info.letterY) * k;
      const scale = 1 - k;
      state.scaleX *= scale;
      state.scaleY *= scale;
      state.opacity *= 1 - k * 0.5;
    },
  });

  fx.register({
    group: 'exit',
    type: 'particlesDisperse',
    tags: ['particles'],
    cost: 2,
    params: [
      { key: 'count', kind: 'int', min: 4, max: 64, step: 1, default: 16 },
      { key: 'drift', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.3 },
    ],
    cpu(state, p, params, rng, info) {
      const k = clamp01(p);
      const drift = (params.drift == null ? 0.3 : params.drift) * info.shortSide;
      if (k > 0.001 && k < 0.999) {
        state.represent = 'particles';
        state.reprProgress = 1 - k;
      }
      state.x += (rng() * 2 - 1) * drift * k;
      state.y += (rng() * 2 - 1) * drift * k - drift * 0.4 * k;
      state.rot += (rng() * 2 - 1) * 60 * k;
      state.opacity *= 1 - k;
    },
  });

  fx.register({
    group: 'exit',
    type: 'melt',
    tags: ['deform'],
    params: [{ key: 'drip', kind: 'number', min: 0, max: 2, step: 0.05, default: 0.7 }],
    cpu(state, p, params, rng, info) {
      const k = clamp01(p);
      state.deform.push({ type: 'melt', amount: k });
      state.y += k * k * (params.drip == null ? 0.7 : params.drip) * info.shortSide * 0.15;
      state.opacity *= 1 - Math.max(0, k - 0.6) / 0.4;
    },
  });

  fx.register({
    group: 'exit',
    type: 'burnAway',
    tags: ['dissolve'],
    cost: 2,
    params: [
      { key: 'scale', kind: 'number', min: 1, max: 64, step: 1, default: 10 },
      { key: 'emberColor', kind: 'color', default: null },
      { key: 'charColor', kind: 'color', default: null },
    ],
    cpu(state, p, params, rng) {
      const threshold = rng() * 0.7;
      const progress = clamp01(p);
      state.colorMix = Math.max(state.colorMix || 0, progress);
      if (progress > threshold) state.opacity = 0;
      else {
        state.opacity *= 1 - progress * 0.2;
        state.scaleX *= 1 - progress * 0.05;
        state.scaleY *= 1 - progress * 0.05;
      }
    },
  });

  fx.register({
    group: 'exit',
    type: 'strokeErase',
    tags: ['stroke'],
    params: [{ key: 'width', kind: 'number', min: 0.5, max: 20, step: 0.5, default: 4 }],
    cpu(state, p) {
      state.visibleFrac = Math.min(state.visibleFrac == null ? 1 : state.visibleFrac, clamp01(1 - clamp01(p)));
      if (clamp01(p) > 0.001 && clamp01(p) < 0.999) {
        state.represent = 'stroke';
        state.reprProgress = 1 - clamp01(p);
      }
    },
  });

  fx.register({
    group: 'exit',
    type: 'creepOut',
    fixedDuration: 0.12,
    params: [{ key: 'shift', kind: 'number', min: 0, max: 0.5, step: 0.01, default: 0.15 }],
    cpu(state, p, params, rng, info) {
      const progress = clamp01(p);
      const shift = (params.shift == null ? 0.15 : params.shift) * info.shortSide;
      const value = Math.sin((info.i + 1) * 12.9898) * 43758.5453;
      const dir = value - Math.floor(value) < 0.5 ? -1 : 1;
      if (progress < 0.5) {
        const t = progress / 0.5;
        state.scaleX *= 1 + 0.25 * t;
        state.scaleY *= 1 + 0.25 * t;
        state.x += shift * t * dir;
      } else {
        state.opacity = 0;
      }
    },
  });

  // Block-space size exit: the text grows to a screen-filling scale and leaves
  // (the camera flies into the letters). `zoomOut` only shrinks each glyph.
  fx.register({
    group: 'exit',
    type: 'megaZoomOut',
    tags: ['deform', 'size'],
    pack: 'font',
    cost: 2,
    params: [
      { key: 'to', kind: 'number', min: 0.05, max: 30, step: 0.05, default: 6, random: [2, 10] },
      { key: 'fade', kind: 'bool', default: true },
    ],
    cpu(state, p, params) {
      const to = params.to == null ? 6 : Number(params.to);
      const progress = clamp01(p);
      const amount = (to - 1) * progress;
      if (Math.abs(amount) > 0.0001) state.deform.push({ type: 'zoomBlock', amount, time: 0, param: 0 });
      if (params.fade !== false) state.opacity *= 1 - progress;
    },
  });

  return fx;
});
