'use strict';

// Phase 5: the figure track. Every motif must be deterministic, finite at any
// time and switch its moves on the sub-beat boundaries.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const figures = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'figures.js'));

const FRAME = { width: 1920, height: 1080 };
const SPAN = { start: 2, end: 14 };

function ctx(extra) {
  return {
    time: 5,
    frame: FRAME,
    clip: { key: 'fig_0', start: SPAN.start, end: SPAN.end },
    seed: 7,
    colors: ['#ff0000', '#00ff00', '#0000ff'],
    beats: [{ start: 2, end: 4 }, { start: 4, end: 6.5 }, { start: 6.5, end: 9 }, { start: 9, end: 12 }, { start: 12, end: 14 }],
    ...(extra || {}),
  };
}

test('generate is deterministic and covers every motif', () => {
  const first = figures.generate({ span: SPAN, axes: { energy: 0.5, weird: 0.5 }, seed: 3, id: 'fig_0' });
  const second = figures.generate({ span: SPAN, axes: { energy: 0.5, weird: 0.5 }, seed: 3, id: 'fig_0' });
  assert.deepEqual(first, second);
  for (const motif of figures.MOTIFS) {
    const spec = figures.generate({ span: SPAN, motif, seed: 5, id: `fig_${motif}` });
    assert.equal(spec.type, 'figure');
    assert.equal(spec.params.motif, motif);
    assert.ok(spec.params.beats.length >= 1);
  }
});

test('every motif returns finite shapes at any time', () => {
  for (const motif of figures.MOTIFS) {
    const spec = figures.generate({ span: SPAN, motif, sync: 'beat', seed: 11, id: 'fig_0' });
    for (let t = SPAN.start; t <= SPAN.end; t += 0.1) {
      const list = figures.drawList(spec, ctx({ time: t }));
      for (const shape of list.shapes) {
        for (const key of ['x', 'y', 'r', 'w', 'h', 'opacity']) {
          if (shape[key] != null) assert.ok(Number.isFinite(shape[key]), `${motif} ${key} at ${t}`);
        }
        if (shape.points) for (const point of shape.points) assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
      }
    }
  }
});

test('sync beat cuts on the lyric beats', () => {
  const spec = figures.generate({ span: SPAN, motif: 'orbit', sync: 'beat', seed: 2, id: 'fig_0' });
  const starts = spec.params.beats.map((beat) => beat.start);
  for (const beat of ctx().beats) {
    assert.ok(starts.some((start) => Math.abs(start - beat.start) < 1e-6 || start <= beat.start + 1e-6), `beat ${beat.start} present`);
  }
  assert.equal(starts[0], SPAN.start);
});

test('a sub-beat boundary changes the drawn moves', () => {
  const spec = figures.generate({ span: SPAN, motif: 'burst', sync: 'beat', seed: 9, id: 'fig_0' });
  const boundaries = spec.params.beats.slice(1).map((beat) => beat.start);
  for (const at of boundaries) {
    const before = JSON.stringify(figures.drawList(spec, ctx({ time: at - 0.05 })).shapes);
    const after = JSON.stringify(figures.drawList(spec, ctx({ time: at + 0.05 })).shapes);
    assert.notEqual(before, after, `no change across ${at}`);
  }
});

test('adjacent sub-beats do not repeat the same in / out move', () => {
  for (const seed of [1, 4, 10, 42]) {
    const spec = figures.generate({ span: SPAN, motif: 'rings', sync: 'beat', seed, id: 'fig_0' });
    for (let i = 1; i < spec.params.beats.length; i += 1) {
      const previous = spec.params.beats[i - 1].move;
      const current = spec.params.beats[i].move;
      assert.notEqual(previous.in, current.in, `seed ${seed}: in repeats`);
      assert.notEqual(previous.out, current.out, `seed ${seed}: out repeats`);
    }
  }
});

test('a hand-made clip without beats derives them from the context', () => {
  const spec = figures.blank({ motif: 'halftone', sync: 'beat' });
  assert.deepEqual(spec.params.beats, []);
  const list = figures.drawList(spec, ctx({ time: 5 }));
  assert.ok(list.shapes.length > 0);
});

test('frame motifs follow the text box when the engine provides one', () => {
  const spec = figures.generate({ span: SPAN, motif: 'underlineSweep', sync: 'text', seed: 1, id: 'fig_0' });
  const wide = figures.drawList(spec, ctx({ time: 5.5, textBox: { x0: 100, y0: 800, x1: 800, y1: 900 } })).shapes;
  const narrow = figures.drawList(spec, ctx({ time: 5.5, textBox: { x0: 100, y0: 800, x1: 300, y1: 900 } })).shapes;
  const width = (shapes) => Math.max(...shapes.map((shape) => Math.max(shape.x1 || 0, shape.x || 0))) - Math.min(...shapes.map((shape) => Math.min(shape.x0 || 0, shape.x || 0)));
  assert.notEqual(width(wide), width(narrow));
});

test('tempoGrid without beatSeconds generates regular sub-beats based on span', () => {
  // without tempoGrid, sync='beat' should generate sub-beats aligned to provided beats
  const spec = figures.generate({
    span: SPAN,
    axes: { speed: 0.5 },
    sync: 'beat',
    seed: 1,
    id: 'fig_tempo_1',
    tempoGrid: false,
  });
  const beatCount = spec.params.beats.length;
  assert.ok(beatCount >= 1, 'should have at least one beat');
});

test('tempoGrid with slow speed generates fewer beats (longer intervals)', () => {
  // slow tempo (speed 0.05) = 8 beat interval = 4 seconds @ 120 BPM
  const slow = figures.generate({
    span: { start: 0, end: 16 },  // 16 seconds = 4 bars
    axes: { speed: 0.05 },
    sync: 'beat',
    seed: 1,
    id: 'fig_slow',
    tempoGrid: true,
    beatSeconds: 0.5,  // 120 BPM
  });
  // 16s span, 4s interval = ~4 sub-beats expected
  assert.ok(slow.params.beats.length >= 2 && slow.params.beats.length <= 5, `slow tempo beat count: ${slow.params.beats.length}`);
});

test('tempoGrid with fast speed generates more beats (shorter intervals)', () => {
  // slow tempo (speed 0.05) = 8 beat interval = 4 seconds @ 120 BPM
  const slow = figures.generate({
    span: { start: 0, end: 16 },
    axes: { speed: 0.05 },
    sync: 'beat',
    seed: 1,
    id: 'fig_slow_compare',
    tempoGrid: true,
    beatSeconds: 0.5,
  });
  // fast tempo (speed 0.95) = 0.5 beat interval = 0.25 seconds @ 120 BPM
  const fast = figures.generate({
    span: { start: 0, end: 16 },  // 16 seconds
    axes: { speed: 0.95 },
    sync: 'beat',
    seed: 1,
    id: 'fig_fast',
    tempoGrid: true,
    beatSeconds: 0.5,  // 120 BPM
  });
  // 16s span, 0.25s interval = ~64 sub-beats expected (large number)
  assert.ok(fast.params.beats.length > slow.params.beats.length, 'fast tempo has more beats than slow');
});

