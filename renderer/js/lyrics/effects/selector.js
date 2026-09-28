(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./registry'));
  else {
    root.SA = root.SA || {};
    root.SA.selector = factory(root.SA.fx);
  }
})(typeof self !== 'undefined' ? self : this, function (fx) {
  'use strict';

  const TAU = Math.PI * 2;

  function clamp(value, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return min;
    return number < min ? min : number > max ? max : number;
  }

  function clamp01(value) {
    return clamp(value, 0, 1);
  }

  function num(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function smoothstep(edge0, edge1, x) {
    if (edge1 <= edge0) return x < edge0 ? 0 : 1;
    const t = clamp01((x - edge0) / (edge1 - edge0));
    return t * t * (3 - 2 * t);
  }

  function emOf(info) {
    const size = info && info.letter && Number(info.letter.size);
    if (size > 0) return size;
    return (info && info.shortSide ? info.shortSide : 1080) * 0.06;
  }

  // --- selector ---------------------------------------------------------------

  const BASED_ON = ['letter', 'word', 'line'];
  const SHAPES = ['square', 'rampUp', 'rampDown', 'triangle', 'round', 'smooth'];
  const SWEEPS = ['once', 'loop', 'pingpong', 'beat'];

  const SELECTOR_PARAMS = [
    // the band the selector paints: start / end in 0..1 of the text, the offset
    // slides it, the width turns it into a narrow travelling band
    { key: 'selBasedOn', kind: 'select', options: BASED_ON, default: 'letter', section: 'selector' },
    { key: 'selShape', kind: 'select', options: SHAPES, default: 'square', section: 'selector' },
    { key: 'selStart', kind: 'number', min: 0, max: 1, step: 0.01, default: 0, section: 'selector' },
    { key: 'selEnd', kind: 'number', min: 0, max: 1, step: 0.01, default: 1, section: 'selector' },
    { key: 'selWidth', kind: 'number', min: 0, max: 1, step: 0.01, default: 0, section: 'selector' },
    { key: 'selOffset', kind: 'number', min: -1, max: 1, step: 0.01, default: 0, section: 'selector' },
    { key: 'selSweep', kind: 'select', options: SWEEPS, default: 'once', section: 'selector' },
    { key: 'selSpeed', kind: 'number', min: 0.05, max: 4, step: 0.05, default: 0.5, section: 'selector' },
    { key: 'selRandom', kind: 'bool', default: false, section: 'selector' },
    { key: 'selSeed', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.5, section: 'selector' },
    { key: 'selEaseHigh', kind: 'number', min: -100, max: 100, step: 5, default: 0, section: 'selector' },
    { key: 'selEaseLow', kind: 'number', min: -100, max: 100, step: 5, default: 0, section: 'selector' },
    { key: 'selAmount', kind: 'number', min: -1, max: 1, step: 0.01, default: 1, section: 'selector' },
  ];

  const PROP_PARAMS = [
    { key: 'dx', kind: 'number', min: -6, max: 6, step: 0.05, default: 0, unit: 'em', random: [-1.2, 1.2], section: 'transform' },
    { key: 'dy', kind: 'number', min: -6, max: 6, step: 0.05, default: 0, unit: 'em', random: [-1.2, 1.2], section: 'transform' },
    { key: 'scale', kind: 'number', min: 0, max: 3, step: 0.02, default: 1, random: [0.3, 1.4], section: 'transform' },
    { key: 'rotate', kind: 'number', min: -360, max: 360, step: 5, default: 0, random: [-35, 35], section: 'transform' },
    { key: 'skew', kind: 'number', min: -60, max: 60, step: 1, default: 0, section: 'transform' },
    { key: 'tilt', kind: 'number', min: -180, max: 180, step: 5, default: 0, section: 'transform' },
    { key: 'axis', kind: 'select', options: ['x', 'y'], default: 'y', section: 'transform' },
    { key: 'opacity', kind: 'number', min: 0, max: 1, step: 0.01, default: 1, random: [0, 0.6], section: 'look' },
    { key: 'blur', kind: 'number', min: 0, max: 40, step: 0.5, default: 0, random: [4, 20], section: 'look' },
    { key: 'flash', kind: 'number', min: 0, max: 1, step: 0.01, default: 0, section: 'look' },
    { key: 'colorMix', kind: 'number', min: 0, max: 1, step: 0.01, default: 0, section: 'look' },
    { key: 'wipe', kind: 'select', options: ['none', 'left', 'right', 'up', 'down', 'iris', 'diagonal'], default: 'none', section: 'mask' },
    { key: 'wipeSoft', kind: 'number', min: 0, max: 0.5, step: 0.01, default: 0.05, section: 'mask' },
    { key: 'mask', kind: 'select', options: ['none', 'baseline', 'capline'], default: 'none', section: 'mask' },
    { key: 'tracking', kind: 'number', min: -3, max: 3, step: 0.05, default: 0, section: 'spacing' },
    { key: 'trackAxis', kind: 'select', options: ['x', 'y'], default: 'x', section: 'spacing' },
  ];

  const WIPE_MODES = { none: 0, left: 0, right: 1, up: 2, down: 3, iris: 4, diagonal: 5 };

  function normalizeProps(params) {
    const source = params || {};
    return {
      ...source,
      dx: clamp(num(source.dx, 0), -6, 6),
      dy: clamp(num(source.dy, 0), -6, 6),
      scale: clamp(num(source.scale, 1), 0, 3),
      rotate: clamp(num(source.rotate, 0), -360, 360),
      skew: clamp(num(source.skew, 0), -60, 60),
      tilt: clamp(num(source.tilt, 0), -180, 180),
      axis: source.axis === 'x' ? 'x' : 'y',
      opacity: clamp01(num(source.opacity, 1)),
      blur: clamp(num(source.blur, 0), 0, 40),
      flash: clamp01(num(source.flash, 0)),
      colorMix: clamp01(num(source.colorMix, 0)),
      wipe: ['none', 'left', 'right', 'up', 'down', 'iris', 'diagonal'].includes(source.wipe) ? source.wipe : 'none',
      wipeSoft: clamp(num(source.wipeSoft, 0.05), 0, 0.5),
      mask: ['none', 'baseline', 'capline'].includes(source.mask) ? source.mask : 'none',
      tracking: clamp(num(source.tracking, 0), -3, 3),
      trackAxis: source.trackAxis === 'y' ? 'y' : 'x',
    };
  }

  function normalizeSelector(params) {
    const source = params || {};
    return {
      basedOn: BASED_ON.includes(source.selBasedOn) ? source.selBasedOn : 'letter',
      shape: SHAPES.includes(source.selShape) ? source.selShape : 'square',
      sweep: SWEEPS.includes(source.selSweep) ? source.selSweep : 'once',
      start: clamp01(source.selStart == null ? 0 : source.selStart),
      end: clamp01(source.selEnd == null ? 1 : source.selEnd),
      width: clamp01(source.selWidth == null ? 0 : source.selWidth),
      offset: clamp(num(source.selOffset, 0), -1, 1),
      speed: clamp(num(source.selSpeed, 0.5), 0.05, 4),
      random: source.selRandom === true,
      seed: clamp01(source.selSeed == null ? 0.5 : source.selSeed),
      easeHigh: clamp(num(source.selEaseHigh, 0), -100, 100),
      easeLow: clamp(num(source.selEaseLow, 0), -100, 100),
      amount: clamp(num(source.selAmount, 1), -1, 1),
    };
  }

  // --- randomized order -------------------------------------------------------

  function unitKey(seed, index) {
    const value = Math.sin((index + 1) * 12.9898 + seed * 78.233) * 43758.5453;
    return value - Math.floor(value);
  }

  const shuffledCache = new Map();

  function shuffledRank(seed, index, count) {
    const key = `${seed.toFixed(3)}|${count}`;
    let order = shuffledCache.get(key);
    if (!order) {
      order = [];
      for (let i = 0; i < count; i += 1) order.push({ index: i, key: unitKey(seed, i) });
      order.sort((a, b) => a.key - b.key || a.index - b.index);
      if (shuffledCache.size > 64) shuffledCache.clear();
      shuffledCache.set(key, order);
    }
    const at = order.findIndex((entry) => entry.index === index);
    return at < 0 ? index : at;
  }

  // --- units ------------------------------------------------------------------

  function unitAt(info, basedOn) {
    const units = info && info.units;
    if (units && units[basedOn]) return units[basedOn];
    // effects outside the beat evaluator (layers, tests) fall back to letters
    const index = info && Number.isFinite(info.i) ? info.i : 0;
    const count = info && Number.isFinite(info.N) ? info.N : 1;
    return { rank: index, count };
  }

  function unitPosition(info, sel) {
    const unit = unitAt(info, sel.basedOn);
    const count = Math.max(1, unit.count);
    let index = clamp(unit.rank, 0, count - 1);
    if (sel.random) index = shuffledRank(sel.seed, index, count);
    return count > 1 ? index / (count - 1) : 0;
  }

  function unitSpan(info, sel) {
    const unit = unitAt(info, sel.basedOn);
    const count = Math.max(1, unit.count);
    const size = 1 / count;
    const start = unitPosition(info, sel) * (1 - size);
    return { a: start, b: start + size };
  }

  function shapeWeight(t, sel, coverage) {
    const high = clamp(sel.easeHigh, -100, 100) / 100;
    const low = clamp(sel.easeLow, -100, 100) / 100;
    const value = clamp01(t);
    if (sel.shape === 'square') {
      // a square band keeps each unit's own coverage: a half covered letter is
      // half affected. Ease high / low soften the two edges of the band.
      if (high <= 0 && low <= 0) return coverage;
      const edgeHigh = Math.max(0.001, 0.5 * (1 - high));
      const edgeLow = Math.max(0.001, 0.5 * (1 - low));
      return coverage * smoothstep(0, edgeHigh, value) * (1 - smoothstep(1 - edgeLow, 1, value));
    }
    if (sel.shape === 'rampUp') return value;
    if (sel.shape === 'rampDown') return 1 - value;
    if (sel.shape === 'triangle') return 1 - Math.abs(2 * value - 1);
    if (sel.shape === 'round') return Math.sin(Math.PI * value);
    const edgeHigh = Math.max(0.001, 0.5 * (1 - high));
    const edgeLow = Math.max(0.001, 0.5 * (1 - low));
    return smoothstep(0, edgeHigh, value) * (1 - smoothstep(1 - edgeLow, 1, value));
  }

  function beatRate(info) {
    const bpm = info && info.audioFeatures && Number(info.audioFeatures.bpm);
    return bpm > 0 ? bpm / 60 : 2;
  }

  // the band [a, b] for the current progress / time
  function bandFor(sel, progress, time) {
    const rate = sel.sweep === 'beat' ? beatRate(sel.info) : sel.speed;
    let offset = sel.offset;
    if (sel.sweep === 'once') offset += clamp01(progress);
    else if (sel.sweep === 'pingpong') {
      const phase = (time * rate) % 2;
      offset += phase <= 1 ? phase : 2 - phase;
    } else offset += (time * rate) % 1;
    if (sel.width > 0) {
      const center = (sel.start + sel.end) / 2 + offset;
      return { a: center - sel.width / 2, b: center + sel.width / 2 };
    }
    const a = sel.start + offset;
    const b = sel.end + offset;
    return a <= b ? { a, b } : { a: b, b: a };
  }

  // selector weight for one unit (0..1, signed by amount)
  function selectAt(info, progress, sel, time) {
    if (!sel.amount) return 0;
    const band = bandFor(sel, progress, time);
    const span = unitSpan(info, sel);
    const size = Math.max(1e-6, span.b - span.a);
    const overlap = Math.max(0, Math.min(band.b, span.b) - Math.max(band.a, span.a)) / size;
    const width = Math.max(1e-6, band.b - band.a);
    const t = ((span.a + span.b) / 2 - band.a) / width;
    return clamp01(shapeWeight(t, sel, clamp01(overlap))) * clamp(sel.amount, -1, 1);
  }

  // --- property application ---------------------------------------------------

  // spreads the letters apart around the block centre (a title's tracking):
  // the offset is already in px, so the factor scales it directly
  function applyTracking(state, info, factor, axis) {
    if (!factor) return;
    const center = (info && info.blockCenter) || { x: 0, y: 0 };
    const x = (info && Number.isFinite(info.letterX) ? info.letterX : center.x) - center.x;
    const y = (info && Number.isFinite(info.letterY) ? info.letterY : center.y) - center.y;
    if (axis === 'y') state.y += y * factor;
    else state.x += x * factor;
  }

  // applies the transform / look properties with weight t
  function applyProps(state, t, props, info) {
    if (t <= 0.0001) return;
    const em = emOf(info);
    if (props.dx) state.x += props.dx * em * t;
    if (props.dy) state.y += props.dy * em * t;
    if (props.scale !== 1) {
      const scale = 1 + (props.scale - 1) * t;
      state.scaleX *= scale;
      state.scaleY *= scale;
    }
    if (props.rotate) state.rot += props.rotate * t;
    if (props.skew) state.skewX += props.skew * t;
    if (props.tilt) {
      if (props.axis === 'x') state.tiltX += props.tilt * t;
      else state.tiltY += props.tilt * t;
    }
    if (props.opacity !== 1) state.opacity *= 1 + (props.opacity - 1) * t;
    if (props.blur) state.blur = Math.max(state.blur || 0, props.blur * t);
    if (props.flash) state.flash = Math.max(state.flash || 0, props.flash * t);
    if (props.colorMix) state.colorMix = Math.max(state.colorMix || 0, props.colorMix * t);
    // wipe / mask: the selected units are hidden by the shader (row 8) until
    // their weight has fallen back to zero, which is what an entrance looks
    // like when the range selector drives a wipe instead of a transform
    if (props.wipe && props.wipe !== 'none') {
      state.wipeMode = WIPE_MODES[props.wipe] == null ? 0 : WIPE_MODES[props.wipe];
      state.wipeSoft = props.wipeSoft;
      state.visibleFrac = Math.min(state.visibleFrac == null ? 1 : state.visibleFrac, 1 - t);
    }
    if (props.mask && props.mask !== 'none') {
      // the mask line stays at the home position while the letters travel: the
      // fraction of the cell that stays visible follows the applied dy
      const dy = props.dy * em * t;
      const height = Math.max(1, (info && info.letter && info.letter.local && info.letter.local.h) || em);
      const lift = props.mask === 'capline' ? height * 0.35 : 0;
      state.maskFrac = Math.min(state.maskFrac == null ? 1 : state.maskFrac, clamp01(1 - (dy - lift) / height));
    }
    if (props.tracking) applyTracking(state, info, props.tracking * t, props.trackAxis);
  }

  // --- registry ---------------------------------------------------------------

  fx.register({
    group: 'hold',
    type: 'rangeSelector',
    tags: ['pro', 'selector', 'text'],
    pack: 'pro',
    cost: 2,
    params: [...SELECTOR_PARAMS, ...PROP_PARAMS],
    normalize: normalizeProps,
    cpu(state, h, env, params, rng, info) {
      const sel = { ...normalizeSelector(params), info };
      if (!sel.amount || env <= 0.0001) return;
      const weight = selectAt(info, 0, sel, h) * clamp01(env);
      applyProps(state, weight, normalizeProps(params), info);
    },
  });

  function registerReveal(group, mode) {
    fx.register({
      group,
      type: 'rangeReveal',
      tags: ['pro', 'selector', 'text'],
      pack: 'pro',
      cost: 2,
      params: [...SELECTOR_PARAMS, ...PROP_PARAMS],
      normalize: normalizeProps,
      cpu(state, p, params, rng, info) {
        const sel = { ...normalizeSelector(params), info };
        // the band slides over the string as the beat progresses: the units it
        // still covers are in their start state, the rest have landed
        const progress = clamp01(p);
        const sweep = { ...sel, sweep: 'once', offset: sel.offset + (mode === 'in' ? 1 - progress : progress) };
        const t = 1 - selectAt(info, 0, sweep, 0);
        applyProps(state, t, normalizeProps(params), info);
      },
    });
  }

  registerReveal('enter', 'in');
  registerReveal('exit', 'out');

  const TRACKING_PARAMS = [
    { key: 'amount', kind: 'number', min: -2, max: 3, step: 0.02, default: 0.5, random: [0.2, 1.1], section: 'spacing' },
    { key: 'mode', kind: 'select', options: ['pulse', 'breathe', 'beat'], default: 'breathe', section: 'spacing' },
    { key: 'freq', kind: 'number', min: 0.05, max: 4, step: 0.05, default: 0.4, section: 'spacing' },
    { key: 'trackAxis', kind: 'select', options: ['x', 'y'], default: 'x', section: 'spacing' },
  ];

  function trackingWave(params, h, info) {
    const mode = params.mode === 'pulse' || params.mode === 'beat' ? params.mode : 'breathe';
    const rate = mode === 'beat' ? beatRate(info) : clamp(num(params.freq, 0.4), 0.05, 4);
    const phase = h * rate;
    if (mode === 'breathe') return Math.sin(TAU * phase);
    return 0.5 - 0.5 * Math.cos(TAU * phase);
  }

  function trackingAmount(params) {
    return clamp(num(params.amount, 0.5), -2, 3);
  }

  function trackingAxis(params) {
    return params.trackAxis === 'y' ? 'y' : 'x';
  }

  // the entrance / exit spread the letters from the block centre and land them
  for (const [group, mode] of [['enter', 'in'], ['exit', 'out']]) {
    fx.register({
      group,
      type: 'tracking',
      tags: ['pro', 'selector', 'text'],
      pack: 'pro',
      cost: 1,
      params: TRACKING_PARAMS,
      normalize(params) {
        return { ...params, amount: trackingAmount(params), trackAxis: trackingAxis(params) };
      },
      cpu(state, p, params, rng, info) {
        const amount = trackingAmount(params);
        if (!amount) return;
        const progress = clamp01(p);
        applyTracking(state, info, amount * (mode === 'in' ? 1 - progress : progress), trackingAxis(params));
      },
    });
  }

  fx.register({
    group: 'hold',
    type: 'tracking',
    tags: ['pro', 'selector', 'text'],
    pack: 'pro',
    cost: 1,
    params: TRACKING_PARAMS,
    normalize(params) {
      return { ...params, amount: trackingAmount(params), trackAxis: trackingAxis(params) };
    },
    cpu(state, h, env, params, rng, info) {
      const amount = trackingAmount(params);
      if (!amount || env <= 0.0001) return;
      applyTracking(state, info, amount * trackingWave(params, h, info) * clamp01(env), trackingAxis(params));
    },
  });

  return {
    BASED_ON,
    SHAPES,
    SWEEPS,
    WIPE_MODES,
    SELECTOR_PARAMS,
    PROP_PARAMS,
    TRACKING_PARAMS,
    normalizeSelector,
    normalizeProps,
    selectAt,
    shapeWeight,
    unitAt,
    unitPosition,
    unitSpan,
    shuffledRank,
    bandFor,
    applyTracking,
    applyProps,
    trackingWave,
    beatRate,
    emOf,
  };
});
