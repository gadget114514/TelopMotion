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
