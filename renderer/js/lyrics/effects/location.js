(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./registry'), require('../rng'));
  else {
    root.SA = root.SA || {};
    factory(root.SA.fx, root.SA.rng);
  }
})(typeof self !== 'undefined' ? self : this, function (fx, rng) {
  'use strict';

  const PRESETS = {
    center: { x: 0.5, y: 0.5 },
    lowerThird: { x: 0.5, y: 0.78 },
    upperThird: { x: 0.5, y: 0.22 },
    left: { x: 0.24, y: 0.5 },
    right: { x: 0.76, y: 0.5 },
    karaoke: { x: 0.5, y: 0.88 },
    stacked: { x: 0.5, y: 0.78 },
  };

  function registerPreset(type, preset) {
    fx.register({
      group: 'location',
      type,
      tags: ['basic'],
      params: [
        { key: 'offsetX', kind: 'number', min: -1, max: 1, step: 0.01, default: 0, unit: 'frame' },
        { key: 'offsetY', kind: 'number', min: -1, max: 1, step: 0.01, default: 0, unit: 'frame' },
        { key: 'safeArea', kind: 'number', min: 0.05, max: 0.15, step: 0.005, default: 0.08 },
        { key: 'drift', kind: 'vec2', default: { x: 0, y: 0 } },
      ],
      anchor(params, frame, info) {
        const safe = params.safeArea == null ? 0.08 : params.safeArea;
        return {
          x: (preset.x + (params.offsetX || 0)) * frame.width,
          y: (preset.y + (params.offsetY || 0)) * frame.height,
          safe,
        };
      },
    });
  }

  for (const [type, preset] of Object.entries(PRESETS)) registerPreset(type, preset);

  fx.register({
    group: 'location',
    type: 'randomSafe',
    tags: ['random'],
    params: [
      { key: 'offsetX', kind: 'number', min: -1, max: 1, step: 0.01, default: 0 },
      { key: 'offsetY', kind: 'number', min: -1, max: 1, step: 0.01, default: 0 },
      { key: 'safeArea', kind: 'number', min: 0.05, max: 0.15, step: 0.005, default: 0.08 },
      { key: 'drift', kind: 'vec2', default: { x: 0, y: 0 } },
    ],
    anchor(params, frame, info) {
      const safe = params.safeArea == null ? 0.08 : params.safeArea;
      const random = (info && info.rng) || rng.mulberry32(1);
      const x = safe + random() * (1 - safe * 2);
      const y = safe + random() * (1 - safe * 2);
      return {
        x: (x + (params.offsetX || 0)) * frame.width,
        y: (y + (params.offsetY || 0)) * frame.height,
        safe,
      };
    },
  });

  fx.register({
    group: 'location',
    type: 'badgeAnchored',
    params: [
      { key: 'offsetX', kind: 'number', min: -1, max: 1, step: 0.01, default: 0 },
      { key: 'offsetY', kind: 'number', min: -1, max: 1, step: 0.01, default: 0 },
      { key: 'safeArea', kind: 'number', min: 0.05, max: 0.15, step: 0.005, default: 0.08 },
      { key: 'drift', kind: 'vec2', default: { x: 0, y: 0 } },
    ],
    anchor(params, frame, info) {
      const safe = params.safeArea == null ? 0.08 : params.safeArea;
      const rect = info && info.badgeRect;
      if (!rect) {
        // without a badge the effect still honours its offsets around centre
        return {
          x: (0.5 + (params.offsetX || 0)) * frame.width,
          y: (0.5 + (params.offsetY || 0)) * frame.height,
          safe,
        };
      }
      const side = rect.x + rect.w + 0.28 * frame.width < frame.width - safe * frame.width ? 1 : -1;
      const x = side > 0 ? rect.x + rect.w + 0.12 * frame.width : rect.x - 0.12 * frame.width;
      return {
        x: x + (params.offsetX || 0) * frame.width,
        y: rect.y + rect.h * 0.5 + (params.offsetY || 0) * frame.height,
        safe,
      };
    },
  });

  fx.register({
    group: 'location',
    type: 'custom',
    params: [
      { key: 'x', kind: 'number', min: -1, max: 2, step: 0.01, default: 0.5 },
      { key: 'y', kind: 'number', min: -1, max: 2, step: 0.01, default: 0.5 },
      { key: 'offsetX', kind: 'number', min: -1, max: 1, step: 0.01, default: 0 },
      { key: 'offsetY', kind: 'number', min: -1, max: 1, step: 0.01, default: 0 },
      { key: 'safeArea', kind: 'number', min: 0.05, max: 0.15, step: 0.005, default: 0.08 },
      { key: 'drift', kind: 'vec2', default: { x: 0, y: 0 } },
    ],
    anchor(params, frame) {
      const safe = params.safeArea == null ? 0.08 : params.safeArea;
      return {
        x: ((params.x == null ? 0.5 : params.x) + (params.offsetX || 0)) * frame.width,
        y: ((params.y == null ? 0.5 : params.y) + (params.offsetY || 0)) * frame.height,
        safe,
      };
    },
  });

  // The composition grid: place the block on a 0..1 grid and let `edgeX` /
  // `edgeY` pick which edge of the block is the reference (-1 = left / top,
  // 0 = centre, 1 = right / bottom). motion.js shifts the anchor by the block
  // half-size before the safe-area clamp, so x / y name the edge, not the centre.
  fx.register({
    group: 'location',
    type: 'grid',
    tags: ['basic'],
    pack: 'pro',
    params: [
      { key: 'x', kind: 'number', min: -0.5, max: 1.5, step: 0.01, default: 0.5 },
      { key: 'y', kind: 'number', min: -0.5, max: 1.5, step: 0.01, default: 0.5 },
      { key: 'edgeX', kind: 'number', min: -1, max: 1, step: 0.05, default: 0 },
      { key: 'edgeY', kind: 'number', min: -1, max: 1, step: 0.05, default: 0 },
      { key: 'offsetX', kind: 'number', min: -1, max: 1, step: 0.01, default: 0 },
      { key: 'offsetY', kind: 'number', min: -1, max: 1, step: 0.01, default: 0 },
      { key: 'safeArea', kind: 'number', min: 0.02, max: 0.15, step: 0.005, default: 0.05 },
      { key: 'drift', kind: 'vec2', default: { x: 0, y: 0 } },
    ],
    anchor(params, frame) {
      const safe = params.safeArea == null ? 0.05 : params.safeArea;
      return {
        x: ((params.x == null ? 0.5 : params.x) + (params.offsetX || 0)) * frame.width,
        y: ((params.y == null ? 0.5 : params.y) + (params.offsetY || 0)) * frame.height,
        safe,
        edge: { x: params.edgeX || 0, y: params.edgeY || 0 },
      };
    },
  });

  return fx;
});
