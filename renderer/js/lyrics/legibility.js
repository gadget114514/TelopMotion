(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../color'), require('./effects/registry'), require('./motion'));
  else {
    root.SA = root.SA || {};
    root.SA.legibility = factory(root.SA.color, root.SA.fx, root.SA.motion);
  }
})(typeof self !== 'undefined' ? self : this, function (color, fx, motion) {
  'use strict';

  // The legibility contract the generators must satisfy before a look is
  // adopted. `check(style, ctx)` reports what breaks, `repair(style, ctx)`
  // returns the closest passing style. Both are pure and consume no random, so
  // the legacy draws (weird 0 / fear 0) stay byte-identical: a generated style
  // that already passes is returned by reference.
  //
  // Contract:
  //   1. text contrast       >= 4.5:1 against the background and the text
  //                          background (fill + edge colours)
  //   2. static window       >= max(0.8s, 55% of the cue): every letter stays
  //                          undeformed, unblurred, opaque, upright, unscaled
  //   3. readable tags       degrade / overlap / glitch / dissolve only for the
  //                          allow-listed types, post stays inside its caps
  //   4. size                >= 4.5% of the frame height
  //   5. text background     inside the clamp the engine applies (P-E-2)
  //   6. figures             cover at most 15% of the text box (or are
  //                          recoloured and dimmed)

  const MIN_CONTRAST = 4.5;
  const MIN_SIZE_RATIO = 0.045;
  const STATIC_SECONDS = 0.8;
  const STATIC_SHARE = 0.55;
  const SAMPLES = 24;
  const BAD_TAGS = new Set(['degrade', 'overlap', 'glitch', 'dissolve']);
  const FIGURE_OVERLAP = 0.15;
  const FIGURE_FALLBACK_OPACITY = 0.35;
  const BG_CELL_MAX = 1.25;
  const BG_EM_MAX = 1.6;
  const STYLE_GROUPS = ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'background', 'bgShape', 'bgFill', 'bgEdge', 'bgMotion', 'repeat'];
  const STACK_GROUPS = new Set(['hold', 'edge', 'post', 'bgEdge']);

  // post effects that can hide the text: caps on the parameters the shader
  // reads. A style over the cap is repaired by lowering the parameter.
  const POST_CAPS = {
    pixelate: { size: 12 },
    halftone: { dotSize: 10 },
    digitalNoise: { density: 0.25, blockSize: 16 },
    glitchBlocks: { intensity: 0.4, blockSize: 40 },
    dataSmear: { amount: 0.35 },
    scanTear: { amount: 0.3, lines: 40 },
    vhsTracking: { amount: 0.35, noise: 0.35 },
    pixelSort: { length: 20 },
    spinBlur: { amount: 0.25 },
    zoomBlur: { amount: 0.25 },
    motionBlur: { amount: 0.3 },
    echoTrail: { copies: 3 },
    turbulentDisplace: { amount: 0.3 },
    waveWarp: { amount: 0.3 },
    twirl: { amount: 0.25 },
    cameraHandheld: { amount: 0.2 },
    cameraPunch: { amount: 0.25 },
  };
  // post effects that never belong on a readable look
  const POST_FORBIDDEN = new Set(['kaleidoscope']);

  function clamp01(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.max(0, Math.min(1, number));
  }

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function lazy(name) {
    if (typeof SA !== 'undefined' && SA && SA[name]) return SA[name];
    try {
      return require(`./${name}`);
    } catch {
      return null;
    }
  }

  // the readable end of the tag-gated vocabulary: the union of the weird and
  // fear allow lists the generators already use
  function readableTags() {
    const set = new Set();
    if (typeof SA !== 'undefined' && SA && SA.moods) {
      for (const name of SA.moods.WEIRD_TAG_OK || []) set.add(name);
      for (const name of SA.moods.FEAR_TAG_OK || []) set.add(name);
      return set;
    }
    try {
      const moods = require('./moods');
      for (const name of moods.WEIRD_TAG_OK || []) set.add(name);
      for (const name of moods.FEAR_TAG_OK || []) set.add(name);
    } catch {
      // without moods fall back to the conservative future set: every type
      // with a bad tag fails the check
    }
    return set;
  }

  function paletteOf(style, ctx) {
    const palette = (style && style.palette && style.palette.colors) || (ctx && ctx.palette) || [];
    return Array.isArray(palette) ? palette : [];
  }

  function parseHex(value) {
    try {
      return value ? color.parse(value) : null;
    } catch {
      return null;
    }
  }

  function contrast(a, b) {
    const first = parseHex(a);
    const second = parseHex(b);
    if (!first || !second) return Infinity;
    return color.contrastRatio(first, second);
  }

  function colorRefHex(value, palette) {
    if (!value) return null;
    if (value.kind === 'palette') return palette[Math.abs(Math.floor(value.index || 0)) % palette.length] || null;
    if (value.kind === 'gradient') {
      const stops = Array.isArray(value.stops) ? value.stops : [];
      const hexes = stops.map((stop) => {
        if (!stop) return null;
        if (stop.paletteIndex != null) return palette[Math.abs(Math.floor(stop.paletteIndex)) % palette.length] || null;
        return stop.color || null;
      }).filter(Boolean);
      return hexes[0] || null;
    }
    if (typeof value.value === 'string') return value.value;
    return null;
  }

  function textColors(style, ctx) {
    const palette = paletteOf(style, ctx);
    const out = [];
    const fill = style && style.color && style.color.fill;
    if (fill) {
      if (fill.kind === 'palette') {
        const hex = palette[Math.abs(Math.floor(fill.index || 0)) % palette.length];
        if (hex) out.push(hex);
      } else if (fill.kind === 'gradient') {
        for (const stop of fill.stops || []) {
          if (!stop) continue;
          const hex = stop.paletteIndex != null ? palette[Math.abs(Math.floor(stop.paletteIndex)) % palette.length] : stop.color;
          if (hex) out.push(hex);
        }
      } else if (typeof fill.value === 'string') {
        out.push(fill.value);
      }
    }
    if (!out.length && palette[2]) out.push(palette[2]);
    return out;
  }

  function bgShapeActive(style) {
    const shape = style && style.bgShape;
    return !!(shape && shape.type && shape.type !== 'none');
  }

  function bgColors(style, ctx) {
    const palette = paletteOf(style, ctx);
    const params = (style && style.bgShape && style.bgShape.params) || {};
    const vary = Array.isArray(params.varyColors) && params.varyColors.length ? params.varyColors : null;
    if (vary) return vary.slice();
    return [palette[0] || '#000000'];
  }

  function instanceList(style, group) {
    const value = style && style[group];
    if (!value) return [];
    const list = Array.isArray(value) ? value : [value];
    return list.filter((instance) => instance && instance.type);
  }

  function styleInstances(style) {
    const out = [];
    for (const group of STYLE_GROUPS) {
      for (const instance of instanceList(style, group)) out.push({ group, type: instance.type, instance });
    }
    return out;
  }

  function deformScalar(state) {
    let max = 0;
    for (const item of (state && state.deform) || []) {
      if (!item || typeof item !== 'object') continue;
      const amount = Math.abs(Number(item.amount) || 0);
      const value = item.type === 'twist' ? amount / 90 : amount;
      if (value > max) max = value;
    }
    return max;
  }

  // ---------------------------------------------------------------------------
  // static window

  // A synthetic scene for a style without one: `count` letters of the style's
  // size in a row, the same shape the effect evaluators expect.
  function sceneFor(style, ctx) {
    const context = ctx || {};
    if (context.scene) return context.scene;
    const frame = context.frame || { width: 1920, height: 1080 };
    const size = Math.max(16, Number(style && style.text && style.text.size) || 96);
    const count = Math.max(2, Math.min(24, Number(context.letterCount) || 12));
    const width = size * 0.6;
    const total = width * count;
    const letters = [];
    for (let i = 0; i < count; i += 1) {
      const pen = i * width - total / 2 + frame.width / 2;
      letters.push({
        path: `cue:legibility/beat:legibility:single0/line:0/word:${i}/letter:0`,
        cueId: 'legibility',
        beatId: 'legibility:single0',
        lineIdx: 0,
        wordIdx: i,
        letterIdx: 0,
        globalIdx: i,
        char: 'M',
        local: { x: pen, y: frame.height / 2 + size / 2, w: width, h: size, cx: pen + width / 2, cy: frame.height / 2 + size * 0.2, penX: pen, penY: frame.height / 2 + size / 2 },
        bbox: { x1: 0, y1: -size, x2: width, y2: 0 },
        outlineLength: 400 + i * 10,
      });
    }
    return {
      cueId: 'legibility',
      beatId: 'legibility:single0',
      kind: 'single',
      start: 0,
      end: 3,
      text: 'M'.repeat(count),
      style,
      letters,
      blockBBox: { x1: frame.width / 2 - total / 2, y1: frame.height / 2 - size / 2, x2: frame.width / 2 + total / 2, y2: frame.height / 2 + size / 2 },
      size,
      direction: 'horizontal',
    };
  }

  function staticWindow(style, ctx) {
    if (!motion || typeof motion.evaluateBeat !== 'function') return { ok: true, seconds: Infinity, share: 1 };
    const context = ctx || {};
    const scene = sceneFor(style, context);
    const span = Math.max(0.4, Number(context.duration) || (scene.end - scene.start) || 3);
    const beat = context.beat || { id: 'legibility:single0', cueId: 'legibility', kind: 'single', start: 0, end: span, text: scene.text };
    const frame = context.frame || { width: 1920, height: 1080 };
    // A sample is "at rest" when the letters are opaque, unblurred and
    // undeformed, and neither rotating nor rescaling from the previous sample.
    // The absolute |rot| / |scale-1| bound applies to the first sample of a
    // run, so a static formation (spiral scale, arc rotation) reads as settled
    // while an ongoing warp does not.
    const base = (state) => {
      const opacity = state.opacity == null ? 1 : state.opacity;
      const blur = state.blur == null ? 0 : Math.abs(state.blur);
      return opacity >= 0.95 && blur <= 0.5 && deformScalar(state) <= 0.02;
    };
    const settled = (state, previous) => {
      if (!base(state)) return false;
      const rot = state.rot || 0;
      const scaleX = state.scaleX == null ? 1 : state.scaleX;
      const scaleY = state.scaleY == null ? 1 : state.scaleY;
      if (!previous) return Math.abs(rot) <= 3 && Math.abs(scaleX - 1) <= 0.1 && Math.abs(scaleY - 1) <= 0.1;
      const prevRot = previous.rot || 0;
      const prevX = previous.scaleX == null ? 1 : previous.scaleX;
      const prevY = previous.scaleY == null ? 1 : previous.scaleY;
      const scaleOk = Math.abs(scaleX / (prevX || 1) - 1) <= 0.02 && Math.abs(scaleY / (prevY || 1) - 1) <= 0.02;
      const rotOk = Math.abs(rot) <= 3 || Math.abs(rot - prevRot) <= 1;
      return scaleOk && rotOk;
    };
    let longest = 0;
    let run = 0;
    let previous = null;
    for (let i = 0; i < SAMPLES; i += 1) {
      const time = beat.start + (span * (i + 0.5)) / SAMPLES;
      let result;
      try {
        result = motion.evaluateBeat({ ...scene, style }, time, { frame, seed: context.seed == null ? 42 : context.seed, beat });
      } catch {
        return { ok: true, seconds: Infinity, share: 1 };
      }
      const letters = (result && result.letters ? result.letters : []);
      const readable = letters.length > 0 && letters.every((state, index) => settled(state, previous ? previous[index] : null));
      run = readable ? run + 1 : 0;
      if (run > longest) longest = run;
      previous = letters;
    }
    const seconds = (longest / SAMPLES) * span;
    return { ok: seconds >= Math.max(STATIC_SECONDS, STATIC_SHARE * span) - 1e-9, seconds, share: seconds / span };
  }

  // ---------------------------------------------------------------------------
  // check

  function check(style, ctx) {
    const reasons = [];
    if (!style) return { ok: true, reasons };
    const context = ctx || {};
    const frame = context.frame || { width: 1920, height: 1080 };
    const palette = paletteOf(style, context);
    const targets = textColors(style, context);
    const backgrounds = bgColors(style, context);
    const shapeActive = bgShapeActive(style);
    const params = (style.bgShape && style.bgShape.params) || {};
    // an almost transparent background does not have to hold the contrast; an
    // auto-contrasted background fixes the per-letter foreground itself, so the
    // declared fill colour is allowed to be anything
    const bgOpacity = params.opacity == null ? 1 : Number(params.opacity);
    const fgAuto = params.fgAutoContrast === true;
    if (shapeActive && bgOpacity >= 0.5 && !fgAuto && targets.length) {
      for (const bg of backgrounds) {
        for (const text of targets) {
          if (contrast(text, bg) < MIN_CONTRAST - 1e-6) {
            reasons.push(`contrast:${text}:${bg}`);
            break;
          }
        }
      }
    }
    // the text itself against the (implicit) backdrop
    if (!shapeActive && targets.length && palette[0]) {
      for (const text of targets) {
        if (contrast(text, palette[0]) < MIN_CONTRAST - 1e-6) {
          reasons.push(`contrast:${text}:${palette[0]}`);
          break;
        }
      }
    }
    // unreadable tags
    const allowed = readableTags();
    for (const { group, type } of styleInstances(style)) {
      const descriptor = fx && fx.get ? fx.get(group, type) : null;
      if (!descriptor) continue;
      if (descriptor.tags.some((tag) => BAD_TAGS.has(tag)) && !allowed.has(type)) reasons.push(`tag:${group}.${type}`);
    }
    // post caps + forbidden
    for (const instance of instanceList(style, 'post')) {
      if (POST_FORBIDDEN.has(instance.type)) {
        reasons.push(`post:${instance.type}`);
        continue;
      }
      const caps = POST_CAPS[instance.type];
      if (!caps) continue;
      const p = instance.params || {};
      for (const [key, cap] of Object.entries(caps)) {
        if (typeof p[key] === 'number' && p[key] > cap) reasons.push(`post-cap:${instance.type}.${key}`);
      }
    }
    // size
    const size = Number(style.text && style.text.size);
    if (Number.isFinite(size) && size > 0 && size / frame.height < MIN_SIZE_RATIO) reasons.push('size');
    // text background clamp (the engine applies the same in P-E-2)
    if (shapeActive) {
      const unit = params.unit === 'em' ? 'em' : 'cell';
      const width = Number(params.width);
      const height = Number(params.height);
      const limit = unit === 'em' ? BG_EM_MAX : BG_CELL_MAX;
      if (Number.isFinite(width) && width > limit) reasons.push(`bg-size:${width}`);
      if (Number.isFinite(height) && height > limit) reasons.push(`bg-size:${height}`);
    }
    // static window (skipped when the caller has no motion, e.g. data checks)
    if (context.motion !== false) {
      const measured = staticWindow(style, context);
      if (!measured.ok) reasons.push(`motion:${measured.seconds.toFixed(2)}s`);
    }
    // figures covering the text
    if (Array.isArray(context.figures) && context.figures.length) {
      for (const spec of context.figures) {
        const ratio = figureOverlap(spec, context);
        if (ratio > FIGURE_OVERLAP + 1e-9) reasons.push(`figure:${ratio.toFixed(2)}`);
      }
    }
    return { ok: reasons.length === 0, reasons };
  }

  // ---------------------------------------------------------------------------
  // repair

  function shrinkHold(style) {
    for (const instance of instanceList(style, 'hold')) {
      const p = instance.params || (instance.params = {});
      for (const [key, value] of Object.entries(p)) {
        if (typeof value !== 'number' || key === 'bpm') continue;
        if (key === 'duration' || key === 'period' || key === 'interval') continue;
        p[key] = Math.round(value * 0.35 * 1000) / 1000;
      }
    }
  }

  function dropLastHold(style) {
    const holds = instanceList(style, 'hold');
    if (holds.length) {
      const instance = holds[holds.length - 1].instance;
      style.hold = (style.hold || []).filter((entry) => entry !== instance);
      if (!style.hold.length) delete style.hold;
      return true;
    }
    const posts = instanceList(style, 'post');
    if (posts.length) {
      const instance = posts[posts.length - 1].instance;
      style.post = (style.post || []).filter((entry) => entry !== instance);
      if (!style.post.length) delete style.post;
      return true;
    }
    return false;
  }

  function fadeInstance(group) {
    return {
      type: 'fade',
      params: {},
      enabled: true,
      motion: group === 'enter' ? { in: { duration: 0.3, delay: 0, ease: 'cubicOut' } } : { out: { duration: 0.25, delay: 0, ease: 'cubicIn' } },
    };
  }

  function capPost(style) {
    for (const instance of instanceList(style, 'post')) {
      if (POST_FORBIDDEN.has(instance.type)) {
        style.post = (style.post || []).filter((entry) => entry !== instance);
        if (!style.post.length) delete style.post;
        continue;
      }
      const caps = POST_CAPS[instance.type];
      if (!caps) continue;
      const p = instance.params || (instance.params = {});
      for (const [key, cap] of Object.entries(caps)) {
        if (typeof p[key] === 'number' && p[key] > cap) p[key] = cap;
      }
    }
  }

  function repairContrastLocal(style, ctx) {
    const palette = paletteOf(style, ctx);
    if (!palette.length) return;
    const moods = lazy('moods');
    const backgrounds = bgColors(style, ctx);
    if (moods && typeof moods.repairContrast === 'function' && Array.isArray(style.palette && style.palette.colors)) {
      moods.repairContrast(style.palette.colors, MIN_CONTRAST);
    }
    // min contrast of a palette role against every background in play
    const roleRatio = (index) => {
      const hex = palette[index];
      if (!hex) return -1;
      return backgrounds.reduce((min, bg) => Math.min(min, contrast(hex, bg)), Infinity);
    };
    // the readable role closest to the one the look chose (text first)
    const bestRole = () => {
      let best = -1;
      let bestRatio = -1;
      for (const index of [2, 3, 5, 6, 4]) {
        const ratio = roleRatio(index);
        if (ratio >= MIN_CONTRAST) return index;
        if (ratio > bestRatio) {
          bestRatio = ratio;
          best = index;
        }
      }
      return best;
    };
    const shapeActive = bgShapeActive(style);
    const shapeParams = (style.bgShape && style.bgShape.params) || {};
    const declared = textColors(style, ctx);
    const declaredFails = declared.some((hex) => backgrounds.some((bg) => contrast(hex, bg) < MIN_CONTRAST));
    if (shapeActive && declaredFails && !shapeParams.fgAutoContrast) {
      // the background shape decides the contrast: let the engine pick a
      // readable per-letter foreground instead of flattening the fill
      style.bgShape.params = { ...shapeParams, fgAutoContrast: true };
      return;
    }
    const fixFillPart = (part) => {
      if (!part) return part;
      if (part.kind === 'palette') {
        if (roleRatio(part.index) < MIN_CONTRAST) return { ...part, index: bestRole() };
        return part;
      }
      if (part.kind === 'solid' && typeof part.value === 'string' && contrast(part.value, backgrounds[0] || '#000000') < MIN_CONTRAST) {
        return { ...part, value: color.ensureContrast(part.value, backgrounds[0] || '#000000', MIN_CONTRAST) };
      }
      return part;
    };
    const fill = style.color && style.color.fill;
    if (fill) {
      if (fill.kind === 'gradient' && Array.isArray(fill.stops)) {
        const stops = fill.stops.map((stop) => {
          if (!stop || stop.paletteIndex == null) {
            if (stop && typeof stop.color === 'string' && contrast(stop.color, backgrounds[0] || '#000000') < MIN_CONTRAST) {
              return { ...stop, color: color.ensureContrast(stop.color, backgrounds[0] || '#000000', MIN_CONTRAST) };
            }
            return stop;
          }
          if (roleRatio(stop.paletteIndex) < MIN_CONTRAST) return { ...stop, paletteIndex: bestRole() };
          return stop;
        });
        style.color = { ...style.color, fill: { ...fill, stops } };
      } else {
        style.color = { ...(style.color || {}), fill: fixFillPart(fill) };
      }
    }
    // decorations with a literal colour are separated from the text
    for (const { group, instance } of styleInstances(style)) {
      if (group === 'fill' || group === 'bgFill') continue;
      if (!instance.params) continue;
      for (const key of ['color', 'tint']) {
        const value = instance.params[key];
        if (typeof value === 'string' && /^#/.test(value)) {
          const worst = backgrounds.reduce((min, bg) => Math.min(min, contrast(value, bg)), Infinity);
          if (worst < MIN_CONTRAST && key === 'color') instance.params[key] = color.ensureContrast(value, backgrounds[0] || '#000000', MIN_CONTRAST);
        }
      }
    }
  }

  function repairBackgroundClamp(style) {
    const shape = style.bgShape;
    if (!shape || !shape.params) return;
    const p = shape.params;
    const unit = p.unit === 'em' ? 'em' : 'cell';
    const limit = unit === 'em' ? BG_EM_MAX : BG_CELL_MAX;
    if (typeof p.width === 'number' && p.width > limit) p.width = limit;
    if (typeof p.height === 'number' && p.height > limit) p.height = limit;
  }

  // ---------------------------------------------------------------------------
  // figures

  function shapeBox(shapes) {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    const grow = (x, y, r) => {
      x0 = Math.min(x0, x - (r || 0));
      y0 = Math.min(y0, y - (r || 0));
      x1 = Math.max(x1, x + (r || 0));
      y1 = Math.max(y1, y + (r || 0));
    };
    for (const shape of shapes || []) {
      if (!shape) continue;
      if (Array.isArray(shape.points)) {
        for (const point of shape.points) if (point) grow(point.x, point.y, 0);
      } else if (shape.kind === 'rect') {
        grow(shape.x, shape.y, 0);
        grow(shape.x + shape.w, shape.y + shape.h, 0);
      } else if (shape.kind === 'capsule') {
        grow(shape.x0, shape.y0, (shape.width || 0) / 2);
        grow(shape.x1, shape.y1, (shape.width || 0) / 2);
      } else if (shape.kind === 'circle' || shape.kind === 'ring' || shape.kind === 'polygon') {
        grow(shape.x, shape.y, shape.radius != null ? shape.radius : shape.r || 0);
      }
    }
    return Number.isFinite(x0) ? { x0, y0, x1, y1 } : null;
  }

  function overlapRatio(box, textBox) {
    if (!box || !textBox) return 0;
    const w = Math.max(0, Math.min(box.x1, textBox.x1) - Math.max(box.x0, textBox.x0));
    const h = Math.max(0, Math.min(box.y1, textBox.y1) - Math.max(box.y0, textBox.y0));
    const area = Math.max(1e-6, (textBox.x1 - textBox.x0) * (textBox.y1 - textBox.y0));
    return (w * h) / area;
  }

  function figureTextBox(ctx) {
    const frame = (ctx && ctx.frame) || { width: 1920, height: 1080 };
    if (ctx && ctx.textBox) return ctx.textBox;
    return { x0: frame.width * 0.2, y0: frame.height * 0.38, x1: frame.width * 0.8, y1: frame.height * 0.62 };
  }

  // The worst overlap of a figure spec's sampled shapes with the text box,
  // weighted by the spec's own opacity (a dimmed figure stops hiding text).
  function figureOverlap(spec, ctx) {
    const figures = lazy('figures');
    if (!figures || typeof figures.drawList !== 'function') return 0;
    const context = ctx || {};
    const frame = context.frame || { width: 1920, height: 1080 };
    const span = Math.max(0.4, Number(context.duration) || 3);
    const textBox = figureTextBox(context);
    const raw = spec && spec.params && spec.params.opacity;
    const opacity = raw == null ? 1 : Math.max(0, Math.min(1, Number(raw)));
    if (!(opacity > 0)) return 0;
    let worst = 0;
    for (const share of [0.1, 0.35, 0.55, 0.75, 0.9]) {
      let result;
      try {
        result = figures.drawList(spec, {
          time: span * share,
          frame,
          clip: { start: 0, end: span, key: 'legibility' },
          beats: [{ start: 0, end: span }],
          textBox,
          colors: context.colors || null,
        });
      } catch {
        continue;
      }
      worst = Math.max(worst, overlapRatio(shapeBox(result && result.shapes), textBox));
    }
    return worst * opacity;
  }

  function repairFigureSpec(spec, ctx) {
    const copy = clone(spec);
    if (!copy) return copy;
    const context = ctx || {};
    if (figureOverlap(copy, context) <= FIGURE_OVERLAP + 1e-9) return spec;
    const textColors = context.textColors || (context.palette && context.palette[2] ? [context.palette[2]] : ['#eef2ff']);
    const params = copy.params || (copy.params = {});
    if (typeof params.color === 'string') {
      params.color = color.separateFrom(params.color, textColors, 3) || params.color;
    }
    if (Array.isArray(params.colors)) {
      params.colors = params.colors.map((hex) => (typeof hex === 'string' ? color.separateFrom(hex, textColors, 3) : hex));
    }
    if (figureOverlap(copy, context) > FIGURE_OVERLAP + 1e-9) {
      params.opacity = Math.min(params.opacity == null ? 1 : Number(params.opacity), FIGURE_FALLBACK_OPACITY);
    }
    return copy;
  }

  // ---------------------------------------------------------------------------
  // repair

  // Replacements for a single group whose type carries an unreadable tag: the
  // repair keeps the same slot (motion stays) but swaps in a plain type.
  const SAFE_FALLBACKS = {
    animation: 'simultaneous',
    layout: 'row',
    enter: 'fade',
    exit: 'fade',
    fill: 'solid',
    background: 'gradient',
    bgShape: 'none',
    bgFill: 'solid',
    bgMotion: 'follow',
    repeat: 'none',
  };

  // Drops / replaces every instance whose tags make it unreadable for an
  // automatic look (degrade / overlap / glitch / dissolve without an allow
  // entry). Stacks lose the entry; single groups fall back to a plain type.
  function dropUnreadable(style) {
    const allowed = readableTags();
    for (const { group, type, instance } of styleInstances(style)) {
      const descriptor = fx && fx.get ? fx.get(group, type) : null;
      if (!descriptor || !descriptor.tags.some((tag) => BAD_TAGS.has(tag))) continue;
      if (allowed.has(type)) continue;
      if (STACK_GROUPS.has(group)) {
        style[group] = (style[group] || []).filter((entry) => entry !== instance);
        if (!style[group].length) delete style[group];
      } else if (SAFE_FALLBACKS[group]) {
        style[group] = { ...instance, type: SAFE_FALLBACKS[group], params: {}, enabled: instance.enabled !== false };
      } else {
        delete style[group];
      }
    }
  }

  function repair(style, ctx) {
    if (!style) return { style, changed: false, reasons: [] };
    const context = ctx || {};
    const first = check(style, context);
    if (first.ok) return { style, changed: false, reasons: [] };
    const out = clone(style);
    const reasons = new Set(first.reasons.map((reason) => String(reason).split(':')[0]));
    repairContrastLocal(out, { ...context, palette: paletteOf(out, context) });
    repairBackgroundClamp(out);
    capPost(out);
    dropUnreadable(out);
    // 1) shrink the hold amplitudes, 2) drop one hold / post, 3) fade in/out
    if (reasons.has('motion')) {
      shrinkHold(out);
      let guard = 0;
      while (!staticWindow(out, context).ok && guard < 12) {
        guard += 1;
        if (!dropLastHold(out)) break;
        if (guard % 4 === 0) {
          out.enter = fadeInstance('enter');
          out.exit = fadeInstance('exit');
        }
      }
      if (!staticWindow(out, context).ok) {
        out.enter = fadeInstance('enter');
        out.exit = fadeInstance('exit');
        delete out.hold;
        if (out.post) out.post = out.post.filter((instance) => !POST_CAPS[instance.type] && !POST_FORBIDDEN.has(instance.type));
        if (out.post && !out.post.length) delete out.post;
        shrinkHold(out);
      }
      // last resort: the formation transitions (from / to) keep the letters
      // moving for most of the cue, then the formation itself
      if (!staticWindow(out, context).ok && out.layout && out.layout.params) {
        const params = { ...out.layout.params };
        delete params.from;
        delete params.fromFormation;
        delete params.to;
        delete params.sequence;
        out.layout = { ...out.layout, params };
      }
      if (!staticWindow(out, context).ok) {
        out.layout = { type: 'row', params: {}, enabled: true };
        out.animation = { type: 'simultaneous', params: {}, enabled: true };
        out.enter = fadeInstance('enter');
        out.exit = fadeInstance('exit');
        delete out.hold;
      }
    }
    // figures never reach into the text box: recolour, then dim
    if (Array.isArray(context.figures) && !context.repairFigures) {
      out.figures = context.figures.map((spec) => repairFigureSpec(spec, { ...context, figures: null }));
    }
    const result = check(out, { ...context, motion: context.motion });
    return { style: out, changed: true, reasons: result.reasons };
  }

  return {
    MIN_CONTRAST,
    MIN_SIZE_RATIO,
    STATIC_SECONDS,
    STATIC_SHARE,
    SAMPLES,
    FIGURE_OVERLAP,
    POST_CAPS,
    readableTags,
    staticWindow,
    sceneFor,
    check,
    repair,
    repairContrastLocal,
    repairBackgroundClamp,
    dropUnreadable,
    figureOverlap,
    repairFigureSpec,
    overlapRatio,
    shapeBox,
  };
});
