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
    const spec = figures.generate({ span: SPAN, motif: 'proc', seed, id: `sig_${seed}` });
    const list = figures.drawList(spec, ctx({ time: 6 }));
    signatures.add(
      list.shapes
        .map((shape) => [shape.kind, Math.round(shape.x || shape.x0 || 0), Math.round(shape.y || shape.y0 || 0), Math.round(shape.r || shape.width || shape.w || 0)].join(':'))
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
    const spec = figures.generate({ span: SPAN, seed, id: `share_${seed}`, axes: { weird: 0.5, energy: 0.5 } });
    if (spec.params.motif === 'proc') proc += 1;
    // a classic draw keeps the historic beat fields only
    else for (const beat of spec.params.beats) assert.deepEqual(Object.keys(beat).sort(), ['accent', 'end', 'move', 'start', 'variant']);
  }
  assert.ok(proc >= 120 && proc <= 180, `proc share ${proc}/200`);
  // the fear axis hands the pick back to the fixed library
  let feared = 0;
  for (let seed = 1; seed <= 200; seed += 1) {
    const spec = figures.generate({ span: SPAN, seed, id: `share_${seed}`, axes: { weird: 0.5, energy: 0.5, fear: 0.9 } });
    if (spec.params.motif === 'proc') feared += 1;
  }
  assert.ok(feared < proc / 2, `feared proc ${feared} vs ${proc}`);
  // fear 0 is the legacy no-op: the whole spec is unchanged
  const withFear = figures.generate({ span: SPAN, seed: 17, id: 'noop', axes: { weird: 0.5, energy: 0.5, fear: 0 } });
  const without = figures.generate({ span: SPAN, seed: 17, id: 'noop', axes: { weird: 0.5, energy: 0.5 } });
  assert.deepEqual(withFear, without);
  // an explicit proc request always carries a finite seed
  const explicit = figures.generate({ span: SPAN, motif: 'proc', seed: 3, id: 'explicit' });
  assert.equal(explicit.params.motif, 'proc');
  assert.ok(Number.isFinite(Number(explicit.params.seed)));
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
