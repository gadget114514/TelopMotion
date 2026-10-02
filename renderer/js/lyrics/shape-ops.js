(function (root, factory) {
  const api = factory(
    typeof module === 'object' && module.exports ? require('./patterns') : (root.SA || {}).patterns
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.SA = root.SA || {};
    root.SA.shapeOps = api;
  }
})(typeof self !== 'undefined' ? self : this, function (patterns) {
  'use strict';

  // CPU side of the shape layer: one authored shape expands into the primitive
  // list the GL shape pass draws (repeater), and its trim / dash / path op are
  // normalised into the uniforms that pass understands.

  const PATTERNS = (patterns && patterns.PATTERNS) || ['solid'];
  const PATTERN_CODES = (patterns && patterns.CODES) || { solid: 0 };

  // The named shapes match post.shapeLayer, so a clip placed from the timeline
  // reads the same vocabulary. They are resolved against the text box handed
  // in by the engine (followText block / line).
  const SHAPES = [
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
  const FOLLOW_MODES = ['block', 'line', 'word', 'char', 'span'];
  const PATH_OPS = ['none', 'wiggle', 'zigzag', 'pucker', 'twist'];
  const PATH_OP_CODES = { none: 0, wiggle: 1, zigzag: 2, pucker: 3, twist: 4 };
  const ENTER_ANIMS = ['draw', 'pop', 'fade', 'slide', 'expand', 'none'];
  const EXIT_ANIMS = ['erase', 'shrink', 'fade', 'slide', 'none'];
  const HOLD_ANIMS = ['flow', 'pulse', 'float', 'shiver', 'none'];
  const BG_PATTERNS = ['none', 'stripes', 'dots', 'grid', 'checker', 'diamond', 'wave', 'hatch', 'crosshatch', 'chain', 'random'];

  function num(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp01(value) {
    return Math.max(0, Math.min(1, value));
  }

  function normalizeTrim(spec) {
    const start = clamp01(num(spec && spec.trimStart, 0));
    const end = clamp01(num(spec && spec.trimEnd, 1));
    const offset = num(spec && spec.trimOffset, 0);
    return start <= end ? [start, end, offset] : [end, start, offset];
  }

  function normalizeDash(spec) {
    const on = Math.max(0, num(spec && spec.dashOn, 0));
    if (!on) return [0, 0, 0];
    const off = Math.max(0, num(spec && spec.dashOff, on));
    return [on, off, num(spec && spec.dashOffset, 0)];
  }

  // pathOp -> the (code, amount, freq, time) the fragment shader expects
  function normalizePathOp(spec, time) {
    const op = spec && spec.pathOp;
    const code = PATH_OP_CODES[op] == null ? 0 : PATH_OP_CODES[op];
    if (!code) return [0, 0, 0, 0];
    return [code, num(spec.pathOpAmount, 0.25), num(spec.pathOpFreq, 2), num(time, 0)];
  }

  // The repeater walks copies away from the main shape: every instance gets the
  // previous one's position, rotation and scale, and its own fade.
  function repeaterInstances(spec, options) {
    const opts = options || {};
    const copies = Math.max(1, Math.min(64, Math.round(num(opts.copies, num(spec && spec.repeat, 1)))));
    if (copies <= 1) return [{ index: 0, opacity: 1, dx: 0, dy: 0, rotation: 0, scale: 1 }];
    const offset = num(opts.offset, num(spec && spec.repeatOffset, 0.25));
    const position = (opts.position || (spec && spec.repeatPosition) || { x: 1, y: 0 });
    const rotation = num(opts.rotation, num(spec && spec.repeatRotate, 0));
    const scale = num(opts.scale, num(spec && spec.repeatScale, 1));
    const startOpacity = opts.startOpacity == null ? (spec && spec.repeatOpacity == null ? 1 : spec.repeatOpacity) : opts.startOpacity;
    const endOpacity = opts.endOpacity == null ? 0 : opts.endOpacity;
    const width = num(opts.width, 1);
    const instances = [];
    let dx = 0;
    let dy = 0;
    let angle = 0;
    let factor = 1;
    for (let i = 0; i < copies; i += 1) {
      const t = copies > 1 ? i / (copies - 1) : 0;
      instances.push({
        index: i,
        opacity: num(startOpacity, 1) + (num(endOpacity, 0) - num(startOpacity, 1)) * t,
        dx,
        dy,
        rotation: angle,
        scale: factor,
      });
      // the next copy continues from this one
      dx += (position.x || 0) * offset * width * factor;
      dy += (position.y || 0) * offset * width * factor;
      angle += rotation;
      factor *= scale <= 0 ? 1 : scale;
    }
    return instances;
  }

  // Expands a shape spec ({kind, ...}) into the primitive list the shape pass
  // takes: `rect` / `circle` / `ring` / `capsule` / `polygon`. A spec with a
  // named `shape` (underline / box / circle / ...) is resolved against the text
  // box first: `followText: 'block'` fits the whole block, `'line'` repeats the
  // shape for every line box the engine passes in `options.boxes`.
  function arcSegments(centerX, centerY, radiusX, radiusY, startAngleDeg, endAngleDeg, steps, stroke) {
    const n = Math.max(2, steps || 5);
    const segs = [];
    const startRad = (startAngleDeg * Math.PI) / 180;
    const endRad = (endAngleDeg * Math.PI) / 180;
    for (let i = 0; i < n; i += 1) {
      const a0 = startRad + (endRad - startRad) * (i / n);
      const a1 = startRad + (endRad - startRad) * ((i + 1) / n);
      const p0x = centerX + Math.cos(a0) * radiusX;
      const p0y = centerY + Math.sin(a0) * radiusY;
      const p1x = centerX + Math.cos(a1) * radiusX;
      const p1y = centerY + Math.sin(a1) * radiusY;
      const mx = (p0x + p1x) / 2;
      const my = (p0y + p1y) / 2;
      const len = Math.hypot(p1x - p0x, p1y - p0y);
      const ang = (Math.atan2(p1y - p0y, p1x - p0x) * 180) / Math.PI;
      segs.push({ kind: 'capsule', x: mx, y: my, length: len, angle: ang, lineWidth: stroke });
    }
    return segs;
  }

  // Plate surface specification (fills behind the stroked outline)
  function plateSurfaceSpec(source, box) {
    const hasFill = source.fillColor != null || source.shape === 'plate' || num(source.fillOpacity, 0) > 0 || (source.bgPattern && source.bgPattern !== 'none');
    if (!hasFill) return null;
    const pad = Math.max(0, num(source.padding, 0.08)) * Math.min(Math.max(1, box.x1 - box.x0), Math.max(1, box.y1 - box.y0));
    const x0 = box.x0 - pad;
    const y0 = box.y0 - pad;
    const x1 = box.x1 + pad;
    const y1 = box.y1 + pad;
    const w = Math.max(1, x1 - x0);
    const h = Math.max(1, y1 - y0);
    const corner = Math.max(0, num(source.corner, 0.12)) * Math.min(w, h) * 0.5;
    const isRound = source.shape === 'circle' || source.shape === 'ring';
    const isCapsule = source.shape === 'capsule' || source.shape === 'sidesSemicircle';
    const bgPattern = source.bgPattern || 'none';
    const bgPatternCode = PATTERN_CODES[bgPattern] == null ? 0 : PATTERN_CODES[bgPattern];
    const bgPatternSize = Math.max(0.5, num(source.bgPatternSize, 24));
    const bgPatternRatio = Math.max(0.02, Math.min(0.98, num(source.bgPatternRatio, 0.5)));
    const bgPatternFlow = num(source.bgPatternFlow, 0);

    return {
      kind: isRound ? 'circle' : 'rect',
      x: isRound ? (x0 + x1) / 2 : x0,
      y: isRound ? (y0 + y1) / 2 : y0,
      w,
      h,
      radius: isRound ? Math.max(w, h) / 2 : (isCapsule ? h / 2 : corner),
      stroke: 0,
      strokeColor: null,
      color: source.fillColor || source.plateColor || source.color,
      opacity: num(source.fillOpacity, source.shape === 'plate' ? 0.35 : 0.25),
      pattern: bgPattern,
      patternCode: bgPatternCode,
      patternSize: bgPatternSize,
      patternRatio: bgPatternRatio,
      patternFlow: bgPatternFlow,
      drive: source.drive === 'hold' ? 'hold' : (source.drive === 'beat' ? 'beat' : 'auto'),
      isPlateSurface: true,
    };
  }

  // Expands a shape spec ({kind, ...}) into the primitive list the shape pass
  // takes: `rect` / `circle` / `ring` / `capsule` / `polygon`. A spec with a
  // named `shape` (underline / box / circle / ...) is resolved against the text
  // box first: `followText: 'block'` fits the whole block, `'line'` repeats the
  // shape for every line box the engine passes in `options.boxes`.
  function expand(spec, options) {
    const source = spec || {};
    if (!SHAPES.includes(source.shape)) return expandPrimitive(source, options);
    const opts = options || {};
    const boxes = followBoxes(source, opts);
    const out = [];
    for (const box of boxes) {
      const width = Math.max(1, Math.min(box.x1 - box.x0, box.y1 - box.y0));
      const plate = plateSurfaceSpec(source, box);
      if (plate) {
        out.push(...expandPrimitive(plate, { ...opts, width: opts.width == null ? width : opts.width }));
      }
      for (const geometry of namedSpecs(source, box)) {
        out.push(...expandPrimitive({ ...source, ...geometry }, { ...opts, width: opts.width == null ? width : opts.width }));
      }
    }
    return out;
  }

  // Extracts bounding boxes for partial substrings:
  // - matchText: searches for substring match within letters (case-insensitive)
  // - spanFrom / spanTo: character index range [spanFrom, spanTo] (0-based)
  // Contiguous matched characters within the same line are grouped into a box.
  function spanBoxes(spec, options) {
    const opts = options || {};
    const chars = (opts.chars || []).filter(Boolean);
    if (!chars.length) {
      const box = opts.box || (opts.boxes && opts.boxes[0]) || null;
      return box ? [box] : [];
    }

    const matchText = spec && spec.matchText != null ? String(spec.matchText).trim() : '';
    const hasFrom = spec && spec.spanFrom != null && spec.spanFrom !== '' && Number.isFinite(Number(spec.spanFrom));
    const hasTo = spec && spec.spanTo != null && spec.spanTo !== '' && Number.isFinite(Number(spec.spanTo));
    const spanFrom = hasFrom ? Number(spec.spanFrom) : null;
    const spanTo = hasTo ? Number(spec.spanTo) : null;

    const matchedIndices = new Set();

    if (matchText.length > 0) {
      const fullText = chars.map((c) => c.char || '').join('');
      const lowerFull = fullText.toLowerCase();
      const lowerMatch = matchText.toLowerCase();
      let pos = 0;
      while (pos < lowerFull.length) {
        const found = lowerFull.indexOf(lowerMatch, pos);
        if (found === -1) break;
        for (let i = found; i < found + lowerMatch.length; i += 1) {
          if (i < chars.length) matchedIndices.add(i);
        }
        pos = found + Math.max(1, lowerMatch.length);
      }
    }

    if (hasFrom || hasTo) {
      const from = hasFrom ? Math.max(0, Math.floor(spanFrom)) : 0;
      const to = hasTo ? Math.min(chars.length - 1, Math.floor(spanTo)) : chars.length - 1;
      for (let i = from; i <= to; i += 1) {
        if (i >= 0 && i < chars.length) matchedIndices.add(i);
      }
    }

    if (!matchedIndices.size) {
      if (matchText.length > 0) {
        return [];
      }
      const box = opts.box || (opts.boxes && opts.boxes[0]) || null;
      return box ? [box] : [];
    }

    const groups = [];
    let currentGroup = [];
    let prevIndex = -2;
    let prevLine = null;

    for (let i = 0; i < chars.length; i += 1) {
      if (matchedIndices.has(i)) {
        const c = chars[i];
        const line = c.lineIdx == null ? 0 : c.lineIdx;
        if (currentGroup.length > 0 && (i !== prevIndex + 1 || line !== prevLine)) {
          groups.push(currentGroup);
          currentGroup = [];
        }
        currentGroup.push(c);
        prevIndex = i;
        prevLine = line;
      }
    }
    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    const result = [];
    for (const group of groups) {
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const c of group) {
        x0 = Math.min(x0, c.x0);
        y0 = Math.min(y0, c.y0);
        x1 = Math.max(x1, c.x1);
        y1 = Math.max(y1, c.y1);
      }
      if (Number.isFinite(x0)) {
        result.push({ x0, y0, x1, y1 });
      }
    }

    return result;
  }

  // The boxes a named shape follows.
  // - 'block': uses the whole text box
  // - 'line': one box per line
  // - 'word': one box per word
  // - 'char': one box per character
  // - 'span': boxes covering the matched substring or character index range
  function followBoxes(spec, options) {
    const opts = options || {};
    const mode = (spec && spec.followText) || 'block';

    if (mode === 'line') {
      return (opts.lines || opts.boxes || []).filter(Boolean);
    }
    if (mode === 'word') {
      const words = (opts.words || []).filter(Boolean);
      if (words.length) return words;
      return (opts.lines || opts.boxes || []).filter(Boolean);
    }
    if (mode === 'char') {
      const chars = (opts.chars || []).filter(Boolean);
      if (chars.length) return chars;
      const box = opts.box || (opts.boxes && opts.boxes[0]) || null;
      return box ? [box] : [];
    }
    if (mode === 'span') {
      return spanBoxes(spec, opts);
    }

    const box = opts.box || (opts.boxes && opts.boxes[0]) || null;
    return box ? [box] : [];
  }

  // One named shape -> its low-level primitives, fitted to a px text box
  // ({x0, y0, x1, y1}, y down). The frame comes back from the box edges.
  function namedSpecs(source, box) {
    const pad = Math.max(0, num(source.padding, 0.08)) * Math.min(Math.max(1, box.x1 - box.x0), Math.max(1, box.y1 - box.y0));
    const x0 = box.x0 - pad;
    const y0 = box.y0 - pad;
    const x1 = box.x1 + pad;
    const y1 = box.y1 + pad;
    const w = Math.max(1, x1 - x0);
    const h = Math.max(1, y1 - y0);
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const stroke = Math.max(0.1, num(source.stroke, 4));
    const corner = Math.max(0, num(source.corner, 0.12)) * Math.min(w, h) * 0.5;
    const segment = (x, y, length, angle) => ({ kind: 'capsule', x, y, length, angle, lineWidth: stroke });
    switch (source.shape) {
      case 'underline':
        return [segment(cx, y1, w, 0)];
      case 'overline':
        return [segment(cx, y0, w, 0)];
      case 'topBottom':
        return [segment(cx, y0, w, 0), segment(cx, y1, w, 0)];
      case 'strike':
        return [segment(cx, cy, w, 0)];
      case 'sides':
        return [segment(x0, cy, h, 90), segment(x1, cy, h, 90)];
      case 'sidesSemicircle': {
        const r = h / 2;
        return [
          ...arcSegments(x0, cy, r, r, 90, 270, 5, stroke),
          ...arcSegments(x1, cy, r, r, -90, 90, 5, stroke),
        ];
      }
      case 'sidesSemiellipse': {
        const rx = Math.max(h * 0.35, pad * 1.5);
        const ry = h / 2;
        return [
          ...arcSegments(x0, cy, rx, ry, 90, 270, 5, stroke),
          ...arcSegments(x1, cy, rx, ry, -90, 90, 5, stroke),
        ];
      }
      case 'cross':
        return [segment(cx, cy, w, 0), segment(cx, cy, h, 90)];
      case 'diagonal':
        return [segment(cx, cy, Math.hypot(w, h), (Math.atan2(h, w) * 180) / Math.PI)];
      case 'box':
      case 'plate':
        return [{ kind: 'rect', x: x0, y: y0, w, h, radius: corner }];
      case 'capsule':
        return [{ kind: 'rect', x: x0, y: y0, w, h, radius: Math.min(w, h) / 2 }];
      case 'circle':
        return [{ kind: 'circle', x: cx, y: cy, radius: Math.max(w, h) / 2 }];
      case 'ring':
        return [{ kind: 'ring', x: cx, y: cy, radius: Math.max(w, h) / 2, ring: stroke }];
      case 'brackets': {
        const arm = Math.min(w, h) * 0.24;
        return [
          segment(x0, cy, h, 90),
          segment(x0 + arm / 2, y0, arm, 0),
          segment(x0 + arm / 2, y1, arm, 0),
          segment(x1, cy, h, 90),
          segment(x1 - arm / 2, y0, arm, 0),
          segment(x1 - arm / 2, y1, arm, 0),
        ];
      }
      case 'ornament': {
        const arm = Math.min(w, h) * 0.24;
        const fl = arm * 0.55;
        return [
          segment(x0, cy, h, 90),
          segment(x0 + arm / 2, y0, arm, 0),
          segment(x0 + arm / 2, y1, arm, 0),
          segment(x1, cy, h, 90),
          segment(x1 - arm / 2, y0, arm, 0),
          segment(x1 - arm / 2, y1, arm, 0),
          segment(x0 - fl * 0.35, y0 - fl * 0.35, fl, 45),
          segment(x1 + fl * 0.35, y0 - fl * 0.35, fl, -45),
          segment(x0 - fl * 0.35, y1 + fl * 0.35, fl, -45),
          segment(x1 + fl * 0.35, y1 + fl * 0.35, fl, 45),
        ];
      }
      case 'burst': {
        const copies = Math.max(2, Math.min(24, Math.round(num(source.repeat, 8))));
        const rotation = (num(source.repeatRotate, 0) * Math.PI) / 180;
        const reach = Math.max(0.5, Math.max(w, h) * 0.5 * Math.max(0.1, num(source.repeatScale, 1)));
        const spokes = [];
        for (let i = 0; i < copies; i += 1) {
          const angle = rotation + (i / copies) * Math.PI * 2;
          spokes.push({
            ...segment(cx + (Math.cos(angle) * reach) / 2, cy + (Math.sin(angle) * reach) / 2, reach, (angle * 180) / Math.PI),
            repeat: 1,
          });
        }
        return spokes;
      }
      default:
        return [];
    }
  }

  function computeMotion(source, options) {
    const opts = options || {};
    const progress = clamp01(num(opts.progress, 1));
    const time = num(opts.time, 0);
    const drive = (source && source.drive) || 'enter';
    const inWindow = clamp01(num(source && source.in, 0.25));
    const outWindow = clamp01(num(source && source.out, 0.25));
    const speed = num(source && source.speed, 0.6);
    const enterAnim = (source && source.enterAnim) || (drive === 'enter' ? 'draw' : 'none');
    const exitAnim = (source && source.exitAnim) || (drive === 'exit' ? 'erase' : 'none');
    const holdAnim = (source && source.holdAnim) || (drive === 'hold' ? 'flow' : 'none');

    let scale = 1;
    let opacity = 1;
    let dx = 0;
    let dy = 0;
    let [trimStart, trimEnd, trimOffset] = normalizeTrim(source);

    if (drive === 'enter') {
      trimEnd = trimStart + (trimEnd - trimStart) * progress;
    } else if (drive === 'exit') {
      trimStart = trimStart + (trimEnd - trimStart) * progress;
    } else if (drive === 'hold') {
      trimOffset += time * speed;
    } else if (drive === 'beat') {
      const bpm = num(opts.bpm, 120);
      trimOffset += ((time * bpm) / 60) % 1;
    } else {
      const inEnd = Math.max(0.001, inWindow);
      const outStart = Math.min(0.999, 1 - outWindow);

      if (progress < inEnd && enterAnim !== 'none') {
        const t = clamp01(progress / inEnd);
        if (enterAnim === 'draw') {
          trimEnd = trimStart + (trimEnd - trimStart) * (1 - Math.pow(1 - t, 3));
        } else if (enterAnim === 'pop') {
          scale = 1 - Math.pow(2, -10 * t) + 0.08 * Math.sin(Math.PI * t);
          opacity = clamp01(t * 1.5);
        } else if (enterAnim === 'fade') {
          opacity = 1 - Math.pow(1 - t, 2);
        } else if (enterAnim === 'slide') {
          dy = (1 - (1 - Math.pow(1 - t, 3))) * 35;
          opacity = clamp01(t * 1.5);
        } else if (enterAnim === 'expand') {
          scale = 0.2 + 0.8 * (1 - Math.pow(1 - t, 3));
          opacity = clamp01(t * 1.5);
        }
      } else if (progress > outStart && exitAnim !== 'none') {
        const t = clamp01((progress - outStart) / Math.max(0.001, 1 - outStart));
        if (exitAnim === 'erase') {
          trimStart = trimStart + (trimEnd - trimStart) * Math.pow(t, 3);
        } else if (exitAnim === 'shrink') {
          scale = Math.max(0, 1 - Math.pow(t, 3));
          opacity = Math.max(0, 1 - t);
        } else if (exitAnim === 'fade') {
          opacity = Math.max(0, 1 - t * t);
        } else if (exitAnim === 'slide') {
          dy = Math.pow(t, 2) * -35;
          opacity = Math.max(0, 1 - t);
        }
      }
    }

    if (holdAnim === 'flow') {
      if (drive !== 'hold') trimOffset += time * speed;
    } else if (holdAnim === 'pulse') {
      scale *= 1 + Math.sin(time * speed * 3.5) * 0.035;
    } else if (holdAnim === 'float') {
      dy += Math.sin(time * speed * 2.4) * 6;
    } else if (holdAnim === 'shiver') {
      dx += Math.sin(time * 37) * 1.2;
      dy += Math.cos(time * 43) * 1.2;
    }

    return { scale, opacity, dx, dy, trim: [trimStart, trimEnd, trimOffset] };
  }

  function expandPrimitive(source, options) {
    const opts = options || {};
    const sourceSpec = source || {};
    const instances = repeaterInstances(sourceSpec, opts);
    const motion = computeMotion(sourceSpec, opts);
    const dash = normalizeDash(sourceSpec);
    const pathOp = normalizePathOp(sourceSpec, opts.time);
    const kind = sourceSpec.kind || sourceSpec.shape || 'rect';
    const patternCode = sourceSpec.patternCode != null ? sourceSpec.patternCode : (PATTERN_CODES[sourceSpec.pattern] == null ? 0 : PATTERN_CODES[sourceSpec.pattern]);
    const patternSize = Math.max(0.5, num(sourceSpec.patternSize, 0));
    const base = {
      opacity: (sourceSpec.opacity == null ? 1 : sourceSpec.opacity) * motion.opacity,
      color: sourceSpec.color,
      stroke: sourceSpec.stroke,
      strokeColor: sourceSpec.strokeColor,
      angle: sourceSpec.angle,
      trim: motion.trim,
      dash,
      cap: sourceSpec.cap,
      pathOp,
      isPlateSurface: !!sourceSpec.isPlateSurface,
      pattern: patternCode,
      patternParams:
        patternCode > 0
          ? [patternSize, Math.max(0.02, Math.min(0.98, num(sourceSpec.patternRatio, 0.5))), num(sourceSpec.patternFlow, 0) * num(opts.time, 0)]
          : [0, 0, 0],
    };
    const out = [];
    for (const instance of instances) {
      const shape = { ...base };
      const currentScale = instance.scale * motion.scale;
      if (kind === 'circle' || kind === 'ring') {
        shape.kind = 'circle';
        shape.x = num(sourceSpec.x, 0) + instance.dx + motion.dx;
        shape.y = num(sourceSpec.y, 0) + instance.dy + motion.dy;
        shape.radius = Math.max(0.5, num(sourceSpec.radius, num(sourceSpec.w, 0) / 2 || 10) * currentScale);
        shape.ring = kind === 'ring' ? Math.max(0.5, num(sourceSpec.ring, 2) * currentScale) : 0;
      } else if (kind === 'capsule' || kind === 'line') {
        const angle = ((num(sourceSpec.angle, 0) + instance.rotation) * Math.PI) / 180;
        const length = num(sourceSpec.length, num(sourceSpec.w, 0) || 20) * currentScale;
        const x = num(sourceSpec.x, 0) + instance.dx + motion.dx;
        const y = num(sourceSpec.y, 0) + instance.dy + motion.dy;
        shape.kind = 'capsule';
        shape.x = x;
        shape.y = y;
        shape.p0 = { x: x - Math.cos(angle) * length / 2, y: y - Math.sin(angle) * length / 2 };
        shape.p1 = { x: x + Math.cos(angle) * length / 2, y: y + Math.sin(angle) * length / 2 };
        shape.lineWidth = Math.max(0.1, num(sourceSpec.lineWidth, num(sourceSpec.stroke, 2)));
      } else if (kind === 'polygon') {
        shape.kind = 'polygon';
        shape.x = num(sourceSpec.x, 0) + instance.dx + motion.dx;
        shape.y = num(sourceSpec.y, 0) + instance.dy + motion.dy;
        shape.radius = Math.max(0.5, num(sourceSpec.radius, 10) * currentScale);
        shape.sides = Math.max(3, Math.round(num(sourceSpec.sides, 6)));
        shape.angle = num(sourceSpec.angle, 0) + instance.rotation;
      } else {
        const origW = num(sourceSpec.w, num(sourceSpec.width, 0) || 20);
        const origH = num(sourceSpec.h, num(sourceSpec.height, 0) || 20);
        const w = Math.max(0.5, origW * currentScale);
        const h = Math.max(0.5, origH * currentScale);
        shape.kind = 'rect';
        shape.x = num(sourceSpec.x, 0) + instance.dx - (w - origW) / 2 + motion.dx;
        shape.y = num(sourceSpec.y, 0) + instance.dy - (h - origH) / 2 + motion.dy;
        shape.w = w;
        shape.h = h;
        shape.radius = Math.max(0, Math.min(num(sourceSpec.radius, 0) * currentScale, Math.min(w, h) / 2));
        shape.angle = num(sourceSpec.angle, 0) + instance.rotation;
      }
      shape.opacity *= instance.opacity;
      out.push(shape);
    }
    return out;
  }

  // The drive maps the beat to the trim: enter grows the end, exit the start,
  // hold loops the offset and beat snaps it to the tempo.
  function trimForDrive(spec, options) {
    const opts = options || {};
    const [start, end, offset] = normalizeTrim(spec);
    const drive = (spec && spec.drive) || 'enter';
    const progress = clamp01(num(opts.progress, 1));
    let a = start;
    let b = end;
    let o = offset;
    const speed = num(spec && spec.speed, 0.6);
    if (drive === 'enter') b = start + (end - start) * progress;
    else if (drive === 'exit') a = start + (end - start) * progress;
    else if (drive === 'hold') o += num(opts.time, 0) * speed;
    else if (drive === 'beat') {
      const bpm = num(opts.bpm, 120);
      o += ((num(opts.time, 0) * bpm) / 60) % 1;
    }
    return [a, b, o];
  }

  return {
    SHAPES,
    FOLLOW_MODES,
    PATH_OPS,
    PATH_OP_CODES,
    PATTERNS,
    PATTERN_CODES,
    ENTER_ANIMS,
    EXIT_ANIMS,
    HOLD_ANIMS,
    BG_PATTERNS,
    normalizeTrim,
    normalizeDash,
    normalizePathOp,
    repeaterInstances,
    followBoxes,
    spanBoxes,
    namedSpecs,
    plateSurfaceSpec,
    computeMotion,
    expand,
    trimForDrive,
  };
});
