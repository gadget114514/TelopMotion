(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./registry'), require('../rng'), require('../easing'), require('../../color'), require('../shape-ops'));
  else {
    root.SA = root.SA || {};
    root.SA.textBg = factory(root.SA.fx, root.SA.rng, root.SA.easing, root.SA.color, root.SA.shapeOps);
  }
})(typeof self !== 'undefined' ? self : this, function (fx, rng, easing, color, shapeOps) {
  'use strict';

  // Shape indices must match the constants used by BG_FRAG.
  const SHAPES = {
    none: 0,
    square: 1,
    rounded: 2,
    circle: 3,
    diamond: 4,
    ring: 5,
    bar: 6,
    star: 7,
    blob: 8,
    heart: 9,
    splatter: 10,
    scratch: 11,
    drop: 12,
    bracket: 13,
    paper: 14,
    cloud: 15,
  };

  const SHAPE_TYPES = Object.keys(SHAPES);
  const VARY_MODES = ['none', 'alternate', 'cycle', 'random', 'charClass', 'word', 'line', 'first', 'last'];

  const COMMON_PARAMS = [
    { key: 'unit', kind: 'select', options: ['cell', 'em'], default: 'cell' },
    { key: 'width', kind: 'number', min: 0.05, max: 5, step: 0.01, default: 1.05, random: [0.7, 1.15] },
    { key: 'height', kind: 'number', min: 0.05, max: 5, step: 0.01, default: 1.05, random: [0.7, 1.15] },
    { key: 'lockAspect', kind: 'bool', default: true },
    { key: 'offset', kind: 'vec2', default: { x: 0, y: 0 } },
    { key: 'rotation', kind: 'number', min: -180, max: 180, step: 1, default: 0 },
    { key: 'radius', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.25 },
    { key: 'thickness', kind: 'number', min: 0.02, max: 0.5, step: 0.01, default: 0.12 },
    { key: 'points', kind: 'int', min: 3, max: 12, step: 1, default: 5 },
    { key: 'wobble', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.3 },
    { key: 'rotateWithLetter', kind: 'bool', default: true },
    { key: 'scaleWithLetter', kind: 'bool', default: true },
    { key: 'opacity', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 },
    { key: 'knockout', kind: 'bool', default: false },
    { key: 'layer', kind: 'select', options: ['behind', 'front'], default: 'behind' },
    { key: 'skipSpaces', kind: 'bool', default: true },
    { key: 'skipRate', kind: 'number', min: 0, max: 1, step: 0.01, default: 0 },
    { key: 'fgAutoContrast', kind: 'bool', default: false },
    { key: 'fgColors', kind: 'colors', default: [] },
    { key: 'vary', kind: 'select', options: VARY_MODES, default: 'none' },
    { key: 'varyColors', kind: 'colors', default: [] },
    { key: 'varyShape', kind: 'bool', default: false },
    { key: 'varyShapes', kind: 'multiselect', options: ['square', 'circle', 'rounded', 'diamond', 'star'], default: ['square', 'circle'] },
    { key: 'varySize', kind: 'number', min: 0, max: 1, step: 0.01, default: 0 },
    { key: 'varyOffset', kind: 'number', min: 0, max: 1, step: 0.01, default: 0 },
    { key: 'varyRotation', kind: 'number', min: 0, max: 180, step: 1, default: 0 },
    // trim / dash cut the outline by its arc length; `stroke` draws the outline
    // and `fill` the interior, so `bgMotion.draw` can trace the line first and
    // let the shape appear when the line is complete
    { key: 'stroke', kind: 'number', min: 0, max: 0.5, step: 0.01, default: 0 },
    { key: 'fill', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 },
    { key: 'trimStart', kind: 'number', min: 0, max: 1, step: 0.01, default: 0 },
    { key: 'trimEnd', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 },
    { key: 'trimOffset', kind: 'number', min: -1, max: 1, step: 0.01, default: 0 },
    { key: 'dashOn', kind: 'number', min: 0, max: 1, step: 0.01, default: 0 },
    { key: 'dashOff', kind: 'number', min: 0, max: 1, step: 0.01, default: 0 },
    { key: 'dashOffset', kind: 'number', min: -1, max: 1, step: 0.01, default: 0 },
  ];

  const TYPE_PARAMS = {
    splatter: [
      { key: 'spikes', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
      { key: 'seedShift', kind: 'int', min: 0, max: 9999, step: 1, default: 0 },
    ],
    scratch: [
      { key: 'count', kind: 'int', min: 1, max: 6, step: 1, default: 3 },
      { key: 'seedShift', kind: 'int', min: 0, max: 9999, step: 1, default: 0 },
    ],
    paper: [
      { key: 'jag', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.4 },
      { key: 'seedShift', kind: 'int', min: 0, max: 9999, step: 1, default: 0 },
    ],
    blob: [{ key: 'seedShift', kind: 'int', min: 0, max: 9999, step: 1, default: 0 }],
    cloud: [{ key: 'seedShift', kind: 'int', min: 0, max: 9999, step: 1, default: 0 }],
  };

  function paramsFor(type) {
    return [...COMMON_PARAMS, ...(TYPE_PARAMS[type] || [])];
  }

  // The text background is the one shape the definition allows: a per-letter
  // square covering the letter's own box (`inkBoxFor`). Everything else the old `bgShape`
  // carried (circles, stars, bars, em-sized washes, free offsets / rotations)
  // is a text ornament and lives in the separate `ornShape` group, so the
  // subtitle background switch never hides a decoration.
  const BG_SHAPE_TYPES = ['none', 'square'];
  const ORN_SHAPE_TYPES = SHAPE_TYPES.filter((type) => type !== 'none');
  // The background keeps only the modifiers that do not move or resize it:
  // colour variation (the background and the per-letter text colour),
  // fill / stroke / trim / dash and letter following. Geometry
  // (unit / width / height / offset / rotation / wobble / vary* geometry) is
  // ignored by evaluateBg for the background group. The background has no size
  // knob at all: it is exactly the letter's cell, so it tracks the font size.
  const BG_PARAM_KEYS = new Set([
    'rotateWithLetter', 'scaleWithLetter', 'opacity', 'skipSpaces', 'skipRate',
    'fgAutoContrast', 'fgColors', 'vary', 'varyColors', 'stroke', 'fill',
    'trimStart', 'trimEnd', 'trimOffset', 'dashOn', 'dashOff', 'dashOffset',
  ]);

  function bgParamsFor(type) {
    const base = COMMON_PARAMS.filter((param) => BG_PARAM_KEYS.has(param.key));
    return [...base, ...(TYPE_PARAMS[type] || [])];
  }

  for (const type of BG_SHAPE_TYPES) {
    fx.register({
      group: 'bgShape',
      type,
      tags: type === 'none' ? ['basic'] : [],
      params: bgParamsFor(type),
      cost: type === 'none' ? 0 : 2,
    });
  }

  for (const type of ORN_SHAPE_TYPES) {
    fx.register({
      group: 'ornShape',
      type,
      params: paramsFor(type),
      cost: 2,
    });
  }

  const MOTION_PARAMS = [
    { key: 'lead', kind: 'number', min: -1, max: 1, step: 0.01, default: 0.08 },
    { key: 'duration', kind: 'number', min: 0.05, max: 2, step: 0.05, default: 0.35 },
    { key: 'ease', kind: 'ease', default: 'easeOutCubic' },
    { key: 'exit', kind: 'select', options: ['withText', 'fade', 'shrink', 'none'], default: 'withText' },
    { key: 'exitDuration', kind: 'number', min: 0.05, max: 2, step: 0.05, default: 0.3 },
    { key: 'hold', kind: 'select', options: ['none', 'pulse', 'wobble', 'spin', 'beat', 'heartbeat', 'shiver', 'drift'], default: 'none' },
    { key: 'holdAmount', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.3 },
  ];

  const MOTION_EXTRA = {
    pop: [{ key: 'overshoot', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.15 }],
    stamp: [{ key: 'from', kind: 'number', min: 1, max: 4, step: 0.05, default: 1.8 }],
    wipe: [{ key: 'dir', kind: 'select', options: ['left', 'right', 'up', 'down'], default: 'left' }],
    spin: [{ key: 'turns', kind: 'number', min: -2, max: 2, step: 0.05, default: 0.25 }],
    grow: [{ key: 'axis', kind: 'select', options: ['x', 'y'], default: 'x' }],
    flicker: [{ key: 'flickers', kind: 'int', min: 1, max: 10, step: 1, default: 4 }],
    bleed: [{ key: 'roughness', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.5 }],
    float: [{ key: 'rise', kind: 'number', min: -0.6, max: 0.6, step: 0.01, default: 0.3 }],
    fall: [{ key: 'from', kind: 'number', min: 0.05, max: 1.5, step: 0.01, default: 0.6 }],
  };

  const MOTIONS = ['follow', 'fade', 'pop', 'stamp', 'wipe', 'spin', 'grow', 'none', 'flicker', 'bleed', 'float', 'fall', 'draw'];

  for (const motion of MOTIONS) {
    fx.register({
      group: 'bgMotion',
      type: motion,
      tags: motion === 'follow' || motion === 'none' ? ['basic'] : [],
      params: [...MOTION_PARAMS, ...(MOTION_EXTRA[motion] || [])],
      // the extended motions stay behind the pro pack so the earlier generated
      // pools (FX 400 / 800) keep their exact type list
      pack: ['draw'].includes(motion) ? 'pro' : null,
      cost: ['flicker', 'bleed'].includes(motion) ? 1 : 0,
    });
  }

  // The background fill / edge reuse the foreground effect libraries; the
  // ornament groups are the same libraries behind their own names
  if (typeof fx.alias === 'function') {
    fx.alias('bgFill', 'fill');
    fx.alias('bgEdge', 'edge');
    fx.alias('ornFill', 'fill');
    fx.alias('ornEdge', 'edge');
    fx.alias('ornMotion', 'bgMotion');
  }

  // The text attributes a scoped entry can set per letter. It is not a drawable
  // group: the engine turns these params into synthetic composition spans, so
  // the layout itself carries the size / weight / colour (see scene.js). `scale`
  // multiplies the beat size, `weight` 0 keeps the beat weight, and the colour
  // is a literal hex or a palette slot (`paletteIndex` -1 = the beat fill).
  fx.register({
    group: 'text',
    type: 'span',
    tags: ['basic'],
    params: [
      { key: 'scale', kind: 'number', min: 0.25, max: 4, step: 0.01, default: 1 },
      { key: 'weight', kind: 'number', min: 0, max: 900, step: 100, default: 0 },
      { key: 'color', kind: 'color', default: null },
      { key: 'paletteIndex', kind: 'int', min: -1, max: 11, step: 1, default: -1 },
    ],
    cost: 0,
  });

  function clamp01(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return number < 0 ? 0 : number > 1 ? 1 : number;
  }

  function num(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback == null ? 0 : fallback;
  }

  function hash01(a, b) {
    const value = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
    return value - Math.floor(value);
  }

  function backOut(p, overshoot) {
    const t = p - 1;
    return 1 + (overshoot + 1) * t * t * t + overshoot * t * t;
  }

  function expoOut(p) {
    return p >= 1 ? 1 : 1 - Math.pow(2, -10 * p);
  }

  function bounceOut(p) {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (p < 1 / d1) return n1 * p * p;
    if (p < 2 / d1) {
      const t = p - 1.5 / d1;
      return n1 * t * t + 0.75;
    }
    if (p < 2.5 / d1) {
      const t = p - 2.25 / d1;
      return n1 * t * t + 0.9375;
    }
    const t = p - 2.625 / d1;
    return n1 * t * t + 0.984375;
  }

  function bump(x, c, w) {
    const t = (x - c) / w;
    return Math.exp(-t * t * 4);
  }

  // The engine-side safety cap every text background passes through: a cell
  // shape may span at most `limits.cell` letter boxes and an em shape at most the
  // beat's text box width + 0.6 em, so a stored project cannot paint a giant
  // slab over the frame. The states are clamped in place and returned. The
  // definition background is one letter box wide and never reaches the cap; the
  // limit stays as the guard for the ornaments, whose geometry the author
  // controls.
  function capBackground(states, unit, box, limits) {
    const opts = limits || {};
    const cellMax = Number.isFinite(Number(opts.cell)) ? Number(opts.cell) : 1.25;
    const emExtra = Number.isFinite(Number(opts.emExtra)) ? Number(opts.emExtra) : 0.6;
    const emPx = Number(opts.emPx) > 0 ? Number(opts.emPx) : 0;
    const width = Number(box && box.w) > 0 ? Number(box.w) : 0;
    const height = Number(box && box.h) > 0 ? Number(box.h) : 0;
    const fallback = unit === 'em' ? 1.6 : cellMax;
    for (const state of states || []) {
      if (!state) continue;
      const scaleX = Math.abs(Number(state.motionScaleX) || 1) || 1;
      const scaleY = Math.abs(Number(state.motionScaleY) || 1) || 1;
      if (unit === 'em') {
        // the em limit is expressed in the beat's own font size
        const maxX = emPx > 0 && width > 0 ? width / emPx + emExtra : fallback;
        const maxY = emPx > 0 && height > 0 ? height / emPx + emExtra : fallback;
        if (state.sizeX * scaleX > maxX) state.sizeX = maxX / scaleX;
        if (state.sizeY * scaleY > maxY) state.sizeY = maxY / scaleY;
      } else {
        if (state.sizeX * scaleX > cellMax) state.sizeX = cellMax / scaleX;
        if (state.sizeY * scaleY > cellMax) state.sizeY = cellMax / scaleY;
      }
    }
    return states;
  }

  // `cellMetrics` reads the advance in em (the unit the layout tests use):
  // horizontal text spans `advance em x 1 em`, vertical text `1 em x advance`.
  // The runtime scene letters carry the advance in px instead (see font.js
  // layoutText), so `cellMetricsFor` normalises the px advance to em and
  // delegates: the cell is the advance box behind the letter either way.
  //
  // The returned offset is the vector from the ink bbox centre (glyph-local
  // origin) to the cell centre, in px.
  function cellMetricsFor(letter) {
    const size = num(letter && letter.size, 1) || 1;
    const copy = { ...(letter || {}) };
    if (letter) {
      if (Number.isFinite(Number(letter.advanceWithSpacing))) copy.advanceWithSpacing = Number(letter.advanceWithSpacing) / size;
      if (Number.isFinite(Number(letter.advance))) copy.advance = Number(letter.advance) / size;
      if (Number.isFinite(Number(letter.advanceV))) copy.advanceV = Number(letter.advanceV) / size;
    }
    return cellMetrics(copy);
  }

  function cellMetrics(letter) {
    const size = num(letter.size, 1) || 1;
    // `num(value, null)` answers 0, not null, so the spacing test is written
    // out: a letter without it must fall back to its advance, not to 1 em
    const spacing = letter && Number.isFinite(Number(letter.advanceWithSpacing)) ? Number(letter.advanceWithSpacing) : null;
    const advance = spacing == null ? num(letter.advance, 1) : spacing;
    const vertical = !!(letter.vertical || (letter.style && letter.style.text && letter.style.text.direction === 'vertical'));
    const cellW = vertical ? size : Math.max(0.05, advance) * size;
    const cellH = vertical ? Math.max(0.05, num(letter.advanceV, advance)) * size : size;
    const penX = letter.local ? num(letter.local.penX, 0) : 0;
    const penY = letter.local ? num(letter.local.penY, 0) : 0;
    const cx = letter.local ? num(letter.local.cx, penX) : penX;
    const cy = letter.local ? num(letter.local.cy, penY) : penY;
    const centerX = vertical ? penX : penX + cellW / 2;
    const centerY = vertical ? penY + cellH / 2 : penY - cellH / 2;
    return { w: cellW, h: cellH, inkToCell: [centerX - cx, centerY - cy] };
  }

  // The box a letter's background / ornament is drawn on: the letter's own ink
  // box, centred on the same point the glyph mesh is centred on (`local.cx/cy`,
  // which is also what the layout formations, the overlay, frame-guard and the
  // canvas2d fallback use).
  //
  // The advance cell above is a *layout* metric, not the letter's shape: at
  // 100 px a lowercase 'a' has a 56 x 100 cell around a 43 x 55 glyph, so a
  // shape anchored to the cell centre sat ~0.23 em below the letter and was
  // stretched to the cell aspect (a `circle` came out as a tall ellipse). The
  // shape has to be registered to the letter, so the quad carries this box and
  // the shader's `a_inkToCell` stays 0.
  function inkBoxFor(letter) {
    const local = (letter && letter.local) || null;
    const w = local ? num(local.w, 0) : 0;
    const h = local ? num(local.h, 0) : 0;
    if (w > 0 && h > 0) return { w, h };
    // no ink box (a synthetic letter): the advance cell is the closest stand-in
    const cell = cellMetricsFor(letter);
    return { w: cell.w, h: cell.h };
  }

  function defaultInstance(group, type) {
    return { type, params: fx.paramDefaults(group, type), enabled: true };
  }

  function bgColorOf(entry, fallback) {
    const value = entry && entry.color;
    if (Array.isArray(value) && value.length >= 3) return [value[0], value[1], value[2], value[3] == null ? 1 : value[3]];
    if (typeof value === 'string') {
      const rgba = color.parse(value);
      return [rgba.r, rgba.g, rgba.b, rgba.a == null ? 1 : rgba.a];
    }
    return fallback;
  }

  // True when a stored shape is a text background by the definition: a
  // per-letter square in cell units. A square in em units is the small accent
  // square (an ornament), never a background.
  function isBackground(shape) {
    if (!shape || shape.type !== 'square') return false;
    const params = shape.params || {};
    return params.unit !== 'em';
  }

  // Splits the legacy `bg*` groups of one style bag into the two current
  // groups. A square / cell shape stays a background (its geometry parameters
  // are dropped: the engine always draws cell-size squares); everything else
  // becomes an ornament. `options.shape` is the shape resolved for the bag's
  // layer (a bag that only patches `bgFill` inherits the shape from its
  // parent), `options.shadow: false` skips the `bgShape: none` marker the
  // migration writes so a moved ornament still cancels an inherited
  // background. Returns `{ style, changed, kind }`; `style` is a new bag when
  // something moved, the same reference otherwise.
  function splitStyle(style, options) {
    if (!style || typeof style !== 'object') return { style, changed: false, kind: null };
    const opts = options || {};
    const hasOwn = (key) => Object.prototype.hasOwnProperty.call(style, key);
    if (!['bgShape', 'bgFill', 'bgEdge', 'bgMotion'].some(hasOwn)) return { style, changed: false, kind: null };
    const shape = opts.shape || style.bgShape || null;
    const kind = shape && shape.type && shape.type !== 'none' && !isBackground(shape) ? 'orn' : 'bg';
    const next = { ...style };
    if (kind === 'orn') {
      if (style.bgShape && style.bgShape.type && style.bgShape.type !== 'none') {
        next.ornShape = {
          type: style.bgShape.type,
          params: { ...(style.bgShape.params || {}) },
          enabled: style.bgShape.enabled !== false,
        };
      }
      if (style.bgFill) next.ornFill = style.bgFill;
      if (style.bgEdge) next.ornEdge = style.bgEdge;
      if (style.bgMotion) next.ornMotion = style.bgMotion;
      delete next.bgShape;
      delete next.bgFill;
      delete next.bgEdge;
      delete next.bgMotion;
      if (opts.shadow !== false) next.bgShape = { type: 'none', params: {}, enabled: true };
      return { style: next, changed: true, kind };
    }
    if (style.bgShape) {
      const params = { ...(style.bgShape.params || {}) };
      for (const key of Object.keys(params)) if (!BG_PARAM_KEYS.has(key)) delete params[key];
      next.bgShape = { ...style.bgShape, params };
      return { style: next, changed: true, kind };
    }
    return { style, changed: false, kind };
  }

  // CPU state for every letter's background quad. The GPU only applies the
  // transform, the SDF shape and the fill / edge passes. `options.group`
  // selects the group the shape came from: a `bgShape` is forced to a cell
  // square (unit cell, size 1x1, no offset / rotation / geometry variation),
  // while an `ornShape` keeps the stored geometry. Without an explicit group
  // the shape itself decides (isBackground).
  function evaluateBg(shape, motion, letters, variation, timings, local, options) {
    const opts = options || {};
    const shapeInstance = shape && shape.type ? shape : defaultInstance('bgShape', 'none');
    if (!shapeInstance.type || shapeInstance.type === 'none' || !letters.length) return null;
    const group = opts.group === 'bgShape' || opts.group === 'ornShape' ? opts.group : isBackground(shapeInstance) ? 'bgShape' : 'ornShape';
    const isBg = group === 'bgShape';
    const shapeParams = { ...fx.paramDefaults(group, shapeInstance.type), ...(shapeInstance.params || {}) };
    const motionGroup = isBg ? 'bgMotion' : 'ornMotion';
    const motionInstance = motion && motion.type ? motion : defaultInstance(motionGroup, 'follow');
    const motionParams = { ...fx.paramDefaults(motionGroup, motionInstance.type), ...(motionInstance.params || {}) };
    const unit = isBg ? 'cell' : shapeParams.unit === 'em' ? 'em' : 'cell';
    const typeIndex = isBg ? SHAPES.square : SHAPES[shapeInstance.type] == null ? 0 : SHAPES[shapeInstance.type];
    const baseOpacity = clamp01(shapeParams.opacity == null ? 1 : shapeParams.opacity);
    const lockAspect = shapeParams.lockAspect !== false;
    const width = isBg ? 1 : Math.max(0.05, num(shapeParams.width, 1.15));
    const height = isBg ? 1 : lockAspect ? width : Math.max(0.05, num(shapeParams.height, 1.15));
    const rotation = isBg ? 0 : num(shapeParams.rotation, 0);
    const offset = isBg ? { x: 0, y: 0 } : shapeParams.offset || { x: 0, y: 0 };
    const mode = motionInstance.type || 'follow';
    const lead = num(motionParams.lead, 0.08);
    const duration = Math.max(0.05, num(motionParams.duration, 0.35));
    const exitMode = motionParams.exit || 'withText';
    const exitDuration = Math.max(0.05, num(motionParams.exitDuration, 0.3));
    const holdMode = motionParams.hold || 'none';
    const holdAmount = clamp01(motionParams.holdAmount == null ? 0.3 : motionParams.holdAmount);
    const seed = num(opts.seed, 12345);
    // trim / dash cut the outline by its arc length; the trim range is static
    // unless `bgMotion.draw` grows it
    const trimRange = shapeOps ? shapeOps.normalizeTrim(shapeParams) : [0, 1, 0];
    const dash = shapeOps ? shapeOps.normalizeDash(shapeParams) : [0, 0, 0];
    let stroke = Math.max(0, Math.min(0.5, num(shapeParams.stroke, 0)));
    const fillBase = clamp01(shapeParams.fill == null ? 1 : shapeParams.fill);
    const states = [];
    for (let index = 0; index < letters.length; index += 1) {
      const entryRef = letters[index];
      const state = entryRef.state || entryRef;
      const letterRef = entryRef.letter || state;
      const vary = variation && variation[index] ? variation[index] : null;
      const timing = timings && timings[index] ? timings[index] : state.timing || null;
      const enterStart = timing ? num(timing.enterStart, 0) : 0;
      const exitStart = timing ? num(timing.exitStart, 1e9) : 1e9;
      const random = rng.rngFor(seed, letterRef.path || `i${index}`, 'bg');
      const visible = !vary || vary.visible !== false;
      const inactive = !visible || mode === 'none';
      const tIn = enterStart - lead;
      const pin = inactive ? 1 : clamp01((local - tIn) / duration);
      const pout = exitMode === 'withText' ? num(state.px, 0) : clamp01((local - exitStart) / exitDuration);
      let opacity = baseOpacity;
      let scaleX = 1;
      let scaleY = 1;
      let offsetX = num(offset.x, 0);
      let offsetY = num(offset.y, 0);
      let rot = rotation;
      // -1 is the "no clip" sentinel the BG_FRAG clip plane reads (v_clip >
      // -0.999 skips it). Only `wipe` walks it up from -1 to 1; every other
      // motion must keep it there, or the plane cuts the shape at its centre
      // and a circle / heart / square is drawn as its right half.
      let clip = -1;
      const entry = Math.max(1e-4, num(motionParams.duration, 0.35));
      const e = clamp01(pin);
      const smooth = easing.get(motionParams.ease || 'easeOutCubic')(e);
      if (mode === 'follow') {
        // the letter opacity is applied once at the end
      } else if (mode === 'fade') {
        opacity *= smooth;
      } else if (mode === 'pop') {
        const s = backOut(e, clamp01(num(motionParams.overshoot, 0.15)));
        scaleX *= s;
        scaleY *= s;
        opacity *= Math.min(1, pin * 4);
      } else if (mode === 'stamp') {
        const from = Math.max(1, num(motionParams.from, 1.8));
        const s = 1 + (from - 1) * (1 - expoOut(e));
        scaleX *= s;
        scaleY *= s;
        if (pin >= 0.85 && pin <= 0.95) {
          scaleY *= 0.94;
        }
        opacity *= Math.min(1, pin * 3);
      } else if (mode === 'wipe') {
        clip = -1 + 2 * smooth;
      } else if (mode === 'spin') {
        const turns = num(motionParams.turns, 0.25);
        scaleX *= smooth;
        scaleY *= smooth;
        rot += (1 - smooth) * turns * 360;
        opacity *= smooth;
      } else if (mode === 'grow') {
        if (motionParams.axis === 'y') scaleY *= smooth;
        else scaleX *= smooth;
      } else if (mode === 'flicker') {
        const flickers = Math.max(1, num(motionParams.flickers, 4));
        const k = Math.floor(pin * flickers * 3);
        const on = hash01(k * 12.9898, seed * 7.233) < 0.25 + 0.75 * pin ? 1 : 0.08;
        opacity *= pin >= 1 ? 1 : on;
      } else if (mode === 'bleed') {
        const growth = Math.pow(e, 0.7);
        scaleX *= growth;
        scaleY *= growth;
        opacity *= growth;
      } else if (mode === 'float') {
        opacity *= smooth;
        offsetY += (1 - smooth) * num(motionParams.rise, 0.3);
      } else if (mode === 'fall') {
        const from = num(motionParams.from, 0.6);
        offsetY -= (1 - bounceOut(e)) * from;
        const squash = bump(pin, 0.9, 0.1);
        scaleY *= 1 - 0.15 * squash;
        opacity *= Math.min(1, pin * 5);
      } else if (mode === 'draw') {
        // the outline is traced first, then the fill appears (see below)
        opacity *= e > 0.001 ? 1 : 0;
      }
      if (mode === 'follow' || exitMode === 'withText') {
        opacity *= num(state.opacity, 1);
      }
      if (exitMode === 'withText') {
        // already applied above
      } else if (exitMode === 'fade') {
        opacity *= 1 - clamp01(pout);
      } else if (exitMode === 'shrink') {
        const shrink = 1 - easing.get('easeInCubic')(clamp01(pout));
        scaleX *= shrink;
        scaleY *= shrink;
      }
      // hold shimmer, timed from the end of the entry
      const h = Math.max(0, local - (tIn + duration));
      if (holdMode !== 'none' && h > 0 && pout < 1) {
        if (holdMode === 'pulse') {
          const s = 1 + holdAmount * 0.1 * Math.sin(h * Math.PI * 2 * 0.8 + random() * 0.4);
          scaleX *= s;
          scaleY *= s;
        } else if (holdMode === 'wobble') {
          rot += holdAmount * 8 * Math.sin(h * 2.1 + random() * 6);
        } else if (holdMode === 'spin') {
          rot += holdAmount * 90 * h;
        } else if (holdMode === 'beat') {
          const beatEnv = typeof opts.beatEnv === 'function' ? opts.beatEnv(local) : 0.5 + 0.5 * Math.sin(h * Math.PI * 2 * 1.6);
          const s = 1 + 0.08 * holdAmount * beatEnv;
          scaleX *= s;
          scaleY *= s;
        } else if (holdMode === 'heartbeat') {
          const bpm = num(opts.bpm, 0) > 0 ? num(opts.bpm, 72) : 72;
          const phase = ((local * bpm) / 60) % 1;
          const s = 1 + holdAmount * (bump(phase, 0, 0.1) + 0.6 * bump(phase, 0.18, 0.1));
          scaleX *= s;
          scaleY *= s;
        } else if (holdMode === 'shiver') {
          offsetX += holdAmount * 0.03 * (hash01(Math.floor(local * 30), index) - 0.5);
          offsetY += holdAmount * 0.03 * (hash01(Math.floor(local * 30) + 7, index) - 0.5);
        } else if (holdMode === 'drift') {
          offsetY += holdAmount * 0.05 * h;
        }
      }
      const shapeIndex = isBg ? typeIndex : vary && vary.shapeIndex != null ? vary.shapeIndex : typeIndex;
      const sizeMul = isBg ? [1, 1] : vary && vary.sizeMul ? vary.sizeMul : [1, 1];
      const offsetAdd = isBg ? [0, 0] : vary && vary.offsetAdd ? vary.offsetAdd : [0, 0];
      const rotAdd = isBg ? 0 : vary && vary.rotAdd ? vary.rotAdd : 0;
      const varyColor = vary && vary.color ? vary.color : null;
      const wobbleSeed = (num(shapeParams.seedShift, 0) * 131 + index * 17.13) % 1000;
      // the draw motion walks the trim end around the outline and only fills
      // the shape once the line is complete
      let trim = trimRange;
      let fill = fillBase;
      if (mode === 'draw') {
        trim = [trimRange[0], trimRange[0] + (trimRange[1] - trimRange[0]) * smooth, trimRange[2]];
        fill = fillBase * clamp01((smooth - 0.6) / 0.4);
      }
      states.push({
        sizeX: width * sizeMul[0],
        sizeY: height * sizeMul[1],
        offsetX: offsetX + offsetAdd[0],
        offsetY: offsetY + offsetAdd[1],
        rotation: rot + rotAdd,
        shapeIndex,
        motionScaleX: scaleX,
        motionScaleY: scaleY,
        opacity: clamp01(opacity) * (vary && vary.opacity != null ? clamp01(vary.opacity) : 1),
        clip,
        color: varyColor || [1, 1, 1, 1],
        wobbleSeed,
        rotateWithLetter: shapeParams.rotateWithLetter !== false,
        scaleWithLetter: shapeParams.scaleWithLetter !== false,
        fgColor: vary && vary.fgColor ? vary.fgColor : null,
        params: shapeParams,
        trim,
        dash,
        stroke: mode === 'draw' && stroke <= 0.001 ? 0.07 : stroke,
        fill,
      });
    }
    return { unit, type: shapeInstance.type, shapeIndex: typeIndex, motion: mode, states, params: shapeParams, motionParams, group };
  }

  return {
    SHAPES,
    SHAPE_TYPES,
    BG_SHAPE_TYPES,
    ORN_SHAPE_TYPES,
    VARY_MODES,
    capBackground,
    cellMetrics,
    cellMetricsFor,
    inkBoxFor,
    evaluateBg,
    defaultInstance,
    bgColorOf,
    isBackground,
    splitStyle,
  };
});
