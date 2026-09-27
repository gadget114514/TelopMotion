(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./registry'));
  else {
    root.SA = root.SA || {};
    factory(root.SA.fx);
  }
})(typeof self !== 'undefined' ? self : this, function (fx) {
  'use strict';

  const TARGETS = [
    { type: 'row', params: [], tags: ['basic'] },
    { type: 'vertical', params: [{ key: 'columnGap', kind: 'number', min: 0.5, max: 3, step: 0.05, default: 1.2 }] },
    {
      type: 'circle',
      tags: ['overlap'],
      params: [
        { key: 'radius', kind: 'number', min: 0.05, max: 1, step: 0.01, default: 0.28, unit: 'frame' },
        { key: 'startAngle', kind: 'number', min: -360, max: 360, step: 1, default: -90 },
        { key: 'clockwise', kind: 'bool', default: true },
        { key: 'faceOut', kind: 'bool', default: true },
      ],
    },
    {
      type: 'arc',
      tags: ['overlap'],
      params: [
        { key: 'radius', kind: 'number', min: 0.1, max: 1.5, step: 0.01, default: 0.6 },
        { key: 'sweep', kind: 'number', min: 10, max: 360, step: 1, default: 120 },
        { key: 'bulge', kind: 'select', options: ['up', 'down'], default: 'up' },
      ],
    },
    {
      type: 'spiral',
      tags: ['overlap'],
      params: [
        { key: 'r0', kind: 'number', min: 0, max: 0.5, step: 0.01, default: 0.05 },
        { key: 'r1', kind: 'number', min: 0.05, max: 1, step: 0.01, default: 0.35 },
        { key: 'turns', kind: 'number', min: 0.5, max: 6, step: 0.1, default: 2.5 },
      ],
    },
    {
      type: 'wave',
      params: [
        { key: 'amp', kind: 'number', min: 0, max: 0.3, step: 0.005, default: 0.06 },
        { key: 'wavelength', kind: 'number', min: 0.1, max: 2, step: 0.05, default: 0.5 },
        { key: 'phase', kind: 'number', min: -360, max: 360, step: 1, default: 0 },
      ],
    },
    {
      type: 'diagonal',
      tags: ['overlap'],
      params: [
        { key: 'angle', kind: 'number', min: -90, max: 90, step: 1, default: -20 },
        { key: 'followAngle', kind: 'bool', default: false },
      ],
    },
    { type: 'staircase', tags: ['overlap'], params: [{ key: 'step', kind: 'number', min: -1, max: 1, step: 0.01, default: 0.35, unit: 'size' }] },
    {
      type: 'grid',
      params: [
        { key: 'cols', kind: 'int', min: 0, max: 12, step: 1, default: 0 },
        { key: 'gap', kind: 'number', min: 0, max: 0.5, step: 0.01, default: 0.08 },
      ],
    },
    { type: 'stackedWords', params: [{ key: 'fillWidth', kind: 'number', min: 0.3, max: 1, step: 0.01, default: 0.8 }] },
    {
      type: 'scatter',
      tags: ['overlap'],
      params: [
        { key: 'spread', kind: 'number', min: 0.05, max: 1, step: 0.01, default: 0.35 },
        { key: 'safeArea', kind: 'number', min: 0.05, max: 0.2, step: 0.005, default: 0.08 },
      ],
    },
    { type: 'path', tags: ['overlap'], params: [{ key: 'points', kind: 'points', default: [{ x: 0.1, y: 0.7 }, { x: 0.4, y: 0.3 }, { x: 0.9, y: 0.6 }] }, { key: 'smooth', kind: 'bool', default: true }] },
  ];

  for (const target of TARGETS) {
    fx.register({
      group: 'layout',
      type: target.type,
      tags: target.tags || [],
      params: [
        { key: 'from', kind: 'select', options: ['none', 'offscreenEdges', 'corners', 'point', 'ring', 'depth', 'mirror', 'formation', 'previousCue'], default: 'none' },
        { key: 'fromFormation', kind: 'select', options: TARGETS.map((entry) => entry.type), default: 'row' },
        { key: 'curve', kind: 'number', min: -1, max: 1, step: 0.01, default: 0 },
        { key: 'curveDir', kind: 'select', options: ['left', 'right', 'alternate', 'random'], default: 'left' },
        { key: 'to', kind: 'select', options: ['none', ...TARGETS.map((entry) => entry.type)], default: 'none' },
      ].concat(target.params),
    });
  }

  return fx;
});
