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
  // takes: `rect` / `circle` / `ring` / `capsule` / `polygon`.
  function expand(spec, options) {
    const opts = options || {};
    const source = spec || {};
    const instances = repeaterInstances(source, opts);
    const trim = normalizeTrim(source);
    const dash = normalizeDash(source);
    const pathOp = normalizePathOp(source, opts.time);
    const kind = source.kind || source.shape || 'rect';
    const base = {
      opacity: source.opacity == null ? 1 : source.opacity,
      color: source.color,
      stroke: source.stroke,
      strokeColor: source.strokeColor,
      angle: source.angle,
      trim,
      dash,
      cap: source.cap,
      pathOp,
    };
    const out = [];
    for (const instance of instances) {
      const shape = { ...base };
      if (kind === 'circle' || kind === 'ring') {
        shape.kind = 'circle';
        shape.x = num(source.x, 0) + instance.dx;
        shape.y = num(source.y, 0) + instance.dy;
        shape.radius = Math.max(0.5, num(source.radius, num(source.w, 0) / 2 || 10) * instance.scale);
        shape.ring = kind === 'ring' ? Math.max(0.5, num(source.ring, 2) * instance.scale) : 0;
      } else if (kind === 'capsule' || kind === 'line') {
        const angle = ((num(source.angle, 0) + instance.rotation) * Math.PI) / 180;
        const length = num(source.length, num(source.w, 0) || 20) * instance.scale;
        const x = num(source.x, 0) + instance.dx;
        const y = num(source.y, 0) + instance.dy;
        shape.kind = 'capsule';
        shape.x = x;
        shape.y = y;
        shape.p0 = { x: x - Math.cos(angle) * length / 2, y: y - Math.sin(angle) * length / 2 };
        shape.p1 = { x: x + Math.cos(angle) * length / 2, y: y + Math.sin(angle) * length / 2 };
        shape.lineWidth = Math.max(0.5, num(source.lineWidth, num(source.stroke, 2)));
      } else if (kind === 'polygon') {
        shape.kind = 'polygon';
        shape.x = num(source.x, 0) + instance.dx;
        shape.y = num(source.y, 0) + instance.dy;
        shape.radius = Math.max(0.5, num(source.radius, 10) * instance.scale);
        shape.sides = Math.max(3, Math.round(num(source.sides, 6)));
        shape.angle = num(source.angle, 0) + instance.rotation;
      } else {
        const w = Math.max(0.5, num(source.w, num(source.width, 0) || 20) * instance.scale);
        const h = Math.max(0.5, num(source.h, num(source.height, 0) || 20) * instance.scale);
        shape.kind = 'rect';
        shape.x = num(source.x, 0) + instance.dx - (w - num(source.w, w)) / 2;
        shape.y = num(source.y, 0) + instance.dy - (h - num(source.h, h)) / 2;
        shape.w = w;
        shape.h = h;
        shape.radius = Math.max(0, Math.min(num(source.radius, 0) * instance.scale, Math.min(w, h) / 2));
        shape.angle = num(source.angle, 0) + instance.rotation;
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
    PATH_OPS,
    PATH_OP_CODES,
    normalizeTrim,
    normalizeDash,
    normalizePathOp,
    repeaterInstances,
    expand,
    trimForDrive,
  };
});