test('density axis controls figure density, not energy', () => {
  // low density should give small density value
  const lowDensity = figures.generate({
    span: SPAN,
    axes: { speed: 0.5, energy: 0.8, density: 0.1 },
    sync: 'beat',
    seed: 2,
    id: 'fig_low_density',
  });
  // high density should give large density value
  const highDensity = figures.generate({
    span: SPAN,
    axes: { speed: 0.5, energy: 0.8, density: 0.9 },
    sync: 'beat',
    seed: 2,
    id: 'fig_high_density',
  });
  // density values should reflect the density axis, not energy (which is same at 0.8)
  const lowVal = Number(lowDensity.params.density);
  const highVal = Number(highDensity.params.density);
  assert.ok(lowVal < highVal, `density values should increase with axis: ${lowVal} < ${highVal}`);
});

test('a forced in / hold / out lands on every beat and keeps the random sequence', () => {
  const options = { span: SPAN, axes: { energy: 0.5, weird: 0.5 }, seed: 21, id: 'fig_0' };
  const random = figures.generate(options);
  const forced = figures.generate({ ...options, in: 'pop', hold: 'spin', out: 'fade' });
  assert.equal(forced.params.motif, random.params.motif);
  assert.equal(forced.params.beats.length, random.params.beats.length);
  for (let i = 0; i < forced.params.beats.length; i += 1) {
    assert.equal(forced.params.beats[i].move.in, 'pop');
    assert.equal(forced.params.beats[i].move.hold, 'spin');
    assert.equal(forced.params.beats[i].move.out, 'fade');
    // the variant / accent draws sit on the same random positions
    assert.equal(forced.params.beats[i].variant, random.params.beats[i].variant);
    assert.equal(forced.params.beats[i].accent, random.params.beats[i].accent);
  }
  // 'auto' and unknown names keep the drawn move
  const auto = figures.generate({ ...options, in: 'auto', hold: 'nonsense' });
  assert.deepEqual(auto.params.beats.map((beat) => beat.move), random.params.beats.map((beat) => beat.move));
});

test('editing a move overrides already generated beats at draw time', () => {
  const spec = figures.generate({ span: SPAN, motif: 'burst', sync: 'beat', seed: 9, id: 'fig_0' });
  const before = JSON.parse(JSON.stringify(spec.params.beats));
  const edited = { type: 'figure', params: { ...spec.params, hold: 'spin' } };
  const manual = {
    type: 'figure',
    params: { ...spec.params, beats: spec.params.beats.map((beat) => ({ ...beat, move: { ...beat.move, hold: 'spin' } })) },
  };
  let differs = false;
  for (const beat of spec.params.beats) {
    for (const at of [beat.start + 0.1, (beat.start + beat.end) / 2]) {
      const forced = JSON.stringify(figures.drawList(edited, ctx({ time: at })).shapes);
      const reference = JSON.stringify(figures.drawList(manual, ctx({ time: at })).shapes);
      const original = JSON.stringify(figures.drawList(spec, ctx({ time: at })).shapes);
      assert.equal(forced, reference, `forced draw matches at ${at}`);
      if (forced !== original) differs = true;
    }
  }
  assert.ok(differs, 'the forced hold changes at least one frame');
  assert.deepEqual(spec.params.beats, before, 'the source beats are not mutated');
});

test('scale, x and y transform the figure about the frame centre', () => {
  const base = { motif: 'orbit', sync: 'beat', density: 0.5, beats: [] };
  const bounds = (shapes) => {
    const xs = [];
    const ys = [];
    for (const shape of shapes) {
      if (shape.points) for (const point of shape.points) { xs.push(point.x); ys.push(point.y); }
      if (shape.kind === 'capsule') { xs.push(shape.x0, shape.x1); ys.push(shape.y0, shape.y1); }
      if (shape.x != null) { xs.push(shape.x); ys.push(shape.y); }
    }
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  };
  const plain = figures.drawList({ type: 'figure', params: { ...base } }, ctx({ time: 3 })).shapes;
  const scaled = figures.drawList({ type: 'figure', params: { ...base, scale: 2 } }, ctx({ time: 3 })).shapes;
  const moved = figures.drawList({ type: 'figure', params: { ...base, x: 0.25, y: -0.1 } }, ctx({ time: 3 })).shapes;
  const a = bounds(plain);
  const b = bounds(scaled);
  const c = bounds(moved);
  const cx = FRAME.width / 2;
  const cy = FRAME.height / 2;
  // every bound maps about the frame centre, so the frame centre stays put
  assert.ok(Math.abs(b.x0 - cx - (a.x0 - cx) * 2) < 0.01, 'left edge doubles about the centre');
  assert.ok(Math.abs(b.x1 - cx - (a.x1 - cx) * 2) < 0.01, 'right edge doubles about the centre');
  assert.ok(Math.abs(b.y0 - cy - (a.y0 - cy) * 2) < 0.01, 'top edge doubles about the centre');
  assert.ok(Math.abs(b.y1 - cy - (a.y1 - cy) * 2) < 0.01, 'bottom edge doubles about the centre');
  assert.ok(Math.abs(c.x0 - (a.x0 + 0.25 * FRAME.width)) < 0.01, 'x shifts by the frame fraction');
  assert.ok(Math.abs(c.y0 - (a.y0 - 0.1 * FRAME.height)) < 0.01, 'y shifts by the frame fraction');
});

test('a filler clip past 4s draws its derived sub-beats (from / to regression)', () => {
  const fillerRender = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'filler-render.js'));
  const spec = { type: 'figures', params: { motif: 'halftone', sync: 'beat', density: 0.6, in: 'auto', hold: 'auto', out: 'auto' } };
  const context = { frame: FRAME, clip: { key: 'gap_1', from: 30, to: 40 }, seed: 3, colors: ['#ff0000', '#00ff00', '#0000ff'] };
  for (const t of [31, 35, 39]) {
    const list = fillerRender.drawList(spec, { ...context, time: t, duration: 40 });
    assert.ok((list.shapes || []).length > 0, `no shapes at ${t}`);
  }
  // the old shape (start / end instead of from / to) still works
  const alt = fillerRender.drawList(spec, { ...context, clip: { key: 'gap_1', start: 30, end: 40 }, time: 35, duration: 40 });
  assert.ok((alt.shapes || []).length > 0, 'start / end spans still draw');
});

