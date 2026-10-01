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

  const MOTIFS = [
    'orbit', 'burst', 'bars', 'rings', 'confetti', 'frame', 'underlineSweep', 'bracketsPop',
    'polyMorph', 'ribbon', 'ticker', 'halftone',
    // fear / variety pack
    'cracks', 'spikes', 'eyes', 'scratches', 'drips', 'lattice', 'waves', 'comets',
  ];
  // the bold rhythm set: thick shapes placed away from the text box, drawn with
  // the snappy easing and a longer in window. `generate` draws from it when the
  // profile's figureBoldChance roll succeeds.
  const BOLD_MOTIFS = ['slabWipe', 'cornerBlocks', 'ringDraw', 'stripeRun', 'dotGrid', 'sideBars'];
  MOTIFS.push(...BOLD_MOTIFS);
  // the procedural motif: a composition grown from a seed (layers x layout x
  // symmetry x element kinds x size / colour / motion rules x continuous
  // values). `generate` draws it most of the time, so clips rarely look alike.
  const PROC = 'proc';
  MOTIFS.push(PROC);
  const PROC_CHANCE = 0.75;
  const PROC_LAYER_BUDGET = 240;
  const PROC_TOTAL_BUDGET = 480;
  const INS = ['pop', 'draw', 'wipe', 'scatterIn'];
  const HOLDS = ['spin', 'pulse', 'drift', 'morph'];
  const OUTS = ['shrink', 'fade', 'burstOut'];
  const SYNCS = ['beat', 'free', 'text'];
  const STROKES = { thin: 0.7, med: 1.3, bold: 2.2 };
  const TAU = Math.PI * 2;

  // Optional per-clip tuning (the filler params): count 3..24, radius 0.3..1.2,
  // aspect 0.5..2, spinRate 0..2, stroke thin / med / bold. Unset values keep
  // the historic draw of the motif.
  function tuningOf(params) {
    const p = params || {};
    const number = (value, fallback) => (value == null || value === '' ? fallback : num(value, fallback));
    return {
      count: p.count == null ? null : Math.max(3, Math.min(24, Math.round(number(p.count, 8)))),
      radius: Math.max(0.3, Math.min(1.2, number(p.radius, 1))),
      aspect: Math.max(0.5, Math.min(2, number(p.aspect, 1))),
      spinRate: Math.max(0, Math.min(2, number(p.spinRate, 1))),
      stroke: STROKES[p.stroke] == null ? 1 : STROKES[p.stroke],
    };
  }

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

  // The bold motifs' own easing: an expo out plus an 8% overshoot, so a slab
  // or bar arrives with a snap instead of drifting in.
  function snap(t) {
    const p = clamp01(t);
    return 1 - Math.pow(2, -10 * p) + 0.08 * Math.sin(Math.PI * p);
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
    const motifPool = (w >= 0.6 ? MOTIFS : MOTIFS.filter((name) => name !== 'halftone')).filter((name) => name !== PROC);
    // the motif pool answers the smartness and fear axes (a no-op at 0)
    let motif = requested || fxAxes.pickWeighted(random, 'figureMotif', motifPool, axes, { smartness: s });
    // the procedural motif draws from its own stream, so every other draw below
    // is unchanged; the fear axis hands the pick back to the scary fixed motifs
    const procRandom = rng.rngFor(seed, 'figure-proc', id);
    const procRoll = procRandom();
    const procSeed = Math.floor(procRandom() * 1e9);
    const fear = Number.isFinite(Number(axes.fear)) ? clamp01(axes.fear) : 0;
    if (!requested && procRoll < PROC_CHANCE * (1 - fear)) motif = PROC;
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
    if (motif === PROC) params.seed = Number.isFinite(Number(opts.procSeed)) ? Number(opts.procSeed) : procSeed;
    if (opts.scale != null && Number.isFinite(Number(opts.scale))) params.scale = Number(opts.scale);
    if (opts.x != null && Number.isFinite(Number(opts.x))) params.x = Number(opts.x);
    if (opts.y != null && Number.isFinite(Number(opts.y))) params.y = Number(opts.y);
    if (opts.color) params.color = String(opts.color);
    // optional motif tuning (the filler editor writes these)
    if (opts.stroke != null) params.stroke = STROKES[opts.stroke] != null ? opts.stroke : 'med';
    for (const key of ['count', 'radius', 'aspect', 'spinRate']) {
      if (opts[key] != null && Number.isFinite(Number(opts[key]))) params[key] = Number(opts[key]);
    }
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

  // Sub-beat at `time` with its local progress and the move windows. The bold
  // motifs open with a longer in window (0.45 s cap) so the snap reads.
  function beatAt(beats, time, motif) {
    if (!Array.isArray(beats) || !beats.length) return null;
    const bold = BOLD_MOTIFS.includes(motif);
    for (let i = 0; i < beats.length; i += 1) {
      const beat = beats[i];
      if (time >= beat.start && time < beat.end) {
        const duration = Math.max(0.001, beat.end - beat.start);
        const local = time - beat.start;
        const window = Math.min(bold ? 0.45 : 0.3, duration * (bold ? 0.35 : 0.25));
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

  // ---------------------------------------------------------------------------
  // procedural motif
  //
  // A clip's `seed` grows a genome of 1..3 layers. Every layer independently
  // draws a layout, a symmetry, one to three element kinds, a size rule, a
  // colour rule, a motion rule and the continuous values (count, size, spread,
  // offset, jitter, tilt, opacity...). The sub-beat only reshuffles the
  // placement, so a clip keeps its family while its beats still differ.

  const PROC_LAYOUTS = ['radial', 'grid', 'scatter', 'spiral', 'curve', 'cluster', 'brick', 'edge', 'bands', 'burst'];
  const PROC_KINDS = ['circle', 'ring', 'rect', 'capsule', 'polygon', 'polyline', 'cross', 'shard', 'dash'];
  const PROC_SIZE_RULES = ['flat', 'ramp', 'radial', 'invRadial', 'random', 'alternate'];
  const PROC_COLOR_RULES = ['index', 'random', 'radius', 'angle', 'single', 'band'];
  const PROC_MOTIONS = ['spin', 'breathe', 'wave', 'flow', 'orbit', 'still', 'twinkle'];
  const PROC_SYMMETRIES = ['none', 'none', 'mirrorX', 'mirrorY', 'mirror4', 'fold', 'fold'];

  function logRange(random, lo, hi) {
    return Math.exp(rng.range(random, Math.log(lo), Math.log(hi)));
  }

  function procGenome(seed) {
    const random = rng.rngFor(seed, 'proc-genome');
    const layerCount = 1 + (random() < 0.55 ? 1 : 0) + (random() < 0.2 ? 1 : 0);
    const layers = [];
    for (let l = 0; l < layerCount; l += 1) {
      const kindCount = 1 + (random() < 0.5 ? 1 : 0) + (random() < 0.2 ? 1 : 0);
      const kinds = [];
      for (let k = 0; k < kindCount; k += 1) kinds.push(pick(random, PROC_KINDS));
      layers.push({
        layout: pick(random, PROC_LAYOUTS),
        kinds,
        symmetry: pick(random, PROC_SYMMETRIES),
        folds: 2 + Math.floor(random() * 7),
        sizeRule: pick(random, PROC_SIZE_RULES),
        colorRule: pick(random, PROC_COLOR_RULES),
        motion: pick(random, PROC_MOTIONS),
        count: Math.round(logRange(random, 5, 90)),
        size: logRange(random, 0.006, 0.075),
        stretch: logRange(random, 0.4, 5),
        spreadX: rng.range(random, 0.12, 0.5),
        spreadY: rng.range(random, 0.12, 0.5),
        offsetX: rng.range(random, -0.22, 0.22),
        offsetY: rng.range(random, -0.2, 0.2),
        jitter: random() < 0.4 ? 0 : rng.range(random, 0.02, 0.6),
        tilt: random() < 0.4 ? 0 : rng.range(random, 0, 360),
        tiltRandom: random() < 0.5 ? 0 : rng.range(random, 0, 180),
        opacity: rng.range(random, 0.35, 0.95),
        sides: 3 + Math.floor(random() * 7),
        filled: random() < 0.5,
        weight: logRange(random, 0.0015, 0.012),
        speed: rng.range(random, 0.25, 1.6) * (random() < 0.5 ? -1 : 1),
        phase: random() * TAU,
        rings: 1 + Math.floor(random() * 4),
        aspect: rng.range(random, 0.5, 2),
        twist: random() < 0.5 ? 2.39996 : rng.range(random, 0.2, 3),
        freqA: 1 + Math.floor(random() * 5),
        freqB: 1 + Math.floor(random() * 5),
        amp: rng.range(random, 0.15, 0.9),
        blobs: 2 + Math.floor(random() * 4),
        slope: rng.range(random, -0.6, 0.6),
        avoidText: random() < 0.75,
        colorShift: Math.floor(random() * 5),
      });
    }
    return layers;
  }

  function procCopies(layer) {
    if (layer.symmetry === 'mirrorX' || layer.symmetry === 'mirrorY') return 2;
    if (layer.symmetry === 'mirror4') return 4;
    if (layer.symmetry === 'fold') return layer.folds;
    return 1;
  }

  // unit-space points in [-1, 1]^2 with the order fraction `t`, radius `r`, angle `a`
  function procPoints(layer, n, random) {
    const points = [];
    const push = (x, y, t) => points.push({ x, y, t, r: Math.min(1.5, Math.hypot(x, y)), a: Math.atan2(y, x) });
    const layout = layer.layout;
    if (layout === 'radial') {
      const per = Math.max(1, Math.round(n / layer.rings));
      for (let ring = 0; ring < layer.rings; ring += 1) {
        const offset = random() * TAU;
        for (let i = 0; i < per; i += 1) {
          const a = offset + (i / per) * TAU;
          const rad = (ring + 1) / layer.rings;
          push(Math.cos(a) * rad, Math.sin(a) * rad, (ring * per + i) / (layer.rings * per));
        }
      }
    } else if (layout === 'grid') {
      const cols = Math.max(2, Math.round(Math.sqrt(n * layer.aspect)));
      const rows = Math.max(2, Math.ceil(n / cols));
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) push((col / (cols - 1)) * 2 - 1, (row / (rows - 1)) * 2 - 1, (row * cols + col) / (rows * cols));
      }
    } else if (layout === 'spiral') {
      for (let i = 0; i < n; i += 1) {
        const rad = Math.sqrt((i + 0.5) / n);
        push(Math.cos(i * layer.twist) * rad, Math.sin(i * layer.twist) * rad, i / n);
      }
    } else if (layout === 'curve') {
      for (let i = 0; i < n; i += 1) {
        const u = i / Math.max(1, n - 1);
        if (layer.freqB > 3) push(Math.sin(layer.freqA * u * TAU + layer.phase), Math.sin(layer.freqB * u * TAU), u);
        else push(u * 2 - 1, Math.sin(u * TAU * layer.freqA * 0.5 + layer.phase) * layer.amp, u);
      }
    } else if (layout === 'cluster') {
      const centers = [];
      for (let b = 0; b < layer.blobs; b += 1) centers.push({ x: rng.range(random, -0.7, 0.7), y: rng.range(random, -0.7, 0.7), s: rng.range(random, 0.1, 0.35) });
      for (let i = 0; i < n; i += 1) {
        const c = centers[i % centers.length];
        push(c.x + rng.gauss(random) * c.s, c.y + rng.gauss(random) * c.s, i / n);
      }
    } else if (layout === 'brick') {
      const rows = 2 + Math.floor(random() * 5);
      const per = Math.max(2, Math.round(n / rows));
      for (let row = 0; row < rows; row += 1) {
        for (let i = 0; i < per; i += 1) push(((i + (row % 2 ? 0.5 : 0)) / per) * 2 - 1, (row / (rows - 1)) * 2 - 1, (row * per + i) / (rows * per));
      }
    } else if (layout === 'edge') {
      for (let i = 0; i < n; i += 1) {
        const u = (i / n) * 4;
        const side = Math.floor(u);
        const f = (u - side) * 2 - 1;
        const at = [[f, -1], [1, f], [-f, 1], [-1, -f]][side % 4];
        push(at[0], at[1], i / n);
      }
    } else if (layout === 'bands') {
      const rows = 2 + Math.floor(random() * 5);
      const per = Math.max(2, Math.round(n / rows));
      for (let row = 0; row < rows; row += 1) {
        for (let i = 0; i < per; i += 1) {
          const x = (i / (per - 1)) * 2 - 1;
          push(x, (row / (rows - 1)) * 2 - 1 + x * layer.slope, (row * per + i) / (rows * per));
        }
      }
    } else if (layout === 'burst') {
      const arms = 3 + Math.floor(random() * 10);
      const per = Math.max(1, Math.round(n / arms));
      for (let arm = 0; arm < arms; arm += 1) {
        const a = (arm / arms) * TAU + layer.phase;
        for (let i = 0; i < per; i += 1) push(Math.cos(a) * ((i + 1) / per), Math.sin(a) * ((i + 1) / per), (arm * per + i) / (arms * per));
      }
    } else {
      // scatter: a disc on even freqA, a rectangle otherwise
      for (let i = 0; i < n; i += 1) {
        if (layer.freqA % 2 === 0) {
          const rad = Math.sqrt(random());
          const a = random() * TAU;
          push(Math.cos(a) * rad, Math.sin(a) * rad, i / n);
        } else {
          push(random() * 2 - 1, random() * 2 - 1, i / n);
        }
      }
    }
    return points;
  }

  // the point plus its symmetric copies (`turn` / `flip` feed the element tilt)
  function procMirror(layer, point) {
    const list = [point];
    if (layer.symmetry === 'mirrorX') list.push({ ...point, x: -point.x, flip: true });
    else if (layer.symmetry === 'mirrorY') list.push({ ...point, y: -point.y, flip: true });
    else if (layer.symmetry === 'mirror4') list.push({ ...point, x: -point.x, flip: true }, { ...point, y: -point.y, flip: true }, { ...point, x: -point.x, y: -point.y });
    else if (layer.symmetry === 'fold') {
      for (let k = 1; k < layer.folds; k += 1) {
        const a = (k / layer.folds) * TAU;
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        list.push({ ...point, x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos, turn: a });
      }
    }
    return list;
  }

  // one element -> plain shapes (e: x, y, s(size px), angle(deg), color, opacity, weight(px))
  function procPush(shapes, layer, kind, e) {
    const { x, y, s, angle, color, opacity, weight } = e;
    const rad = (angle * Math.PI) / 180;
    if (kind === 'circle') shapes.push({ kind: 'circle', x, y, r: s, color, opacity });
    else if (kind === 'ring') shapes.push({ kind: 'ring', x, y, r: s, thickness: Math.max(1, weight), color, opacity });
    else if (kind === 'rect') {
      const w = s * 2 * layer.stretch;
      const h = (s * 2) / Math.max(0.6, layer.stretch * 0.6);
      shapes.push({ kind: 'rect', x: x - w / 2, y: y - h / 2, w, h, radius: Math.min(w, h) * 0.15, angle, color, opacity });
    } else if (kind === 'capsule' || kind === 'dash') {
      const len = kind === 'dash' ? s * 1.2 : s * (1 + layer.stretch);
      shapes.push({ kind: 'capsule', x0: x - Math.cos(rad) * len, y0: y - Math.sin(rad) * len, x1: x + Math.cos(rad) * len, y1: y + Math.sin(rad) * len, width: Math.max(1, kind === 'dash' ? weight * 2.2 : weight), color, opacity });
    } else if (kind === 'polygon') {
      shapes.push({ kind: 'polygon', x, y, r: s, sides: layer.sides, rotation: angle, stroke: Math.max(1, weight), strokeColor: color, color: layer.filled ? color : null, opacity });
    } else if (kind === 'polyline') {
      shapes.push({ kind: 'polygon', x, y, r: s, sides: layer.sides, rotation: angle, stroke: Math.max(1, weight * 1.4), strokeColor: color, color: null, opacity });
    } else if (kind === 'cross') {
      for (let k = 0; k < 2; k += 1) {
        const a = rad + (k * Math.PI) / 2;
        shapes.push({ kind: 'capsule', x0: x - Math.cos(a) * s, y0: y - Math.sin(a) * s, x1: x + Math.cos(a) * s, y1: y + Math.sin(a) * s, width: Math.max(1, weight), color, opacity });
      }
    } else if (kind === 'shard') {
      const corners = 3 + (layer.sides % 2);
      const points = [];
      for (let k = 0; k < corners; k += 1) {
        const a = rad + (k / corners) * TAU;
        const reach = s * (k % 2 ? 0.55 : 1.15);
        points.push({ x: x + Math.cos(a) * reach * Math.min(2, layer.stretch) * 0.5, y: y + Math.sin(a) * reach });
      }
      shapes.push({ kind: 'convex', points, color, opacity });
    }
  }

  function procShapes(params, ctx, info, state, tuning, density) {
    const { box, opacity } = state;
    const seed = Number.isFinite(Number(params.seed)) ? Number(params.seed) : 1;
    const layers = procGenome(seed);
    const tb = textBox(ctx, box);
    const local = info.local;
    const shapes = [];
    layers.forEach((layer, li) => {
      if (shapes.length >= PROC_TOTAL_BUDGET) return;
      const random = rng.rngFor(seed, 'proc-place', li, info.index, state.variant);
      const copies = procCopies(layer);
      const countScale = tuning.count == null ? 0.6 + density : tuning.count / 8;
      const n = Math.max(3, Math.min(150, Math.round(layer.count * countScale)));
      let points = procPoints(layer, n, random);
      // decimate evenly when symmetry would blow the per-layer budget
      const cap = Math.max(3, Math.floor(PROC_LAYER_BUDGET / copies));
      if (points.length > cap) {
        const stride = Math.ceil(points.length / cap);
        points = points.filter((_, i) => i % stride === 0);
      }
      const spanX = box.width * layer.spreadX * state.scale;
      const spanY = box.height * layer.spreadY * state.scale;
      const cx = box.cx + box.width * layer.offsetX;
      const cy = box.cy + box.height * layer.offsetY;
      const turn = (state.rotation * Math.PI) / 180 + (layer.motion === 'spin' ? local * layer.speed * 0.8 : 0);
      const cosT = Math.cos(turn);
      const sinT = Math.sin(turn);
      const sizeBase = box.short * layer.size * state.scale;
      const weight = box.short * layer.weight;
      let counter = 0;
      for (const base of points) {
        // every random value of the element is drawn here, before any element
        // can be skipped, so the stream never depends on the time
        const jx = layer.jitter ? (random() * 2 - 1) * layer.jitter * 0.25 : 0;
        const jy = layer.jitter ? (random() * 2 - 1) * layer.jitter * 0.25 : 0;
        const tiltNoise = layer.tiltRandom ? (random() * 2 - 1) * layer.tiltRandom : 0;
        const sizeNoise = Math.exp(rng.gauss(random) * 0.45);
        const kind = layer.kinds[Math.floor(random() * layer.kinds.length)];
        const colorRoll = random();
        for (const point of procMirror(layer, { ...base, x: base.x + jx, y: base.y + jy })) {
          const index = counter;
          counter += 1;
          let ux = point.x;
          let uy = point.y;
          const phase = index * 0.7 + layer.phase;
          if (layer.motion === 'wave') uy += Math.sin(local * layer.speed * 2.2 + ux * 3 + layer.phase) * 0.12;
          else if (layer.motion === 'flow') ux = ((((ux + 1) / 2 + local * layer.speed * 0.12) % 1) + 1) % 1 * 2 - 1;
          else if (layer.motion === 'orbit') {
            const a = local * layer.speed * (0.4 + base.r * 0.6);
            const ox = ux * Math.cos(a) - uy * Math.sin(a);
            uy = ux * Math.sin(a) + uy * Math.cos(a);
            ux = ox;
          }
          const x = cx + (ux * cosT - uy * sinT) * spanX;
          const y = cy + (ux * sinT + uy * cosT) * spanY + state.drift;
          let s;
          if (layer.sizeRule === 'ramp') s = sizeBase * (0.3 + 1.4 * base.t);
          else if (layer.sizeRule === 'radial') s = sizeBase * (1.5 - Math.min(1.2, base.r));
          else if (layer.sizeRule === 'invRadial') s = sizeBase * (0.3 + Math.min(1.2, base.r));
          else if (layer.sizeRule === 'random') s = sizeBase * sizeNoise;
          else if (layer.sizeRule === 'alternate') s = sizeBase * (index % 2 ? 0.45 : 1.3);
          else s = sizeBase;
          let alpha = layer.opacity;
          if (layer.motion === 'breathe') s *= 0.65 + 0.35 * Math.sin(local * layer.speed * 2 + phase);
          else if (layer.motion === 'twinkle') alpha *= 0.3 + 0.7 * Math.abs(Math.sin(local * layer.speed * 1.5 + phase));
          // the beat never draws empty: the first element is kept even if the
          // placement would skip it, so a clip cannot vanish between two frames
          const first = shapes.length === 0;
          if (first) s = Math.max(s, 1.2);
          else if (s < 0.8) continue;
          // keep the lyrics clear: skip what lands on the padded text box
          if (layer.avoidText && !first) {
            const pad = s * 1.6;
            if (x > tb.x0 - pad && x < tb.x1 + pad && y > tb.y0 - pad && y < tb.y1 + pad) continue;
          }
          let colorIndex;
          if (layer.colorRule === 'random') colorIndex = Math.floor(colorRoll * 8);
          else if (layer.colorRule === 'radius') colorIndex = Math.floor(Math.min(1, base.r) * 4);
          else if (layer.colorRule === 'angle') colorIndex = Math.floor(((base.a + Math.PI) / TAU) * 5);
          else if (layer.colorRule === 'single') colorIndex = layer.colorShift;
          else if (layer.colorRule === 'band') colorIndex = Math.floor(base.t * 4) + layer.colorShift;
          else colorIndex = index + layer.colorShift;
          const angle = layer.tilt + tiltNoise + (point.turn ? (point.turn * 180) / Math.PI : 0) + (point.flip ? 180 : 0) + (layer.motion === 'spin' ? local * layer.speed * 40 : 0);
          procPush(shapes, layer, kind, { x, y, s, angle, color: colorOf(params, ctx, colorIndex + li), opacity: opacity * alpha, weight });
        }
      }
    });
    return shapes.length > PROC_TOTAL_BUDGET ? shapes.slice(0, PROC_TOTAL_BUDGET) : shapes;
  }

  // ---------------------------------------------------------------------------
  // motif geometry

  // The shapes of one motif for one sub-beat. `state` carries the shared
  // scale / opacity / rotation and the optional morph phase. The move
  // post-processing happens in motifShapes, so a morph can blend two calls.
  function buildMotif(motif, params, ctx, info, state) {
    const { beat, inProgress, outProgress } = info;
    const bold = BOLD_MOTIFS.includes(motif);
    const enter = bold ? snap(inProgress) : easeOut(inProgress);
    const leave = 1 - easeIn(1 - outProgress);
    const progress = Math.min(enter, leave);
    const { box, opacity } = state;
    const grow = box.scale0 || 1;
    void grow;
    const shapes = [];
    const density = Math.max(0.15, Math.min(1, num(params.density, 0.5)));
    const tuning = state.tuning || tuningOf(params);
    const variant = state.variant;
    const rotation = state.rotation;
    const pulse = state.pulse;
    const drift = state.drift;
    const scale = state.scale;
    const morph = state.morphPhase == null ? null : clamp01(state.morphPhase);
    const countOf = (fallback) => (tuning.count == null ? fallback : tuning.count);
    const stroke = box.short * 0.006 * tuning.stroke;
    const spinRate = state.spinRate == null ? 1 : state.spinRate;

    if (motif === PROC) return procShapes(params, ctx, info, state, tuning, density);

    if (motif === 'orbit') {
      const radius = box.short * (0.14 + 0.1 * density) * scale;
      const rings = tuning.count == null ? 3 : Math.max(3, Math.min(6, tuning.count));
      for (let i = 0; i < rings; i += 1) {
        const angle = info.local * (0.8 + i * 0.25) * spinRate + (variant * TAU) / 3;
        shapes.push({ kind: 'ring', x: box.cx + Math.cos(angle) * radius, y: box.cy + Math.sin(angle) * radius * 0.72, r: box.short * 0.02 * (1 + i * 0.4), thickness: box.short * 0.008 * tuning.stroke, color: colorOf(params, ctx, i), opacity: opacity * 0.8 });
      }
      shapes.push({ kind: 'circle', x: box.cx, y: box.cy, r: box.short * 0.03 * scale, color: colorOf(params, ctx, 0), opacity });
    } else if (motif === 'burst') {
      const count = countOf(Math.max(4, Math.round(6 + density * 30)));
      const reach = box.short * 0.22 * scale;
      for (let i = 0; i < count; i += 1) {
        const angle = (i / count) * TAU + rotation * 0.05;
        shapes.push({ kind: 'capsule', x0: box.cx, y0: box.cy, x1: box.cx + Math.cos(angle) * reach, y1: box.cy + Math.sin(angle) * reach, width: box.short * 0.009 * tuning.stroke, color: colorOf(params, ctx, i), opacity: opacity * 0.85 });
      }
    } else if (motif === 'bars') {
      const bars = Math.max(5, Math.round(8 + density * 16));
      const total = countOf(bars);
      const width = box.width * 0.5;
      const morphLevel = morph == null ? 1 : 0.55 + 0.9 * Math.abs(Math.sin(Math.PI * morph));
      for (let i = 0; i < total; i += 1) {
        const x = box.cx - width / 2 + (width * i) / Math.max(1, total - 1);
        const level = (0.2 + 0.8 * Math.abs(Math.sin(info.local * 2 + i * 0.7))) * scale * morphLevel;
        const h = box.short * 0.16 * level * (variant % 2 ? -1 : 1);
        shapes.push({ kind: 'rect', x, y: box.cy - h, w: Math.max(2, width / total - 3), h: Math.abs(h) * 2, radius: 2, color: colorOf(params, ctx, i), opacity: opacity * 0.8 });
      }
    } else if (motif === 'rings') {
      const count = tuning.count == null ? 4 : Math.max(2, Math.min(8, tuning.count));
      for (let i = 0; i < count; i += 1) {
        const phase = ((info.local * 0.8 + i / count) % 1 + 1) % 1;
        // morph: the radius itself breathes between two shapes
        const baseR = morph == null ? 0.28 : 0.2 + 0.14 * morph;
        shapes.push({ kind: 'ring', x: box.cx, y: box.cy, r: phase * box.short * baseR * (0.7 + 0.3 * scale), thickness: box.short * 0.007 * tuning.stroke, color: colorOf(params, ctx, i), opacity: opacity * (1 - phase) * 0.9 });
      }
    } else if (motif === 'confetti') {
      const count = countOf(Math.max(4, Math.round(6 + density * 30)));
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
      const pad = tb.h * (0.2 + 0.25 * density) * (0.4 + 0.6 * progress);
      const x0 = tb.x0 - pad;
      const y0 = tb.y0 - pad;
      const x1 = tb.x1 + pad;
      const y1 = tb.y1 + pad;
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
      const y = tb.y1 + tb.h * (0.18 + 0.12 * density);
      const sweep = x0 + (x1 - x0) * progress;
      shapes.push({ kind: 'capsule', x0, y0: y, x1: sweep, y1: y + drift, width: box.short * 0.016 * tuning.stroke, color: colorOf(params, ctx, 0), opacity });
      if (variant > 0) shapes.push({ kind: 'capsule', x0, y0: y + box.short * 0.02, x1: x0 + (sweep - x0) * 0.6, y1: y + box.short * 0.02, width: box.short * 0.009 * tuning.stroke, color: colorOf(params, ctx, 1), opacity: opacity * 0.7 });
    } else if (motif === 'bracketsPop') {
      const tb = textBox(ctx, box);
      const push = tb.w * (0.08 + 0.08 * density) * (0.5 + 0.5 * progress) * (1 + 0.15 * Math.sin(info.local * 4));
      const y0 = tb.y0 - tb.h * 0.2;
      const y1 = tb.y1 + tb.h * 0.2;
      const w = box.short * 0.016 * tuning.stroke;
      shapes.push({ kind: 'capsule', x0: tb.x0 - push, y0, x1: tb.x0 - push, y1, width: w, color: colorOf(params, ctx, 0), opacity });
      shapes.push({ kind: 'capsule', x0: tb.x1 + push, y0, x1: tb.x1 + push, y1, width: w, color: colorOf(params, ctx, 1), opacity });
    } else if (motif === 'polyMorph') {
      // morph = the side count walks continuously through 3..7 (and back)
      const walk = morph == null ? (Math.round(info.local * 2) + variant) % 5 : ((morph * 4 + variant) % 4.999);
      const sides = 3 + Math.floor(walk);
      const nextSides = 3 + Math.floor((walk + 1) % 5);
      const blend = walk - Math.floor(walk);
      const radius = box.short * 0.12 * scale;
      for (let i = 0; i < 3; i += 1) {
        const angle = rotation + (i * TAU) / 3;
        shapes.push({ kind: 'polygon', x: box.cx + Math.cos(angle) * box.short * 0.14 * scale, y: box.cy + Math.sin(angle) * box.short * 0.1 * scale, r: radius, sides: i === 0 && blend > 0.5 ? nextSides : sides + i, rotation: rotation * 20, stroke: stroke, color: null, strokeColor: colorOf(params, ctx, i), opacity });
      }
    } else if (motif === 'ribbon') {
      const points = [];
      const amp = box.short * (0.05 + 0.03 * density) * (0.3 + 0.7 * progress);
      const waves = tuning.count == null ? 1 + variant : Math.max(1, Math.min(4, tuning.count / 4));
      for (let i = 0; i <= 16; i += 1) {
        const u = i / 16;
        points.push({ x: box.cx - box.width * 0.3 + box.width * 0.6 * u, y: box.cy + Math.sin(u * TAU * waves + info.local * 2) * amp + drift });
      }
      for (let i = 0; i < points.length - 1; i += 1) {
        shapes.push({ kind: 'capsule', x0: points[i].x, y0: points[i].y, x1: points[i + 1].x, y1: points[i + 1].y, width: box.short * 0.011 * tuning.stroke, color: colorOf(params, ctx, i), opacity: opacity * 0.85 });
      }
    } else if (motif === 'ticker') {
      const countTick = countOf(Math.max(4, Math.round(10 + density * 10)));
      const width = box.width * 0.7;
      for (let i = 0; i < countTick; i += 1) {
        const u = (i / countTick + info.local * 0.15 * spinRate) % 1;
        const x = box.cx - width / 2 + width * u;
        const h = box.short * (0.01 + 0.02 * ((i * 7) % 5) / 5) * (0.5 + 0.5 * progress);
        shapes.push({ kind: 'rect', x, y: box.cy - h, w: box.short * 0.006, h: h * 2, color: colorOf(params, ctx, i), opacity: opacity * 0.7 });
      }
    } else if (motif === 'halftone') {
      const cols = tuning.count == null ? Math.max(3, Math.round(4 + density * 6)) : Math.max(3, Math.min(12, Math.round(tuning.count / 2)));
      const rows = Math.max(3, Math.round(cols * 0.6));
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const phase = Math.sin((col + row) * 0.9 - info.local * 2) * 0.5 + 0.5;
          const r = box.short * 0.008 * (0.3 + phase) * scale * (tuning.radius == null ? 1 : tuning.radius);
          shapes.push({ kind: 'circle', x: box.cx + (col - (cols - 1) / 2) * box.short * 0.045, y: box.cy + (row - (rows - 1) / 2) * box.short * 0.045, r, color: colorOf(params, ctx, col + row), opacity: opacity * phase });
        }
      }
    } else if (motif === 'cracks') {
      const random = rng.rngFor(0x0c4a, 'cracks', info.index, variant);
      const branches = countOf(4 + Math.round(density * 4));
      const originX = box.cx + (random() * 2 - 1) * box.width * 0.08;
      const originY = box.cy + (random() * 2 - 1) * box.height * 0.08;
      const reach = box.short * (0.12 + 0.14 * (0.4 + 0.6 * progress));
      for (let i = 0; i < branches; i += 1) {
        const angle = random() * TAU;
        const length = reach * (0.5 + random() * 0.9);
        const kink = 0.35 + random() * 0.4;
        const mx = originX + Math.cos(angle) * length * kink;
        const my = originY + Math.sin(angle) * length * kink;
        const ex = mx + Math.cos(angle + (random() - 0.5) * 0.9) * length * (1 - kink);
        const ey = my + Math.sin(angle + (random() - 0.5) * 0.9) * length * (1 - kink);
        const w = box.short * 0.005 * tuning.stroke;
        shapes.push({ kind: 'capsule', x0: originX, y0: originY, x1: mx, y1: my, width: w, color: colorOf(params, ctx, i), opacity: opacity * 0.9 });
        shapes.push({ kind: 'capsule', x0: mx, y0: my, x1: ex, y1: ey, width: w * 0.7, color: colorOf(params, ctx, i + 1), opacity: opacity * 0.8 });
      }
    } else if (motif === 'spikes') {
      const count = countOf(Math.max(6, Math.round(9 + density * 12)));
      const reach = box.short * 0.2 * scale;
      for (let i = 0; i < count; i += 1) {
        const angle = (i / count) * TAU + rotation * 0.04;
        const length = reach * (0.5 + 0.5 * Math.abs(Math.sin(info.local * 1.6 + i)));
        shapes.push({ kind: 'capsule', x0: box.cx, y0: box.cy, x1: box.cx + Math.cos(angle) * length, y1: box.cy + Math.sin(angle) * length, width: box.short * 0.004 * tuning.stroke, color: colorOf(params, ctx, i), opacity: opacity * 0.85 });
      }
    } else if (motif === 'eyes') {
      const random = rng.rngFor(0x0e75, 'eyes', info.index, variant);
      const pairs = countOf(3 + Math.round(density * 3));
      for (let i = 0; i < pairs; i += 1) {
        const ex = box.cx + (random() * 2 - 1) * box.width * 0.22;
        const ey = box.cy + (random() * 2 - 1) * box.height * 0.16;
        const blink = 0.5 + 0.5 * Math.abs(Math.sin(info.local * 1.1 + i * 1.7));
        const r = box.short * (0.02 + 0.014 * random()) * scale;
        shapes.push({ kind: 'ring', x: ex, y: ey, r: r * 1.6, thickness: box.short * 0.007 * tuning.stroke, color: colorOf(params, ctx, i), opacity: opacity * 0.9 });
        shapes.push({ kind: 'circle', x: ex, y: ey, r: r * 0.7 * blink, color: colorOf(params, ctx, i + 1), opacity });
      }
    } else if (motif === 'scratches') {
      const random = rng.rngFor(0x5c7a, 'scratches', info.index, variant);
      const count = countOf(5 + Math.round(density * 4));
      const baseAngle = (-38 + variant * 19) * (Math.PI / 180);
      for (let i = 0; i < count; i += 1) {
        const x = box.cx + (random() * 2 - 1) * box.width * 0.3;
        const y = box.cy + (random() * 2 - 1) * box.height * 0.25;
        const length = box.short * (0.12 + 0.22 * random()) * (0.5 + 0.5 * progress);
        const angle = baseAngle + (random() - 0.5) * 0.25;
        shapes.push({ kind: 'capsule', x0: x - Math.cos(angle) * length * 0.5, y0: y - Math.sin(angle) * length * 0.5, x1: x + Math.cos(angle) * length * 0.5, y1: y + Math.sin(angle) * length * 0.5, width: box.short * 0.0045 * tuning.stroke, color: colorOf(params, ctx, i), opacity: opacity * (0.6 + 0.4 * random()) });
      }
    } else if (motif === 'drips') {
      const random = rng.rngFor(0x0d71, 'drips', info.index, variant);
      const count = countOf(5 + Math.round(density * 5));
      for (let i = 0; i < count; i += 1) {
        const x = box.cx + (random() * 2 - 1) * box.width * 0.3;
        const top = box.cy - box.height * 0.18;
        const grow = ((info.local * (0.2 + random() * 0.4) + random()) % 1 + 1) % 1;
        const length = box.short * (0.04 + 0.18 * grow) * (0.4 + 0.6 * progress);
        const w = box.short * 0.009 * tuning.stroke * (0.7 + 0.3 * random());
        shapes.push({ kind: 'capsule', x0: x, y0: top, x1: x, y1: top + length, width: w, color: colorOf(params, ctx, i), opacity: opacity * 0.85 });
        shapes.push({ kind: 'circle', x, y: top + length + w * 0.4, r: w * 0.9, color: colorOf(params, ctx, i), opacity: opacity * 0.9 });
      }
    } else if (motif === 'lattice') {
      const cells = countOf(4);
      const spanX = box.width * 0.36 * scale;
      const spanY = box.height * 0.3 * scale;
      const step = (2 * spanX) / Math.max(1, cells);
      for (let i = 0; i <= cells; i += 1) {
        const x = box.cx - spanX + step * i;
        shapes.push({ kind: 'capsule', x0: x, y0: box.cy - spanY, x1: x, y1: box.cy + spanY, width: box.short * 0.004 * tuning.stroke, color: colorOf(params, ctx, 0), opacity: opacity * 0.7 });
        shapes.push({ kind: 'capsule', x0: box.cx - spanX, y0: box.cy - spanY + step * i * 0.75, x1: box.cx + spanX, y1: box.cy - spanY + step * i * 0.75, width: box.short * 0.004 * tuning.stroke, color: colorOf(params, ctx, 1), opacity: opacity * 0.7 });
      }
      for (let i = 0; i < 2; i += 1) {
        const sign = i === 0 ? 1 : -1;
        shapes.push({ kind: 'capsule', x0: box.cx - spanX, y0: box.cy - sign * spanY, x1: box.cx + spanX, y1: box.cy + sign * spanY, width: box.short * 0.006 * tuning.stroke, color: colorOf(params, ctx, 2), opacity: opacity * 0.8 });
      }
    } else if (motif === 'waves') {
      const bands = countOf(3);
      const amp = box.short * (0.04 + 0.03 * density) * (0.4 + 0.6 * progress);
      for (let b = 0; b < bands; b += 1) {
        const phase = (b / Math.max(1, bands)) * TAU + info.local * 1.6 * spinRate;
        const points = [];
        for (let i = 0; i <= 16; i += 1) {
          const u = i / 16;
          points.push({ x: box.cx - box.width * 0.35 + box.width * 0.7 * u, y: box.cy + Math.sin(u * TAU * (1 + b) * 0.5 + phase) * amp + (b - (bands - 1) / 2) * amp * 1.6 });
        }
        for (let i = 0; i < points.length - 1; i += 1) {
          shapes.push({ kind: 'capsule', x0: points[i].x, y0: points[i].y, x1: points[i + 1].x, y1: points[i + 1].y, width: box.short * 0.0065 * tuning.stroke, color: colorOf(params, ctx, b), opacity: opacity * (0.9 - b * 0.15) });
        }
      }
    } else if (motif === 'comets') {
      const random = rng.rngFor(0x0c0e, 'comets', info.index, variant);
      const count = countOf(4 + Math.round(density * 4));
      for (let i = 0; i < count; i += 1) {
        const lane = box.height * (0.15 + random() * 0.7);
        const speed = 0.25 + random() * 0.5;
        const progressAlong = ((info.local * speed + random()) % 1 + 1) % 1;
        const dir = variant % 2 ? -1 : 1;
        const x = dir > 0 ? box.width * (0.05 + progressAlong * 0.9) : box.width * (0.95 - progressAlong * 0.9);
        const r = box.short * (0.009 + 0.009 * random()) * scale;
        const tail = box.short * 0.09 * (0.4 + 0.6 * progress);
        shapes.push({ kind: 'capsule', x0: x, y0: lane, x1: x - dir * tail, y1: lane, width: r * 0.9, color: colorOf(params, ctx, i), opacity: opacity * 0.7 });
        shapes.push({ kind: 'circle', x, y: lane, r, color: colorOf(params, ctx, i + 1), opacity });
      }
    } else if (motif === 'slabWipe') {
      // one thick band crossing above or below the text box and stopping there
      const tb = textBox(ctx, box);
      const h = box.short * (0.10 + 0.06 * density);
      const top = variant % 2 === 0;
      const y = top
        ? Math.max(box.short * 0.03, tb.y0 - tb.h * (0.25 + 0.3 * density) - h)
        : Math.min(box.height - box.short * 0.03 - h, tb.y1 + tb.h * (0.25 + 0.3 * density));
      const width = box.width * (0.35 + 0.25 * density);
      const from = variant % 2 ? box.width + width * 0.2 : -width * 1.1;
      const stop = box.width * (variant % 2 ? 0.45 : 0.15);
      const x = from + (stop - from) * enter;
      shapes.push({ kind: 'rect', x, y, w: width, h, radius: 3, color: colorOf(params, ctx, 0), opacity });
      if (variant > 0) {
        shapes.push({
          kind: 'rect',
          x: x + width * 0.18,
          y: top ? y + h + box.short * 0.012 : y - box.short * 0.012 - h * 0.4,
          w: width * 0.5,
          h: h * 0.4,
          radius: 2,
          color: colorOf(params, ctx, 1),
          opacity: opacity * 0.75,
        });
      }
    } else if (motif === 'cornerBlocks') {
      // two big triangles on one diagonal, sliding in from their corners
      const size = box.short * (0.28 + 0.14 * density) * (0.4 + 0.6 * progress);
      const first = variant % 2 === 0;
      const corners = first
        ? [{ x: 0, y: 0, sx: 1, sy: 1 }, { x: box.width, y: box.height, sx: -1, sy: -1 }]
        : [{ x: box.width, y: 0, sx: -1, sy: 1 }, { x: 0, y: box.height, sx: 1, sy: -1 }];
      const push = (1 - enter) * box.short * 0.5;
      corners.forEach((corner, i) => {
        const { x, y, sx, sy } = corner;
        const points = [
          { x: x + sx * push, y: y + sy * push },
          { x: x + sx * (size + push), y: y + sy * push },
          { x: x + sx * push, y: y + sy * (size + push) },
        ];
        shapes.push({ kind: 'convex', points, color: colorOf(params, ctx, i), opacity: opacity * (i ? 0.85 : 1) });
      });
    } else if (motif === 'ringDraw') {
      // a large ring near a corner; the radius draws out with the in
      const spots = [
        [box.width * 0.16, box.short * 0.22],
        [box.width * 0.84, box.height - box.short * 0.22],
        [box.width * 0.84, box.short * 0.22],
        [box.width * 0.16, box.height - box.short * 0.22],
      ];
      const spot = spots[variant % spots.length];
      const max = box.short * (0.16 + 0.12 * density) * scale;
      const r = Math.max(2, max * enter);
      shapes.push({ kind: 'ring', x: spot[0], y: spot[1], r, thickness: box.short * 0.02 * tuning.stroke, color: colorOf(params, ctx, 0), opacity });
      if (variant % 2) shapes.push({ kind: 'circle', x: spot[0], y: spot[1], r: Math.max(1, r * 0.22), color: colorOf(params, ctx, 1), opacity: opacity * 0.9 });
    } else if (motif === 'stripeRun') {
      // parallel diagonal capsules running in from one side in the band above
      // or below the text box
      const tb = textBox(ctx, box);
      const countStripes = countOf(Math.max(4, Math.round(5 + density * 3)));
      const below = variant % 2 === 0;
      const slope = Math.tan((12 * Math.PI) / 180);
      const room = Math.max(box.short * 0.1, (below ? box.height - tb.y1 : tb.y0) - box.short * 0.04);
      const length = Math.max(box.width * 0.3, Math.min(box.width * 0.75, (room * 0.7) / Math.max(0.1, slope)));
      const step = Math.max(box.short * 0.012, (room - slope * length) / Math.max(1, countStripes - 1));
      const extent = slope * length;
      const top = below
        ? Math.min(box.height - box.short * 0.02 - (extent + step * (countStripes - 1)), tb.y1 + box.short * 0.02)
        : Math.max(box.short * 0.02, tb.y0 - box.short * 0.02 - (extent + step * (countStripes - 1)));
      const run = (1 - enter) * box.width * 0.9;
      for (let i = 0; i < countStripes; i += 1) {
        const lane = top + i * step;
        const x0 = -box.width * 0.5 + run;
        const x1 = x0 + length;
        shapes.push({
          kind: 'capsule',
          x0,
          y0: lane,
          x1,
          y1: lane + extent,
          width: box.short * 0.018 * tuning.stroke,
          color: colorOf(params, ctx, i),
          opacity: opacity * 0.9,
        });
      }
    } else if (motif === 'dotGrid') {
      // a 4x4 dot grid in one corner, scaling in along the diagonal
      const step = box.short * 0.055;
      const right = variant % 2 === 1;
      const bottom = variant % 4 >= 2;
      const ox = box.width * (right ? 0.82 - step * 3 : 0.06);
      const oy = box.short * (bottom ? 0.86 - step * 3 : 0.08);
      for (let row = 0; row < 4; row += 1) {
        for (let col = 0; col < 4; col += 1) {
          const order = (row + col) / 6;
          const local = clamp01((enter - order) / Math.max(0.15, 1 - order));
          const r = box.short * 0.016 * (0.4 + 0.6 * local) * scale;
          shapes.push({
            kind: 'circle',
            x: ox + col * step,
            y: oy + row * step,
            r: Math.max(0.5, r),
            color: colorOf(params, ctx, row + col),
            opacity: opacity * local,
          });
        }
      }
    } else if (motif === 'sideBars') {
      // three vertical bars per edge, stretching with the beat
      const countBars = countOf(3);
      const pulse = 0.6 + 0.4 * Math.abs(Math.sin(info.local * Math.PI * 2));
      for (let side = 0; side < 2; side += 1) {
        const x = box.width * (side === 0 ? 0.04 : 0.96);
        for (let i = 0; i < countBars; i += 1) {
          const fall = countBars <= 1 ? 0.5 : i / (countBars - 1);
          const h = box.height * 0.16 * pulse * (0.7 + 0.3 * fall) * scale;
          shapes.push({
            kind: 'rect',
            x: x - box.short * 0.009,
            y: box.cy - h / 2 + (i - (countBars - 1) / 2) * box.short * 0.12,
            w: box.short * 0.016 * tuning.stroke,
            h,
            radius: 3,
            color: colorOf(params, ctx, i),
            opacity: opacity * 0.85,
          });
        }
      }
    }

    return shapes;
  }

  // ---------------------------------------------------------------------------
  // move post-processing

  // wipe: the shapes enter left -> right (variant reverses) as the in window
  // runs. The revealed interval is [-inf, front] (or [front, +inf]); capsules
  // shorten parametrically, rects are trimmed and the rest drop once crossed.
  function applyWipe(shapes, front, direction) {
    const reverse = direction < 0;
    const kept = [];
    for (let shape of shapes) {
      const xs = shapeExtentX(shape);
      if (!xs) {
        kept.push(shape);
        continue;
      }
      if (!reverse && xs.min > front) continue;
      if (reverse && xs.max < front) continue;
      const partially = reverse ? xs.min < front : xs.max > front;
      if (partially) {
        if (shape.kind === 'capsule') {
          const dx = shape.x1 - shape.x0;
          const dy = shape.y1 - shape.y0;
          if (Math.abs(dx) > 1e-6) {
            const t = Math.max(0, Math.min(1, (front - shape.x0) / dx));
            if (reverse) {
              shape = { ...shape, x0: shape.x0 + dx * t, y0: shape.y0 + dy * t };
            } else {
              shape = { ...shape, x1: shape.x0 + dx * t, y1: shape.y0 + dy * t };
            }
          }
        } else if (shape.kind === 'rect') {
          if (reverse) {
            const left = Math.max(shape.x, front);
            shape = { ...shape, x: left, w: Math.max(1, shape.x + shape.w - left) };
          } else {
            shape = { ...shape, w: Math.max(1, front - shape.x) };
          }
        } else {
          const center = xs.min + (xs.max - xs.min) / 2;
          if (reverse ? center < front : center > front) continue;
        }
      }
      kept.push(shape);
    }
    return kept;
  }

  function shapeExtentX(shape) {
    if (!shape) return null;
    if (Array.isArray(shape.points) && shape.points.length) {
      let min = Infinity;
      let max = -Infinity;
      for (const point of shape.points) {
        min = Math.min(min, point.x);
        max = Math.max(max, point.x);
      }
      return { min, max };
    }
    if (shape.kind === 'capsule') return { min: Math.min(shape.x0, shape.x1), max: Math.max(shape.x0, shape.x1) };
    if (shape.kind === 'rect') return { min: shape.x, max: shape.x + shape.w };
    if (shape.x != null) {
      const r = shape.radius != null ? shape.radius : shape.r || 0;
      return { min: shape.x - r, max: shape.x + r };
    }
    return null;
  }

  // draw: capsules trace from their own start, the other shapes scale from
  // their own centre, so it never reads like the scattershot `scatterIn`.
  function applyDraw(shapes, progress) {
    const p = clamp01(progress);
    const out = [];
    for (const shape of shapes) {
      if (shape.kind === 'capsule') {
        const x1 = shape.x0 + (shape.x1 - shape.x0) * p;
        const y1 = shape.y0 + (shape.y1 - shape.y0) * p;
        out.push({ ...shape, x1, y1 });
        continue;
      }
      out.push(scaleShape(shape, p, shapeAnchor(shape)));
    }
    return out;
  }

  function shapeAnchor(shape) {
    if (!shape) return { x: 0, y: 0 };
    if (shape.kind === 'capsule') return { x: (shape.x0 + shape.x1) / 2, y: (shape.y0 + shape.y1) / 2 };
    if (Array.isArray(shape.points)) {
      let x = 0;
      let y = 0;
      for (const point of shape.points) {
        x += point.x;
        y += point.y;
      }
      return { x: x / Math.max(1, shape.points.length), y: y / Math.max(1, shape.points.length) };
    }
    return { x: shape.x || 0, y: shape.y || 0 };
  }

  function scaleShape(shape, factor, anchor) {
    if (!shape || factor === 1) return shape;
    const ax = (anchor && anchor.x) || 0;
    const ay = (anchor && anchor.y) || 0;
    const sx = (x) => ax + (x - ax) * factor;
    const sy = (y) => ay + (y - ay) * factor;
    const next = { ...shape };
    if (Array.isArray(next.points)) next.points = next.points.map((point) => ({ x: sx(point.x), y: sy(point.y) }));
    if (next.kind === 'rect') {
      const x0 = sx(next.x);
      const y0 = sy(next.y);
      const x1 = sx(next.x + next.w);
      const y1 = sy(next.y + next.h);
      next.x = Math.min(x0, x1);
      next.y = Math.min(y0, y1);
      next.w = Math.abs(x1 - x0);
      next.h = Math.abs(y1 - y0);
    } else {
      if (next.x != null) next.x = sx(next.x);
      if (next.y != null) next.y = sy(next.y);
      if (next.x0 != null) {
        next.x0 = sx(next.x0);
        next.x1 = sx(next.x1);
        next.y0 = sy(next.y0);
        next.y1 = sy(next.y1);
        if (next.width != null) next.width *= factor;
      }
      if (next.r != null) next.r *= factor;
      if (next.radius != null) next.radius *= factor;
    }
    return next;
  }

  // morph (the generic case): crossfade the geometry of two consecutive
  // variants; shapes that exist on one side only fade in / out.
  function mixShapes(a, b, t) {
    const out = [];
    const length = Math.max(a.length, b.length);
    for (let i = 0; i < length; i += 1) {
      const first = a[i];
      const second = b[i];
      if (!first) {
        out.push(second ? { ...second, opacity: (second.opacity == null ? 1 : second.opacity) * t } : null);
        continue;
      }
      if (!second) {
        out.push({ ...first, opacity: (first.opacity == null ? 1 : first.opacity) * (1 - t) });
        continue;
      }
      const mixed = { ...first };
      const firstOpacity = first.opacity == null ? 1 : first.opacity;
      const secondOpacity = second.opacity == null ? 1 : second.opacity;
      mixed.opacity = firstOpacity * (1 - t) + secondOpacity * t;
      if (first.kind === second.kind) {
        for (const key of ['x', 'y', 'x0', 'y0', 'x1', 'y1', 'r', 'radius', 'w', 'h', 'angle']) {
          if (typeof first[key] === 'number' && typeof second[key] === 'number') mixed[key] = first[key] * (1 - t) + second[key] * t;
        }
        if (Array.isArray(first.points) && Array.isArray(second.points) && first.points.length === second.points.length) {
          mixed.points = first.points.map((point, index) => ({
            x: point.x * (1 - t) + second.points[index].x * t,
            y: point.y * (1 - t) + second.points[index].y * t,
          }));
        }
      }
      out.push(mixed);
    }
    return out.filter(Boolean);
  }

  // aspect: stretch the whole motif horizontally about the frame centre
  function stretchX(shapes, aspect, cx) {
    if (aspect === 1) return shapes;
    const scalePoint = (point) => ({ x: cx + (point.x - cx) * aspect, y: point.y });
    return shapes.map((shape) => {
      if (!shape) return shape;
      const next = { ...shape };
      if (Array.isArray(next.points)) next.points = next.points.map(scalePoint);
      if (next.kind === 'rect') next.w *= aspect;
      if (next.x != null) next.x = cx + (next.x - cx) * aspect;
      if (next.x0 != null) {
        next.x0 = cx + (next.x0 - cx) * aspect;
        next.x1 = cx + (next.x1 - cx) * aspect;
      }
      return next;
    });
  }

  // scaleStroke: the optional stroke weight multiplies every line width
  function scaleStroke(shapes, factor) {
    if (factor === 1) return shapes;
    return shapes.map((shape) => {
      if (!shape) return shape;
      const next = { ...shape };
      if (typeof next.width === 'number') next.width *= factor;
      if (typeof next.thickness === 'number') next.thickness *= factor;
      if (typeof next.stroke === 'number') next.stroke *= factor;
      return next;
    });
  }

  function motifShapes(motif, params, ctx, info) {
    const { beat, inProgress } = info;
    const enter = easeOut(inProgress);
    const leave = 1 - easeIn(1 - textProgress(info));
    const progress = Math.min(enter, leave);
    const { box, opacity } = base(ctx, progress);
    const tuning = tuningOf(params);
    const variant = num(beat.variant, 0);
    const spinHold = beat.move.hold === 'spin';
    const rotation = spinHold ? info.local * 40 * (variant % 2 ? -1 : 1) * tuning.spinRate : variant * 5 * tuning.spinRate;
    const pulse = beat.move.hold === 'pulse' ? 1 + 0.08 * Math.sin(TAU * info.local * 2) : 1;
    const drift = beat.move.hold === 'drift' ? Math.sin(info.local * 1.6) * box.short * 0.03 : 0;
    const scale = (0.2 + 0.8 * progress) * pulse;
    const state = { box, opacity, scale, rotation, pulse, drift, variant, tuning, spinRate: spinHold ? tuning.spinRate : 1, morphPhase: null };
    const morphHold = beat.move.hold === 'morph';
    let shapes;
    if (morphHold) {
      const phase = clamp01(info.local / Math.max(0.5, info.duration));
      const specific = motif === 'polyMorph' || motif === 'rings' || motif === 'bars';
      if (specific) {
        shapes = buildMotif(motif, params, ctx, info, { ...state, morphPhase: phase });
      } else {
        const a = buildMotif(motif, params, ctx, info, { ...state, variant });
        const b = buildMotif(motif, params, ctx, info, { ...state, variant: variant + 1 });
        shapes = mixShapes(a, b, phase);
      }
    } else {
      shapes = buildMotif(motif, params, ctx, info, state);
    }
    // radius: the optional motif size, about the frame centre
    if (tuning.radius !== 1) {
      for (let i = 0; i < shapes.length; i += 1) shapes[i] = scaleShape(shapes[i], tuning.radius, { x: box.cx, y: box.cy });
    }
    if (tuning.aspect !== 1) shapes = stretchX(shapes, tuning.aspect, box.cx);
    if (tuning.stroke !== 1) shapes = scaleStroke(shapes, tuning.stroke);
    // accent: the emphasised sub-beat reads bigger and fully opaque
    if (beat.accent) {
      for (let i = 0; i < shapes.length; i += 1) shapes[i] = scaleShape(shapes[i], 1.25, { x: box.cx, y: box.cy });
    } else {
      for (const shape of shapes) shape.opacity = (shape.opacity == null ? 1 : shape.opacity) * 0.85;
    }
    // the in / out moves: a wipe clips the x span, a draw traces the lines,
    // scatterIn slides each shape, a fade drops the opacity, a pop scales (the
    // base `scale` already carries it)
    if (beat.move.in === 'wipe') {
      const direction = variant % 2 ? -1 : 1;
      const front = direction > 0 ? box.cx - box.width / 2 + box.width * enter : box.cx + box.width / 2 - box.width * enter;
      shapes = applyWipe(shapes, front, direction);
    } else if (beat.move.in === 'scatterIn') {
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
    } else if (beat.move.in === 'draw') {
      shapes = applyDraw(shapes, enter);
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

  function textProgress(info) {
    return clamp01(info.outProgress);
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
    let params = (spec && spec.params) || {};
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
      // rhythm cuts in the context (deterministic from the clip key). Filler
      // clips carry `from` / `to` instead of `start` / `end`.
      const span = (ctx && ctx.clip) || {};
      const start = num(span.start != null ? span.start : span.from, 0);
      const end = num(span.end != null ? span.end : span.to, start + 4);
      const generated = generate({
        span: { start, end },
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
        stroke: params.stroke,
        count: params.count,
        radius: params.radius,
        aspect: params.aspect,
        spinRate: params.spinRate,
        procSeed: params.seed,
        axes: { weird: 0.5, energy: 0.5 },
      });
      beats = generated.params.beats;
      // a hand-made `proc` clip has no genome seed stored yet: keep the one the
      // generator just drew, deterministic from the clip key, so every frame
      // grows the same composition
      if (!params.seed && generated.params.seed != null) params = { ...params, seed: generated.params.seed };
    } else if (forced) {
      // editing an in / hold / out move on an already generated figure must take
      // effect without regenerating: override on a shallow copy, never in place
      beats = beats.map((beat) => ({ ...beat, move: { ...(beat.move || {}), ...force } }));
    }
    const info = beatAt(beats, time, params.motif);
    if (!info) return { shapes: [], texts: [] };
    const result = motifShapes(params.motif || 'orbit', params, ctx || {}, info);
    const place = placementOf(params, ctx || {});
    if (place) transformShapes(result.shapes, place);
    return result;
  }

  return { MOTIFS, BOLD_MOTIFS, PROC, INS, HOLDS, OUTS, SYNCS, STROKES, generate, blank, drawList, subBeats, beatAt, transformShapes, tuningOf };
});
