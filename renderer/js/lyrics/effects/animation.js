(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./registry'));
  else {
    root.SA = root.SA || {};
    factory(root.SA.fx);
  }
})(typeof self !== 'undefined' ? self : this, function (fx) {
  'use strict';

  const ORDERS = ['ltr', 'rtl', 'center-out', 'edges-in', 'random', 'word', 'line', 'strokeLength', 'oddEven', 'vertical-reading'];

  fx.register({
    group: 'animation',
    type: 'stagger',
    tags: ['basic'],
    params: [
      { key: 'order', kind: 'select', options: ORDERS, default: 'ltr' },
      { key: 'each', kind: 'number', min: 0, max: 0.3, step: 0.005, default: 0.035, unit: 's', random: [0.01, 0.08] },
      { key: 'ease', kind: 'ease', default: 'linear' },
      { key: 'from', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
      { key: 'unit', kind: 'select', options: ['letter', 'word', 'line'], default: 'letter' },
      { key: 'exitOrder', kind: 'select', options: ['same', 'reverse'], default: 'same' },
    ],
  });

  fx.register({
    group: 'animation',
    type: 'simultaneous',
    tags: ['basic'],
    params: [],
    defaults: { motion: { stagger: { each: 0 } } },
  });

  fx.register({
    group: 'animation',
    type: 'cascade',
    params: [{ key: 'overlap', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.5, random: [0.2, 0.8] }],
    defaults: { motion: { stagger: { unit: 'word' } } },
  });

  fx.register({
    group: 'animation',
    type: 'spring',
    params: [
      { key: 'stiffness', kind: 'number', min: 40, max: 400, step: 5, default: 170 },
      { key: 'damping', kind: 'number', min: 5, max: 60, step: 1, default: 26 },
    ],
  });

  fx.register({
    group: 'animation',
    type: 'followThrough',
    params: [
      { key: 'amount', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.35, random: [0.1, 0.6] },
      { key: 'decay', kind: 'number', min: 0.5, max: 8, step: 0.1, default: 3 },
    ],
  });

  fx.register({
    group: 'animation',
    type: 'stopMotion',
    params: [{ key: 'fps', kind: 'int', min: 4, max: 24, step: 1, default: 12, random: [6, 18] }],
  });

  fx.register({
    group: 'animation',
    type: 'timeWarp',
    params: [{ key: 'ease', kind: 'ease', default: 'easeInOutSine' }],
  });

  fx.register({
    group: 'animation',
    type: 'loop',
    params: [
      { key: 'period', kind: 'number', min: 0, max: 10, step: 0.1, default: 2, random: [0.5, 4] },
      { key: 'yoyo', kind: 'bool', default: true },
    ],
  });

  return fx;
});