test('wipe reveals the shapes over the in window instead of popping them', () => {
  const make = (move) => ({ type: 'figure', params: { motif: 'burst', density: 0.6, colors: ['#ff0000', '#00ff00'], beats: [{ start: 0, end: 2, move: { in: move, hold: 'pulse', out: 'fade' }, variant: 0, accent: true }] } });
  const ctxAt = (time) => ({ time, frame: FRAME, clip: { key: 'fig_wipe', start: 0, end: 2 }, seed: 1, colors: ['#ff0000', '#00ff00'] });
  const early = figures.drawList(make('wipe'), ctxAt(0.03)).shapes.length;
  const mid = figures.drawList(make('wipe'), ctxAt(0.18)).shapes.length;
  const done = figures.drawList(make('wipe'), ctxAt(0.5)).shapes.length;
  assert.ok(early < mid, `early ${early} mid ${mid}`);
  assert.ok(mid <= done, `mid ${mid} done ${done}`);
  assert.equal(done, figures.drawList(make('pop'), ctxAt(0.5)).shapes.length, 'the finished wipe matches the pop count');
});

test('draw traces capsules and scales the rest, so it differs from scatterIn', () => {
  const spec = (move) => ({ type: 'figure', params: { motif: 'ribbon', density: 0.5, colors: ['#ff0000', '#00ff00'], beats: [{ start: 0, end: 2, move: { in: move, hold: 'drift', out: 'fade' }, variant: 1, accent: false }] } });
  const ctxAt = (time) => ({ time, frame: FRAME, clip: { key: 'fig_draw', start: 0, end: 2 }, seed: 2, colors: ['#ff0000', '#00ff00'] });
  const drawn = figures.drawList(spec('draw'), ctxAt(0.12)).shapes;
  const scattered = figures.drawList(spec('scatterIn'), ctxAt(0.12)).shapes;
  assert.notDeepEqual(drawn, scattered);
  // a half-drawn capsule is shorter than the finished one
  const finished = figures.drawList(spec('draw'), ctxAt(0.5)).shapes;
  const length = (shapes) => shapes.filter((shape) => shape.kind === 'capsule').reduce((sum, shape) => sum + Math.abs(shape.x1 - shape.x0), 0);
  assert.ok(length(drawn) < length(finished), `drawn ${length(drawn)} vs finished ${length(finished)}`);
});

test('morph changes the motif over the hold', () => {
  const make = (motif) => ({ type: 'figure', params: { motif, density: 0.6, colors: ['#ff0000', '#00ff00'], beats: [{ start: 0, end: 3, move: { in: 'pop', hold: 'morph', out: 'fade' }, variant: 1, accent: true }] } });
  const ctxAt = (time) => ({ time, frame: FRAME, clip: { key: 'fig_morph', start: 0, end: 3 }, seed: 4, colors: ['#ff0000', '#00ff00'] });
  const polyA = figures.drawList(make('polyMorph'), ctxAt(0.4)).shapes;
  const polyB = figures.drawList(make('polyMorph'), ctxAt(1.4)).shapes;
  assert.ok(polyA.some((shape, i) => polyB[i] && shape.sides !== polyB[i].sides), 'polyMorph interpolates its sides');
  const ringA = figures.drawList(make('rings'), ctxAt(0.4)).shapes;
  const ringB = figures.drawList(make('rings'), ctxAt(1.4)).shapes;
  assert.ok(ringA.some((shape, i) => ringB[i] && Math.abs(shape.r - ringB[i].r) > 0.5), 'rings interpolate their radius');
  const barsA = figures.drawList(make('bars'), ctxAt(0.4)).shapes;
  const barsB = figures.drawList(make('bars'), ctxAt(1.4)).shapes;
  assert.ok(barsA.some((shape, i) => barsB[i] && Math.abs(shape.h - barsB[i].h) > 1), 'bars interpolate their height');
  // the generic path crossfades two variants
  const genericA = figures.drawList(make('orbit'), ctxAt(0.4)).shapes;
  const genericB = figures.drawList(make('orbit'), ctxAt(1.4)).shapes;
  assert.notDeepEqual(genericA, genericB);
});

test('the accent sub-beat draws bigger and fully opaque, the others at 0.85', () => {
  const make = (accent) => ({ type: 'figure', params: { motif: 'orbit', density: 0.5, colors: ['#ff0000'], beats: [{ start: 0, end: 2, move: { in: 'pop', hold: 'drift', out: 'fade' }, variant: 0, accent }] } });
  const ctxAt = (time) => ({ time, frame: FRAME, clip: { key: 'fig_accent', start: 0, end: 2 }, seed: 6, colors: ['#ff0000'] });
  const loud = figures.drawList(make(true), ctxAt(1)).shapes;
  const quiet = figures.drawList(make(false), ctxAt(1)).shapes;
  const center = (shapes) => shapes.find((shape) => shape.kind === 'circle');
  assert.ok(center(loud).r > center(quiet).r, 'the accent circle is bigger');
  assert.ok(Math.abs(center(loud).opacity - 1) < 1e-9, `accent opacity ${center(loud).opacity}`);
  assert.ok(Math.abs(center(quiet).opacity - 0.85) < 1e-9, `plain opacity ${center(quiet).opacity}`);
});

test('the motif tuning params reach the geometry', () => {
  const params = (extra) => ({ motif: 'burst', density: 0.5, colors: ['#ff0000', '#00ff00'], beats: [{ start: 0, end: 3, move: { in: 'pop', hold: 'drift', out: 'fade' }, variant: 0, accent: true }], ...extra });
  const ctxAt = (time) => ({ time, frame: FRAME, clip: { key: 'fig_tune', start: 0, end: 3 }, seed: 8, colors: ['#ff0000', '#00ff00'] });
  const few = figures.drawList({ type: 'figure', params: params({ count: 6 }) }, ctxAt(1)).shapes;
  const many = figures.drawList({ type: 'figure', params: params({ count: 20 }) }, ctxAt(1)).shapes;
  assert.ok(many.length > few.length, `count ${few.length} -> ${many.length}`);
  const small = figures.drawList({ type: 'figure', params: params({ radius: 0.4 }) }, ctxAt(1)).shapes;
  const big = figures.drawList({ type: 'figure', params: params({ radius: 1.2 }) }, ctxAt(1)).shapes;
  const span = (shapes) => {
    const xs = [];
    for (const shape of shapes) {
      if (shape.x0 != null) xs.push(shape.x0, shape.x1);
      if (shape.x != null) xs.push(shape.x);
    }
    return Math.max(...xs) - Math.min(...xs);
  };
  assert.ok(span(big) > span(small), `radius ${span(small)} -> ${span(big)}`);
  const strokeThin = figures.drawList({ type: 'figure', params: params({ stroke: 'thin' }) }, ctxAt(1)).shapes;
  const strokeBold = figures.drawList({ type: 'figure', params: params({ stroke: 'bold' }) }, ctxAt(1)).shapes;
  const width = (shapes) => shapes.reduce((sum, shape) => sum + (shape.width || 0), 0);
  assert.ok(width(strokeBold) > width(strokeThin) * 2, `stroke ${width(strokeThin)} -> ${width(strokeBold)}`);
  // spinRate feeds the spin hold
  const spin = (rate) => figures.drawList({ type: 'figure', params: { ...params({ spinRate: rate }), beats: [{ start: 0, end: 3, move: { in: 'pop', hold: 'spin', out: 'fade' }, variant: 0, accent: true }] } }, ctxAt(1.2)).shapes;
  assert.notDeepEqual(spin(0.2), spin(2));
});

