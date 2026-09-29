(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rng'), require('./smartness'), require('./weird'), require('./fx-axes'));
  else {
    root.SA = root.SA || {};
    root.SA.figures = factory(root.SA.rng, root.SA.smartness, root.SA.weird, root.SA.fxAxes);
  }
})(typeof self !== 'undefined' ? self : this, function (rng, smartness, weird, fxAxes) {
  'use strict';

  // Animated figure motifs for the `figure` track. A clip is a list of
  // sub-beats; every sub-beat has an in / hold / out move, and drawList turns
  // the current time into plain shapes for the shape pass. The motifs are
  // built from the same primitives as the filler (circle / ring / capsule /
  // rect / polygon / convex), so they render wherever the filler does.

  const MOTIFS = ['orbit', 'burst', 'bars', 'rings', 'confetti', 'frame', 'underlineSweep', 'bracketsPop', 'polyMorph', 'ribbon', 'ticker', 'halftone'];
  const INS = ['pop', 'draw', 'wipe', 'scatterIn'];
  const HOLDS = ['spin', 'pulse', 'drift', 'morph'];
  const OUTS = ['shrink', 'fade', 'burstOut'];
  const SYNCS = ['beat', 'free', 'text'];
  const TAU = Math.PI * 2;

  function num(value, fallback) {
    if (value == null || value === '') return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp01(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.max(0, Math.min(1, number));
  }

  function round(value, digits) {
    const factor = Math.pow(10, digits == null ? 3 : digits);
    return Math.round(value * factor) / factor;
  }

  function easeOut(t) {
    return 1 - Math.pow(1 - clamp01(t), 3);
  }

  function easeIn(t) {
    return Math.pow(clamp01(t), 3);
  }

  function pick(random, list) {
    return list[Math.min(list.length - 1, Math.floor(random() * list.length))];
  }

  // Sub-beat spans for a figure clip: the lyric beats, the rhythm cuts or the
  // text boxes, always inside [span.start, span.end].
  function subBeats(options, random) {
    const span = options.span || {};
    const start = num(span.start, 0);
    const end = Math.max(start + 0.05, num(span.end, start + 2));
    let edges = [];
    const sync = options.sync || 'beat';
    if (sync === 'free' && Array.isArray(options.cuts) && options.cuts.length) {
      const beat = Math.max(0.05, num(options.beatSeconds, 0.5));
      edges = options.cuts.filter((cut) => cut > start + 0.05 && cut < end - 0.05).map((cut) => cut + beat * 0.5);
    } else if ((sync === 'beat' || sync === 'text') && Array.isArray(options.beats) && options.beats.length) {
      edges = options.beats.filter((beat) => beat.end > start + 0.05 && beat.start < end - 0.05).map((beat) => Math.max(start + 0.05, beat.start));
    }
    edges = [...new Set(edges)].filter((cut) => cut > start + 0.05 && cut < end - 0.05).sort((a, b) => a - b);
    const bounds = [start, ...edges, end];
    const beats = [];
    for (let i = 0; i < bounds.length - 1; i += 1) {
      const from = bounds[i];
      const to = bounds[i + 1];
      if (to - from < 0.12) continue;
      beats.push({ start: from, end: to });
    }
    if (!beats.length) beats.push({ start, end });
    return beats;
  }

  // The forced move for one key ('in' / 'hold' / 'out') when the caller pinned
  // it to a known name; 'auto' / unknown names keep the random pick.
  function forcedMove(force, key, list) {
    if (!force) return null;
    const value = force[key];
    return value && list.includes(value) ? value : null;
  }

  function assignMoves(beats, random, force, s, axes) {
    let previousIn = null;
    let previousOut = null;
    for (const beat of beats) {
      const ins = INS.filter((name) => name !== previousIn);
      const outs = OUTS.filter((name) => name !== previousOut);
      // the random draws always run, forced or not, so the variant / accent
      // sequence stays stable when a move is pinned. The seventh axis demotes
      // the cheap moves and the eighth prefers the fear-heavy ones (a no-op at
      // 0, where the plain pick returns).
      const inPick = fxAxes.pickWeighted(random, 'figureIn', ins.length ? ins : INS, axes, { smartness: s });
      const holdPick = fxAxes.pickWeighted(random, 'figureHold', HOLDS, axes, { smartness: s });
      const outPick = fxAxes.pickWeighted(random, 'figureOut', outs.length ? outs : OUTS, axes, { smartness: s });
      const variant = Math.floor(random() * 3);
      const accent = random() < 0.5;
      beat.move = {
        in: forcedMove(force, 'in', INS) || inPick,
        hold: forcedMove(force, 'hold', HOLDS) || holdPick,
        out: forcedMove(force, 'out', OUTS) || outPick,
      };
      beat.variant = variant;
      beat.accent = accent;
      previousIn = beat.move.in;
      previousOut = beat.move.out;
    }
    return beats;
  }

  // The deterministic figure a clip carries: motif, sub-beats and moves. The
  // in / hold / out moves can be pinned ('auto' draws them at random) and the
  // optional scale / x / y / color land in the params so they survive a save.
  function generate(options) {
    const opts = options || {};
    const seed = Number.isFinite(Number(opts.seed)) ? Number(opts.seed) : 1;
    const id = opts.id == null ? 'figure' : String(opts.id);
    const random = rng.rngFor(seed, 'figure', id);
    const axes = opts.axes || {};
    // figures are the backdrop side: the channel saturates at raw 0.4
    const w = weird.bg(axes.weird);
    const s = smartness.smartOf(axes);
    const requested = MOTIFS.includes(opts.motif) ? opts.motif : null;
    const motifPool = w >= 0.6 ? MOTIFS : MOTIFS.filter((name) => name !== 'halftone');
    // the motif pool answers the smartness and fear axes (a no-op at 0)
    const motif = requested || fxAxes.pickWeighted(random, 'figureMotif', motifPool, axes, { smartness: s });
    const sync = SYNCS.includes(opts.sync) ? opts.sync : pick(random, ['beat', 'beat', 'text', 'free']);
    const force = { in: opts.in, hold: opts.hold, out: opts.out };
    const beats = assignMoves(subBeats({ ...opts, sync }, random), random, force, s, axes);
    const palette = Array.isArray(opts.palette) ? opts.palette : [];
    const colors = palette.length >= 3 ? palette.slice(3, 8) : palette.slice();
    const density = Math.max(0.15, Math.min(1, num(opts.density, 0.4 + 0.5 * clamp01(axes.energy))));
    const params = {
      motif,
      sync,
      density: round(density, 2),
      colors: colors.length ? colors : null,
      beats: beats.map((beat) => ({
        start: round(beat.start, 3),
        end: round(beat.end, 3),
        move: beat.move,
        variant: beat.variant,
        accent: beat.accent,
      })),
    };
    if (opts.scale != null && Number.isFinite(Number(opts.scale))) params.scale = Number(opts.scale);
    if (opts.x != null && Number.isFinite(Number(opts.x))) params.x = Number(opts.x);
    if (opts.y != null && Number.isFinite(Number(opts.y))) params.y = Number(opts.y);
    if (opts.color) params.color = String(opts.color);
    return { type: 'figure', params };
  }

  function blank(params) {
    return {
      type: 'figure',
      params: {
        motif: (params && params.motif) || 'orbit',
        sync: (params && params.sync) || 'beat',
        density: (params && params.density) || 0.5,
        colors: null,
        beats: [],
      },
    };
  }

  // Sub-beat at `time` with its local progress and the move windows.
  function beatAt(beats, time) {
    if (!Array.isArray(beats) || !beats.length) return null;
    for (let i = 0; i < beats.length; i += 1) {
      const beat = beats[i];
      if (time >= beat.start && time < beat.end) {
        const duration = Math.max(0.001, beat.end - beat.start);
        const local = time - beat.start;
        const window = Math.min(0.3, duration * 0.25);
        const inProgress = window > 0 ? clamp01(local / window) : 1;
        const outProgress = window > 0 ? clamp01((beat.end - time) / window) : 1;
        return { beat, index: i, local, duration, inProgress, outProgress };
      }
    }
    return null;
  }

  function colorOf(params, ctx, index) {
    const own = params.colors && params.colors.length ? params.colors : null;
    // a single hand-picked colour wins over the clip palette (but not over an
    // explicit multi-colour list)
    if (!own && params.color) return params.color;
    const list = own || (ctx && ctx.colors) || [];
    if (list.length) return list[Math.abs(Math.round(index || 0)) % list.length];
    return (ctx && ctx.color) || '#c86bff';
  }

  function frameBox(ctx) {
    const frame = (ctx && ctx.frame) || { width: 1920, height: 1080 };
    return { width: frame.width, height: frame.height, cx: frame.width / 2, cy: frame.height / 2, short: Math.min(frame.width, frame.height) };
  }

  // Text box in pixels when the caller has one (the engine passes the union of
  // the on-screen text boxes); otherwise a centred band.
  function textBox(ctx, box) {
    const source = ctx && ctx.textBox;
    if (source && Number.isFinite(Number(source.x0))) {
      return {
        x0: Number(source.x0),
        y0: Number(source.y0),
        x1: Number(source.x1),
        y1: Number(source.y1),
        cx: (Number(source.x0) + Number(source.x1)) / 2,
        cy: (Number(source.y0) + Number(source.y1)) / 2,
        w: Number(source.x1) - Number(source.x0),
        h: Number(source.y1) - Number(source.y0),
      };
    }
    return { x0: box.cx - box.width * 0.3, y0: box.cy - box.height * 0.12, x1: box.cx + box.width * 0.3, y1: box.cy + box.height * 0.12, cx: box.cx, cy: box.cy, w: box.width * 0.6, h: box.height * 0.24 };
  }

  function base(ctx, progress) {
    const box = frameBox(ctx);
    const scale = 0.5 + 0.5 * easeOut(progress);
    return { box, scale, opacity: clamp01(progress * 1.4) };
  }

  function motifShapes(motif, params, ctx, info) {
    const { beat, inProgress, outProgress } = info;
    const enter = easeOut(inProgress);
    const leave = 1 - easeIn(1 - outProgress);
    const progress = Math.min(enter, leave);
    const { box, opacity } = base(ctx, progress);
    const grow = box.scale0 || 1;
    void grow;
    const shapes = [];
    const density = Math.max(0.15, Math.min(1, num(params.density, 0.5)));
    const count = Math.max(4, Math.round(6 + density * 30));
    const variant = num(beat.variant, 0);
    const rotation = beat.move.hold === 'spin' ? info.local * 40 * (variant % 2 ? -1 : 1) : variant * 5;
    const pulse = beat.move.hold === 'pulse' ? 1 + 0.08 * Math.sin(TAU * info.local * 2) : 1;
    const drift = beat.move.hold === 'drift' ? Math.sin(info.local * 1.6) * box.short * 0.03 : 0;
    const scale = (0.2 + 0.8 * progress) * pulse;

    if (motif === 'orbit') {
      const radius = box.short * (0.14 + 0.1 * density) * scale;
      for (let i = 0; i < 3; i += 1) {
        const angle = info.local * (0.8 + i * 0.25) + (variant * TAU) / 3;
        shapes.push({ kind: 'ring', x: box.cx + Math.cos(angle) * radius, y: box.cy + Math.sin(angle) * radius * 0.72, r: box.short * 0.02 * (1 + i * 0.4), thickness: box.short * 0.005, color: colorOf(params, ctx, i), opacity: opacity * 0.8 });
      }
      shapes.push({ kind: 'circle', x: box.cx, y: box.cy, r: box.short * 0.03 * scale, color: colorOf(params, ctx, 0), opacity });
    } else if (motif === 'burst') {
      const reach = box.short * 0.22 * scale;
      for (let i = 0; i < count; i += 1) {
        const angle = (i / count) * TAU + rotation * 0.05;
        shapes.push({ kind: 'capsule', x0: box.cx, y0: box.cy, x1: box.cx + Math.cos(angle) * reach, y1: box.cy + Math.sin(angle) * reach, width: box.short * 0.006, color: colorOf(params, ctx, i), opacity: opacity * 0.85 });
      }
    } else if (motif === 'bars') {
      const bars = Math.max(5, Math.round(8 + density * 16));
      const width = box.width * 0.5;
      for (let i = 0; i < bars; i += 1) {
        const x = box.cx - width / 2 + (width * i) / (bars - 1);
        const level = (0.2 + 0.8 * Math.abs(Math.sin(info.local * 2 + i * 0.7))) * scale;
        const h = box.short * 0.16 * level * (variant % 2 ? -1 : 1);
        shapes.push({ kind: 'rect', x, y: box.cy - h, w: Math.max(2, width / bars - 3), h: Math.abs(h) * 2, radius: 2, color: colorOf(params, ctx, i), opacity: opacity * 0.8 });
      }
    } else if (motif === 'rings') {
      for (let i = 0; i < 4; i += 1) {
        const phase = ((info.local * 0.8 + i / 4) % 1 + 1) % 1;
        shapes.push({ kind: 'ring', x: box.cx, y: box.cy, r: phase * box.short * 0.28, thickness: box.short * 0.004, color: colorOf(params, ctx, i), opacity: opacity * (1 - phase) * 0.9 });
      }
    } else if (motif === 'confetti') {
      const random = rng.rngFor(0x51ed, 'confetti', info.index, variant);
      for (let i = 0; i < count; i += 1) {
        const rx = random();
        const ry = random();
        const spin = random() * TAU;
        const fall = ((info.local * (0.3 + ry * 0.5) + ry) % 1 + 1) % 1;
        shapes.push({ kind: 'rect', x: box.width * (0.1 + rx * 0.8), y: box.height * (0.15 + fall * 0.7) + drift, w: box.short * 0.012, h: box.short * 0.02, radius: 1, angle: (spin + info.local * 2) * 57.3, color: colorOf(params, ctx, i), opacity: opacity * 0.9 });
      }
    } else if (motif === 'frame') {
      const tb = textBox(ctx, box);
      const pad = tb.h * 0.35 * (0.4 + 0.6 * progress);
      const x0 = tb.x0 - pad;
      const y0 = tb.y0 - pad;
      const x1 = tb.x1 + pad;
      const y1 = tb.y1 + pad;
      const stroke = box.short * 0.004;
      const corners = [
        [x0, y0, x0 + (x1 - x0) * 0.25, y0], [x1, y0, x1, y0 + (y1 - y0) * 0.25],
        [x1, y1, x1 - (x1 - x0) * 0.25, y1], [x0, y1, x0, y1 - (y1 - y0) * 0.25],
      ];
      corners.forEach((corner, i) => {
        const dx = corner[2] - corner[0];
        const dy = corner[3] - corner[1];
        const length = Math.hypot(dx, dy) * progress;
        shapes.push({ kind: 'capsule', x0: corner[0], y0: corner[1], x1: corner[0] + (dx / Math.max(1e-6, Math.hypot(dx, dy))) * length, y1: corner[1] + (dy / Math.max(1e-6, Math.hypot(dx, dy))) * length, width: stroke, color: colorOf(params, ctx, i), opacity });
      });
    } else if (motif === 'underlineSweep') {
      const tb = textBox(ctx, box);
      const x0 = tb.x0 - tb.w * 0.05;
      const x1 = tb.x1 + tb.w * 0.05;
      const y = tb.y1 + tb.h * 0.22;
      const sweep = x0 + (x1 - x0) * progress;
      shapes.push({ kind: 'capsule', x0, y0: y, x1: sweep, y1: y + drift, width: box.short * 0.012, color: colorOf(params, ctx, 0), opacity });
      if (variant > 0) shapes.push({ kind: 'capsule', x0, y0: y + box.short * 0.02, x1: x0 + (sweep - x0) * 0.6, y1: y + box.short * 0.02, width: box.short * 0.006, color: colorOf(params, ctx, 1), opacity: opacity * 0.7 });
    } else if (motif === 'bracketsPop') {
      const tb = textBox(ctx, box);
      const push = tb.w * 0.12 * (0.5 + 0.5 * progress) * (1 + 0.15 * Math.sin(info.local * 4));
      const y0 = tb.y0 - tb.h * 0.2;
      const y1 = tb.y1 + tb.h * 0.2;
      const stroke = box.short * 0.012;
      shapes.push({ kind: 'capsule', x0: tb.x0 - push, y0, x1: tb.x0 - push, y1, width: stroke, color: colorOf(params, ctx, 0), opacity });
      shapes.push({ kind: 'capsule', x0: tb.x1 + push, y0, x1: tb.x1 + push, y1, width: stroke, color: colorOf(params, ctx, 1), opacity });
    } else if (motif === 'polyMorph') {
      const sides = 3 + (Math.round(info.local * 2) + variant) % 5;
      const radius = box.short * 0.12 * scale;
      for (let i = 0; i < 3; i += 1) {
        const angle = rotation + (i * TAU) / 3;
        shapes.push({ kind: 'polygon', x: box.cx + Math.cos(angle) * box.short * 0.14 * scale, y: box.cy + Math.sin(angle) * box.short * 0.1 * scale, r: radius, sides: sides + i, rotation: rotation * 20, stroke: box.short * 0.004, color: null, strokeColor: colorOf(params, ctx, i), opacity });
      }
    } else if (motif === 'ribbon') {
      const points = [];
      const amp = box.short * 0.08 * (0.3 + 0.7 * progress);
      for (let i = 0; i <= 16; i += 1) {
        const u = i / 16;
        points.push({ x: box.cx - box.width * 0.3 + box.width * 0.6 * u, y: box.cy + Math.sin(u * TAU * (1 + variant) + info.local * 2) * amp + drift });
      }
      for (let i = 0; i < points.length - 1; i += 1) {
        shapes.push({ kind: 'capsule', x0: points[i].x, y0: points[i].y, x1: points[i + 1].x, y1: points[i + 1].y, width: box.short * 0.008, color: colorOf(params, ctx, i), opacity: opacity * 0.85 });
      }
    } else if (motif === 'ticker') {
      const countTick = Math.max(4, Math.round(10 + density * 10));
      const width = box.width * 0.7;
      for (let i = 0; i < countTick; i += 1) {
        const u = (i / countTick + info.local * 0.15) % 1;
        const x = box.cx - width / 2 + width * u;
        const h = box.short * (0.01 + 0.02 * ((i * 7) % 5) / 5) * (0.5 + 0.5 * progress);
        shapes.push({ kind: 'rect', x, y: box.cy - h, w: box.short * 0.004, h: h * 2, color: colorOf(params, ctx, i), opacity: opacity * 0.7 });
      }
    } else if (motif === 'halftone') {
      const cols = Math.max(3, Math.round(4 + density * 6));
      const rows = Math.max(3, Math.round(cols * 0.6));
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const phase = Math.sin((col + row) * 0.9 - info.local * 2) * 0.5 + 0.5;
          const r = box.short * 0.008 * (0.3 + phase) * scale;
          shapes.push({ kind: 'circle', x: box.cx + (col - (cols - 1) / 2) * box.short * 0.045, y: box.cy + (row - (rows - 1) / 2) * box.short * 0.045, r, color: colorOf(params, ctx, col + row), opacity: opacity * phase });
        }
      }
    }

    // the in / out moves: a scatter slides each shape, a wipe clips the x span,
    // a fade drops the opacity, a pop scales (already in `scale`)
    if (beat.move.in === 'scatterIn' || beat.move.in === 'draw') {
      const spread = (1 - enter) * box.short * 0.25;
      for (let i = 0; i < shapes.length; i += 1) {
        const angle = (i / Math.max(1, shapes.length)) * TAU;
        if (shapes[i].kind === 'capsule') {
          shapes[i].x0 += Math.cos(angle) * spread;
          shapes[i].x1 += Math.cos(angle) * spread;
          shapes[i].y0 += Math.sin(angle) * spread;
          shapes[i].y1 += Math.sin(angle) * spread;
        } else if (shapes[i].x != null) {
          shapes[i].x += Math.cos(angle) * spread;
          shapes[i].y += Math.sin(angle) * spread;
        }
      }
    }
    if (beat.move.out === 'burstOut') {
      const spread = (1 - leave) * box.short * 0.35;
      for (let i = 0; i < shapes.length; i += 1) {
        const angle = (i / Math.max(1, shapes.length)) * TAU + 0.4;
        if (shapes[i].kind === 'capsule') {
          shapes[i].x1 += Math.cos(angle) * spread;
          shapes[i].y1 += Math.sin(angle) * spread;
        } else if (shapes[i].x != null) {
          shapes[i].x += Math.cos(angle) * spread;
          shapes[i].y += Math.sin(angle) * spread;
        }
      }
      for (const shape of shapes) if (shape.kind !== 'capsule' && shape.r != null) shape.r *= Math.max(0.05, leave);
    }
    if (beat.move.out === 'fade') {
      for (const shape of shapes) shape.opacity = (shape.opacity == null ? 1 : shape.opacity) * Math.max(0, leave);
    }
    // an explicit layer opacity (the legibility gate dims a figure that would
    // cover the lyrics) multiplies the finished shapes; absent = 1
    const ownOpacity = num(params.opacity, 1);
    if (ownOpacity < 1) {
      const level = clamp01(ownOpacity);
      for (const shape of shapes) shape.opacity = (shape.opacity == null ? 1 : shape.opacity) * level;
    }
    return { shapes, texts: [] };
  }

  // Maps every shape of a list through one scale / rotate / translate about
  // (originX, originY). filler-render's clip `animate` uses the same helper, and
  // a figure's own scale / x / y placement runs through it at draw time.
  function transformShapes(shapes, options) {
    const opts = options || {};
    const originX = num(opts.originX, 0);
    const originY = num(opts.originY, 0);
    const scale = opts.scale == null ? 1 : num(opts.scale, 1);
    const dx = num(opts.dx, 0);
    const dy = num(opts.dy, 0);
    const rotate = num(opts.rotate, 0);
    const cos = Math.cos(rotate);
    const sin = Math.sin(rotate);
    const mapPoint = (point) => {
      const px = (point.x - originX) * scale;
      const py = (point.y - originY) * scale;
      return { x: originX + px * cos - py * sin + dx, y: originY + px * sin + py * cos + dy };
    };
    for (const shape of shapes || []) {
      if (!shape) continue;
      if (Array.isArray(shape.points)) shape.points = shape.points.map(mapPoint);
      if (shape.kind === 'rect') {
        const p0 = mapPoint({ x: shape.x, y: shape.y });
        const p1 = mapPoint({ x: shape.x + shape.w, y: shape.y + shape.h });
        shape.x = Math.min(p0.x, p1.x);
        shape.y = Math.min(p0.y, p1.y);
        shape.w = Math.abs(p1.x - p0.x);
        shape.h = Math.abs(p1.y - p0.y);
      } else if (shape.kind === 'circle' || shape.kind === 'ring' || shape.kind === 'polygon') {
        const p = mapPoint({ x: shape.x, y: shape.y });
        shape.x = p.x;
        shape.y = p.y;
        if (shape.radius != null) shape.radius *= scale;
        if (shape.r != null) shape.r *= scale;
      } else if (shape.kind === 'capsule') {
        const p0 = mapPoint({ x: shape.x0, y: shape.y0 });
        const p1 = mapPoint({ x: shape.x1, y: shape.y1 });
        shape.x0 = p0.x;
        shape.y0 = p0.y;
        shape.x1 = p1.x;
        shape.y1 = p1.y;
        shape.width = (shape.width || 2) * scale;
      }
    }
    return shapes;
  }

  // The placement params (scale / x / y) map to a transform about the frame
  // centre; null when the figure sits exactly where it was drawn.
  function placementOf(params, ctx) {
    const scale = params.scale == null ? 1 : num(params.scale, 1);
    const x = num(params.x, 0);
    const y = num(params.y, 0);
    if (scale === 1 && !x && !y) return null;
    const frame = (ctx && ctx.frame) || { width: 1920, height: 1080 };
    return { originX: frame.width / 2, originY: frame.height / 2, scale, dx: x * frame.width, dy: y * frame.height, rotate: 0 };
  }

  // drawList for the figure clip type: resolve the sub-beat and build shapes.
  function drawList(spec, ctx) {
    const params = (spec && spec.params) || {};
    const time = num(ctx && ctx.time, 0);
    let beats = Array.isArray(params.beats) ? params.beats : [];
    const force = {};
    let forced = false;
    if (params.in && INS.includes(params.in)) {
      force.in = params.in;
      forced = true;
    }
    if (params.hold && HOLDS.includes(params.hold)) {
      force.hold = params.hold;
      forced = true;
    }
    if (params.out && OUTS.includes(params.out)) {
      force.out = params.out;
      forced = true;
    }
    if (!beats.length) {
      // a hand-made clip: derive the sub-beats from the clip's own beats / the
      // rhythm cuts in the context (deterministic from the clip key)
      const span = (ctx && ctx.clip) || {};
      const generated = generate({
        span: { start: num(span.start, 0), end: num(span.end, num(span.start, 0) + 4) },
        beats: ctx && ctx.beats,
        cuts: ctx && ctx.cuts,
        sync: params.sync,
        motif: params.motif,
        seed: ctx && ctx.seed,
        id: (ctx && ctx.clip && ctx.clip.key) || 'figure',
        density: params.density,
        in: params.in,
        hold: params.hold,
        out: params.out,
        scale: params.scale,
        x: params.x,
        y: params.y,
        color: params.color,
        axes: { weird: 0.5, energy: 0.5 },
      });
      beats = generated.params.beats;
    } else if (forced) {
      // editing an in / hold / out move on an already generated figure must take
      // effect without regenerating: override on a shallow copy, never in place
      beats = beats.map((beat) => ({ ...beat, move: { ...(beat.move || {}), ...force } }));
    }
    const info = beatAt(beats, time);
    if (!info) return { shapes: [], texts: [] };
    const result = motifShapes(params.motif || 'orbit', params, ctx || {}, info);
    const place = placementOf(params, ctx || {});
    if (place) transformShapes(result.shapes, place);
    return result;
  }

  return { MOTIFS, INS, HOLDS, OUTS, SYNCS, generate, blank, drawList, subBeats, beatAt, transformShapes };
});
