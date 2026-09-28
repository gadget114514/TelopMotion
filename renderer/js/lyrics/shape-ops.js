(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.SA = root.SA || {};
    root.SA.shapeOps = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // CPU side of the shape layer: one authored shape expands into the primitive
  // list the GL shape pass draws (repeater), and its trim / dash / path op are
  // normalised into the uniforms that pass understands.

  // The named shapes match post.shapeLayer, so a clip placed from the timeline
  // reads the same vocabulary. They are resolved against the text box handed
  // in by the engine (followText block / line).
  const SHAPES = ['underline', 'strike', 'box', 'brackets', 'circle', 'ring', 'burst', 'cross', 'diagonal'];
  const FOLLOW_MODES = ['block', 'line'];
  const PATH_OPS = ['none', 'wiggle', 'zigzag', 'pucker', 'twist'];
  const PATH_OP_CODES = { none: 0, wiggle: 1, zigzag: 2, pucker: 3, twist: 4 };

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
  function expand(spec, options) {
    const source = spec || {};
    if (!SHAPES.includes(source.shape)) return expandPrimitive(source, options);
    const opts = options || {};
    const boxes = followBoxes(source, opts);
    const out = [];
    for (const box of boxes) {
      const width = Math.max(1, Math.min(box.x1 - box.x0, box.y1 - box.y0));
      for (const geometry of namedSpecs(source, box)) {
        out.push(...expandPrimitive({ ...source, ...geometry }, { ...opts, width: opts.width == null ? width : opts.width }));
      }
    }
    return out;
  }

  // The boxes a named shape follows. Block mode uses the whole text box, line
  // mode one box per line; without a box (no text on screen) nothing is drawn.
  function followBoxes(spec, options) {
    const opts = options || {};
    if (spec && spec.followText === 'line') return (opts.boxes || []).filter(Boolean);
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
    const stroke = Math.max(0.5, num(source.stroke, 4));
    const corner = Math.max(0, num(source.corner, 0.12)) * Math.min(w, h) * 0.5;
    const segment = (x, y, length, angle) => ({ kind: 'capsule', x, y, length, angle, lineWidth: stroke });
    switch (source.shape) {
      case 'underline':
        return [segment(cx, y1, w, 0)];
      case 'strike':
        return [segment(cx, cy, w, 0)];
      case 'cross':
        return [segment(cx, cy, w, 0), segment(cx, cy, h, 90)];
      case 'diagonal':
        return [segment(cx, cy, Math.hypot(w, h), (Math.atan2(h, w) * 180) / Math.PI)];
      case 'box':
        return [{ kind: 'rect', x: x0, y: y0, w, h, radius: corner }];
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
      case 'burst': {
        // the spokes are generated here, so the repeater stays out of the way
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

  function expandPrimitive(source, options) {
    const opts = options || {};
    const sourceSpec = source || {};
    const instances = repeaterInstances(sourceSpec, opts);
    const trim = trimForDrive(sourceSpec, opts);
    const dash = normalizeDash(sourceSpec);
    const pathOp = normalizePathOp(sourceSpec, opts.time);
    const kind = sourceSpec.kind || sourceSpec.shape || 'rect';
    const base = {
      opacity: sourceSpec.opacity == null ? 1 : sourceSpec.opacity,
      color: sourceSpec.color,
      stroke: sourceSpec.stroke,
      strokeColor: sourceSpec.strokeColor,
      angle: sourceSpec.angle,
      trim,
      dash,
      cap: sourceSpec.cap,
      pathOp,
    };
    const out = [];
    for (const instance of instances) {
      const shape = { ...base };
      if (kind === 'circle' || kind === 'ring') {
        shape.kind = 'circle';
        shape.x = num(sourceSpec.x, 0) + instance.dx;
        shape.y = num(sourceSpec.y, 0) + instance.dy;
        shape.radius = Math.max(0.5, num(sourceSpec.radius, num(sourceSpec.w, 0) / 2 || 10) * instance.scale);
        shape.ring = kind === 'ring' ? Math.max(0.5, num(sourceSpec.ring, 2) * instance.scale) : 0;
      } else if (kind === 'capsule' || kind === 'line') {
        const angle = ((num(sourceSpec.angle, 0) + instance.rotation) * Math.PI) / 180;
        const length = num(sourceSpec.length, num(sourceSpec.w, 0) || 20) * instance.scale;
        const x = num(sourceSpec.x, 0) + instance.dx;
        const y = num(sourceSpec.y, 0) + instance.dy;
        shape.kind = 'capsule';
        shape.x = x;
        shape.y = y;
        shape.p0 = { x: x - Math.cos(angle) * length / 2, y: y - Math.sin(angle) * length / 2 };
        shape.p1 = { x: x + Math.cos(angle) * length / 2, y: y + Math.sin(angle) * length / 2 };
        shape.lineWidth = Math.max(0.5, num(sourceSpec.lineWidth, num(sourceSpec.stroke, 2)));
      } else if (kind === 'polygon') {
        shape.kind = 'polygon';
        shape.x = num(sourceSpec.x, 0) + instance.dx;
        shape.y = num(sourceSpec.y, 0) + instance.dy;
        shape.radius = Math.max(0.5, num(sourceSpec.radius, 10) * instance.scale);
        shape.sides = Math.max(3, Math.round(num(sourceSpec.sides, 6)));
        shape.angle = num(sourceSpec.angle, 0) + instance.rotation;
      } else {
        const w = Math.max(0.5, num(sourceSpec.w, num(sourceSpec.width, 0) || 20) * instance.scale);
        const h = Math.max(0.5, num(sourceSpec.h, num(sourceSpec.height, 0) || 20) * instance.scale);
        shape.kind = 'rect';
        shape.x = num(sourceSpec.x, 0) + instance.dx - (w - num(sourceSpec.w, w)) / 2;
        shape.y = num(sourceSpec.y, 0) + instance.dy - (h - num(sourceSpec.h, h)) / 2;
        shape.w = w;
        shape.h = h;
        shape.radius = Math.max(0, Math.min(num(sourceSpec.radius, 0) * instance.scale, Math.min(w, h) / 2));
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
    normalizeTrim,
    normalizeDash,
    normalizePathOp,
    repeaterInstances,
    followBoxes,
    namedSpecs,
    expand,
    trimForDrive,
  };
});