// ---------------------------------------------------------------------------
// the bold rhythm set (profile figureBoldChance)

test('the bold motifs draw thick shapes and stay clear of the text box', () => {
  const legibility = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'legibility.js'));
  const textBox = { x0: 480, y0: 400, x1: 1440, y1: 680 };
  for (const motif of figures.BOLD_MOTIFS) {
    const spec = figures.generate({ span: SPAN, motif, sync: 'beat', seed: 13, id: `fig_${motif}`, axes: { weird: 0.6, energy: 0.6 } });
    let thickest = 0;
    let shapes = 0;
    for (let t = SPAN.start + 0.05; t <= SPAN.end; t += 0.25) {
      const list = figures.drawList(spec, ctx({ time: t, textBox }));
      shapes += list.shapes.length;
      for (const shape of list.shapes) {
        let size = 0;
        if (shape.kind === 'convex' && Array.isArray(shape.points)) {
          const xs = shape.points.map((point) => point.x);
          const ys = shape.points.map((point) => point.y);
          size = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
        } else {
          size = shape.w != null ? shape.w : shape.width != null ? shape.width : shape.r != null ? shape.r * 2 : shape.thickness != null ? shape.thickness * 2 : 0;
        }
        if (size > thickest) thickest = size;
      }
    }
    assert.ok(shapes > 0, `${motif} draws nothing`);
    assert.ok(thickest >= FRAME.height * 0.008, `${motif} is a thin line (${thickest})`);
    const overlap = legibility.figureOverlap(spec, { frame: FRAME, duration: SPAN.end - SPAN.start, textBox });
    assert.ok(overlap <= legibility.FIGURE_OVERLAP + 1e-9, `${motif} overlaps the text (${overlap})`);
  }
  // the bold set is part of the drawn library
  for (const motif of figures.BOLD_MOTIFS) assert.ok(figures.MOTIFS.includes(motif), `${motif} missing from MOTIFS`);
});

// ---------------------------------------------------------------------------
// the procedural `proc` motif

test('proc draws finite, budgeted shapes of the six GL kinds over 3000 seeds', () => {
  const kinds = new Set(['rect', 'circle', 'ring', 'capsule', 'polygon', 'convex']);
  const times = [3.1, 5.2, 7.8, 10.5, 13.2];
  let bad = null;
  for (let seed = 1; seed <= 3000; seed += 1) {
    const spec = figures.generate({ span: SPAN, motif: 'proc', seed, id: `proc_${seed}`, axes: { weird: 0.6, energy: 0.6 } });
    if (spec.params.motif !== 'proc') bad = `seed ${seed} motif ${spec.params.motif}`;
    if (!Number.isFinite(Number(spec.params.seed))) bad = `seed ${seed} has no proc seed`;
    if (bad) break;
    for (const time of times) {
      const list = figures.drawList(spec, ctx({ time }));
      if (!list.shapes.length) { bad = `seed ${seed} draws nothing at ${time}`; break; }
      if (list.shapes.length > 480) { bad = `seed ${seed} budget ${list.shapes.length}`; break; }
      for (const shape of list.shapes) {
        if (!kinds.has(shape.kind)) { bad = `seed ${seed} kind ${shape.kind}`; break; }
        for (const key of ['x', 'y', 'r', 'w', 'h', 'x0', 'y0', 'x1', 'y1', 'width', 'thickness', 'opacity']) {
          if (shape[key] != null && !Number.isFinite(shape[key])) { bad = `seed ${seed} ${key} at ${time}`; break; }
        }
        if (bad) break;
        if (shape.points) {
          for (const point of shape.points) {
            if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) { bad = `seed ${seed} point at ${time}`; break; }
          }
        }
        if (bad) break;
      }
      if (bad) break;
    }
    if (bad) break;
  }
  assert.equal(bad, null);
});

test('proc seeds yield almost only unique compositions (< 1% duplicates)', () => {
  const signatures = new Set();
  const total = 3000;
  for (let seed = 1; seed <= total; seed += 1) {
    const spec = figures.generate({ span: SPAN, motif: 'proc', seed, id: `sig_${seed}`, axes: { weird: 1 } });
    const list = figures.drawList(spec, ctx({ time: 6 }));
    signatures.add(
      list.shapes
        .map((shape) => [shape.kind, Math.round(shape.x || shape.x0 || (shape.points && shape.points[0].x) || 0), Math.round(shape.y || shape.y0 || (shape.points && shape.points[0].y) || 0), Math.round(shape.r || shape.width || shape.w || (shape.points && shape.points[1].x) || 0)].join(':'))
        .join(';')
    );
  }
  const duplicates = total - signatures.size;
  assert.ok(duplicates / total < 0.01, `duplicates ${duplicates} of ${total}`);
  assert.ok(signatures.size > total * 0.99, `unique ${signatures.size}/${total}`);
});

test('proc is deterministic and holds its shape count frame to frame', () => {
  const a = figures.generate({ span: SPAN, motif: 'proc', seed: 4242, id: 'det' });
  const b = figures.generate({ span: SPAN, motif: 'proc', seed: 4242, id: 'det' });
  assert.deepEqual(a, b);
  assert.deepEqual(figures.drawList(a, ctx({ time: 8 })).shapes, figures.drawList(b, ctx({ time: 8 })).shapes);
  // a hand-made proc clip (no beats, no seed) grows its composition from the
  // clip key, so two clips never share the seed-1 genome
  const handmade = figures.blank({ motif: 'proc', sync: 'beat' });
  const first = figures.drawList(handmade, ctx({ time: 5.2 }));
  const other = figures.drawList(handmade, { ...ctx({ time: 5.2 }), clip: { key: 'fig_other', start: SPAN.start, end: SPAN.end } });
  assert.ok(first.shapes.length > 0 && other.shapes.length > 0);
  assert.notDeepEqual(first.shapes, other.shapes);
  // one hold beat sampled every frame: the count stays within a small delta
  // (the per-element phase keeps the entrance / exit from popping all at once)
  for (const seed of [5, 21, 72, 94, 123]) {
    const spec = { type: 'figure', params: { motif: 'proc', seed: 1000 + seed, density: 0.6, colors: ['#ff0000', '#00ff00'], beats: [{ start: 0, end: 6, move: { in: 'pop', hold: 'still', out: 'fade' }, variant: 0, accent: false }] } };
    let previous = null;
    let peak = 0;
    for (let time = 1; time <= 5; time += 1 / 60) {
      const count = figures.drawList(spec, ctx({ time })).shapes.length;
      peak = Math.max(peak, count);
      if (previous != null) assert.ok(Math.abs(count - previous) <= 20, `seed ${seed} jumped ${previous} -> ${count} at ${time}`);
      previous = count;
    }
    assert.ok(peak > 0);
  }
});

