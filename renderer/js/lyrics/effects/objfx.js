(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./registry'));
  else {
    root.SA = root.SA || {};
    factory(root.SA.fx);
  }
})(typeof self !== 'undefined' ? self : this, function (fx) {
  'use strict';

  // Motion-reactive holds (doc/objeffects.md O1): the cpu is a no-op by
  // contract (like the softBody physics hook). motion.js reads the
  // `motionFx(params)` config and applies it after the keyframe deltas, driven
  // by the letter's own rigid motion history instead of wall-clock time.
  const SELECTS = ['all', 'every', 'oddEven', 'rank', 'random', 'scope'];
  const UNITS = ['letter', 'word', 'line'];

  function selectParams() {
    return [
      { key: 'select', kind: 'select', options: SELECTS, default: 'all' },
      { key: 'n', kind: 'int', min: 1, max: 12, step: 1, default: 2 },
      { key: 'offset', kind: 'int', min: 0, max: 12, step: 1, default: 0 },
      { key: 'oddEven', kind: 'select', options: ['odd', 'even'], default: 'odd' },
      { key: 'units', kind: 'select', options: UNITS, default: 'letter' },
      { key: 'from', kind: 'number', min: 0, max: 1, step: 0.01, default: 0 },
      { key: 'to', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 },
      { key: 'fraction', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
      { key: 'seed', kind: 'int', min: 0, max: 9999, step: 1, default: 7 },
      { key: 'grade', kind: 'bool', default: false },
    ];
  }

  function motionParams(cfg) {
    return [
      { key: 'sensitivity', kind: 'number', min: 0.25, max: 4, step: 0.05, default: 1 },
      { key: 'release', kind: 'number', min: 0, max: 1, step: 0.01, default: cfg.release },
    ];
  }

  fx.register({
    group: 'hold',
    type: 'timeDelay',
    tags: ['time', 'pro'],
    pack: 'pro',
    stackable: true,
    cost: 1,
    params: [
      { key: 'unit', kind: 'select', options: ['letter', 'word', 'line'], default: 'letter' },
      ...selectParams(),
      { key: 'lag', kind: 'number', min: 0, max: 0.6, step: 0.005, default: 0.12, random: [0.06, 0.25] },
      { key: 'props', kind: 'select', options: ['pos', 'pos+rot', 'all'], default: 'pos' },
    ],
    cpu() {},
    motionFx(params) {
      return {
        kind: 'timeDelay',
        unit: params.unit || 'letter',
        select: params.select || 'all',
        lag: params.lag == null ? 0.12 : Number(params.lag),
        props: params.props || 'pos',
        selParams: { ...params },
      };
    },
  });

  fx.register({
    group: 'hold',
    type: 'motionFlicker',
    tags: ['flicker', 'pro'],
    pack: 'pro',
    stackable: true,
    cost: 1,
    params: [
      { key: 'wave', kind: 'select', options: ['random', 'sine', 'strobe'], default: 'random' },
      { key: 'rate', kind: 'number', min: 2, max: 30, step: 0.5, default: 12 },
      { key: 'depth', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.7 },
      { key: 'minOpacity', kind: 'number', min: 0, max: 0.8, step: 0.01, default: 0.2 },
      { key: 'duty', kind: 'number', min: 0.1, max: 0.9, step: 0.01, default: 0.5 },
      { key: 'spread', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
      ...motionParams({ release: 0.15 }),
      ...selectParams(),
    ],
    cpu() {},
    motionFx(params) {
      return {
        kind: 'motionFlicker',
        wave: params.wave || 'random',
        rate: params.rate == null ? 12 : Number(params.rate),
        depth: params.depth == null ? 0.7 : Number(params.depth),
        minOpacity: params.minOpacity == null ? 0.2 : Number(params.minOpacity),
        duty: params.duty == null ? 0.5 : Number(params.duty),
        spread: params.spread == null ? 0.5 : Number(params.spread),
        sensitivity: params.sensitivity == null ? 1 : Number(params.sensitivity),
        release: params.release == null ? 0.15 : Number(params.release),
        select: params.select || 'all',
        seed: params.seed == null ? 21 : Number(params.seed),
        selParams: { ...params },
      };
    },
  });

  fx.register({
    group: 'hold',
    type: 'colorShift',
    tags: ['color', 'pro'],
    pack: 'pro',
    stackable: true,
    cost: 1,
    params: [
      { key: 'driver', kind: 'select', options: ['speed', 'distance', 'progress'], default: 'distance' },
      { key: 'palette', kind: 'select', options: ['hueCycle', 'gradient', 'beatPalette'], default: 'hueCycle' },
      { key: 'colorA', kind: 'color', default: '#ff3b6b' },
      { key: 'colorB', kind: 'color', default: '#3bd1ff' },
      { key: 'cycles', kind: 'number', min: 0.1, max: 6, step: 0.05, default: 1 },
      { key: 'phase', kind: 'number', min: 0, max: 1, step: 0.01, default: 0 },
      { key: 'spread', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.3 },
      { key: 'mix', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.85 },
      { key: 'affect', kind: 'select', options: ['fill', 'fill+edge'], default: 'fill' },
      ...selectParams(),
      ...motionParams({ release: 0.3 }),
    ],
    cpu() {},
    motionFx(params) {
      return {
        kind: 'colorShift',
        driver: params.driver || 'distance',
        palette: params.palette || 'hueCycle',
        colorA: params.colorA || '#ff3b6b',
        colorB: params.colorB || '#3bd1ff',
        cycles: params.cycles == null ? 1 : Number(params.cycles),
        phase: params.phase == null ? 0 : Number(params.phase),
        spread: params.spread == null ? 0.3 : Number(params.spread),
        mix: params.mix == null ? 0.85 : Number(params.mix),
        sensitivity: params.sensitivity == null ? 1 : Number(params.sensitivity),
        release: params.release == null ? 0.3 : Number(params.release),
        select: params.select || 'all',
        selParams: { ...params },
      };
    },
  });

  return fx;
});
