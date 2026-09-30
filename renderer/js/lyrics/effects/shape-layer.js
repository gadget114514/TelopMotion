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
  const SHAPES = (shapeOps && shapeOps.SHAPES) || ['underline', 'strike', 'box', 'brackets', 'circle', 'ring', 'burst', 'cross', 'diagonal'];
  const FOLLOW_MODES = (shapeOps && shapeOps.FOLLOW_MODES) || ['block', 'line'];
  const PATH_OPS = (shapeOps && shapeOps.PATH_OPS) || ['none', 'wiggle', 'zigzag', 'pucker', 'twist'];
  const SHAPE_CODES = {};
  SHAPES.forEach((name, index) => {
    SHAPE_CODES[name] = index;
  });
  const DRIVES = ['enter', 'exit', 'hold', 'beat'];

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
      { key: 'speed', kind: 'number', min: 0.05, max: 4, step: 0.05, default: 0.6, section: 'shape' },
      { key: 'trimStart', kind: 'number', min: 0, max: 1, step: 0.01, default: 0, section: 'shape' },
      { key: 'trimEnd', kind: 'number', min: 0, max: 1, step: 0.01, default: 1, section: 'shape' },
      { key: 'trimOffset', kind: 'number', min: -1, max: 1, step: 0.01, default: 0, section: 'shape' },
      { key: 'feather', kind: 'number', min: 0, max: 0.5, step: 0.01, default: 0.06, section: 'shape' },
      { key: 'stroke', kind: 'number', min: 0.5, max: 40, step: 0.5, default: 4, section: 'look' },
      { key: 'padding', kind: 'number', min: -0.2, max: 0.6, step: 0.01, default: 0.06, section: 'look' },
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
        trimStart: Math.max(0, Math.min(1, num(source.trimStart, 0))),
        trimEnd: Math.max(0, Math.min(1, num(source.trimEnd, 1))),
        trimOffset: num(source.trimOffset, 0),
        feather: Math.max(0, Math.min(0.5, num(source.feather, 0.06))),
        stroke: Math.max(0.5, Math.min(40, num(source.stroke, 4))),
        padding: Math.max(-0.2, Math.min(0.6, num(source.padding, 0.06))),
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
      { key: 'drive', kind: 'select', options: DRIVES, default: 'enter', section: 'shape' },
      { key: 'speed', kind: 'number', min: 0.05, max: 4, step: 0.05, default: 0.6, section: 'shape' },
      { key: 'trimStart', kind: 'number', min: 0, max: 1, step: 0.01, default: 0, section: 'shape' },
      { key: 'trimEnd', kind: 'number', min: 0, max: 1, step: 0.01, default: 1, section: 'shape' },
      { key: 'trimOffset', kind: 'number', min: -1, max: 1, step: 0.01, default: 0, section: 'shape' },
      { key: 'dashOn', kind: 'number', min: 0, max: 1, step: 0.01, default: 0, section: 'shape' },
      { key: 'dashOff', kind: 'number', min: 0, max: 1, step: 0.01, default: 0, section: 'shape' },
      { key: 'dashOffset', kind: 'number', min: -1, max: 1, step: 0.01, default: 0, section: 'shape' },
      { key: 'pathOp', kind: 'select', options: PATH_OPS, default: 'none', section: 'shape' },
      { key: 'pathOpAmount', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.25, section: 'shape' },
      { key: 'pathOpFreq', kind: 'number', min: 0.2, max: 8, step: 0.1, default: 2, section: 'shape' },
      { key: 'stroke', kind: 'number', min: 0.5, max: 40, step: 0.5, default: 4, section: 'look' },
      { key: 'corner', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.12, section: 'look' },
      { key: 'padding', kind: 'number', min: -0.2, max: 0.6, step: 0.01, default: 0.08, section: 'look' },
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
      }
      const color = context.shapeColor || [1, 0.82, 0.42, 1];
      return {
        u_params: [SHAPE_CODES[p.shape] == null ? 0 : SHAPE_CODES[p.shape], start, end, offset],
        u_params2: [p.stroke == null ? 4 : p.stroke, p.repeat == null ? 4 : p.repeat, p.repeatScale == null ? 1 : p.repeatScale, p.repeatRotate == null ? 0 : p.repeatRotate],
        u_params3: [box.x0, box.y0, box.x1, box.y1],
        u_colorA: [color[0], color[1], color[2], (p.glow == null ? 0.25 : p.glow) * envelope],
        u_colorB: [p.padding == null ? 0.06 : p.padding, p.repeatOpacity == null ? 0.5 : p.repeatOpacity, p.cap === 'butt' ? 0 : 1, p.feather == null ? 0.06 : p.feather],
      };
    },
  };

  return { SHAPES, SHAPE_CODES, DRIVES, FOLLOW_MODES, PATH_OPS };
});