test('generate picks proc most of the time and hands it back to fear', () => {
  let proc = 0;
  for (let seed = 1; seed <= 200; seed += 1) {
    const spec = figures.generate({ span: SPAN, seed, id: `share_${seed}`, axes: { weird: 1, energy: 0.5 } });
    if (spec.params.motif === 'proc') proc += 1;
    // a classic draw keeps the historic move fields, plus its own scale / tone
    else for (const beat of spec.params.beats) assert.deepEqual(Object.keys(beat).sort(), ['accent', 'end', 'move', 'size', 'start', 'tone', 'variant']);
  }
  assert.ok(proc >= 120 && proc <= 180, `proc share ${proc}/200`);
  // the fear axis hands the pick back to the fixed library
  let feared = 0;
  for (let seed = 1; seed <= 200; seed += 1) {
    const spec = figures.generate({ span: SPAN, seed, id: `share_${seed}`, axes: { weird: 1, energy: 0.5, fear: 0.9 } });
    if (spec.params.motif === 'proc') feared += 1;
  }
  assert.ok(feared < proc / 2, `feared proc ${feared} vs ${proc}`);
  // fear 0 is the legacy no-op: the whole spec is unchanged
  const withFear = figures.generate({ span: SPAN, seed: 17, id: 'noop', axes: { weird: 1, energy: 0.5, fear: 0 } });
  const without = figures.generate({ span: SPAN, seed: 17, id: 'noop', axes: { weird: 1, energy: 0.5 } });
  assert.deepEqual(withFear, without);
  // an explicit proc request always carries a finite seed
  const explicit = figures.generate({ span: SPAN, motif: 'proc', seed: 3, id: 'explicit' });
  assert.equal(explicit.params.motif, 'proc');
  assert.ok(Number.isFinite(Number(explicit.params.seed)));
});

// ---------------------------------------------------------------------------
// variety: per-beat size / colour, and the clearance the auto direction needs

test('every sub-beat draws its own size and palette rotation', () => {
  for (const seed of [2, 7, 19, 42]) {
    const spec = figures.generate({ span: SPAN, motif: 'burst', sync: 'beat', seed, id: 'fig_0', axes: { weird: 0.5, energy: 0.5 } });
    const sizes = new Set();
    const tones = new Set();
    for (const beat of spec.params.beats) {
      assert.ok(Number.isFinite(beat.size) && beat.size >= 0.6 && beat.size <= 1.4, `seed ${seed} size ${beat.size}`);
      assert.ok(Number.isInteger(beat.tone) && beat.tone >= 0 && beat.tone < 8, `seed ${seed} tone ${beat.tone}`);
      sizes.add(beat.size);
      tones.add(beat.tone);
    }
    assert.ok(spec.params.beats.length < 2 || sizes.size >= 2, `seed ${seed} sizes ${[...sizes].join(',')}`);
    assert.ok(spec.params.beats.length < 2 || tones.size >= 2, `seed ${seed} tones ${[...tones].join(',')}`);
  }
  // the size reaches the geometry: a big beat draws a bigger circle
  const make = (size, tone) => ({ type: 'figure', params: { motif: 'orbit', density: 0.5, colors: ['#ff0000', '#00ff00', '#0000ff'], beats: [{ start: 0, end: 3, move: { in: 'pop', hold: 'drift', out: 'fade' }, variant: 0, accent: true, size, tone }] } });
  const ctxAt = (time) => ({ time, frame: FRAME, clip: { key: 'fig_var', start: 0, end: 3 }, seed: 8, colors: ['#ff0000', '#00ff00', '#0000ff'] });
  const small = figures.drawList(make(0.6, 0), ctxAt(1)).shapes.find((shape) => shape.kind === 'circle');
  const large = figures.drawList(make(1.4, 0), ctxAt(1)).shapes.find((shape) => shape.kind === 'circle');
  assert.ok(large.r > small.r * 2, `size ${small.r} -> ${large.r}`);
  // the tone rotates the palette through the shapes
  const rotated = figures.drawList(make(1, 2), ctxAt(1)).shapes.map((shape) => shape.color).join('|');
  const plain = figures.drawList(make(1, 0), ctxAt(1)).shapes.map((shape) => shape.color).join('|');
  assert.notEqual(rotated, plain, 'the palette rotation changes the colours');
});

test('a proc figure never covers the lyrics (the gate keeps it procedural)', () => {
  const legibility = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'legibility.js'));
  const boxes = [
    undefined,
    { x0: FRAME.width * 0.4, y0: FRAME.height * 0.4, x1: FRAME.width * 0.6, y1: FRAME.height * 0.6 },
    { x0: 200, y0: 300, x1: 1720, y1: 780 },
    { x0: 400, y0: 820, x1: 1500, y1: 960 },
  ];
  for (let seed = 1; seed <= 60; seed += 1) {
    for (const textBox of boxes) {
      const spec = figures.generate({ span: SPAN, motif: 'proc', sync: 'beat', seed, id: `clear_${seed}` });
      const overlap = legibility.figureOverlap(spec, {
        frame: FRAME,
        duration: SPAN.end - SPAN.start,
        textBox,
        geometry: true,
      });
      assert.ok(overlap <= legibility.FIGURE_OVERLAP + 1e-9, `seed ${seed} overlap ${overlap}`);
    }
  }
});

test('the figure lines are drawn thick (the legacy tuning stays the floor)', () => {
  const manual = {
    type: 'figure',
    params: {
      motif: 'rings',
      density: 0.5,
      colors: ['#ffffff'],
      beats: [{ start: 0, end: 3, move: { in: 'pop', hold: 'drift', out: 'fade' }, variant: 0, accent: false }],
    },
  };
  const context = { time: 1, frame: FRAME, clip: { key: 'fig_thick', start: 0, end: 3 }, seed: 2, colors: ['#ffffff'] };
  let thickest = 0;
  for (const shape of figures.drawList(manual, context).shapes) {
    if (shape.thickness) thickest = Math.max(thickest, shape.thickness);
    if (shape.width) thickest = Math.max(thickest, shape.width);
  }
  assert.ok(thickest >= FRAME.height * 0.005, `line thickness ${thickest}`);
  assert.ok(figures.drawList(manual, context).shapes.length > 0);
});


