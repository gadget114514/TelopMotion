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
      { key: 'unit', kind: 'select', options: ['letter', 'word', 'line', 'region'], default: 'letter' },
      ...selectParams(),
      { key: 'lag', kind: 'number', min: 0, max: 0.6, step: 0.005, default: 0.12, random: [0.06, 0.25] },
      { key: 'props', kind: 'select', options: ['pos', 'pos+rot', 'all'], default: 'pos' },
      { key: 'band', kind: 'select', options: ['top', 'bottom', 'left', 'right'], default: 'top' },
      { key: 'bandSize', kind: 'number', min: 0.1, max: 0.9, step: 0.01, default: 0.5 },
      { key: 'feather', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.4 },
    ],
    cpu() {},
    motionFx(params) {
      return {
        kind: 'timeDelay',
        unit: params.unit || 'letter',
        select: params.select || 'all',
        lag: params.lag == null ? 0.12 : Number(params.lag),
        props: params.props || 'pos',
        band: params.band || 'top',
        bandSize: params.bandSize == null ? 0.5 : Number(params.bandSize),
        feather: params.feather == null ? 0.4 : Number(params.feather),
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

  fx.register({
    group: 'hold',
    type: 'timeDisplacement',    tags: ['time', 'deform', 'pro'],
    pack: 'pro',
    stackable: true,
    cost: 2,
    params: [
      { key: 'unit', kind: 'select', options: ['letter', 'block'], default: 'letter' },
      { key: 'map', kind: 'select', options: ['linearX', 'linearY', 'radial', 'alongVelocity', 'noise'], default: 'alongVelocity' },
      { key: 'maxLag', kind: 'number', min: 0, max: 0.5, step: 0.005, default: 0.15, random: [0.06, 0.25] },
      { key: 'invert', kind: 'bool', default: false },
      { key: 'noiseScale', kind: 'number', min: 0.5, max: 4, step: 0.1, default: 1.5 },
      { key: 'amount', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 },
      ...selectParams(),
    ],
    cpu() {},
    motionFx(params) {
      return {
        kind: 'timeDisplacement',
        unit: params.unit || 'letter',
        map: params.map || 'alongVelocity',
        maxLag: params.maxLag == null ? 0.15 : Number(params.maxLag),
        invert: !!params.invert,
        noiseScale: params.noiseScale == null ? 1.5 : Number(params.noiseScale),
        amount: params.amount == null ? 1 : Number(params.amount),
        seed: params.seed == null ? 3 : Number(params.seed),
        select: params.select || 'all',
        selParams: { ...params },
      };
    },
  });

  fx.register({
    group: 'hold',
    type: 'motionBend',
    tags: ['deform', 'physics', 'pro'],
    pack: 'pro',
    stackable: true,
    cost: 3,
    params: [
      { key: 'leadSide', kind: 'select', options: ['auto', 'left', 'right', 'top', 'bottom'], default: 'auto' },
      { key: 'leadWidth', kind: 'number', min: 0.1, max: 0.8, step: 0.01, default: 0.3 },
      { key: 'stiffness', kind: 'number', min: 0.05, max: 0.9, step: 0.01, default: 0.25 },
      { key: 'damping', kind: 'number', min: 0, max: 0.5, step: 0.01, default: 0.08 },
      { key: 'inertia', kind: 'number', min: 0, max: 3, step: 0.05, default: 1.4 },
      { key: 'maxStretch', kind: 'number', min: 0.4, max: 1.2, step: 0.01, default: 0.9 },
      { key: 'rotLag', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
    ],
    cpu() {},
    physics(params, phase) {
      if (phase !== 'hold') return null;
      return {
        drive: 'none',
        stiffness: params.stiffness == null ? 0.25 : Number(params.stiffness),
        damping: params.damping == null ? 0.08 : Number(params.damping),
        inertia: params.inertia == null ? 1.4 : Number(params.inertia),
        gravity: 0,
        maxStretch: params.maxStretch == null ? 0.9 : Number(params.maxStretch),
        lead: {
          side: params.leadSide || 'auto',
          width: params.leadWidth == null ? 0.3 : Number(params.leadWidth),
          rotLag: params.rotLag == null ? 0.5 : Number(params.rotLag),
        },
      };
    },
    motionFx(params) {
      // present so the hold stack keeps the instance; the deformation itself
      // comes from the physics hook above, not from a state rewrite
      return { kind: 'motionBend' };
    },
  });

  fx.register({
    group: 'hold',
    type: 'motionEcho',
    tags: ['trail', 'pro'],
    pack: 'pro',
    stackable: true,
    cost: 2,
    params: [
      { key: 'count', kind: 'int', min: 1, max: 6, step: 1, default: 3 },
      { key: 'spacing', kind: 'number', min: 0.02, max: 0.3, step: 0.005, default: 0.06 },
      { key: 'colorA', kind: 'color', default: '#ff3b6b' },
      { key: 'colorB', kind: 'color', default: '#3b6bff' },
      { key: 'opacity', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.6 },
      { key: 'decay', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.35 },
      { key: 'scaleDecay', kind: 'number', min: 0, max: 0.3, step: 0.005, default: 0 },
      { key: 'blend', kind: 'select', options: ['normal', 'add'], default: 'normal' },
      { key: 'behind', kind: 'bool', default: true },
      { key: 'minGap', kind: 'number', min: 0, max: 0.5, step: 0.005, default: 0.08 },
    ],
    costOf(params) {
      return Math.min(6, Math.max(1, Math.round(params && params.count != null ? params.count : 3)));
    },
    cpu() {},
    motionFx(params) {
      return {
        kind: 'motionEcho',
        count: Math.min(6, Math.max(1, Math.round(params.count == null ? 3 : params.count))),
        spacing: params.spacing == null ? 0.06 : Number(params.spacing),
        colorA: params.colorA || '#ff3b6b',
        colorB: params.colorB || '#3b6bff',
        opacity: params.opacity == null ? 0.6 : Number(params.opacity),
        decay: params.decay == null ? 0.35 : Number(params.decay),
        scaleDecay: params.scaleDecay == null ? 0 : Number(params.scaleDecay),
        blend: params.blend || 'normal',
        behind: params.behind !== false,
        minGap: params.minGap == null ? 0.08 : Number(params.minGap),
      };
    },
  });

  fx.register({
    group: 'hold',
    type: 'strokeTrail',
    tags: ['trail', 'stroke', 'pro'],
    pack: 'pro',
    stackable: true,
    cost: 2,
    params: [
      { key: 'count', kind: 'int', min: 1, max: 6, step: 1, default: 4 },
      { key: 'spacing', kind: 'number', min: 0.02, max: 0.3, step: 0.005, default: 0.05 },
      { key: 'width', kind: 'number', min: 0.5, max: 8, step: 0.1, default: 2 },
      { key: 'colorA', kind: 'color', default: '#00e5ff' },
      { key: 'colorB', kind: 'color', default: '#ff00c8' },
      { key: 'opacity', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.9 },
      { key: 'decay', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.25 },
      { key: 'widthDecay', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.3 },
      { key: 'dash', kind: 'number', min: 0, max: 1, step: 0.01, default: 0 },
      { key: 'blend', kind: 'select', options: ['normal', 'add'], default: 'normal' },
      { key: 'behind', kind: 'bool', default: true },
      { key: 'minGap', kind: 'number', min: 0, max: 0.5, step: 0.005, default: 0.08 },
    ],
    costOf(params) {
      return Math.min(6, Math.max(1, Math.round(params && params.count != null ? params.count : 4)));
    },
    cpu() {},
    motionFx(params) {
      return {
        kind: 'strokeTrail',
        count: Math.min(6, Math.max(1, Math.round(params.count == null ? 4 : params.count))),
        spacing: params.spacing == null ? 0.05 : Number(params.spacing),
        width: params.width == null ? 2 : Number(params.width),
        colorA: params.colorA || '#00e5ff',
        colorB: params.colorB || '#ff00c8',
        opacity: params.opacity == null ? 0.9 : Number(params.opacity),
        decay: params.decay == null ? 0.25 : Number(params.decay),
        widthDecay: params.widthDecay == null ? 0.3 : Number(params.widthDecay),
        dash: params.dash == null ? 0 : Number(params.dash),
        blend: params.blend || 'normal',
        behind: params.behind !== false,
        minGap: params.minGap == null ? 0.08 : Number(params.minGap),
      };
    },
  });

  return fx;
});
