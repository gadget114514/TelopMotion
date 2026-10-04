(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rng'), require('./smartness'), require('./weird'), require('./fx-axes'), require('./adsr'), require('./scene3d'), require('./figure-geo'), require('./gl/fields'), require('./gl/sim'));
  else {
    root.SA = root.SA || {};
    root.SA.figures = factory(root.SA.rng, root.SA.smartness, root.SA.weird, root.SA.fxAxes, root.SA.adsr, root.SA.scene3d, root.SA.figureGeo, root.SA.glFields, root.SA.glSim);
  }
})(typeof self !== 'undefined' ? self : this, function (rng, smartness, weird, fxAxes, adsrApi, scene3d, figureGeo, glFields, glSim) {
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
  // the pseudo-3D scenes (scene3d.js): planets, n-body, pendulums, a gravity well,
  // polyhedra, attractors, knots, a starfield. Like `proc` they grow from a seed
  // and the randomness level, and only come up on a weird run.
  const SCENE_MOTIFS = scene3d && Array.isArray(scene3d.SCENES) ? scene3d.SCENES.slice() : [];
  MOTIFS.push(...SCENE_MOTIFS);
  // the geometry / data-structure figures (figure-geo.js): k-d tree, Voronoi,
  // Delaunay, proximity graphs, L-systems, space-filling curves, circle packing,
  // treemap, space colonisation, string art
  const GEO_MOTIFS = figureGeo && Array.isArray(figureGeo.GEOS) ? figureGeo.GEOS.slice() : [];
  MOTIFS.push(...GEO_MOTIFS);
  // figures that pass behind the lyrics: what touches the text box is dropped
  // the full-frame mathematical fields (gl/fields.js): a fragment shader per
  // field, drawn by the engine; the figure returns the field spec, not shapes.
  // They keep clear of the lyrics in the shader itself (a feathered window).
  const FIELD_MOTIFS = glFields && Array.isArray(glFields.IDS) ? glFields.IDS.slice() : [];
  MOTIFS.push(...FIELD_MOTIFS);
  // the fields that carry a GPU simulation (gl/sim.js): the same registry, but the
  // picture comes from a texture of state that is stepped forward, and where it is
  // splatted is frozen here so a scrub lands on the same drop as a play
  const SIM_MOTIFS = new Set(glSim && Array.isArray(glSim.SIMS) && glFields && typeof glFields.simOf === 'function' ? glSim.SIMS.filter((id) => glFields.simOf(id)) : []);
  const BEHIND_MOTIFS = new Set([...SCENE_MOTIFS, ...GEO_MOTIFS]);
  const SEEDED_MOTIFS = new Set([...BEHIND_MOTIFS, ...FIELD_MOTIFS]);
  // the 2D camera moves any figure clip can carry (`params.camera`)
  const CAMERAS_2D = ['none', 'push', 'pull', 'pan', 'roll', 'shake', 'whip', 'orbit'];
  // the plain default: flat bars / rings / frames that snap in fast. Anything
  // ornate (proc, cracks, eyes, drips ...) only appears on a weird or fearful run.
  const PLAIN_MOTIFS = ['bars', 'rings', 'underlineSweep', 'bracketsPop', 'ticker', 'slabWipe', 'cornerBlocks', 'stripeRun', 'sideBars', 'dotGrid', 'ringDraw'];
  const PLAIN_INS = ['pop', 'wipe'];
  const PLAIN_HOLDS = ['drift', 'pulse'];
  const PLAIN_OUTS = ['shrink', 'fade'];
  const TEMPO_STEPS = [8, 4, 2, 1, 0.5]; // beats per switch, slow → fast
  function isPlainRun(axes) {
    const a = axes || {};
    return !(weird.bg(a.weird) >= 0.6) && !(clamp01(a.fear) >= 0.5);
  }
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
    if (options.tempoGrid) {
      const beat = Math.max(0.05, num(options.beatSeconds, 0.5));
      const speed = clamp01((options.axes || {}).speed);
      const step = beat * TEMPO_STEPS[Math.min(TEMPO_STEPS.length - 1, Math.floor(speed * TEMPO_STEPS.length))];
      if (!edges.length) {
        for (let t = start + step; t < end - 0.05; t += step) edges.push(t);
      } else {
        edges.sort((a, b) => a - b);
        const kept = [];
        let last = start;
        for (const e of edges) if (e - last >= step - 1e-6) { kept.push(e); last = e; }
        edges = kept;
      }
    }
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

  // Which pool a random choice reads from at randomness `rnd`: the full one
  // (probability rnd), the plain one, or the single plain default (rnd 0).
  function randomTier(u, rnd) {
    if (u < rnd) return 'full';
    if (u < rnd + (1 - rnd) * Math.min(1, rnd * 2)) return 'plain';
    return 'base';
  }

  function assignMoves(beats, random, force, s, axes, beatRandom, rndLevel) {
    let previousIn = null;
    let previousOut = null;
    const rnd = rndLevel == null ? weird.raw(axes && axes.weird) : rndLevel;
    const tierStream = beatRandom || random;
    for (const beat of beats) {
      const ins = INS.filter((name) => name !== previousIn);
      const outs = OUTS.filter((name) => name !== previousOut);
      // the random draws always run, forced or not, so the variant / accent
      // sequence stays stable when a move is pinned. The seventh axis demotes
      // the cheap moves and the eighth prefers the fear-heavy ones (a no-op at
      // 0, where the plain pick returns).
      const fullIn = fxAxes.pickWeighted(random, 'figureIn', ins.length ? ins : INS, axes, { smartness: s });
      const fullHold = fxAxes.pickWeighted(random, 'figureHold', HOLDS, axes, { smartness: s });
      const fullOut = fxAxes.pickWeighted(random, 'figureOut', outs.length ? outs : OUTS, axes, { smartness: s });
      const plainIns = PLAIN_INS.filter((name) => name !== previousIn);
      const plainOuts = PLAIN_OUTS.filter((name) => name !== previousOut);
      const plainIn = fxAxes.pickWeighted(random, 'figureIn', plainIns.length ? plainIns : PLAIN_INS, axes, { smartness: s });
      const plainHold = fxAxes.pickWeighted(random, 'figureHold', PLAIN_HOLDS, axes, { smartness: s });
      const plainOut = fxAxes.pickWeighted(random, 'figureOut', plainOuts.length ? plainOuts : PLAIN_OUTS, axes, { smartness: s });
      const choose = (full, plainPick, base) => {
        const tier = randomTier(tierStream(), rnd);
        return tier === 'full' ? full : tier === 'plain' ? plainPick : base;
      };
      const inPick = choose(fullIn, plainIn, PLAIN_INS[0]);
      const holdPick = choose(fullHold, plainHold, PLAIN_HOLDS[0]);
      const outPick = choose(fullOut, plainOut, PLAIN_OUTS[0]);
      const drawnVariant = Math.floor(random() * 3);
      const drawnAccent = random() < 0.5;
      const variant = tierStream() < rnd ? drawnVariant : 0;
      const accent = tierStream() < rnd ? drawnAccent : true;
      // the sub-beat's own scale (0.6..1.4) and palette rotation, drawn from
      // their own stream so the move sequence above stays exactly as before
      const stream = beatRandom || random;
      const drawnSize = 0.6 + stream() * 0.8;
      const drawnTone = Math.floor(stream() * 8);
      const size = round(1 + (drawnSize - 1) * rnd, 2);
      const tone = stream() < rnd ? drawnTone : 0;
      beat.size = size;
      beat.tone = tone;
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
  function generateOne(options) {
    const opts = options || {};
    const seed = Number.isFinite(Number(opts.seed)) ? Number(opts.seed) : 1;
    const id = opts.id == null ? 'figure' : String(opts.id);
    const random = rng.rngFor(seed, 'figure', id);
    const axes = opts.axes || {};
    // figures are the backdrop side: the channel saturates at raw 0.4
    const w = weird.bg(axes.weird);
    const s = smartness.smartOf(axes);
    const requested = MOTIFS.includes(opts.motif) ? opts.motif : null;
    const plainRun = isPlainRun(axes);
    // The randomness level is the raw weird axis (weird 1 draws every parameter
    // from its full range, weird 0 draws none: the plain figure). Every random
    // still runs, so the draws stay put; the level only decides which one is used.
    const rnd = opts.rand != null && Number.isFinite(Number(opts.rand)) ? clamp01(opts.rand) : weird.raw(axes.weird);
    const gates = rng.rngFor(seed, 'figure-gate', id);
    // the frame motif is the heavy one: below weird 0.8 it never draws
    const motifPool = (plainRun ? PLAIN_MOTIFS : (w >= 0.6 ? MOTIFS : MOTIFS.filter((name) => name !== 'halftone')).filter((name) => name !== PROC)).filter((name) => name !== 'frame' || weird.raw(axes.weird) >= 0.8);
    // the motif pool answers the smartness and fear axes (a no-op at 0)
    let motif = requested || fxAxes.pickWeighted(random, 'figureMotif', motifPool, axes, { smartness: s });
    if (!requested) {
      const tier = randomTier(gates(), rnd);
      if (tier === 'base') motif = PLAIN_MOTIFS[0];
      else if (tier === 'plain' && !PLAIN_MOTIFS.includes(motif)) motif = PLAIN_MOTIFS[Math.floor(gates() * PLAIN_MOTIFS.length)];
    }
    // the procedural motif draws from its own stream, so every other draw below
    // is unchanged; the fear axis hands the pick back to the scary fixed motifs
    const procRandom = rng.rngFor(seed, 'figure-proc', id);
    const procRoll = procRandom();
    const procSeed = Math.floor(procRandom() * 1e9);
    const fear = Number.isFinite(Number(axes.fear)) ? clamp01(axes.fear) : 0;
    let chosenSeed = procSeed;
    if (!requested && !plainRun && procRoll < PROC_CHANCE * rnd * (1 - fear)) motif = PROC;
    // a caller that remembers the recent compositions can ask for one that does
    // not repeat them (the redraw keeps the same stream, so it stays deterministic)
    if (motif === PROC && Array.isArray(opts.avoid) && opts.avoid.length && !Number.isFinite(Number(opts.procSeed))) {
      for (let attempt = 0; attempt < 16; attempt += 1) {
        const key = procKey(chosenSeed, rnd);
        if (!opts.avoid.some((other) => procTooSimilar(other, key))) break;
        chosenSeed = Math.floor(procRandom() * 1e9);
      }
    }
    const drawnSync = pick(random, ['beat', 'beat', 'text', 'free']);
    const sync = SYNCS.includes(opts.sync) ? opts.sync : gates() < rnd ? drawnSync : 'beat';
    const force = { in: opts.in, hold: opts.hold, out: opts.out };
    const beats = assignMoves(subBeats({ ...opts, sync }, random), random, force, s, axes, rng.rngFor(seed, 'figure-beat', id), rnd);
    // a continuation of a previous figure carries its per-beat look (moves,
    // variant, accent, scale, tone) round and round, so nothing about it is
    // re-drawn; pinned moves still win
    if (Array.isArray(opts.beatStyle) && opts.beatStyle.length) {
      beats.forEach((beat, i) => {
        const style = opts.beatStyle[i % opts.beatStyle.length];
        const move = style.move || {};
        beat.move = {
          in: forcedMove(force, 'in', INS) || move.in || beat.move.in,
          hold: forcedMove(force, 'hold', HOLDS) || move.hold || beat.move.hold,
          out: forcedMove(force, 'out', OUTS) || move.out || beat.move.out,
        };
        if (style.variant != null) beat.variant = style.variant;
        if (style.accent != null) beat.accent = style.accent;
        if (style.size != null) beat.size = style.size;
        if (style.tone != null) beat.tone = style.tone;
      });
    }
    const palette = Array.isArray(opts.palette) ? opts.palette : [];
    const colors = palette.length >= 3 ? palette.slice(3, 8) : palette.slice();
    const density = Math.max(0.15, Math.min(1, num(opts.density, 0.4 + 0.5 * clamp01(axes.density))));
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
        size: beat.size,
        tone: beat.tone,
      })),
    };
    if (motif === PROC || SEEDED_MOTIFS.has(motif)) params.rand = round(rnd, 2);
    if (motif === PROC || SEEDED_MOTIFS.has(motif)) params.seed = Number.isFinite(Number(opts.procSeed)) ? Number(opts.procSeed) : chosenSeed;
    // A simulation splats on the rhythm, so the times it reacts at are written down
    // here, once. They are read from the whole clip rather than from the beats that
    // happen to be under the playhead, which would change as it moves and break the
    // agreement between playing and scrubbing.
    if (SIM_MOTIFS.has(motif)) {
      const from = Number(opts.span && opts.span.start != null ? opts.span.start : opts.span && opts.span.from) || 0;
      const times = [];
      for (const beat of beats) {
        const at = Number(beat && beat.start);
        if (Number.isFinite(at)) times.push(round(Math.max(0, at - from), 3));
      }
      params.simBeats = times.slice(0, 32);
    }
    // the 2D camera: pinned by the caller, else drawn on its own stream (never at
    // randomness 0, and a fraction of the clips above it)
    const cameraRoll = rng.rngFor(seed, 'figure-camera', id);
    const cameraGate = cameraRoll();
    const cameraPick = CAMERAS_2D[1 + Math.floor(cameraRoll() * (CAMERAS_2D.length - 1))];
    const camera = CAMERAS_2D.includes(opts.camera) ? opts.camera : cameraGate < rnd * 0.55 ? cameraPick : 'none';
    if (camera !== 'none') params.camera = camera;
    if (opts.scale != null && Number.isFinite(Number(opts.scale))) params.scale = Number(opts.scale);
    if (opts.x != null && Number.isFinite(Number(opts.x))) params.x = Number(opts.x);
    if (opts.y != null && Number.isFinite(Number(opts.y))) params.y = Number(opts.y);
    if (opts.color) params.color = String(opts.color);
    if (opts.enabled != null) params.enabled = Boolean(opts.enabled);
    else if (opts.disabled != null) params.enabled = !opts.disabled;
    // optional motif tuning (the filler editor writes these)
    if (opts.stroke != null) params.stroke = STROKES[opts.stroke] != null ? opts.stroke : 'med';
    for (const key of ['count', 'radius', 'aspect', 'spinRate']) {
      if (opts[key] != null && Number.isFinite(Number(opts[key]))) params[key] = Number(opts[key]);
    }
    // the element count: an explicit `shapes` survives, otherwise one draw from
    // the theme's range on its own stream (every draw above stays as it was)
    const shapes = opts.shapes != null && Number.isFinite(Number(opts.shapes))
      ? Math.max(1, Math.round(Number(opts.shapes)))
      : opts.shapeRange ? drawShapeCount(rng.rngFor(seed, 'figure-count', id), opts.shapeRange) : null;
    if (shapes != null) params.shapes = shapes;
    return { type: 'figure', params };
  }

  const SHAPE_COUNT_MAX = PROC_TOTAL_BUDGET;

  // The theme's figure count range ({ min, max, bias }) from a resolved
  // gen-params profile; null without one.
  function shapeRangeOf(profile) {
    if (!profile || profile.figureCountMax == null) return null;
    return { min: profile.figureCountMin, max: profile.figureCountMax, bias: profile.figureCountBias };
  }

  // One element count from a range: log-uniform between min and max, so 3..90
  // is as likely to land in 3..16 as in 16..90 and the few and the many come up
  // evenly. `bias` (-1..1) bends the draw: -1 leans hard toward min, +1 toward
  // max, 0 is the plain log-uniform draw.
  function drawShapeCount(random, range) {
    const r = range || {};
    let lo = Math.max(1, Math.min(SHAPE_COUNT_MAX, num(r.min, 3)));
    let hi = Math.max(1, Math.min(SHAPE_COUNT_MAX, num(r.max, 60)));
    if (lo > hi) [lo, hi] = [hi, lo];
    const bias = Math.max(-1, Math.min(1, num(r.bias, 0)));
    const u = Math.pow(clamp01(random()), Math.pow(3, -bias));
    return Math.max(1, Math.round(Math.exp(Math.log(lo) + (Math.log(hi) - Math.log(lo)) * u)));
  }

  // The drawn element count a clip carries; null = the motif's own count.
  function shapeLimitOf(params) {
    const value = Number(params && params.shapes);
    return Number.isFinite(value) && value > 0 ? Math.min(SHAPE_COUNT_MAX, Math.round(value)) : null;
  }


  // ---------------------------------------------------------------------------
  // the position of a figure in "direction space"
  //
  // A figure is placed in a ~35 dimensional space whose axes are what a viewer
  // sees, not how the figure was drawn: how many shapes, how big, how spread,
  // where the mass sits, round / boxy / linear / shard, filled or outlined,
  // ornamented, how many colours (and which), how it moves, and how it comes in,
  // holds and leaves. The shape axes are measured from the figure itself (three
  // frames of its own drawList on a neutral canvas), so every motif, fixed or
  // procedural, lands in the same space without a hand-kept table. The moves sit
  // at hand-placed coordinates (aggressiveness, directness). The distance of two
  // figures is the weighted RMS gap of the axes, 0 for the same figure.

  const EMBED_FRAME = { width: 1920, height: 1080 };
  const EMBED_COLORS = ['#e63946', '#f4a261', '#2a9d8f', '#264653', '#9b5de5'];
  // [aggressiveness, directness]: how hard a move lands, and how straight / radial
  const MOVE_COORDS = {
    in: { pop: [0.2, 0.2], draw: [0.45, 0.85], wipe: [0.7, 0.9], scatterIn: [0.95, 0.15] },
    hold: { drift: [0.15, 0.75], pulse: [0.4, 0.15], spin: [0.75, 0.5], morph: [0.9, 0.3] },
    out: { fade: [0.05, 0.3], shrink: [0.3, 0.2], burstOut: [0.95, 0.1] },
  };
  const EMBED_WEIGHTS = {
    count: 1, size: 1.1, sizeSd: 0.8, spreadX: 0.9, spreadY: 0.9, cx: 0.7, cy: 0.7, occupancy: 0.9, cover: 0.9,
    round: 1.2, boxy: 1.2, linear: 1.2, shard: 1, filled: 0.9, tilt: 0.7, weight: 0.9, deco: 0.9, balance: 0.7,
    colors: 0.7, hueX: 0.9, hueY: 0.9, sat: 0.6, val: 0.6, alpha: 0.6, move: 1.2,
    inA: 0.8, inD: 0.6, holdA: 0.8, holdD: 0.6, outA: 0.7, outD: 0.5, sync: 0.3, density: 0.5,
  };
  const EMBED_KEYS = Object.keys(EMBED_WEIGHTS);

  function embedHsv(hex) {
    const m = /^#?([0-9a-f]{6})/i.exec(String(hex || ''));
    if (!m) return { h: 0, s: 0, v: 0.5 };
    const n = parseInt(m[1], 16);
    const r = ((n >> 16) & 255) / 255;
    const g = ((n >> 8) & 255) / 255;
    const b = (n & 255) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    if (d) h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { h: (h / 6) * TAU, s: max ? d / max : 0, v: max };
  }

  function embedBox(shape) {
    if (Array.isArray(shape.points) && shape.points.length) {
      const xs = shape.points.map((point) => point.x);
      const ys = shape.points.map((point) => point.y);
      return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), angle: 0 };
    }
    if (shape.kind === 'rect') return { x0: shape.x, x1: shape.x + shape.w, y0: shape.y, y1: shape.y + shape.h, angle: shape.angle || 0 };
    if (shape.kind === 'capsule') {
      const half = (shape.width || 0) / 2;
      return { x0: Math.min(shape.x0, shape.x1) - half, x1: Math.max(shape.x0, shape.x1) + half, y0: Math.min(shape.y0, shape.y1) - half, y1: Math.max(shape.y0, shape.y1) + half, angle: (Math.atan2(shape.y1 - shape.y0, shape.x1 - shape.x0) * 180) / Math.PI };
    }
    const r = shape.r != null ? shape.r : shape.radius || 0;
    return { x0: shape.x - r, x1: shape.x + r, y0: shape.y - r, y1: shape.y + r, angle: shape.rotation || 0 };
  }

  // A field has no shapes to measure: it sits at its hand-placed profile (nudged
  // by its genome), turned into the same axes the shape frames fill in.
  function fieldFrame(field, time) {
    const pr = glFields.profile(field.id, field.p);
    const hsvs = (field.colors || []).map(embedHsv);
    const n = Math.max(1, hsvs.length);
    let hx = 0;
    let hy = 0;
    let sat = 0;
    let val = 0;
    for (const hsv of hsvs) {
      hx += Math.cos(hsv.h) / n;
      hy += Math.sin(hsv.h) / n;
      sat += hsv.s / n;
      val += hsv.v / n;
    }
    return {
      count: 40 + pr.dense * 420 + (time > 3.4 ? pr.motion * 70 : 0),
      round: pr.organic * 0.8,
      boxy: (1 - pr.organic) * (1 - pr.sharp) * 0.8,
      linear: pr.sharp * 0.7,
      shard: (1 - pr.organic) * pr.sharp * 0.4,
      filled: 1 - pr.sharp * 0.6,
      deco: pr.dense * 0.5,
      weight: Math.log(1 + (1 - pr.dense) * 10),
      alpha: field.opacity,
      tilt: 0.3,
      cx: 0.5,
      cy: 0.5,
      spreadX: 1,
      spreadY: 1,
      cover: 0.9,
      size: Math.log(8 + (1 - pr.dense) * 300),
      sizeSd: 0.3 + 0.7 * pr.organic,
      balance: 1,
      hx,
      hy,
      sat,
      val,
      colors: n,
      cells: 46,
    };
  }

  function embedFrame(spec, time) {
    const list = drawList(spec, {
      time,
      frame: EMBED_FRAME,
      clip: { key: 'embed', start: 0, end: 12 },
      seed: 1,
      colors: EMBED_COLORS,
      beats: [{ start: 0, end: 12 }],
    });
    if (list.field && glFields) return fieldFrame(list.field, time);
    const shapes = list.shapes || [];
    const n = Math.max(1, shapes.length);
    const frame = { count: shapes.length, round: 0, boxy: 0, linear: 0, shard: 0, filled: 0, deco: 0, weight: 0, alpha: 0, tilt: 0, cx: 0.5, cy: 0.5, spreadX: 0, spreadY: 0, cover: 0, size: 0, sizeSd: 0, balance: 1, hx: 0, hy: 0, sat: 0, val: 0, colors: 0, cells: 0 };
    let mass = 0;
    let mx = 0;
    let my = 0;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    const sizes = [];
    const cells = new Set();
    const colors = new Set();
    let left = 0;
    let right = 0;
    for (const shape of shapes) {
      const b = embedBox(shape);
      const w = Math.max(0, b.x1 - b.x0);
      const h = Math.max(0, b.y1 - b.y0);
      const size = Math.sqrt(Math.max(1, w * h));
      const cxs = (b.x0 + b.x1) / 2;
      const cys = (b.y0 + b.y1) / 2;
      sizes.push(Math.log(size));
      mass += size;
      mx += cxs * size;
      my += cys * size;
      minX = Math.min(minX, b.x0);
      maxX = Math.max(maxX, b.x1);
      minY = Math.min(minY, b.y0);
      maxY = Math.max(maxY, b.y1);
      frame.cover += w * h;
      cells.add(`${Math.floor((cxs / EMBED_FRAME.width) * 8)}:${Math.floor((cys / EMBED_FRAME.height) * 6)}`);
      if (cxs < EMBED_FRAME.width / 2) left += size;
      else right += size;
      if (shape.kind === 'circle' || shape.kind === 'ring' || (shape.kind === 'polygon' && (shape.sides || 6) >= 5)) frame.round += 1;
      else if (shape.kind === 'rect' || (shape.kind === 'polygon' && (shape.sides || 6) < 5)) frame.boxy += 1;
      else if (shape.kind === 'capsule') frame.linear += 1;
      else frame.shard += 1;
      const outlined = shape.kind === 'ring' || (shape.kind === 'polygon' && !shape.color) || (shape.kind === 'rect' && !shape.color);
      if (!outlined) frame.filled += 1;
      if (shape.pattern || shape.dash || shape.trim || (shape.stroke > 0 && shape.color)) frame.deco += 1;
      frame.weight += Math.log(1 + (shape.kind === 'ring' ? shape.thickness || 2 : shape.kind === 'capsule' ? shape.width || 2 : shape.stroke || 0));
      frame.alpha += shape.opacity == null ? 1 : shape.opacity;
      frame.tilt += Math.abs(Math.cos((b.angle * Math.PI) / 90)) * (w > h * 1.5 || h > w * 1.5 ? 1 : 0.3);
      const color = shape.color || shape.strokeColor || '#888888';
      colors.add(color);
      const hsv = embedHsv(color);
      frame.hx += Math.cos(hsv.h);
      frame.hy += Math.sin(hsv.h);
      frame.sat += hsv.s;
      frame.val += hsv.v;
    }
    if (shapes.length) {
      frame.cx = mx / mass / EMBED_FRAME.width;
      frame.cy = my / mass / EMBED_FRAME.height;
      frame.spreadX = (maxX - minX) / EMBED_FRAME.width;
      frame.spreadY = (maxY - minY) / EMBED_FRAME.height;
      const mean = sizes.reduce((a, c) => a + c, 0) / n;
      frame.size = mean;
      frame.sizeSd = Math.sqrt(sizes.reduce((a, c) => a + (c - mean) * (c - mean), 0) / n);
      frame.balance = 1 - Math.abs(left - right) / Math.max(1e-6, left + right);
    }
    frame.round /= n;
    frame.boxy /= n;
    frame.linear /= n;
    frame.shard /= n;
    frame.filled /= n;
    frame.deco /= n;
    frame.weight /= n;
    frame.alpha /= n;
    frame.tilt /= n;
    frame.hx /= n;
    frame.hy /= n;
    frame.sat /= n;
    frame.val /= n;
    frame.colors = colors.size;
    frame.cells = cells.size;
    frame.cover = frame.cover / (EMBED_FRAME.width * EMBED_FRAME.height);
    return frame;
  }

  // the figure's position: one number per axis, each scaled into 0..1
  function embedFigure(spec) {
    const params = (spec && spec.params) || {};
    const beats = Array.isArray(params.beats) ? params.beats : [];
    // the position is the figure's own identity (motif, seed, moves, tuning),
    // not its beat timing: it is measured on one canonical 6 s beat with the
    // clip's dominant moves and neutral colours, so the same figure drawn for
    // two cues of different lengths sits at the same point
    const inMove = dominantMove(beats, 'in') || 'pop';
    const holdMove = dominantMove(beats, 'hold') || 'drift';
    const outMove = dominantMove(beats, 'out') || 'fade';
    const probe = {
      type: 'figure',
      params: Object.assign({}, params, {
        enabled: true,
        colors: null,
        color: undefined,
        opacity: undefined,
        beats: [{ start: 0, end: 6, move: { in: inMove, hold: holdMove, out: outMove }, variant: 0, accent: true, size: 1, tone: 0 }],
      }),
    };
    const times = [2, 3.2, 3.6];
    let frames;
    try {
      frames = times.map((time) => embedFrame(probe, time));
    } catch (error) {
      frames = [embedFrame({ type: 'figure', params: { motif: 'orbit', beats: [] } }, 6)];
    }
    const main = frames.length >= 3 ? [frames[0], frames[1]] : frames;
    const avg = (key) => main.reduce((sum, frame) => sum + frame[key], 0) / main.length;
    const move = frames.length >= 3
      ? Math.min(1, (Math.abs(frames[1].cx - frames[2].cx) * 12 + Math.abs(frames[1].cy - frames[2].cy) * 12 + Math.abs(frames[1].size - frames[2].size) * 0.8 + Math.abs(frames[1].count - frames[2].count) / 40 + Math.abs(frames[1].spreadX - frames[2].spreadX) * 3) / 1.6)
      : 0;
    const coord = (group, name) => MOVE_COORDS[group][name] || [0.3, 0.3];
    const inAt = coord('in', inMove);
    const holdAt = coord('hold', holdMove);
    const outAt = coord('out', outMove);
    const clamp = (v) => Math.max(0, Math.min(1, v));
    const out = {
      count: clamp(Math.log(1 + avg('count')) / Math.log(481)),
      size: clamp((avg('size') - Math.log(4)) / (Math.log(500) - Math.log(4))),
      sizeSd: clamp(avg('sizeSd') / 1.5),
      spreadX: clamp(avg('spreadX')),
      spreadY: clamp(avg('spreadY')),
      cx: clamp(avg('cx')),
      cy: clamp(avg('cy')),
      occupancy: clamp(avg('cells') / 48),
      cover: clamp(Math.log(1 + avg('cover') * 20) / Math.log(21)),
      round: avg('round'),
      boxy: avg('boxy'),
      linear: avg('linear'),
      shard: avg('shard'),
      filled: avg('filled'),
      tilt: clamp(avg('tilt')),
      weight: clamp(avg('weight') / Math.log(30)),
      deco: avg('deco'),
      balance: clamp(avg('balance')),
      colors: clamp(avg('colors') / 5),
      hueX: clamp(0.5 + avg('hx') / 2),
      hueY: clamp(0.5 + avg('hy') / 2),
      sat: clamp(avg('sat')),
      val: clamp(avg('val')),
      alpha: clamp(avg('alpha')),
      move,
      inA: inAt[0],
      inD: inAt[1],
      holdA: holdAt[0],
      holdD: holdAt[1],
      outA: outAt[0],
      outD: outAt[1],
      sync: params.sync === 'free' ? 1 : params.sync === 'text' ? 0.5 : 0,
      density: clamp(num(params.density, 0.5)),
    };
    return EMBED_KEYS.map((key) => out[key]);
  }

  // the gap between two positions: weighted RMS, 0 (the same figure) .. ~1
  function figureDistance(a, b) {
    const left = Array.isArray(a) ? a : embedFigure(a);
    const right = Array.isArray(b) ? b : embedFigure(b);
    let sum = 0;
    let weights = 0;
    for (let i = 0; i < EMBED_KEYS.length; i += 1) {
      const w = EMBED_WEIGHTS[EMBED_KEYS[i]];
      const gap = (left[i] || 0) - (right[i] || 0);
      sum += w * gap * gap;
      weights += w;
    }
    return Math.sqrt(sum / weights);
  }

  // the move a clip leans on most, so a clone of it can force the same moves
  function dominantMove(beats, key) {
    const counts = new Map();
    for (const beat of beats || []) {
      const name = beat.move && beat.move[key];
      if (name) counts.set(name, (counts.get(name) || 0) + 1);
    }
    let best = null;
    let bestCount = 0;
    for (const [name, count] of counts) if (count > bestCount) { best = name; bestCount = count; }
    return best;
  }

  const DISTANCE_CANDIDATES = 24;
  const NEAR_CANDIDATES = 8;

  // The figure for a cue that follows `previous`. The energy sets how far the
  // new figure stands from the previous one in direction space: 0 keeps the
  // previous figure itself (distance 0), 1 takes the farthest of the candidates,
  // in between the candidate at that rank of the distance order. Without a
  // previous figure or an energy this is the plain generate.
  function generate(options) {
    const opts = options || {};
    const energy = opts.energy != null && opts.energy !== '' && Number.isFinite(Number(opts.energy)) ? clamp01(opts.energy) : null;
    const previous = opts.previous && opts.previous.params ? opts.previous : null;
    // an explicitly requested motif is the caller's choice: no distance pick
    if (!previous || energy == null || MOTIFS.includes(opts.motif)) return generateOne(opts);
    const seed = Number.isFinite(Number(opts.seed)) ? Number(opts.seed) : 1;
    const before = embedFigure(previous);
    const pp = previous.params;
    const pool = [];
    // candidate 0: the previous figure again (same motif, seed, moves, tuning)
    const clone = generateOne({
      ...opts,
      motif: pp.motif,
      procSeed: pp.seed,
      rand: pp.rand,
      sync: pp.sync,
      density: pp.density,
      beatStyle: pp.beats,
      stroke: pp.stroke != null ? pp.stroke : opts.stroke,
      count: pp.count != null ? pp.count : opts.count,
      radius: pp.radius != null ? pp.radius : opts.radius,
      aspect: pp.aspect != null ? pp.aspect : opts.aspect,
      spinRate: pp.spinRate != null ? pp.spinRate : opts.spinRate,
      shapes: pp.shapes != null ? pp.shapes : opts.shapes,
      camera: pp.camera != null ? pp.camera : 'none',
    });
    // energy 0: the previous figure exactly, no small differences either
    if (energy <= 0) return clone;
    pool.push({ spec: clone, gap: figureDistance(before, embedFigure(clone)) });
    // near candidates: the same composition with a growing change of moves and
    // tuning, so the distance order has steps between "the same" and "another"
    const near = rng.rngFor(seed, 'figure-near', opts.id == null ? 'figure' : String(opts.id));
    const cloneOpts = {
      ...opts,
      motif: pp.motif,
      procSeed: pp.seed,
      rand: pp.rand,
      sync: pp.sync,
      density: pp.density,
      shapes: pp.shapes != null ? pp.shapes : opts.shapes,
      camera: pp.camera != null ? pp.camera : 'none',
      beatStyle: pp.beats,
    };
    // another move, through the same smartness / fear filter the draw uses
    const nearAxes = opts.axes || {};
    const nearSmart = smartness.smartOf(nearAxes);
    const others = (group, list, name) => {
      const rest = list.filter((item) => item !== name);
      return fxAxes.pickWeighted(near, group, rest.length ? rest : list, nearAxes, { smartness: nearSmart });
    };
    const tunable = (value, fallback, strength, lo, hi) => Math.max(lo, Math.min(hi, num(value, fallback) * (1 + (near() * 2 - 1) * 0.7 * strength)));
    const keepIn = dominantMove(pp.beats, 'in') || 'pop';
    const keepHold = dominantMove(pp.beats, 'hold') || 'drift';
    const keepOut = dominantMove(pp.beats, 'out') || 'fade';
    for (let j = 1; j <= NEAR_CANDIDATES; j += 1) {
      const strength = j / NEAR_CANDIDATES;
      const spec = generateOne({
        ...cloneOpts,
        in: strength > 0.6 ? others('figureIn', INS, keepIn) : undefined,
        hold: strength > 0.3 ? others('figureHold', HOLDS, keepHold) : undefined,
        out: strength > 0.8 ? others('figureOut', OUTS, keepOut) : undefined,
        radius: tunable(pp.radius, 1, strength, 0.3, 1.2),
        aspect: tunable(pp.aspect, 1, strength, 0.5, 2),
        spinRate: tunable(pp.spinRate, 1, strength, 0, 2),
        count: pp.count != null || strength > 0.5 ? Math.round(tunable(pp.count, 8, strength, 3, 24)) : undefined,
        stroke: strength > 0.5 ? pick(near, ['thin', 'med', 'bold']) : pp.stroke != null ? pp.stroke : opts.stroke,
      });
      pool.push({ spec, gap: figureDistance(before, embedFigure(spec)) });
    }
    for (let k = 1; k < DISTANCE_CANDIDATES; k += 1) {
      const spec = generateOne({ ...opts, seed: seed + k * 7717 });
      pool.push({ spec, gap: figureDistance(before, embedFigure(spec)) });
    }
    pool.sort((x, y) => x.gap - y.gap);
    const pickAt = Math.round(energy * (pool.length - 1));
    return pool[pickAt].spec;
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
  function beatAt(beats, time, motif, adsrRaw) {
    if (!Array.isArray(beats) || !beats.length) return null;
    const bold = BOLD_MOTIFS.includes(motif);
    for (let i = 0; i < beats.length; i += 1) {
      const beat = beats[i];
      if (time >= beat.start && time < beat.end) {
        const duration = Math.max(0.001, beat.end - beat.start);
        const local = time - beat.start;
        const window = Math.min(bold ? 0.45 : 0.3, duration * (bold ? 0.35 : 0.25));
        const fast = PLAIN_MOTIFS.includes(motif) ? Math.min(window, 0.18) : window;
        const inProgress = fast > 0 ? clamp01(local / fast) : 1;
        const outProgress = fast > 0 ? clamp01((beat.end - time) / fast) : 1;
        const info = { beat, index: i, local, duration, inProgress, outProgress };
        if (adsrRaw && adsrApi) {
          const a = adsrApi.def(adsrRaw, duration);
          if (a) {
            const inWin = a.attack != null ? a.attack : fast;
            const outWin = a.release != null ? a.release : fast;
            info.adsr = a;
            info.adsrLevel = adsrApi.level(a, local, 0, inWin, duration - outWin, outWin, null, null);
          }
        }
        return info;
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

  const PROC_LAYOUTS = ['radial', 'grid', 'scatter', 'spiral', 'curve', 'cluster', 'brick', 'edge', 'bands', 'burst', 'sierpinski', 'flow', 'lattice', 'ripple', 'rose', 'spirograph', 'poisson', 'hex', 'harmonograph', 'superformula', 'galaxy', 'truchet'];
  const PROC_KINDS = ['circle', 'ring', 'rect', 'capsule', 'polygon', 'polyline', 'cross', 'shard', 'dash', 'blob', 'chevron', 'asterisk', 'frame'];
  const PROC_WARPS = ['none', 'sine', 'swirl', 'bulge', 'noise'];
  const PROC_ROLES = ['field', 'hero', 'dust', 'accent'];
  const PROC_SIZE_RULES = ['flat', 'ramp', 'radial', 'invRadial', 'random', 'alternate'];
  const PROC_COLOR_RULES = ['index', 'random', 'radius', 'angle', 'single', 'band'];
  const PROC_MOTIONS = ['spin', 'breathe', 'wave', 'flow', 'orbit', 'still', 'twinkle', 'tumble', 'travel', 'cascade', 'bounce', 'shiver', 'ellipse', 'sway', 'ripple', 'fall', 'zoom'];
  const PROC_SIZE_DISTS = ['lognormal', 'pareto', 'bimodal', 'steps', 'uniform'];
  const PROC_ALIGNS = ['none', 'tangent', 'radial', 'perp', 'grid'];
  const PROC_OUTLINES = ['same', 'alt', 'contrast', 'dark', 'light'];
  const PROC_PATTERN_CODES = [1, 2, 3, 4, 5, 9, 10, 12];
  const PROC_SYMMETRIES = ['none', 'mirrorX', 'mirrorY', 'mirror4', 'fold'];

  function logRange(random, lo, hi) {
    return Math.exp(rng.range(random, Math.log(lo), Math.log(hi)));
  }

  // The plain layer: what the motif draws at randomness 0 (weird 0). One ring of
  // equal circles, no symmetry, no warp, no decoration, no per-element spread.
  const PROC_PLAIN_LAYER = {
    layout: 'radial', kinds: ['circle'], symmetry: 'none', folds: 2, sizeRule: 'flat', colorRule: 'index', motion: 'still', motions: ['still'],
    count: 12, size: 0.03, stretch: 1, spreadX: 0.3, spreadY: 0.3, offsetX: 0, offsetY: 0, jitter: 0, tilt: 0, tiltRandom: 0, opacity: 0.85,
    sides: 6, filled: true, weight: 0.005, speed: 0.5, phase: 0, rings: 1, aspect: 1, twist: 2.39996, freqA: 2, freqB: 2, amp: 0.5, blobs: 3,
    slope: 0, colorShift: 0, warp: { type: 'none', amp: 0.3, freq: 2, phase: 0 }, tone: { hue: 0, sat: 1, val: 1, ramp: 0 },
    sizeDist: 'lognormal', sizeSpread: 0, weightSpread: 0, alphaSpread: 0, hueSpread: 0, valSpread: 0,
    decoOutline: 0, decoDash: 0, decoTrim: 0, decoPattern: 0, outlineMode: 'same', alignMode: 'none', margin: 0,
    extraMotion: 'still', extraMotionOn: false, role: 'field',
  };
  const PROC_INT_KEYS = new Set(['count', 'folds', 'sides', 'rings', 'freqA', 'freqB', 'blobs', 'colorShift']);

  // numbers slide from the plain value to the drawn one with `rand`; every other
  // kind of value (a name, a flag, a list) is the drawn one with probability
  // `rand` and the plain one otherwise. rand 1 is the full draw, rand 0 the plain layer.
  function procBlend(full, plain, rand, gate) {
    const out = {};
    for (const key of Object.keys(plain)) {
      const a = plain[key];
      const b = full[key];
      if (typeof a === 'number' && typeof b === 'number') {
        const v = a + (b - a) * rand;
        out[key] = PROC_INT_KEYS.has(key) ? Math.round(v) : v;
      } else if (a && typeof a === 'object' && !Array.isArray(a)) out[key] = procBlend(b, a, rand, gate);
      else {
        const roll = gate();
        out[key] = roll < rand ? b : a;
      }
    }
    return out;
  }

  function procGenome(seed, rand) {
    const level = rand == null ? 1 : clamp01(rand);
    const random = rng.rngFor(seed, 'proc-genome');
    const gate = rng.rngFor(seed, 'proc-gate');
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
        count: Math.round(logRange(random, 7, 90)),
        size: logRange(random, 0.017, 0.085),
        stretch: logRange(random, 0.4, 5),
        spreadX: rng.range(random, 0.12, 0.5),
        spreadY: rng.range(random, 0.12, 0.5),
        offsetX: rng.range(random, -0.22, 0.22),
        offsetY: rng.range(random, -0.2, 0.2),
        jitter: random() < 0.4 ? 0 : rng.range(random, 0.02, 0.6),
        tilt: random() < 0.4 ? 0 : rng.range(random, 0, 360),
        tiltRandom: random() < 0.5 ? 0 : rng.range(random, 0, 180),
        opacity: rng.range(random, 0.5, 0.97),
        sides: 3 + Math.floor(random() * 7),
        filled: random() < 0.5,
        weight: logRange(random, 0.0025, 0.013),
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
        colorShift: Math.floor(random() * 5),
        warp: { type: pick(random, PROC_WARPS), amp: rng.range(random, 0.12, 0.55), freq: rng.range(random, 0.8, 3.2), phase: random() * TAU },
        tone: {
          hue: random() < 0.45 ? 0 : rng.range(random, 12, 75) * (random() < 0.5 ? -1 : 1),
          sat: random() < 0.4 ? 1 : rng.range(random, 0.45, 1.1),
          val: random() < 0.4 ? 1 : rng.range(random, 0.55, 1.15),
          ramp: random() < 0.65 ? 0 : rng.range(random, 0.2, 0.45) * (random() < 0.5 ? -1 : 1),
        },
        // per-element spread: the rules above set a layer's tendency, these set
        // how far each element strays from it (some layers stay even, some wild)
        sizeDist: pick(random, PROC_SIZE_DISTS),
        sizeSpread: random() < 0.3 ? rng.range(random, 0.03, 0.12) : rng.range(random, 0.25, 0.95),
        weightSpread: random() < 0.3 ? rng.range(random, 0.03, 0.1) : rng.range(random, 0.2, 0.8),
        alphaSpread: random() < 0.4 ? 0 : rng.range(random, 0.1, 0.45),
        hueSpread: random() < 0.45 ? 0 : rng.range(random, 8, 55),
        valSpread: random() < 0.4 ? 0 : rng.range(random, 0.1, 0.4),
        decoOutline: random() < 0.45 ? 0 : rng.range(random, 0.15, 1),
        decoDash: random() < 0.6 ? 0 : rng.range(random, 0.15, 0.8),
        decoTrim: random() < 0.7 ? 0 : rng.range(random, 0.2, 0.7),
        decoPattern: random() < 0.6 ? 0 : rng.range(random, 0.2, 0.9),
        outlineMode: pick(random, PROC_OUTLINES),
        alignMode: pick(random, PROC_ALIGNS),
        margin: random() < 0.4 ? 0 : rng.range(random, 0.02, 0.12),
        extraMotion: pick(random, PROC_MOTIONS),
        extraMotionOn: random() < 0.5,
      });
      // the composition role pushes a layer to an extreme (a few huge shapes, a
      // fine dust, a handful of accents) so the layers do not all read as
      // "medium shapes, medium count"
      let layer = layers[layers.length - 1];
      layer.motions = layer.extraMotionOn && layer.extraMotion !== layer.motion && layer.motion !== 'still' && layer.extraMotion !== 'still' ? [layer.motion, layer.extraMotion] : [layer.motion];
      const role = pick(random, PROC_ROLES);
      layer.role = role;
      if (role === 'hero') {
        layer.count = 1 + Math.floor(random() * 4);
        layer.size *= logRange(random, 4, 9);
        layer.opacity *= 0.75;
        layer.weight *= 2;
      } else if (role === 'dust') {
        layer.count = Math.min(150, Math.round(layer.count * 2.2));
        layer.size *= 0.62;
      } else if (role === 'accent') {
        layer.count = 4 + Math.floor(random() * 9);
        layer.size *= 1.8;
      }
      layers[layers.length - 1] = procBlend(layer, PROC_PLAIN_LAYER, level, gate);
    }
    // an extra layer is kept with probability `rand`; the first always draws
    return layers.filter((_, i) => i === 0 || gate() < level);
  }

  // A pseudo-3D scene: rendered by scene3d on the clip's own clock (so a planet or
  // a pendulum keeps going across the sub-beats), then moved into the largest
  // free area beside the lyrics and scaled to fit it. The fit uses a fixed
  // reference square, never the shapes' own extent, so a swinging pendulum does
  // not make the whole scene breathe. Anything still touching the text box is
  // dropped: the scene reads as passing behind the lyrics.
  function sceneShapes(motif, params, ctx, info, state) {
    const { box } = state;
    const seed = Number.isFinite(Number(params.seed)) ? Number(params.seed) : 1;
    const rand = params.rand == null ? 1 : clamp01(params.rand);
    const span = (ctx && ctx.clip) || {};
    const clipStart = num(span.start != null ? span.start : span.from, 0);
    const t = Math.max(0, num(ctx && ctx.time, 0) - clipStart);
    const shapes = scene3d.render(motif, {
      seed,
      rand,
      t,
      frame: { width: box.width, height: box.height, cx: box.cx, cy: box.cy, short: box.short },
      grow: 1,
      opacity: state.opacity,
      color: (index) => colorOf(params, ctx, index),
      variant: state.variant,
    });
    const tb = textBox(ctx, box);
    // the scene's place: centred and at its own size at randomness 0, shifted and
    // enlarged by the genome above it
    const place = rng.rngFor(seed, 'scene-place', motif);
    const ox = (place() * 2 - 1) * 0.28 * rand;
    const oy = (place() * 2 - 1) * 0.24 * rand;
    const grow = 1 + place() * 0.5 * rand;
    transformShapes(shapes, { originX: box.cx, originY: box.cy, scale: grow * state.scale, dx: ox * box.width, dy: oy * box.height, rotate: 0 });
    return shapes;
  }

  // A mathematical field: no shapes, a spec the engine draws as a full-frame
  // fragment shader. The genome (16 numbers) is drawn from the clip seed at the
  // clip's randomness level; the field runs on the clip's own clock; its opacity
  // is capped so the lyrics stay readable, and the shader cuts a feathered window
  // out of the text box.
  function fieldResult(motif, params, ctx, info, progress, box) {
    const seed = Number.isFinite(Number(params.seed)) ? Number(params.seed) : 1;
    const rand = params.rand == null ? 1 : clamp01(params.rand);
    const span = (ctx && ctx.clip) || {};
    const clipStart = num(span.start != null ? span.start : span.from, 0);
    const t = Math.max(0, num(ctx && ctx.time, 0) - clipStart);
    const tb = textBox(ctx || {}, box);
    const cap = 0.42 + 0.16 * rand;
    const field = {
      id: motif,
      p: glFields.genome(motif, seed, rand),
      seed,
      time: t,
      opacity: clamp01(progress) * cap * (info.beat && info.beat.accent === false ? 0.85 : 1),
      colors: [0, 1, 2, 3, 4].map((index) => colorOf(params, ctx || {}, index)),
      textBox: { x0: tb.x0, y0: tb.y0, x1: tb.x1, y1: tb.y1 },
      camera: null,
    };
    // A simulated field names the state it reads: one per clip, seed and
    // randomness level, which is what the runner keeps its ping-pong pair under.
    if (SIM_MOTIFS.has(motif)) {
      field.sim = {
        key: `${span.key || motif}|${seed}|${round(rand, 3)}`,
        beats: Array.isArray(params.simBeats) ? params.simBeats : null,
      };
    }
    return { shapes: [], texts: [], field };
  }

  // A geometry figure: drawn by figure-geo on the clip's own clock over the whole
  // frame, entering by growing out of the centre. Like the scenes it passes
  // behind the lyrics (the clear runs at the end of drawList).
  function geoShapes(motif, params, ctx, info, state) {
    const { box } = state;
    const seed = Number.isFinite(Number(params.seed)) ? Number(params.seed) : 1;
    const rand = params.rand == null ? 1 : clamp01(params.rand);
    const span = (ctx && ctx.clip) || {};
    const clipStart = num(span.start != null ? span.start : span.from, 0);
    const t = Math.max(0, num(ctx && ctx.time, 0) - clipStart);
    const shapes = figureGeo.render(motif, {
      seed,
      rand,
      t,
      frame: { width: box.width, height: box.height, cx: box.cx, cy: box.cy, short: box.short },
      opacity: state.opacity,
      color: (index) => colorOf(params, ctx, index),
    });
    if (state.scale !== 1) transformShapes(shapes, { originX: box.cx, originY: box.cy, scale: state.scale, dx: 0, dy: 0, rotate: 0 });
    return shapes;
  }

  // The scenes pass behind the lyrics: whatever still touches the text box after
  // the moves and the accent are applied is dropped (a scene is never moved, so
  // its structure stays intact).
  function sceneClearShapes(shapes, tb) {
    const pad = 6;
    return shapes.filter((shape) => {
      const b = procShapeBox(shape);
      return b && !(b.x1 > tb.x0 - pad && b.x0 < tb.x1 + pad && b.y1 > tb.y0 - pad && b.y0 < tb.y1 + pad);
    });
  }

  // The 2D camera of a clip at time `tClip` of `duration`: a scale / shift / turn
  // about the frame centre that is applied to the finished shapes.
  function cameraMove(kind, seed, tClip, duration, box) {
    const u = clamp01(tClip / Math.max(0.5, duration));
    const ease = u * u * (3 - 2 * u);
    const dir = rng.rngFor(seed, 'camera-dir')() < 0.5 ? -1 : 1;
    if (kind === 'push') return { scale: 1 + 0.35 * ease, dx: 0, dy: 0, rotate: 0 };
    if (kind === 'pull') return { scale: 1.35 - 0.35 * ease, dx: 0, dy: 0, rotate: 0 };
    if (kind === 'pan') return { scale: 1.12, dx: dir * (0.5 - ease) * 0.16 * box.width, dy: 0, rotate: 0 };
    if (kind === 'roll') return { scale: 1.1, dx: 0, dy: 0, rotate: dir * (ease - 0.5) * 0.4 };
    if (kind === 'shake') {
      return {
        scale: 1,
        dx: (Math.sin(tClip * 31.7) + 0.6 * Math.sin(tClip * 53.1 + 1)) * 0.004 * box.width,
        dy: (Math.sin(tClip * 27.3 + 2) + 0.6 * Math.sin(tClip * 47.9)) * 0.006 * box.height,
        rotate: Math.sin(tClip * 19.3) * 0.006,
      };
    }
    if (kind === 'whip') {
      const step = Math.floor(tClip / 2.2);
      const into = Math.min(1, (tClip - step * 2.2) / 0.35);
      const e = into * into * (3 - 2 * into);
      const side = ((step + 1) % 2 ? 1 : -1) * dir;
      return { scale: 1.08, dx: side * (1 - e) * 0.12 * box.width, dy: 0, rotate: side * (1 - e) * 0.08 };
    }
    if (kind === 'orbit') return { scale: 1.05 + 0.16 * Math.sin(Math.PI * u), dx: 0, dy: 0, rotate: dir * u * 0.5 };
    return null;
  }

  // The free area around the text box (the same centred band `textBox` returns
  // when the engine has none). A composition that would land on the lyrics is
  // moved into one of these bands and shrunk to fit, so a proc clip stays the
  // composition the seed grew instead of being thrown away by the clearance
  // gate in favour of one of the fixed motifs.
  function procBands(tb, box) {
    const margin = Math.max(8, box.short * 0.03);
    return [
      { x: 0, y: 0, w: box.width, h: Math.max(margin, tb.y0 - margin) },
      { x: 0, y: tb.y1 + margin, w: box.width, h: Math.max(margin, box.height - tb.y1 - margin) },
      { x: 0, y: tb.y0, w: Math.max(margin, tb.x0 - margin), h: Math.max(margin, tb.y1 - tb.y0) },
      { x: tb.x1 + margin, y: tb.y0, w: Math.max(margin, box.width - tb.x1 - margin), h: Math.max(margin, tb.y1 - tb.y0) },
    ];
  }

  function insideBox(x, y, pad, box) {
    return x > box.x0 - pad && x < box.x1 + pad && y > box.y0 - pad && y < box.y1 + pad;
  }

  // the element's own half extents in pixels: what the clearance test and the
  // band fit have to reserve for it (a wide rect needs more than its radius)
  function procHalf(kind, layer, s, angleDeg, weightPx) {
    const a = (angleDeg * Math.PI) / 180;
    const cos = Math.abs(Math.cos(a));
    const sin = Math.abs(Math.sin(a));
    if (kind === 'rect') {
      const w = s * 2 * layer.stretch;
      const h = (s * 2) / Math.max(0.6, layer.stretch * 0.6);
      return { x: (w * cos + h * sin) / 2, y: (w * sin + h * cos) / 2 };
    }
    if (kind === 'capsule' || kind === 'dash') {
      const len = kind === 'dash' ? s * 1.2 : s * (1 + layer.stretch);
      const halfWidth = Math.max(1, kind === 'dash' ? weightPx * 2.2 : weightPx) / 2;
      return { x: cos * len + halfWidth, y: sin * len + halfWidth };
    }
    return { x: s, y: s };
  }

  function clampRange(value, min, max) {
    if (!(min <= max)) return (min + max) / 2;
    return Math.max(min, Math.min(max, value));
  }

  // The axis-aligned box of one shape (what the legibility measure uses), so
  // the clearance pass can ask the same question the auto direction asks.
  function procShapeBox(shape) {
    if (!shape) return null;
    if (Array.isArray(shape.points) && shape.points.length) {
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const point of shape.points) {
        x0 = Math.min(x0, point.x);
        y0 = Math.min(y0, point.y);
        x1 = Math.max(x1, point.x);
        y1 = Math.max(y1, point.y);
      }
      return { x0, y0, x1, y1 };
    }
    if (shape.kind === 'rect') return { x0: shape.x, y0: shape.y, x1: shape.x + shape.w, y1: shape.y + shape.h };
    if (shape.kind === 'capsule') {
      const half = (shape.width || 0) / 2;
      return { x0: Math.min(shape.x0, shape.x1) - half, y0: Math.min(shape.y0, shape.y1) - half, x1: Math.max(shape.x0, shape.x1) + half, y1: Math.max(shape.y0, shape.y1) + half };
    }
    const r = shape.r != null ? shape.r : shape.radius || 0;
    const line = Math.max(0, (shape.thickness || shape.stroke || 0) / 2);
    return { x0: shape.x - r - line, y0: shape.y - r - line, x1: shape.x + r + line, y1: shape.y + r + line };
  }

  // The morph hold crossfades two placements of one genome, and scatterIn /
  // burstOut slide the finished shapes, so a shape can still reach the lyrics
  // after the element pass. This runs last: anything that touches the text box
  // is moved into the free band around it (shrunk to fit) or dropped when even
  // the band cannot hold it.
  function procClearShapes(shapes, tb, box) {
    const bands = procBands(tb, box);
    const kept = [];
    for (const shape of shapes) {
      const bounds = procShapeBox(shape);
      if (!bounds) continue;
      const hits = bounds.x1 > tb.x0 && bounds.x0 < tb.x1 && bounds.y1 > tb.y0 && bounds.y0 < tb.y1;
      if (!hits) {
        kept.push(shape);
        continue;
      }
      const cx = (bounds.x0 + bounds.x1) / 2;
      const cy = (bounds.y0 + bounds.y1) / 2;
      const halfX = (bounds.x1 - bounds.x0) / 2;
      const halfY = (bounds.y1 - bounds.y0) / 2;
      let band = null;
      let fit = 0;
      for (const candidate of bands) {
        const scale = Math.min(1, (candidate.w - 8) / (2 * halfX), (candidate.h - 8) / (2 * halfY));
        if (scale > fit) {
          fit = scale;
          band = candidate;
        }
      }
      if (!band || fit < 0.12) continue;
      const shrunk = scaleShape(shape, fit, { x: cx, y: cy });
      const dx = clampRange(cx, band.x + halfX * fit + 4, band.x + band.w - halfX * fit - 4) - cx;
      const dy = clampRange(cy, band.y + halfY * fit + 4, band.y + band.h - halfY * fit - 4) - cy;
      if (!dx && !dy) {
        kept.push(shrunk);
        continue;
      }
      transformShapes([shrunk], { originX: cx, originY: cy, scale: 1, dx, dy });
      kept.push(shrunk);
    }
    return kept;
  }

  // a stable per-element jitter (no stream draw, so the stream stays time-free)
  function hash01(value, salt) {
    const x = Math.sin(value * 127.1 + salt * 311.7) * 43758.5453123;
    return x - Math.floor(x);
  }

  // Beats after the first mutate a layer a little (another element, symmetry,
  // warp, colour rule), so a clip holds its family while each beat still
  // differs. Every draw runs, applied or not, so the stream stays fixed.
  function procMutate(layer, li, seed, info, rand) {
    if (!info || !(info.index > 0)) return layer;
    const level = rand == null ? 1 : clamp01(rand);
    if (level <= 0) return layer;
    const random = rng.rngFor(seed, 'proc-mut', li, info.index);
    const rolls = [random() / level, random() / level, random() / level, random() / level, random() / level, random() / level];
    const motion = pick(random, PROC_MOTIONS);
    const kind = pick(random, PROC_KINDS);
    const symmetry = pick(random, PROC_SYMMETRIES);
    const warp = pick(random, PROC_WARPS);
    const colorRule = pick(random, PROC_COLOR_RULES);
    const sizeRule = pick(random, PROC_SIZE_RULES);
    const amp = rng.range(random, 0.5, 1.8);
    const phase = random() * TAU;
    const next = { ...layer, kinds: layer.kinds.slice(), warp: { ...layer.warp }, tone: layer.tone };
    if (rolls[0] < 0.35) next.kinds[0] = kind;
    if (rolls[1] < 0.3) next.symmetry = symmetry;
    if (rolls[2] < 0.45) {
      next.warp.amp = Math.min(0.7, layer.warp.amp * (1 + (amp - 1) * level));
      next.warp.phase = phase;
      if (rolls[2] < 0.15) next.warp.type = warp;
    }
    if (rolls[3] < 0.3) {
      next.colorRule = colorRule;
      next.colorShift = layer.colorShift + 1;
    }
    if (rolls[4] < 0.25) next.sizeRule = sizeRule;
    if (rolls[5] < 0.25) {
      next.motion = motion;
      next.motions = [motion];
    }
    return next;
  }

  // a unit-space point bent by the layer's warp (static shape + a slow drift)
  function procWarp(layer, x, y, local) {
    const w = layer.warp;
    if (!w || w.type === 'none') return { x, y };
    const phase = w.phase + local * 0.25 * (layer.speed || 1);
    if (w.type === 'sine') return { x: x + w.amp * Math.sin(w.freq * y * Math.PI + phase), y: y + w.amp * Math.sin(w.freq * x * Math.PI + phase * 1.3) };
    if (w.type === 'noise') return { x: x + w.amp * 0.5 * (Math.sin(3.1 * y + phase) + 0.5 * Math.sin(7.3 * x + phase * 2)), y: y + w.amp * 0.5 * (Math.sin(2.7 * x + phase * 1.7) + 0.5 * Math.sin(6.1 * y + phase)) };
    const r = Math.hypot(x, y);
    if (r < 1e-6) return { x, y };
    if (w.type === 'swirl') {
      const a = w.amp * 3.2 * (1 - Math.min(1, r)) * Math.sin(phase * 0.5 + 1);
      return { x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) };
    }
    const k = Math.pow(Math.min(1.5, r), 1 + w.amp * 1.6) / r; // bulge
    return { x: x * k, y: y * k };
  }

  let colorApi;
  function colorLib() {
    if (colorApi !== undefined) return colorApi;
    colorApi = null;
    try {
      if (typeof require === 'function') colorApi = require('../color');
    } catch (error) {
      colorApi = null;
    }
    if (!colorApi && typeof self !== 'undefined' && self.SA && self.SA.color) colorApi = self.SA.color;
    return colorApi;
  }

  // the palette colour bent by the layer's tone (hue turn, saturation, value and
  // a ramp along the element order); a colour that cannot be parsed stays as is
  function procTone(hex, layer, t, jitter) {
    const tone = layer.tone;
    const api = colorLib();
    if (!tone || !api || typeof hex !== 'string' || hex.charAt(0) !== '#') return hex;
    const dh = jitter ? jitter.h * layer.hueSpread : 0;
    const dv = jitter ? 1 + jitter.v * layer.valSpread : 1;
    if (!tone.hue && tone.sat === 1 && tone.val === 1 && !tone.ramp && !dh && dv === 1) return hex;
    try {
      const hsv = api.rgbToHsv(api.parse(hex));
      const out = api.hsvToRgb({ h: hsv.h + tone.hue + dh, s: Math.min(1, hsv.s * tone.sat), v: Math.min(1, hsv.v * tone.val * dv * (1 + tone.ramp * (t - 0.5) * 2)), a: 1 });
      return api.toHex(out);
    } catch (error) {
      return hex;
    }
  }

  // what a person remembers of a composition: the first layers' layout, main
  // element, motion and role. Two seeds sharing two of these read as one picture.
  function procKey(seed, rand) {
    const layers = procGenome(seed, rand);
    const first = layers[0];
    return { layout: first.layout, kind: first.kinds[0], motion: first.motion, role: first.role, second: layers[1] ? layers[1].layout : '' };
  }

  function procTooSimilar(a, b) {
    if (!a || !b) return false;
    let shared = 0;
    if (a.layout === b.layout) shared += 1;
    if (a.kind === b.kind) shared += 1;
    if (a.motion === b.motion) shared += 1;
    if (a.role === b.role) shared += 1;
    return shared >= 2 || (a.layout === b.layout && a.second === b.second);
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
    } else if (layout === 'rose') {
      // rose curve r = cos(k * theta): petals that depend on the rational k
      const k = (layer.freqA + 1) / (1 + (layer.freqB % 3));
      for (let i = 0; i < n; i += 1) {
        const th = (i / n) * TAU * (1 + (layer.freqB % 3));
        const rad = Math.cos(k * th);
        push(Math.cos(th) * rad, Math.sin(th) * rad, i / n);
      }
    } else if (layout === 'spirograph') {
      // hypotrochoid: a gear rolling inside a ring, the pen offset from its centre
      const small = 0.16 + 0.1 * layer.freqA;
      const pen = small * (0.5 + 0.25 * layer.freqB);
      const big = 1;
      const extent = big - small + pen;
      for (let i = 0; i < n; i += 1) {
        const th = (i / n) * TAU * (3 + layer.freqB);
        push(((big - small) * Math.cos(th) + pen * Math.cos(((big - small) / small) * th)) / extent, ((big - small) * Math.sin(th) - pen * Math.sin(((big - small) / small) * th)) / extent, i / n);
      }
    } else if (layout === 'poisson') {
      // dart throwing: an even blue-noise scatter, nothing touching
      const gap = 1.5 / Math.sqrt(Math.max(4, n));
      const accepted = [];
      for (let attempt = 0; attempt < n * 14 && accepted.length < n; attempt += 1) {
        const x = random() * 2 - 1;
        const y = random() * 2 - 1;
        if (accepted.every((q) => (q.x - x) * (q.x - x) + (q.y - y) * (q.y - y) > gap * gap)) accepted.push({ x, y });
      }
      accepted.forEach((q, i) => push(q.x, q.y, i / Math.max(1, accepted.length)));
    } else if (layout === 'hex') {
      const cols = Math.max(2, Math.round(Math.sqrt(n * layer.aspect * 1.15)));
      const rows = Math.max(2, Math.ceil(n / cols));
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) push(((col + (row % 2 ? 0.5 : 0)) / cols) * 2 - 1 + 1 / cols / 2, ((row / (rows - 1)) * 2 - 1) * 0.88, (row * cols + col) / (rows * cols));
      }
    } else if (layout === 'harmonograph') {
      // two damped pendulums: a Lissajous that decays into itself
      const a = 2 + layer.freqA + (layer.freqB % 3) * 0.01;
      const b = 2 + layer.freqB + 0.013 * layer.freqA;
      for (let i = 0; i < n; i += 1) {
        const t = (i / n) * 28;
        const decay = Math.exp(-0.045 * t);
        push(Math.sin(a * t * 0.55 + layer.phase) * decay, Math.sin(b * t * 0.55) * decay, i / n);
      }
    } else if (layout === 'superformula') {
      // Gielis superformula outline sampled as a ring of points
      const m = 2 + layer.freqA * 2;
      const n1 = 0.3 + layer.amp * 1.6;
      const n2 = 0.5 + layer.freqB * 0.9;
      const n3 = 0.5 + layer.freqA * 0.7;
      const raw = [];
      let max = 0;
      for (let i = 0; i < n; i += 1) {
        const th = (i / n) * TAU;
        const r = Math.pow(Math.pow(Math.abs(Math.cos((m * th) / 4)), n2) + Math.pow(Math.abs(Math.sin((m * th) / 4)), n3), -1 / n1);
        const rr = Number.isFinite(r) ? Math.min(r, 6) : 1;
        raw.push({ th, r: rr });
        max = Math.max(max, rr);
      }
      raw.forEach((q, i) => push((Math.cos(q.th) * q.r) / max, (Math.sin(q.th) * q.r) / max, i / n));
    } else if (layout === 'galaxy') {
      const arms = 2 + (layer.freqA % 4);
      for (let i = 0; i < n; i += 1) {
        const arm = i % arms;
        const r = Math.pow((i + 1) / n, 0.7);
        const a = (arm / arms) * TAU + r * layer.twist * 2 + rng.gauss(random) * 0.12;
        push(Math.cos(a) * r, Math.sin(a) * r, i / n);
      }
    } else if (layout === 'truchet') {
      // one diagonal per cell, the lean picked at random
      const cols = Math.max(2, Math.round(Math.sqrt(n * layer.aspect)));
      const rows = Math.max(2, Math.ceil(n / cols));
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          push((col / (cols - 1)) * 2 - 1, (row / (rows - 1)) * 2 - 1, (row * cols + col) / (rows * cols));
          points[points.length - 1].fixed = random() < 0.5 ? 45 : 135;
        }
      }
    } else if (layout === 'sierpinski') {
      // chaos game on a triangle: the same point set as a fractal, never a grid
      const corner = (k) => ({ x: Math.cos(layer.phase + (k * TAU) / 3), y: Math.sin(layer.phase + (k * TAU) / 3) });
      const cs = [corner(0), corner(1), corner(2)];
      let px = 0;
      let py = 0;
      for (let i = 0; i < n + 8; i += 1) {
        const c = cs[Math.floor(random() * 3)];
        px = (px + c.x) / 2;
        py = (py + c.y) / 2;
        if (i >= 8) push(px * 1.9, py * 1.9, (i - 8) / n);
      }
    } else if (layout === 'flow') {
      // streamlines of a sine flow field
      const lines = Math.max(2, Math.round(n / 9));
      const per = Math.max(2, Math.round(n / lines));
      for (let line = 0; line < lines; line += 1) {
        let x = random() * 2 - 1;
        let y = random() * 2 - 1;
        for (let i = 0; i < per; i += 1) {
          push(x, y, (line * per + i) / (lines * per));
          const a = Math.sin(x * layer.freqA * 1.3 + layer.phase) * Math.cos(y * layer.freqB * 1.1) * Math.PI;
          x = Math.max(-1.2, Math.min(1.2, x + Math.cos(a) * 0.16));
          y = Math.max(-1.2, Math.min(1.2, y + Math.sin(a) * 0.16));
        }
      }
    } else if (layout === 'lattice') {
      // a skewed, turned grid
      const cols = Math.max(2, Math.round(Math.sqrt(n * layer.aspect)));
      const rows = Math.max(2, Math.ceil(n / cols));
      const turn = layer.phase * 0.5;
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const gx = (col / (cols - 1)) * 2 - 1 + layer.slope * ((row / (rows - 1)) * 2 - 1);
          const gy = (row / (rows - 1)) * 2 - 1;
          push((gx * Math.cos(turn) - gy * Math.sin(turn)) * 0.8, (gx * Math.sin(turn) + gy * Math.cos(turn)) * 0.8, (row * cols + col) / (rows * cols));
        }
      }
    } else if (layout === 'ripple') {
      // rings whose spacing and count grow outward
      const rings = 3 + layer.rings;
      const weights = Array.from({ length: rings }, (_, i) => i + 1);
      const total = weights.reduce((a, b) => a + b, 0);
      let index = 0;
      for (let ring = 0; ring < rings; ring += 1) {
        const per = Math.max(3, Math.round((n * weights[ring]) / total));
        const offset = random() * TAU;
        const rad = Math.pow((ring + 1) / rings, 1.6);
        for (let i = 0; i < per; i += 1) {
          const a = offset + (i / per) * TAU;
          push(Math.cos(a) * rad, Math.sin(a) * rad, index / n);
          index += 1;
        }
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
    // alignment: elements can lean along the path, the radius or the grid
    if (layer.alignMode && layer.alignMode !== 'none') {
      for (let i = 0; i < points.length; i += 1) {
        const pt = points[i];
        if (pt.fixed != null) {
          pt.al = pt.fixed;
          continue;
        }
        if (layer.alignMode === 'radial') pt.al = (pt.a * 180) / Math.PI;
        else if (layer.alignMode === 'perp') pt.al = (pt.a * 180) / Math.PI + 90;
        else if (layer.alignMode === 'grid') pt.al = Math.floor(hash01(i, layer.phase) * 4) * 45;
        else {
          const before = points[Math.max(0, i - 1)];
          const after = points[Math.min(points.length - 1, i + 1)];
          pt.al = before === after ? 0 : (Math.atan2(after.y - before.y, after.x - before.x) * 180) / Math.PI;
        }
      }
    } else {
      for (const pt of points) if (pt.fixed != null) pt.al = pt.fixed;
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
  // outline / dash / arc trim / stroke pattern on top of a pushed shape; the
  // shape pass takes all of them on every kind except convex
  function procDecorate(shape, deco) {
    if (!deco || shape.kind === 'convex') return;
    const stroked = shape.kind === 'ring' || shape.kind === 'capsule' || shape.stroke > 0;
    const filled = (shape.kind === 'circle' || shape.kind === 'rect' || shape.kind === 'polygon') && shape.color;
    if (deco.outline && filled) {
      shape.stroke = deco.outline.width;
      shape.strokeColor = deco.outline.color;
    }
    const hasStroke = stroked || (deco.outline && filled);
    if (!hasStroke) return;
    if (deco.pattern) {
      shape.pattern = deco.pattern.code;
      shape.patternParams = [deco.pattern.period, deco.pattern.ratio, 0];
    } else if (deco.dash) shape.dash = deco.dash;
    if (deco.trim && shape.kind !== 'capsule') shape.trim = deco.trim;
  }

  function procPush(shapes, layer, kind, e) {
    const before = shapes.length;
    procPushShape(shapes, layer, kind, e);
    if (e.deco) for (let i = before; i < shapes.length; i += 1) procDecorate(shapes[i], e.deco);
  }

  function procPushShape(shapes, layer, kind, e) {
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
    } else if (kind === 'blob') {
      const points = [];
      const seedSalt = e.salt || 0;
      for (let k = 0; k < 8; k += 1) {
        const a = rad + (k / 8) * TAU;
        const reach = s * (0.72 + 0.4 * hash01(seedSalt + k, layer.phase));
        points.push({ x: x + Math.cos(a) * reach, y: y + Math.sin(a) * reach });
      }
      shapes.push({ kind: 'convex', points, color, opacity });
    } else if (kind === 'chevron') {
      const spread = ((25 + layer.sides * 6) * Math.PI) / 180;
      for (const sign of [-1, 1]) {
        const a = rad + Math.PI + sign * spread;
        shapes.push({ kind: 'capsule', x0: x, y0: y, x1: x + Math.cos(a) * s * 1.3, y1: y + Math.sin(a) * s * 1.3, width: Math.max(1, weight * 1.3), color, opacity });
      }
    } else if (kind === 'asterisk') {
      const lines = 2 + (layer.sides % 3);
      for (let k = 0; k < lines; k += 1) {
        const a = rad + (k * Math.PI) / lines;
        shapes.push({ kind: 'capsule', x0: x - Math.cos(a) * s, y0: y - Math.sin(a) * s, x1: x + Math.cos(a) * s, y1: y + Math.sin(a) * s, width: Math.max(1, weight * 0.9), color, opacity });
      }
    } else if (kind === 'frame') {
      const w = s * 2 * Math.min(2.5, layer.stretch);
      const h = s * 2;
      shapes.push({ kind: 'rect', x: x - w / 2, y: y - h / 2, w, h, radius: Math.min(w, h) * 0.08, angle, color: null, stroke: Math.max(1, weight * 1.2), strokeColor: color, opacity });
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

  function procSizeFactor(layer, u, g) {
    const k = layer.sizeSpread;
    let f;
    if (layer.sizeDist === 'pareto') f = Math.pow(1 - Math.min(0.97, u), -k * 0.8);
    else if (layer.sizeDist === 'bimodal') f = u < 0.7 ? 1 - 0.5 * k : 1 + 1.8 * k;
    else if (layer.sizeDist === 'steps') f = Math.pow([0.5, 1, 2][Math.min(2, Math.floor(u * 3))], k * 1.5);
    else if (layer.sizeDist === 'uniform') f = 1 + (u * 2 - 1) * k * 0.9;
    else f = Math.exp(g * k);
    return Math.max(0.3, Math.min(7, f));
  }

  function procShapes(params, ctx, info, state, tuning, density) {
    const { box, opacity } = state;
    const seed = Number.isFinite(Number(params.seed)) ? Number(params.seed) : 1;
    const rand = params.rand == null ? 1 : clamp01(params.rand);
    const layers = procGenome(seed, rand);
    const tb = textBox(ctx, box);
    const bands = procBands(tb, box);
    const local = info.local;
    const shapes = [];
    const api = colorLib();
    // a drawn element count spreads over the layers in proportion to their own
    // counts (symmetric copies included); a hand-set `count` still wins
    const limit = tuning.count == null ? shapeLimitOf(params) : null;
    const wanted = layers.reduce((sum, layer) => sum + layer.count * procCopies(layer), 0);
    const share = limit == null ? null : limit / Math.max(1, wanted);
    layers.forEach((baseLayer, li) => {
      if (shapes.length >= PROC_TOTAL_BUDGET) return;
      const layer = procMutate(baseLayer, li, seed, info, rand);
      const motions = layer.motions || [layer.motion];
      const has = (name) => motions.indexOf(name) >= 0;
      const random = rng.rngFor(seed, 'proc-place', li, info.index, state.variant);
      const copies = procCopies(layer);
      // the first layer always draws; a later one only while the count has room
      if (limit != null && li > 0 && shapes.length + copies > limit) return;
      const countScale = tuning.count == null ? 0.6 + density : tuning.count / 8;
      const n = share == null
        ? Math.max(3, Math.min(150, Math.round(layer.count * countScale)))
        : Math.max(1, Math.min(150, Math.round(layer.count * share)));
      let points = procPoints(layer, n, random);
      // decimate evenly when symmetry would blow the per-layer budget (or the
      // layouts that round up, grid / brick / bands, overshoot the drawn count)
      let cap = Math.max(3, Math.floor(PROC_LAYER_BUDGET / copies));
      if (limit != null) cap = Math.max(1, Math.min(cap, Math.floor((limit - shapes.length) / copies)));
      if (points.length > cap) {
        const stride = Math.ceil(points.length / cap);
        points = points.filter((_, i) => i % stride === 0);
      }
      const zoom = has('zoom') ? 0.78 + 0.22 * Math.sin(local * layer.speed * 0.8 + layer.phase) : 1;
      const spanX = box.width * layer.spreadX * state.scale * zoom;
      const spanY = box.height * layer.spreadY * state.scale * zoom;
      const cx = box.cx + box.width * layer.offsetX;
      const cy = box.cy + box.height * layer.offsetY;
      const turn = (state.rotation * Math.PI) / 180 + (has('spin') ? local * layer.speed * 0.8 : 0) + (has('sway') ? Math.sin(local * layer.speed * 0.9 + layer.phase) * 0.4 : 0);
      const cosT = Math.cos(turn);
      const sinT = Math.sin(turn);
      const sizeBase = box.short * layer.size * state.scale;
      const weightBase = box.short * layer.weight;
      const margin = layer.margin * box.short;
      let counter = 0;
      for (const base of points) {
        // every random value of the element is drawn here, before any element
        // can be skipped, so the stream never depends on the time
        const jx = layer.jitter ? (random() * 2 - 1) * layer.jitter * 0.25 : 0;
        const jy = layer.jitter ? (random() * 2 - 1) * layer.jitter * 0.25 : 0;
        const tiltNoise = layer.tiltRandom ? (random() * 2 - 1) * layer.tiltRandom : 0;
        const kind = layer.kinds[Math.floor(random() * layer.kinds.length)];
        const colorRoll = random();
        const sizeU = random();
        const sizeG = rng.gauss(random);
        const weightG = rng.gauss(random);
        const alphaJ = random() * 2 - 1;
        const hueJ = random() * 2 - 1;
        const valJ = random() * 2 - 1;
        const decoRolls = [random(), random(), random(), random(), random(), random(), random(), random()];
        for (const point of procMirror(layer, { ...base, x: base.x + jx, y: base.y + jy })) {
          const index = counter;
          counter += 1;
          const warped = procWarp(layer, point.x, point.y, local);
          let ux = warped.x;
          let uy = warped.y;
          const phase = index * 0.7 + layer.phase;
          let spinExtra = 0;
          let sizeMul = 1;
          let alphaMul = 1;
          for (const motion of motions) {
            if (motion === 'wave') uy += Math.sin(local * layer.speed * 2.2 + ux * 3 + layer.phase) * 0.12;
            else if (motion === 'flow') ux = ((((ux + 1) / 2 + local * layer.speed * 0.12) % 1) + 1) % 1 * 2 - 1;
            else if (motion === 'fall') uy = ((((uy + 1) / 2 + local * layer.speed * 0.1) % 1) + 1) % 1 * 2 - 1;
            else if (motion === 'orbit') {
              const a = local * layer.speed * (0.4 + base.r * 0.6);
              const ox = ux * Math.cos(a) - uy * Math.sin(a);
              uy = ux * Math.sin(a) + uy * Math.cos(a);
              ux = ox;
            } else if (motion === 'ellipse') {
              const a = local * layer.speed * 0.9 + phase;
              ux += Math.cos(a) * 0.1;
              uy += Math.sin(a) * 0.05;
            } else if (motion === 'bounce') uy -= Math.abs(Math.sin(local * layer.speed * 2.4 + phase)) * 0.18;
            else if (motion === 'shiver') {
              const tick = Math.floor(local * 14);
              ux += (hash01(tick + index * 3, 7) - 0.5) * 0.04;
              uy += (hash01(tick + index * 3, 11) - 0.5) * 0.04;
            } else if (motion === 'ripple') {
              const k = 1 + 0.09 * Math.sin(Math.hypot(ux, uy) * 6 - local * layer.speed * 3);
              ux *= k;
              uy *= k;
            } else if (motion === 'tumble') spinExtra += local * layer.speed * 120 * (0.4 + hash01(index, layer.phase));
            else if (motion === 'travel') sizeMul *= 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(TAU * (base.t * (1 + (layer.freqA % 3)) - local * layer.speed * 0.4)));
            else if (motion === 'cascade') {
              const sweep = Math.abs((((local * 0.18 * Math.abs(layer.speed)) % 2) + 2) % 2 - 1);
              sizeMul *= Math.max(0, Math.min(1, (sweep * 1.6 - base.t) * 4));
            } else if (motion === 'breathe') sizeMul *= 0.65 + 0.35 * Math.sin(local * layer.speed * 2 + phase);
            else if (motion === 'twinkle') alphaMul *= 0.3 + 0.7 * Math.abs(Math.sin(local * layer.speed * 1.5 + phase));
          }
          let x = cx + (ux * cosT - uy * sinT) * spanX;
          let y = cy + (ux * sinT + uy * cosT) * spanY + state.drift;
          let s;
          if (layer.sizeRule === 'ramp') s = sizeBase * (0.3 + 1.4 * base.t);
          else if (layer.sizeRule === 'radial') s = sizeBase * (1.5 - Math.min(1.2, base.r));
          else if (layer.sizeRule === 'invRadial') s = sizeBase * (0.3 + Math.min(1.2, base.r));
          else if (layer.sizeRule === 'alternate') s = sizeBase * (index % 2 ? 0.45 : 1.3);
          else s = sizeBase;
          s = Math.min(box.short * 0.45, s * procSizeFactor(layer, sizeU, sizeG) * sizeMul);
          const weight = Math.max(1, weightBase * Math.exp(weightG * layer.weightSpread));
          const alpha = Math.max(0.3, Math.min(1, layer.opacity * (1 + alphaJ * layer.alphaSpread))) * Math.max(0.4, alphaMul);
          // the beat never draws empty: the first element is kept even if the
          // placement would skip it, so a clip cannot vanish between two frames
          const first = shapes.length === 0;
          if (first) s = Math.max(s, 1.2);
          else if (s < 0.8) continue;
          const align = point.al != null ? point.al + (point.turn ? (point.turn * 180) / Math.PI : 0) : 0;
          const tilt = (point.al != null ? align : layer.tilt) + (point.al != null ? layer.tilt * 0.15 : 0) + tiltNoise * (point.al != null ? 0.25 : 1) + (point.turn && point.al == null ? (point.turn * 180) / Math.PI : 0) + (point.flip ? 180 : 0);
          const spin = (has('spin') ? local * layer.speed * 40 : 0) + spinExtra;
          let half = procHalf(kind, layer, s, tilt + spin, weight);
          // the frame margin keeps the element's centre inside an inset of the frame
          if (margin > 0) {
            x = clampRange(x, margin + half.x, box.width - margin - half.x);
            y = clampRange(y, margin + half.y, box.height - margin - half.y);
          }
          // keep the lyrics clear: an element whose own box touches the text box
          // moves out of it along its shortest exit (shrunk into a free band when
          // no exit is left) instead of being dropped, so the clearance gate
          // keeps this composition rather than the motif
          if (x + half.x > tb.x0 && x - half.x < tb.x1 && y + half.y > tb.y0 && y - half.y < tb.y1) {
            // push the element out of the text box along its shortest exit (plus
            // a hashed extra run), so the composition keeps its shape as a halo
            // around the lyrics instead of collapsing into one band
            const gap = Math.max(8, box.short * 0.03);
            const extra = hash01(index + li * 131, layer.phase) * box.short * 0.1;
            const exits = [
              { axis: 'x', to: tb.x0 - gap - half.x - extra },
              { axis: 'x', to: tb.x1 + gap + half.x + extra },
              { axis: 'y', to: tb.y0 - gap - half.y - extra },
              { axis: 'y', to: tb.y1 + gap + half.y + extra },
            ].filter((exit) => (exit.axis === 'x' ? exit.to >= half.x + 2 && exit.to <= box.width - half.x - 2 : exit.to >= half.y + 2 && exit.to <= box.height - half.y - 2));
            exits.sort((a, b) => Math.abs(a.to - (a.axis === 'x' ? x : y)) - Math.abs(b.to - (b.axis === 'x' ? x : y)));
            if (exits.length) {
              if (exits[0].axis === 'x') x = exits[0].to;
              else y = exits[0].to;
            } else {
              let band = null;
              let fit = 0;
              for (const candidate of bands) {
                const scale = Math.min(1, (candidate.w - 8) / (2 * half.x), (candidate.h - 8) / (2 * half.y));
                if (scale > fit) {
                  fit = scale;
                  band = candidate;
                }
              }
              if (!band || fit < 0.15) continue; // nothing sane fits: drop the element
              s *= fit;
              half = { x: half.x * fit, y: half.y * fit };
              x = clampRange(x, band.x + half.x + 4, band.x + band.w - half.x - 4);
              y = clampRange(y, band.y + half.y + 4, band.y + band.h - half.y - 4);
            }
          }
          let colorIndex;
          if (layer.colorRule === 'random') colorIndex = Math.floor(colorRoll * 8);
          else if (layer.colorRule === 'radius') colorIndex = Math.floor(Math.min(1, base.r) * 4);
          else if (layer.colorRule === 'angle') colorIndex = Math.floor(((base.a + Math.PI) / TAU) * 5);
          else if (layer.colorRule === 'single') colorIndex = layer.colorShift;
          else if (layer.colorRule === 'band') colorIndex = Math.floor(base.t * 4) + layer.colorShift;
          else colorIndex = index + layer.colorShift;
          const color = procTone(colorOf(params, ctx, colorIndex + li), layer, base.t, { h: hueJ, v: valJ });
          // decoration: each element rolls its own outline / dash / pattern / arc
          const deco = {};
          if (decoRolls[0] < layer.decoOutline) {
            let outlineColor = color;
            if (layer.outlineMode === 'alt') outlineColor = procTone(colorOf(params, ctx, colorIndex + li + 2), layer, 1 - base.t);
            else if (layer.outlineMode === 'dark') outlineColor = '#0b0d14';
            else if (layer.outlineMode === 'light') outlineColor = '#f4f6ff';
            else if (layer.outlineMode === 'contrast' && api && typeof color === 'string' && color.charAt(0) === '#') {
              try {
                const hsv = api.rgbToHsv(api.parse(color));
                outlineColor = api.toHex(api.hsvToRgb({ h: hsv.h + 180, s: hsv.s, v: hsv.v > 0.55 ? hsv.v * 0.5 : Math.min(1, hsv.v + 0.5), a: 1 }));
              } catch (error) {
                outlineColor = color;
              }
            }
            deco.outline = { width: Math.max(1, weight * (0.5 + decoRolls[5] * 1.8)), color: outlineColor };
          }
          if (decoRolls[1] < layer.decoPattern) deco.pattern = { code: PROC_PATTERN_CODES[Math.floor(decoRolls[6] * PROC_PATTERN_CODES.length)], period: Math.max(3, weight * (2 + decoRolls[7] * 6)), ratio: 0.3 + decoRolls[5] * 0.4 };
          else if (decoRolls[2] < layer.decoDash) deco.dash = [0.03 + decoRolls[6] * 0.14, 0.03 + decoRolls[7] * 0.12, 0];
          if (decoRolls[3] < layer.decoTrim) deco.trim = [0, 0.3 + decoRolls[4] * 0.6, decoRolls[7]];
          procPush(shapes, layer, kind, { x, y, s, angle: tilt + spin, color, opacity: opacity * alpha, weight, salt: index + li * 977, deco: deco.outline || deco.dash || deco.pattern || deco.trim ? deco : null });
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
    // a hand-set `count` wins; otherwise a drawn element count (params.shapes)
    // replaces the density default, clamped to the motif's own sane range
    // (`per` = shapes one count step draws)
    const limit = shapeLimitOf(params);
    const countOf = (fallback, lo, hi, per) => {
      if (tuning.count != null) return tuning.count;
      if (limit == null || lo == null) return fallback;
      return Math.max(lo, Math.min(hi, Math.round(limit / (per || 1))));
    };
    const stroke = box.short * 0.006 * tuning.stroke;
    const spinRate = state.spinRate == null ? 1 : state.spinRate;

    if (motif === PROC) return procShapes(params, ctx, info, state, tuning, density);
    if (SCENE_MOTIFS.includes(motif)) return sceneShapes(motif, params, ctx, info, state);
    if (GEO_MOTIFS.includes(motif)) return geoShapes(motif, params, ctx, info, state);

    if (motif === 'orbit') {
      const radius = box.short * (0.14 + 0.1 * density) * scale;
      const rings = tuning.count == null ? 3 : Math.max(3, Math.min(6, tuning.count));
      for (let i = 0; i < rings; i += 1) {
        const angle = info.local * (0.8 + i * 0.25) * spinRate + (variant * TAU) / 3;
        shapes.push({ kind: 'ring', x: box.cx + Math.cos(angle) * radius, y: box.cy + Math.sin(angle) * radius * 0.72, r: box.short * 0.02 * (1 + i * 0.4), thickness: box.short * 0.008 * tuning.stroke, color: colorOf(params, ctx, i), opacity: opacity * 0.8 });
      }
      shapes.push({ kind: 'circle', x: box.cx, y: box.cy, r: box.short * 0.03 * scale, color: colorOf(params, ctx, 0), opacity });
    } else if (motif === 'burst') {
      const count = countOf(Math.max(4, Math.round(6 + density * 30)), 3, 40);
      const reach = box.short * 0.22 * scale;
      for (let i = 0; i < count; i += 1) {
        const angle = (i / count) * TAU + rotation * 0.05;
        shapes.push({ kind: 'capsule', x0: box.cx, y0: box.cy, x1: box.cx + Math.cos(angle) * reach, y1: box.cy + Math.sin(angle) * reach, width: box.short * 0.009 * tuning.stroke, color: colorOf(params, ctx, i), opacity: opacity * 0.85 });
      }
    } else if (motif === 'bars') {
      const bars = Math.max(5, Math.round(8 + density * 16));
      const total = countOf(bars, 3, 28);
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
      const count = countOf(Math.max(4, Math.round(6 + density * 30)), 3, 60);
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
      const countTick = countOf(Math.max(4, Math.round(10 + density * 10)), 3, 30);
      const width = box.width * 0.7;
      for (let i = 0; i < countTick; i += 1) {
        const u = (i / countTick + info.local * 0.15 * spinRate) % 1;
        const x = box.cx - width / 2 + width * u;
        const h = box.short * (0.01 + 0.02 * ((i * 7) % 5) / 5) * (0.5 + 0.5 * progress);
        shapes.push({ kind: 'rect', x, y: box.cy - h, w: box.short * 0.006, h: h * 2, color: colorOf(params, ctx, i), opacity: opacity * 0.7 });
      }
    } else if (motif === 'halftone') {
      const cols = tuning.count == null ? (limit == null ? Math.max(3, Math.round(4 + density * 6)) : Math.max(3, Math.min(12, Math.round(Math.sqrt(limit / 0.6))))) : Math.max(3, Math.min(12, Math.round(tuning.count / 2)));
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
      const branches = countOf(4 + Math.round(density * 4), 2, 10, 2);
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
      const count = countOf(Math.max(6, Math.round(9 + density * 12)), 4, 30);
      const reach = box.short * 0.2 * scale;
      for (let i = 0; i < count; i += 1) {
        const angle = (i / count) * TAU + rotation * 0.04;
        const length = reach * (0.5 + 0.5 * Math.abs(Math.sin(info.local * 1.6 + i)));
        shapes.push({ kind: 'capsule', x0: box.cx, y0: box.cy, x1: box.cx + Math.cos(angle) * length, y1: box.cy + Math.sin(angle) * length, width: box.short * 0.004 * tuning.stroke, color: colorOf(params, ctx, i), opacity: opacity * 0.85 });
      }
    } else if (motif === 'eyes') {
      const random = rng.rngFor(0x0e75, 'eyes', info.index, variant);
      const pairs = countOf(3 + Math.round(density * 3), 1, 8, 2);
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
      const count = countOf(5 + Math.round(density * 4), 2, 16);
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
      const count = countOf(5 + Math.round(density * 5), 2, 12, 2);
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
      const cells = countOf(4, 2, 8, 2);
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
      const bands = countOf(3, 1, 4, 16);
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
      const count = countOf(4 + Math.round(density * 4), 2, 10, 2);
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
      const countStripes = countOf(Math.max(4, Math.round(5 + density * 3)), 3, 10);
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
      const countBars = countOf(3, 1, 5, 2);
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
      // a scaled ring / outline keeps its line weight in proportion
      if (next.thickness != null) next.thickness *= factor;
      if (next.stroke != null) next.stroke *= factor;
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
    if (FIELD_MOTIFS.includes(motif)) return fieldResult(motif, params, ctx, info, progress, box);
    const tuning = tuningOf(params);
    const variant = num(beat.variant, 0);
    const spinHold = beat.move.hold === 'spin';
    let rotation = spinHold ? info.local * 40 * (variant % 2 ? -1 : 1) * tuning.spinRate : variant * 5 * tuning.spinRate;
    let pulse = beat.move.hold === 'pulse' ? 1 + 0.08 * Math.sin(TAU * info.local * 2) : 1;
    let drift = beat.move.hold === 'drift' ? Math.sin(info.local * 1.6) * box.short * 0.03 : 0;
    if (info.adsrLevel != null) {
      if (spinHold) rotation *= info.adsrLevel;
      if (beat.move.hold === 'pulse') pulse = 1 + 0.08 * Math.sin(TAU * info.local * 2) * info.adsrLevel;
      if (beat.move.hold === 'drift') drift *= info.adsrLevel;
    }
    let scale = (0.2 + 0.8 * progress) * pulse;
    if (info.adsr && info.adsrLevel != null && info.adsrLevel > 0) {
      scale *= 1 + info.adsr.punch * Math.max(0, info.adsrLevel - info.adsr.sustain);
    }
    // the sub-beat's palette rotation: the same motif cycles its colours across
    // the beats instead of repeating one assignment (a legacy beat without a
    // tone keeps its historic colours)
    const tone = Math.round(num(beat.tone, 0));
    const palette = params.colors && params.colors.length ? params.colors : ((ctx && ctx.colors) || []);
    const drawParams = tone && palette.length ? { ...params, colors: palette.map((_, i) => palette[(i + tone) % palette.length]) } : params;
    const state = { box, opacity, scale, rotation, pulse, drift, variant, tuning, spinRate: spinHold ? tuning.spinRate : 1, morphPhase: null };
    const morphHold = beat.move.hold === 'morph';
    let shapes;
    if (morphHold) {
      const phase = clamp01(info.local / Math.max(0.5, info.duration));
      const specific = motif === 'polyMorph' || motif === 'rings' || motif === 'bars';
      if (specific) {
        shapes = buildMotif(motif, drawParams, ctx, info, { ...state, morphPhase: phase });
      } else {
        const a = buildMotif(motif, drawParams, ctx, info, { ...state, variant });
        const b = buildMotif(motif, drawParams, ctx, info, { ...state, variant: variant + 1 });
        shapes = mixShapes(a, b, phase);
      }
    } else {
      shapes = buildMotif(motif, drawParams, ctx, info, state);
    }
    // radius: the optional motif size, about the frame centre
    if (tuning.radius !== 1) {
      for (let i = 0; i < shapes.length; i += 1) shapes[i] = scaleShape(shapes[i], tuning.radius, { x: box.cx, y: box.cy });
    }
    if (tuning.aspect !== 1) shapes = stretchX(shapes, tuning.aspect, box.cx);
    if (tuning.stroke !== 1) shapes = scaleStroke(shapes, tuning.stroke);
    // the sub-beat's own scale (0.6..1.4): the same motif reads bigger or
    // smaller on every beat, so a clip never draws the identical stamp twice
    const beatSize = Math.max(0.3, Math.min(2, num(beat.size, 1)));
    if (beatSize !== 1) {
      for (let i = 0; i < shapes.length; i += 1) shapes[i] = scaleShape(shapes[i], beatSize, { x: box.cx, y: box.cy });
    }
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
    // proc: scatterIn / burstOut / the morph hold can still slide a shape over
    // the lyrics, so its clearance runs last
    if (motif === PROC) shapes = procClearShapes(shapes, textBox(ctx, box), box);
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
    if (params.disabled || params.enabled === false) return { shapes: [], texts: [] };
    if (ctx && ctx.clip && (ctx.clip.disabled || ctx.clip.enabled === false)) return { shapes: [], texts: [] };
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
    const info = beatAt(beats, time, params.motif, ctx && ctx.adsr);
    if (!info) return { shapes: [], texts: [] };
    const result = motifShapes(params.motif || 'orbit', params, ctx || {}, info);
    const place = placementOf(params, ctx || {});
    if (place) transformShapes(result.shapes, place);
    if (result.field) result.field.opacity *= clamp01(num(params.opacity, 1));
    if (params.camera && CAMERAS_2D.includes(params.camera) && params.camera !== 'none') {
      const frame = (ctx && ctx.frame) || { width: 1920, height: 1080 };
      const clipSpan = (ctx && ctx.clip) || {};
      const start = num(clipSpan.start != null ? clipSpan.start : clipSpan.from, beats.length ? num(beats[0].start, 0) : 0);
      const end = num(clipSpan.end != null ? clipSpan.end : clipSpan.to, beats.length ? num(beats[beats.length - 1].end, start + 4) : start + 4);
      const move = cameraMove(params.camera, num(params.seed, 1) + String(params.motif || '').length, Math.max(0, time - start), end - start, { width: frame.width, height: frame.height });
      if (move) transformShapes(result.shapes, { originX: frame.width / 2, originY: frame.height / 2, scale: move.scale, dx: move.dx, dy: move.dy, rotate: move.rotate });
      if (move && result.field) result.field.camera = { scale: move.scale, dx: move.dx, dy: move.dy, rotate: move.rotate };
    }
    // a scene passes behind the lyrics: what still touches the text box after the
    // moves, the placement and the camera are applied is dropped
    if (BEHIND_MOTIFS.has(params.motif)) result.shapes = sceneClearShapes(result.shapes, textBox(ctx || {}, frameBox(ctx || {})));
    return result;
  }

  return { MOTIFS, BOLD_MOTIFS, PROC, SCENE_MOTIFS, GEO_MOTIFS, FIELD_MOTIFS, SIM_MOTIFS, CAMERAS_2D, procKey,
 procTooSimilar, procGenome, embedFigure, figureDistance, EMBED_KEYS, PROC_PLAIN_LAYER, PROC_LISTS: { layouts: PROC_LAYOUTS, kinds: PROC_KINDS, warps: PROC_WARPS, roles: PROC_ROLES, sizeRules: PROC_SIZE_RULES, colorRules: PROC_COLOR_RULES, motions: PROC_MOTIONS, sizeDists: PROC_SIZE_DISTS, aligns: PROC_ALIGNS, outlines: PROC_OUTLINES, symmetries: PROC_SYMMETRIES }, randomTier, INS, HOLDS, OUTS, SYNCS, STROKES, SHAPE_COUNT_MAX, generate, shapeRangeOf, drawShapeCount, blank, drawList, subBeats, beatAt, transformShapes, tuningOf };
});