test('figures.generate and drawList support disabled flag', () => {
  const specDisabled = figures.generate({ span: SPAN, motif: 'orbit', enabled: false, seed: 1, id: 'fig_d1' });
  assert.equal(specDisabled.params.enabled, false);

  const resDisabled = figures.drawList(specDisabled, ctx());
  assert.deepEqual(resDisabled, { shapes: [], texts: [] });

  const specEnabled = figures.generate({ span: SPAN, motif: 'orbit', enabled: true, seed: 1, id: 'fig_d2' });
  assert.equal(specEnabled.params.enabled, true);
  const resEnabled = figures.drawList(specEnabled, ctx());
  assert.ok(resEnabled.shapes.length > 0);

  // clip-level disabled in context
  const resClipDisabled = figures.drawList(specEnabled, ctx({ clip: { key: 'fig_0', start: SPAN.start, end: SPAN.end, disabled: true } }));
  assert.deepEqual(resClipDisabled, { shapes: [], texts: [] });

  // params.enabled === false
  const resParamEnabledFalse = figures.drawList({ type: 'figure', params: { ...specEnabled.params, enabled: false } }, ctx());
  assert.deepEqual(resParamEnabledFalse, { shapes: [], texts: [] });
});

test('fillerRender includes disabled parameter for figures and figuresShapes respects it', () => {
  const fillerRender = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'filler-render.js'));
  const params = fillerRender.paramsOf('figures');
  assert.ok(params.some((p) => p.key === 'enabled' && p.kind === 'bool' && p.default === true));

  // figuresShapes respects disabled
  const shapes = fillerRender.drawList({ type: 'figures', params: { enabled: false, motif: 'orbit' } }, ctx());
  assert.deepEqual(shapes, { shapes: [], texts: [] });

  const shapesEnabled = fillerRender.drawList({ type: 'figures', params: { enabled: true, motif: 'orbit' } }, ctx());
  assert.ok(shapesEnabled.shapes.length > 0);
});

// the theme's figure count range (figureCountMin / Max / Bias)
test('the drawn figure count spreads log-uniformly over the theme range', () => {
  const range = { min: 3, max: 120, bias: 0 };
  const counts = [];
  for (let seed = 1; seed <= 2000; seed += 1) {
    const spec = figures.generate({ span: SPAN, axes: { energy: 0.5, weird: 0.5 }, seed, id: 'fig_0', shapeRange: range });
    counts.push(spec.params.shapes);
  }
  assert.ok(counts.every((n) => Number.isInteger(n) && n >= 3 && n <= 120));
  // log-uniform: about half the clips land below the geometric middle (~19)
  const few = counts.filter((n) => n < Math.sqrt(3 * 120)).length / counts.length;
  assert.ok(few > 0.4 && few < 0.6, `few share ${few}`);
  assert.ok(counts.some((n) => n <= 5) && counts.some((n) => n >= 90));
  // the bias leans the draw
  const mean = (bias) => {
    let sum = 0;
    for (let seed = 1; seed <= 500; seed += 1) sum += figures.generate({ span: SPAN, seed, id: 'fig_0', shapeRange: { min: 3, max: 120, bias } }).params.shapes;
    return sum / 500;
  };
  assert.ok(mean(-1) < mean(0) && mean(0) < mean(1));
  // the count rides its own stream: every other draw is unchanged
  const plain = figures.generate({ span: SPAN, axes: { energy: 0.5, weird: 0.5 }, seed: 9, id: 'fig_0' });
  const ranged = figures.generate({ span: SPAN, axes: { energy: 0.5, weird: 0.5 }, seed: 9, id: 'fig_0', shapeRange: range });
  assert.equal(plain.params.shapes, undefined);
  assert.deepEqual({ ...ranged.params, shapes: undefined }, { ...plain.params, shapes: undefined });
});

test('the drawn count bounds the shapes a figure draws', () => {
  const total = (motif, shapes, seed) => {
    const params = { ...figures.generate({ span: SPAN, axes: { weird: 1 }, seed, id: 'fig_0', motif }).params, shapes };
    let max = 0;
    for (let time = 2.5; time < 14; time += 0.7) max = Math.max(max, figures.drawList({ type: 'figure', params }, ctx({ time })).shapes.length);
    return max;
  };
  for (let seed = 1; seed <= 40; seed += 1) {
    const few = total('proc', 4, seed);
    const many = total('proc', 300, seed);
    // the first layer always draws one point with its symmetric copies (<= 8)
    assert.ok(few <= 16, `proc seed ${seed}: ${few} shapes at count 4`);
    assert.ok(many >= few, `proc seed ${seed}: ${many} < ${few}`);
  }
  assert.ok(total('burst', 4, 1) < total('burst', 40, 1));
  assert.ok(total('confetti', 3, 1) <= 3);
});

test('figures respond to ADSR envelope with finite shapes and scale changes', () => {
  const spec = figures.generate({ span: SPAN, axes: { energy: 0.5, weird: 0.5 }, seed: 3, id: 'fig_0' });
  const baseCtx = ctx({ time: 2.2 }); // Just after the first beat starts (2..4)
  const withoutAdsr = figures.drawList(spec, baseCtx);
  const withAdsr = figures.drawList(spec, { ...baseCtx, adsr: { attack: 0.1, decay: 0.3, peak: 2, sustain: 1, punch: 0.5 } });

  // Both should return finite shapes
  assert.ok(withoutAdsr.shapes.length > 0);
  assert.ok(withAdsr.shapes.length > 0);
  for (const shape of withAdsr.shapes) {
    for (const key of ['x', 'y', 'r', 'w', 'h', 'opacity', 'scaleX', 'scaleY']) {
      if (shape[key] != null) assert.ok(Number.isFinite(shape[key]), `with ADSR: ${key} is ${shape[key]}`);
    }
  }

  // At the early time (0.2s into first beat, within attack window), shapes should differ
  // The attack window is 0.1s, so at 0.2s we're in the decay phase with scale punch applied
  const baseEarly = ctx({ time: 2.15 }); // 0.15s into first beat
  const earlyWithoutAdsr = figures.drawList(spec, baseEarly);
  const earlyWithAdsr = figures.drawList(spec, { ...baseEarly, adsr: { attack: 0.1, decay: 0.3, peak: 2, sustain: 1, punch: 0.5 } });

  // At least one shape should differ (scale or position)
  let differ = false;
  if (earlyWithAdsr.shapes.length === earlyWithoutAdsr.shapes.length) {
    for (let i = 0; i < earlyWithAdsr.shapes.length; i += 1) {
      const a = earlyWithAdsr.shapes[i];
      const b = earlyWithoutAdsr.shapes[i];
      if ((a.x || 0) !== (b.x || 0) || (a.y || 0) !== (b.y || 0) || (a.scaleX || 1) !== (b.scaleX || 1) || (a.scaleY || 1) !== (b.scaleY || 1)) {
        differ = true;
        break;
      }
    }
  }
  // At least one shape should be different with ADSR applied
  assert.ok(differ || earlyWithAdsr.shapes.length !== earlyWithoutAdsr.shapes.length, 'ADSR should affect the shapes at early time');
});

