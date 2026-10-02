(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./registry'), require('../shape-ops'));
  else {
    root.SA = root.SA || {};
    root.SA.shapeLayer = factory(root.SA.fx, root.SA.shapeOps);
  }
})(typeof self !== 'undefined' ? self : this, function (fx, shapeOps) {
  'use strict';

  // A shape drawn over the finished frame: underline, box, brackets, rings,
  // bursts. The path is stroked with an arc-length parameter, so `trim` draws
  // it on (an underline sweeping in, a frame being drawn, a ring bursting).
  // The shape follows the text block: the engine hands the current text bounds
  // in through `context.textBox`. As a post it belongs to the subtitle track's
  // graphics row, so `graphicsHidden` and the subtitle-only view drop it with
  // the other frame-wide graphics.
  //
  // The same vocabulary is registered as `background.shapeLayer`, a backdrop
  // clip the user places on the timeline: shape-ops expands it against the
  // current text box (`followText: block / line`) and the GL shape pass draws
  // it behind the lyrics.
  const SHAPES = (shapeOps && shapeOps.SHAPES) || [
    'underline',
    'strike',
    'box',
    'brackets',
    'circle',
    'ring',
    'burst',
    'cross',
    'diagonal',
    'overline',
    'topBottom',
    'sides',
    'sidesSemicircle',
    'sidesSemiellipse',
    'capsule',
    'plate',
    'ornament',
  ];
  const FOLLOW_MODES = (shapeOps && shapeOps.FOLLOW_MODES) || ['block', 'line', 'word', 'char', 'span'];
  const PATH_OPS = (shapeOps && shapeOps.PATH_OPS) || ['none', 'wiggle', 'zigzag', 'pucker', 'twist'];
  const PATTERNS = (shapeOps && shapeOps.PATTERNS) || ['solid', 'dashed', 'dotted', 'dashDot', 'double', 'triple', 'stripes', 'checker', 'diamond', 'zigzag', 'wave', 'random', 'railroad', 'hatch', 'crosshatch', 'sketch', 'doubleDashed', 'squareChain', 'chain', 'ornament'];
  const PATTERN_CODES = (shapeOps && shapeOps.PATTERN_CODES) || {
    solid: 0,
    dashed: 1,
    dotted: 2,
    dashDot: 3,
    double: 4,
    triple: 5,
    stripes: 6,
    checker: 7,
    diamond: 8,
    zigzag: 9,
    wave: 10,
    random: 11,
    railroad: 12,
    hatch: 13,
    crosshatch: 14,
    sketch: 15,
    doubleDashed: 16,
    squareChain: 17,
    chain: 18,
    ornament: 19,
  };
  const ENTER_ANIMS = (shapeOps && shapeOps.ENTER_ANIMS) || ['draw', 'pop', 'fade', 'slide', 'expand', 'none'];
  const EXIT_ANIMS = (shapeOps && shapeOps.EXIT_ANIMS) || ['erase', 'shrink', 'fade', 'slide', 'none'];
  const HOLD_ANIMS = (shapeOps && shapeOps.HOLD_ANIMS) || ['flow', 'pulse', 'float', 'shiver', 'none'];
  const BG_PATTERNS = (shapeOps && shapeOps.BG_PATTERNS) || ['none', 'stripes', 'dots', 'grid', 'checker', 'diamond', 'wave', 'hatch', 'crosshatch', 'chain', 'random'];
  const SHAPE_CODES = {};
  SHAPES.forEach((name, index) => {
    SHAPE_CODES[name] = index;
  });
  const DRIVES = ['enter', 'exit', 'hold', 'beat', 'auto'];

  function num(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  fx.register({
    group: 'post',
    type: 'shapeLayer',
    tags: ['pro', 'shape', 'transition'],
    pack: 'pro',
    stackable: true,
    cost: 3,
    params: [
      { key: 'shape', kind: 'select', options: SHAPES, default: 'underline', section: 'shape' },
      { key: 'drive', kind: 'select', options: DRIVES, default: 'enter', section: 'shape' },
      { key: 'enterAnim', kind: 'select', options: ENTER_ANIMS, default: 'draw', section: 'shape' },
      { key: 'exitAnim', kind: 'select', options: EXIT_ANIMS, default: 'erase', section: 'shape' },
      { key: 'holdAnim', kind: 'select', options: HOLD_ANIMS, default: 'flow', section: 'shape' },
      { key: 'speed', kind: 'number', min: 0.05, max: 4, step: 0.05, default: 0.6, section: 'shape' },
      { key: 'trimStart', kind: 'number', min: 0, max: 1, step: 0.01, default: 0, section: 'shape' },
      { key: 'trimEnd', kind: 'number', min: 0, max: 1, step: 0.01, default: 1, section: 'shape' },
      { key: 'trimOffset', kind: 'number', min: -1, max: 1, step: 0.01, default: 0, section: 'shape' },
      { key: 'feather', kind: 'number', min: 0, max: 0.5, step: 0.01, default: 0.06, section: 'shape' },
      { key: 'stroke', kind: 'number', min: 0.1, max: 200, step: 0.5, default: 4, section: 'look' },
      { key: 'padding', kind: 'number', min: -0.2, max: 0.6, step: 0.01, default: 0.06, section: 'look' },
      { key: 'pattern', kind: 'select', options: PATTERNS, default: 'solid', section: 'look' },
      { key: 'patternSize', kind: 'number', min: 2, max: 200, step: 1, default: 16, section: 'look' },
      { key: 'patternRatio', kind: 'number', min: 0.05, max: 0.95, step: 0.01, default: 0.5, section: 'look' },
      { key: 'patternFlow', kind: 'number', min: -4, max: 4, step: 0.05, default: 0, section: 'look' },
      { key: 'dashOn', kind: 'number', min: 0, max: 200, step: 1, default: 0, section: 'look' },
      { key: 'dashOff', kind: 'number', min: 0, max: 200, step: 1, default: 0, section: 'look' },
      { key: 'dashOffset', kind: 'number', min: -1, max: 1, step: 0.05, default: 0, section: 'look' },
      { key: 'fillColor', kind: 'color', default: null, section: 'plate' },
      { key: 'fillOpacity', kind: 'number', min: 0, max: 1, step: 0.01, default: 0, section: 'plate' },
      { key: 'bgPattern', kind: 'select', options: BG_PATTERNS, default: 'none', section: 'plate' },
      { key: 'bgPatternSize', kind: 'number', min: 2, max: 200, step: 1, default: 24, section: 'plate' },
      { key: 'bgPatternOpacity', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.5, section: 'plate' },
      { key: 'bgPatternFlow', kind: 'number', min: -4, max: 4, step: 0.05, default: 0, section: 'plate' },
      { key: 'repeat', kind: 'int', min: 1, max: 12, step: 1, default: 4, section: 'look' },
      { key: 'repeatScale', kind: 'number', min: 0.1, max: 2, step: 0.05, default: 1, section: 'look' },
      { key: 'repeatRotate', kind: 'number', min: -180, max: 180, step: 5, default: 0, section: 'look' },
      { key: 'repeatOpacity', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.5, section: 'look' },
      { key: 'cap', kind: 'select', options: ['butt', 'round'], default: 'round', section: 'look' },
      { key: 'glow', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.25, section: 'look' },
      { key: 'color', kind: 'color', default: null, section: 'look' },
      { key: 'enabled', kind: 'bool', default: true },
      { key: 'in', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 },
      { key: 'out', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 },
    ],
    defaults: { target: 'frame' },
    // the shape's trim follows the beat or loops while the beat is held
    normalize(params) {
      const source = params || {};
      return {
        ...source,
        shape: SHAPES.includes(source.shape) ? source.shape : 'underline',
        drive: DRIVES.includes(source.drive) ? source.drive : 'enter',
        enterAnim: ENTER_ANIMS.includes(source.enterAnim) ? source.enterAnim : 'draw',
        exitAnim: EXIT_ANIMS.includes(source.exitAnim) ? source.exitAnim : 'erase',
        holdAnim: HOLD_ANIMS.includes(source.holdAnim) ? source.holdAnim : 'flow',
        trimStart: Math.max(0, Math.min(1, num(source.trimStart, 0))),
        trimEnd: Math.max(0, Math.min(1, num(source.trimEnd, 1))),
        trimOffset: num(source.trimOffset, 0),
        feather: Math.max(0, Math.min(0.5, num(source.feather, 0.06))),
        stroke: Math.max(0.1, Math.min(200, num(source.stroke, 4))),
        padding: Math.max(-0.2, Math.min(0.6, num(source.padding, 0.06))),
        pattern: PATTERNS.includes(source.pattern) ? source.pattern : 'solid',
        patternSize: Math.max(2, Math.min(200, num(source.patternSize, 16))),
        patternRatio: Math.max(0.05, Math.min(0.95, num(source.patternRatio, 0.5))),
        patternFlow: Math.max(-4, Math.min(4, num(source.patternFlow, 0))),
        dashOn: Math.max(0, Math.min(200, num(source.dashOn, 0))),
        dashOff: Math.max(0, Math.min(200, num(source.dashOff, 0))),
        dashOffset: Math.max(-1, Math.min(1, num(source.dashOffset, 0))),
        fillOpacity: Math.max(0, Math.min(1, num(source.fillOpacity, 0))),
        bgPattern: BG_PATTERNS.includes(source.bgPattern) ? source.bgPattern : 'none',
        bgPatternSize: Math.max(2, Math.min(200, num(source.bgPatternSize, 24))),
        bgPatternOpacity: Math.max(0, Math.min(1, num(source.bgPatternOpacity, 0.5))),
        bgPatternFlow: Math.max(-4, Math.min(4, num(source.bgPatternFlow, 0))),
        repeat: Math.max(1, Math.min(12, Math.round(num(source.repeat, 4)))),
        repeatScale: num(source.repeatScale, 1),
        repeatRotate: num(source.repeatRotate, 0),
        repeatOpacity: Math.max(0, Math.min(1, num(source.repeatOpacity, 0.5))),
        glow: Math.max(0, Math.min(1, num(source.glow, 0.25))),
      };
    },
  });

  // The same shape layer as a backdrop clip: the user places it on the
  // background / backdrop track and it fits the current text (block or line).
  fx.register({
    group: 'background',
    type: 'shapeLayer',
    tags: ['pro', 'shape'],
    pack: 'pro',
    cost: 3,
    params: [
      { key: 'shape', kind: 'select', options: SHAPES, default: 'box', section: 'shape' },
      { key: 'followText', kind: 'select', options: FOLLOW_MODES, default: 'block', section: 'shape' },
      { key: 'matchText', kind: 'string', default: '', section: 'shape' },
      { key: 'spanFrom', kind: 'int', min: 0, max: 500, step: 1, default: 0, section: 'shape' },
      { key: 'spanTo', kind: 'int', min: 0, max: 500, step: 1, default: 0, section: 'shape' },
      { key: 'drive', kind: 'select', options: DRIVES, default: 'enter', section: 'shape' },
      { key: 'enterAnim', kind: 'select', options: ENTER_ANIMS, default: 'draw', section: 'shape' },
      { key: 'exitAnim', kind: 'select', options: EXIT_ANIMS, default: 'erase', section: 'shape' },
      { key: 'holdAnim', kind: 'select', options: HOLD_ANIMS, default: 'flow', section: 'shape' },
      { key: 'speed', kind: 'number', min: 0.05, max: 4, step: 0.05, default: 0.6, section: 'shape' },
      { key: 'trimStart', kind: 'number', min: 0, max: 1, step: 0.01, default: 0, section: 'shape' },
      { key: 'trimEnd', kind: 'number', min: 0, max: 1, step: 0.01, default: 1, section: 'shape' },
      { key: 'trimOffset', kind: 'number', min: -1, max: 1, step: 0.01, default: 0, section: 'shape' },
      { key: 'dashOn', kind: 'number', min: 0, max: 1, step: 0.01, default: 0, section: 'shape' },
      { key: 'dashOff', kind: 'number', min: 0, max: 1, step: 0.01, default: 0, section: 'shape' },
      { key: 'dashOffset', kind: 'number', min: -1, max: 1, step: 0.01, default: 0, section: 'shape' },
      { key: 'pattern', kind: 'select', options: PATTERNS, default: 'solid', section: 'shape' },
      { key: 'patternSize', kind: 'number', min: 2, max: 200, step: 1, default: 16, section: 'shape' },
      { key: 'patternRatio', kind: 'number', min: 0.05, max: 0.95, step: 0.01, default: 0.5, section: 'shape' },
      { key: 'patternFlow', kind: 'number', min: -4, max: 4, step: 0.05, default: 0, section: 'shape' },
      { key: 'pathOp', kind: 'select', options: PATH_OPS, default: 'none', section: 'shape' },
      { key: 'pathOpAmount', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.25, section: 'shape' },
      { key: 'pathOpFreq', kind: 'number', min: 0.2, max: 8, step: 0.1, default: 2, section: 'shape' },
      { key: 'stroke', kind: 'number', min: 0.1, max: 200, step: 0.5, default: 4, section: 'look' },
      { key: 'corner', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.12, section: 'look' },
      { key: 'padding', kind: 'number', min: -0.2, max: 0.6, step: 0.01, default: 0.08, section: 'look' },
      { key: 'fillColor', kind: 'color', default: null, section: 'plate' },
      { key: 'fillOpacity', kind: 'number', min: 0, max: 1, step: 0.01, default: 0, section: 'plate' },
      { key: 'bgPattern', kind: 'select', options: BG_PATTERNS, default: 'none', section: 'plate' },
      { key: 'bgPatternSize', kind: 'number', min: 2, max: 200, step: 1, default: 24, section: 'plate' },
      { key: 'bgPatternOpacity', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.5, section: 'plate' },
      { key: 'bgPatternFlow', kind: 'number', min: -4, max: 4, step: 0.05, default: 0, section: 'plate' },
      { key: 'repeat', kind: 'int', min: 1, max: 12, step: 1, default: 1, section: 'look' },
      { key: 'repeatOffset', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.25, section: 'look' },
      { key: 'repeatScale', kind: 'number', min: 0.1, max: 2, step: 0.05, default: 1, section: 'look' },
      { key: 'repeatRotate', kind: 'number', min: -180, max: 180, step: 5, default: 0, section: 'look' },
      { key: 'repeatOpacity', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.5, section: 'look' },
      { key: 'cap', kind: 'select', options: ['butt', 'round'], default: 'round', section: 'look' },
      { key: 'opacity', kind: 'number', min: 0, max: 1, step: 0.01, default: 1, section: 'look' },
      { key: 'color', kind: 'color', default: null, section: 'look' },
    ],
  });

  fx.postExtensions = fx.postExtensions || {};
  fx.postExtensions.shapeLayer = {
    code: 46,
    uniforms(params, ctx) {
      const p = (fx.withDefaults({ type: 'shapeLayer', params: params || {} }, 'post') || {}).params || params || {};
      const context = ctx || {};
      const envelope = context.envelope == null ? 1 : Math.max(0, context.envelope);
      const progress = context.progress == null ? 1 : Math.max(0, Math.min(1, context.progress));
      const time = context.time || 0;
      const box = context.textBox || { x0: 0.2, y0: 0.35, x1: 0.8, y1: 0.65 };
      let start = p.trimStart == null ? 0 : p.trimStart;
      let end = p.trimEnd == null ? 1 : p.trimEnd;
      let offset = p.trimOffset == null ? 0 : p.trimOffset;
      const speed = p.speed == null ? 0.6 : p.speed;
      const drive = p.drive || 'enter';
      if (drive === 'enter') end = start + (end - start) * progress;
      else if (drive === 'exit') start = start + (end - start) * progress;
      else if (drive === 'hold') offset += time * speed;
      else if (drive === 'beat') {
        const bpm = context.audioFeatures && Number(context.audioFeatures.bpm) > 0 ? Number(context.audioFeatures.bpm) : 120;
        offset += ((time * bpm) / 60) % 1;
      } else if (shapeOps && shapeOps.computeMotion) {
        const bpm = context.audioFeatures && Number(context.audioFeatures.bpm) > 0 ? Number(context.audioFeatures.bpm) : 120;
        const motion = shapeOps.computeMotion(p, { progress, time, bpm });
        start = motion.trim[0];
        end = motion.trim[1];
        offset = motion.trim[2];
      }
      const color = context.shapeColor || [1, 0.82, 0.42, 1];
      // pattern packing: kind, period (px), ratio, phase. The phase already
      // folds in `patternFlow * time`, and a set dashOn/dashOff overrides the
      // period and share (a solid pattern becomes dashed).
      let patternCode = PATTERN_CODES[p.pattern] == null ? 0 : PATTERN_CODES[p.pattern];
      let patternPeriod = Math.max(0.5, num(p.patternSize, 16));
      let patternRatio = Math.max(0.02, Math.min(0.98, num(p.patternRatio, 0.5)));
      let patternPhase = num(p.patternFlow, 0) * time;
      const dashOn = Math.max(0, num(p.dashOn, 0));
      if (dashOn > 0) {
        const dashOff = Math.max(0, num(p.dashOff, dashOn));
        const total = Math.max(0.5, dashOn + dashOff);
        if (patternCode === 0) patternCode = PATTERN_CODES.dashed || 1;
        patternPeriod = total;
        patternRatio = dashOn / total;
        patternPhase -= num(p.dashOffset, 0) / total;
      }
      return {
        u_params: [SHAPE_CODES[p.shape] == null ? 0 : SHAPE_CODES[p.shape], start, end, offset],
        u_params2: [p.stroke == null ? 4 : p.stroke, p.repeat == null ? 4 : p.repeat, p.repeatScale == null ? 1 : p.repeatScale, p.repeatRotate == null ? 0 : p.repeatRotate],
        u_params3: [box.x0, box.y0, box.x1, box.y1],
        u_params4: [patternCode, patternPeriod, patternRatio, patternPhase],
        u_colorA: [color[0], color[1], color[2], (p.glow == null ? 0.25 : p.glow) * envelope],
        u_colorB: [p.padding == null ? 0.06 : p.padding, p.repeatOpacity == null ? 0.5 : p.repeatOpacity, p.cap === 'butt' ? 0 : 1, p.feather == null ? 0.06 : p.feather],
      };
    },
  };

  return { SHAPES, SHAPE_CODES, DRIVES, FOLLOW_MODES, PATH_OPS };
});
