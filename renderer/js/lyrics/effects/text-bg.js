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

  for (const type of SHAPE_TYPES) {
    fx.register({
      group: 'bgShape',
      type,
      tags: type === 'none' ? ['basic'] : [],
      params: paramsFor(type),
      cost: type === 'none' ? 0 : 2,
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

  // the background fill / edge reuse the foreground effect libraries
  if (typeof fx.alias === 'function') {
    fx.alias('bgFill', 'fill');
    fx.alias('bgEdge', 'edge');
  }

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
  // background may span at most 1.25 cells and an em background at most the
  // beat's text box width + 0.6 em, so a stored project cannot paint a giant
  // slab over the frame. `params.maxScale` (an explicit author value) wins.
  // The states are clamped in place and returned.
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
      const explicit = Number(state.params && state.params.maxScale);
      const hasExplicit = Number.isFinite(explicit) && explicit > 0;
      const scaleX = Math.abs(Number(state.motionScaleX) || 1) || 1;
      const scaleY = Math.abs(Number(state.motionScaleY) || 1) || 1;
      if (unit === 'em') {
        // the em limit is expressed in the beat's own font size
        const maxX = hasExplicit ? explicit : emPx > 0 && width > 0 ? width / emPx + emExtra : fallback;
        const maxY = hasExplicit ? explicit : emPx > 0 && height > 0 ? height / emPx + emExtra : fallback;
        if (state.sizeX * scaleX > maxX) state.sizeX = maxX / scaleX;
        if (state.sizeY * scaleY > maxY) state.sizeY = maxY / scaleY;
      } else {
        const cap = hasExplicit ? explicit : fallback;
        if (state.sizeX * scaleX > cap) state.sizeX = cap / scaleX;
        if (state.sizeY * scaleY > cap) state.sizeY = cap / scaleY;
      }
    }
    return states;
  }
  // The cell is the advance box: horizontal text uses advance x size, vertical
  // text uses the vertical advance. The returned offset is the vector from the
  // ink bbox centre (glyph-local origin) to the cell centre, in px.
  function cellMetrics(letter) {
    const size = num(letter.size, 1) || 1;
    const advance = num(letter.advanceWithSpacing, null) != null ? num(letter.advanceWithSpacing, 1) : num(letter.advance, 1);
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

  // CPU state for every letter's background quad. The GPU only applies the
  // transform, the SDF shape and the fill / edge passes.
  function evaluateBg(shape, motion, letters, variation, timings, local, options) {
    const opts = options || {};
    const shapeInstance = shape && shape.type ? shape : defaultInstance('bgShape', 'none');
    if (!shapeInstance.type || shapeInstance.type === 'none' || !letters.length) return null;
    const shapeParams = { ...fx.paramDefaults('bgShape', shapeInstance.type), ...(shapeInstance.params || {}) };
    const motionInstance = motion && motion.type ? motion : defaultInstance('bgMotion', 'follow');
    const motionParams = { ...fx.paramDefaults('bgMotion', motionInstance.type), ...(motionInstance.params || {}) };
    const unit = shapeParams.unit === 'em' ? 'em' : 'cell';
    const typeIndex = SHAPES[shapeInstance.type] == null ? 0 : SHAPES[shapeInstance.type];
    const baseOpacity = clamp01(shapeParams.opacity == null ? 1 : shapeParams.opacity);
    const lockAspect = shapeParams.lockAspect !== false;
    const width = Math.max(0.05, num(shapeParams.width, 1.15));
    const height = lockAspect ? width : Math.max(0.05, num(shapeParams.height, 1.15));
    const rotation = num(shapeParams.rotation, 0);
    const offset = shapeParams.offset || { x: 0, y: 0 };
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
      let clip = 0;
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
      const shapeIndex = vary && vary.shapeIndex != null ? vary.shapeIndex : typeIndex;
      const sizeMul = vary && vary.sizeMul ? vary.sizeMul : [1, 1];
      const offsetAdd = vary && vary.offsetAdd ? vary.offsetAdd : [0, 0];
      const rotAdd = vary && vary.rotAdd ? vary.rotAdd : 0;
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
        opacity: clamp01(opacity),
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
    return { unit, type: shapeInstance.type, shapeIndex: typeIndex, motion: mode, states, params: shapeParams, motionParams };
  }

  return {
    SHAPES,
    SHAPE_TYPES,
    VARY_MODES,
    capBackground,
    cellMetrics,
    evaluateBg,
    defaultInstance,
    bgColorOf,
  };
});