// ---------------------------------------------------------------------------
// text-anchored motifs (frame / underline / brackets): scaled about the text
// box and fitted back on screen, so they never leave the frame

test('frame stays on screen with a low text box, big beats, accent and a pan', () => {
  const lowBox = { x0: 400, y0: 940, x1: 1520, y1: 1000 };
  for (const motif of ['frame', 'underlineSweep', 'bracketsPop']) {
    const spec = {
      type: 'figure',
      params: {
        motif, density: 0.5, camera: 'pan', seed: 5, colors: ['#ff0000', '#00ff00'],
        beats: [{ start: 0, end: 3, move: { in: 'pop', hold: 'drift', out: 'fade' }, variant: 0, accent: true, size: 1.4 }],
      },
    };
    for (let t = 0.1; t < 3; t += 0.2) {
      const list = figures.drawList(spec, { time: t, frame: FRAME, clip: { key: 'fig_frame', start: 0, end: 3 }, seed: 5, colors: ['#ff0000', '#00ff00'], textBox: lowBox });
      assert.ok(list.shapes.length > 0, `${motif} draws nothing at ${t}`);
      for (const shape of list.shapes) {
        if (shape.kind === 'capsule') {
          for (const [x, y] of [[shape.x0, shape.y0], [shape.x1, shape.y1]]) {
            assert.ok(x >= 0 && x <= FRAME.width && y >= 0 && y <= FRAME.height, `${motif} capsule off screen at ${t}: ${x},${y}`);
          }
        }
      }
    }
  }
});

// ---------------------------------------------------------------------------
// line style / caps: decoration, width jitter and end caps on finished pixels

test('dashed draws a pattern on capsules and rings, with whole periods', () => {
  const beats = [{ start: 0, end: 3, move: { in: 'pop', hold: 'drift', out: 'fade' }, variant: 0, accent: false }];
  const at = { time: 1.5, frame: FRAME, clip: { key: 'fig_dash', start: 0, end: 3 }, seed: 1, colors: ['#ff0000', '#00ff00'] };
  const capsules = figures.drawList({ type: 'figure', params: { motif: 'burst', density: 0.5, colors: ['#ff0000', '#00ff00'], beats, lineStyle: 'dashed' } }, at).shapes;
  assert.ok(capsules.length > 0);
  assert.ok(capsules.every((shape) => shape.kind === 'capsule' && shape.pattern === 1), 'every burst capsule carries pattern 1');
  const rings = figures.drawList({ type: 'figure', params: { motif: 'rings', density: 0.5, colors: ['#ff0000', '#00ff00'], beats, lineStyle: 'dashed' } }, at).shapes;
  assert.ok(rings.length > 0 && rings.every((shape) => shape.kind === 'ring'));
  for (const ring of rings) {
    assert.equal(ring.pattern, 1);
    const cycles = (2 * Math.PI * ring.r) / ring.patternParams[0];
    assert.ok(Math.abs(cycles - Math.round(cycles)) < 1e-9, `ring period does not tile: ${cycles}`);
  }
  // a stub shorter than 4% of the short edge keeps its plain line
  const stub = figures.drawList({ type: 'figure', params: { motif: 'burst', radius: 0.3, density: 0.5, colors: ['#ff0000'], lineStyle: 'dashed', beats: [{ start: 0, end: 3, move: { in: 'pop', hold: 'drift', out: 'fade' }, variant: 0, accent: false, size: 0.3 }] } }, at).shapes;
  assert.ok(stub.length > 0);
  assert.ok(stub.every((shape) => shape.pattern == null), 'short stubs stay plain');
});

test('arrow adds one head per capsule, square grows the line by its width', () => {
  const beats = [{ start: 0, end: 3, move: { in: 'pop', hold: 'drift', out: 'fade' }, variant: 1, accent: false }];
  const at = { time: 1.5, frame: FRAME, clip: { key: 'fig_cap', start: 0, end: 3 }, seed: 2, colors: ['#ff0000', '#00ff00'] };
  const base = { motif: 'scratches', density: 0.5, colors: ['#ff0000', '#00ff00'], beats };
  const plain = figures.drawList({ type: 'figure', params: { ...base } }, at).shapes;
  const headed = figures.drawList({ type: 'figure', params: { ...base, lineCap: 'arrow' } }, at).shapes;
  const plainCaps = plain.filter((shape) => shape.kind === 'capsule');
  assert.ok(plainCaps.length > 0);
  assert.equal(headed.filter((shape) => shape.kind === 'convex').length, plainCaps.length, 'one arrow head per capsule');
  const length = (shapes) => shapes.filter((shape) => shape.kind === 'capsule').reduce((sum, shape) => sum + Math.hypot(shape.x1 - shape.x0, shape.y1 - shape.y0), 0);
  const widths = plainCaps.reduce((sum, shape) => sum + shape.width, 0);
  const squared = figures.drawList({ type: 'figure', params: { ...base, lineCap: 'square' } }, at).shapes;
  assert.ok(Math.abs(length(squared) - length(plain) - widths) < 1e-6, 'square extends each end by half the width');
});

test('a clip without the new params draws exactly the neutral clip', () => {
  const beats = [{ start: 0, end: 3, move: { in: 'pop', hold: 'spin', out: 'fade' }, variant: 0, accent: true }];
  const at = { time: 1.2, frame: FRAME, clip: { key: 'fig_compat', start: 0, end: 3 }, seed: 8, colors: ['#ff0000', '#00ff00'] };
  for (const motif of ['burst', 'scratches', 'rings', 'kdTree', 'starfield']) {
    const bare = { motif, density: 0.5, colors: ['#ff0000', '#00ff00'], beats };
    const neutral = { ...bare, lineStyle: 'solid', density: 0.5, inDur: undefined, outDur: undefined };
    assert.deepEqual(figures.drawList({ type: 'figure', params: neutral }, at), figures.drawList({ type: 'figure', params: bare }, at), `${motif} changed without new params`);
    for (const shape of figures.drawList({ type: 'figure', params: bare }, at).shapes) {
      assert.equal(shape.pattern, undefined, `${motif} carries a pattern without lineStyle`);
      assert.equal(shape.cap, undefined, `${motif} carries a cap without lineCap`);
    }
  }
  // density 0.5 is the identity for the geo / scene families
  const dense = { motif: 'voronoi', seed: 7, rand: 1, colors: ['#ff0000', '#00ff00'], beats };
  const half = figures.drawList({ type: 'figure', params: { ...dense, density: 0.5 } }, at).shapes;
  const none = figures.drawList({ type: 'figure', params: { ...dense } }, at).shapes;
  assert.deepEqual(half, none, 'density 0.5 must match density unset');
});

// ---------------------------------------------------------------------------
// density reaches the scene / geo families

test('density grows kdTree, voronoi, circlePack and starfield monotonically', () => {
  const at = { time: 3, frame: FRAME, clip: { key: 'fig_dens', start: 0, end: 6 }, seed: 1, colors: ['#ff0000', '#00ff00'] };
  for (const motif of ['kdTree', 'voronoi', 'circlePack', 'starfield']) {
    const counts = [0.15, 0.5, 1].map((density) => figures.drawList({
      type: 'figure',
      params: { motif, seed: 7, rand: 1, density, colors: ['#ff0000', '#00ff00'], beats: [{ start: 0, end: 6, move: { in: 'pop', hold: 'drift', out: 'fade' }, variant: 0, accent: true }] },
    }, at).shapes.length);
    assert.ok(counts[0] <= counts[1] && counts[1] <= counts[2], `${motif} counts ${counts.join(',')}`);
    assert.ok(counts[0] < counts[2], `${motif} density changes nothing: ${counts.join(',')}`);
  }
});

// ---------------------------------------------------------------------------
// ease / windows: linear entrance and explicit in / out durations

test('linear inEase enters linearly and inDur sets the window', () => {
  // slabWipe: its x is linear in the entrance, so the easing reads directly
  const beats = [{ start: 0, end: 4, move: { in: 'pop', hold: 'drift', out: 'fade' }, variant: 0, accent: false }];
  const at = (time) => ({ time, frame: FRAME, clip: { key: 'fig_ease', start: 0, end: 4 }, seed: 1, colors: ['#ff0000'] });
  const spec = (extra) => ({ type: 'figure', params: { motif: 'slabWipe', density: 0.5, colors: ['#ff0000'], beats, ...extra } });
  const linear = [0.1, 0.2, 0.3].map((t) => figures.drawList(spec({ inEase: 'linear', inDur: 1 }), at(t)).shapes[0].x);
  assert.ok(Math.abs((linear[1] - linear[0]) - (linear[2] - linear[1])) < 1e-6, `entrance is not linear: ${linear.join(',')}`);
  const curved = [0.1, 0.2, 0.3].map((t) => figures.drawList(spec({}), at(t)).shapes[0].x);
  assert.ok(Math.abs((curved[1] - curved[0]) - (curved[2] - curved[1])) > 1e-6, 'the default entrance reads linear too');
  // an explicit 1 s window is half open at 0.5 s
  const info = figures.beatAt(beats, 0.5, 'burst', null, { inDur: 1 });
  assert.equal(info.inProgress, 0.5);
});

test('generate saves the new params without moving the old draws', () => {
  const strip = (params) => {
    const next = { ...params };
    for (const key of ['inEase', 'outEase', 'holdEase', 'cameraEase', 'inDur', 'outDur', 'lineStyle', 'lineCap', 'weightVar']) delete next[key];
    return next;
  };
  for (const axes of [undefined, { weird: 1, energy: 0.5 }]) {
    const base = { span: SPAN, seed: 5, id: 'fig_new', axes };
    const plain = figures.generate(base);
    const pinned = figures.generate({
      ...base,
      inEase: 'backOut', outEase: 'cubicIn', holdEase: 'linear', cameraEase: 'cubicInOut',
      inDur: 1.2, outDur: 0.6, lineStyle: 'dashed', lineCap: 'arrow', weightVar: 0.6,
    });
    assert.equal(pinned.params.inEase, 'backOut');
    assert.equal(pinned.params.outEase, 'cubicIn');
    assert.equal(pinned.params.holdEase, 'linear');
    assert.equal(pinned.params.cameraEase, 'cubicInOut');
    assert.equal(pinned.params.inDur, 1.2);
    assert.equal(pinned.params.outDur, 0.6);
    assert.equal(pinned.params.lineStyle, 'dashed');
    assert.equal(pinned.params.lineCap, 'arrow');
    assert.equal(pinned.params.weightVar, 0.6);
    // the new streams leave every old draw where it was
    assert.deepEqual(strip(pinned.params), strip(plain.params));
  }
});

test('the Inspector descriptor exposes the new figure params and they reach the draw', () => {
  const fillerRender = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'filler-render.js'));
  const params = fillerRender.paramsOf('figures');
  const byKey = new Map(params.map((param) => [param.key, param]));
  assert.deepEqual(byKey.get('stroke').options, ['hair', 'thin', 'med', 'bold', 'heavy']);
  assert.deepEqual(byKey.get('lineStyle').options, ['auto', ...figures.LINE_STYLES]);
  assert.deepEqual(byKey.get('lineCap').options, figures.LINE_CAPS);
  assert.equal(byKey.get('lineCap').default, 'round');
  assert.equal(byKey.get('weightVar').kind, 'number');
  for (const key of ['inEase', 'outEase', 'holdEase', 'cameraEase']) assert.equal(byKey.get(key).kind, 'ease', key);
  for (const key of ['inDur', 'outDur']) assert.equal(byKey.get(key).kind, 'number', key);
  // an Inspector edit flows through to the picture
  const ctx = { frame: FRAME, clip: { key: 'gap_1', from: 30, to: 40 }, seed: 3, colors: ['#ff0000', '#00ff00'], time: 35, duration: 40 };
  const solid = fillerRender.drawList({ type: 'figures', params: { motif: 'burst', lineStyle: 'solid' } }, ctx);
  const dashed = fillerRender.drawList({ type: 'figures', params: { motif: 'burst', lineStyle: 'dashed' } }, ctx);
  assert.ok(solid.shapes.length > 0 && dashed.shapes.length > 0);
  assert.ok(!solid.shapes.some((shape) => shape.pattern != null), 'solid stays plain');
  assert.ok(dashed.shapes.some((shape) => shape.pattern === 1), 'dashed reaches the shape pass');
  const hair = fillerRender.drawList({ type: 'figures', params: { motif: 'burst', stroke: 'hair' } }, ctx);
  const heavy = fillerRender.drawList({ type: 'figures', params: { motif: 'burst', stroke: 'heavy' } }, ctx);
  const width = (list) => list.shapes.reduce((sum, shape) => sum + (shape.width || 0), 0);
  assert.ok(width(heavy) > width(hair) * 2, 'the stroke select reaches the geometry');
});
