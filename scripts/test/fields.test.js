'use strict';

// Full-frame mathematical fields: one closed-form fragment shader per field, a
// genome of 16 numbers, no state between frames. The shaders themselves are
// compiled in the browser; here the genome, the figure plumbing and the
// embedding are checked.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const fields = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'gl', 'fields.js'));
const figures = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'figures.js'));

const COLORS = ['#ff4d6d', '#ffd166', '#06d6a0', '#118ab2', '#c77dff'];
const BEATS = [{ start: 2, end: 8 }, { start: 8, end: 14 }];

test('every field has a shader source and a finite 16 number genome', () => {
  assert.ok(fields.IDS.length >= 16);
  for (const id of fields.IDS) {
    const source = fields.fragment(id);
    assert.ok(source.startsWith('#version 300 es'), id);
    assert.ok(source.includes('vec4 fieldColor(vec2 p, float t)'), `${id} lacks fieldColor`);
    assert.ok(source.includes('void main()'), id);
    for (let seed = 1; seed <= 30; seed += 1) {
      for (const rand of [0, 0.5, 1]) {
        const g = fields.genome(id, seed * 13 + 1, rand);
        assert.equal(g.length, 16);
        assert.ok(g.every(Number.isFinite), `${id} seed ${seed} not finite`);
        for (let i = 12; i < 16; i += 1) assert.ok(g[i] >= 0 && g[i] <= 1, `${id} embedding slot ${i}`);
      }
    }
  }
});

test('the genome is deterministic, differs between seeds at randomness 1 and is plain at 0', () => {
  for (const id of fields.IDS) {
    assert.deepEqual(fields.genome(id, 7, 1), fields.genome(id, 7, 1));
    const plain = fields.genome(id, 1, 0);
    for (let seed = 2; seed <= 20; seed += 1) assert.deepEqual(fields.genome(id, seed, 0), plain, `${id} is not plain at randomness 0`);
    const distinct = new Set();
    for (let seed = 1; seed <= 60; seed += 1) distinct.add(fields.genome(id, seed, 1).map((v) => v.toFixed(3)).join(','));
    assert.ok(distinct.size > 50, `${id} draws only ${distinct.size} distinct genomes of 60`);
  }
});

test('the uniforms carry the genome, the palette, the text window and the camera', () => {
  const field = { id: 'fractal', p: fields.genome('fractal', 3, 1), seed: 42, time: 2.5, opacity: 0.4, colors: COLORS, textBox: { x0: 500, y0: 400, x1: 1400, y1: 600 }, camera: { scale: 1.2, dx: 10, dy: -5, rotate: 0.1 } };
  const u = fields.uniformsOf(field, { width: 1920, height: 1080 }, (hex) => [parseInt(hex.slice(1, 3), 16) / 255, 0, 0]);
  assert.deepEqual(u.u_res, [1920, 1080]);
  assert.equal(u.u_time, 2.5);
  assert.equal(u.u_opacity, 0.4);
  assert.deepEqual(u.u_textBox, [500, 400, 1400, 600]);
  assert.deepEqual(u.u_cam, [1.2, 10, -5, 0.1]);
  assert.equal(u.u_p0[0], field.p[0]);
  assert.equal(u.u_p3[3], field.p[15]);
  assert.equal(Object.keys(u).filter((k) => /^u_c[0-4]$/.test(k)).length, 5);
});

test('field motifs plug into the figure pipeline and return a field, not shapes', () => {
  assert.equal(figures.FIELD_MOTIFS.length, fields.IDS.length);
  for (const motif of figures.FIELD_MOTIFS) {
    assert.ok(figures.MOTIFS.includes(motif));
    const spec = figures.generate({ span: { start: 2, end: 14 }, beats: BEATS, motif, seed: 9, id: `f_${motif}`, axes: { weird: 1, energy: 0.5 } });
    assert.equal(spec.params.motif, motif);
    assert.ok(Number.isFinite(Number(spec.params.seed)));
    assert.equal(spec.params.rand, 1);
    const draw = (time, extra) => figures.drawList(spec, { time, frame: { width: 1920, height: 1080 }, clip: { key: 'c', start: 2, end: 14 }, seed: 7, colors: COLORS, beats: BEATS, ...(extra || {}) });
    const a = draw(4);
    const b = draw(4);
    assert.deepEqual(a, b, `${motif} is not deterministic`);
    assert.equal(a.shapes.length, 0);
    assert.ok(a.field && a.field.id === motif);
    assert.equal(a.field.p.length, 16);
    assert.ok(a.field.opacity > 0 && a.field.opacity <= 0.6, `${motif} opacity ${a.field.opacity}`);
    assert.equal(a.field.colors.length, 5);
    assert.ok(a.field.textBox.x1 > a.field.textBox.x0);
    // the field runs on the clip's own clock, not on the sub-beat's
    assert.ok(Math.abs(draw(9.5).field.time - 7.5) < 1e-9);
    // a given text box wins over the default window
    const boxed = draw(4, { textBox: { x0: 100, y0: 100, x1: 300, y1: 200 } });
    assert.deepEqual(boxed.field.textBox, { x0: 100, y0: 100, x1: 300, y1: 200 });
  }
});

test('a 2D camera and an own opacity reach the field', () => {
  const spec = figures.generate({ span: { start: 2, end: 14 }, beats: BEATS, motif: 'truchet', seed: 5, id: 'cam', axes: { weird: 1, energy: 0.5 }, camera: 'push' });
  const draw = (time) => figures.drawList(spec, { time, frame: { width: 1920, height: 1080 }, clip: { key: 'c', start: 2, end: 14 }, seed: 7, colors: COLORS, beats: BEATS }).field;
  assert.ok(draw(13).camera.scale > draw(3).camera.scale);
  const dim = JSON.parse(JSON.stringify(spec));
  dim.params.opacity = 0.5;
  const base = draw(5).opacity;
  const dimmed = figures.drawList(dim, { time: 5, frame: { width: 1920, height: 1080 }, clip: { key: 'c', start: 2, end: 14 }, seed: 7, colors: COLORS, beats: BEATS }).field.opacity;
  assert.ok(Math.abs(dimmed - base * 0.5) < 1e-9);
});

test('each field sits at its own place in direction space, and the position follows the genome', () => {
  const positions = figures.FIELD_MOTIFS.map((motif) => figures.embedFigure(figures.generate({ span: { start: 2, end: 14 }, beats: BEATS, motif, seed: 3, id: `e_${motif}`, axes: { weird: 1, energy: 0.5 } })));
  for (const v of positions) assert.ok(v.every((x) => Number.isFinite(x) && x >= 0 && x <= 1));
  // no two fields share a point
  for (let i = 0; i < positions.length; i += 1) {
    for (let j = i + 1; j < positions.length; j += 1) {
      assert.ok(figures.figureDistance(positions[i], positions[j]) > 0.01, `${figures.FIELD_MOTIFS[i]} and ${figures.FIELD_MOTIFS[j]} sit together`);
    }
  }
  // two seeds of one field are close but not the same point
  const a = figures.generate({ span: { start: 2, end: 14 }, beats: BEATS, motif: 'moire', seed: 1, id: 'm1', axes: { weird: 1, energy: 0.5 } });
  const b = figures.generate({ span: { start: 2, end: 14 }, beats: BEATS, motif: 'moire', seed: 2, id: 'm2', axes: { weird: 1, energy: 0.5 } });
  assert.ok(figures.figureDistance(a, b) > 0);
});

test('energy 0 keeps a field figure exactly, energy 1 moves away from it', () => {
  const previous = figures.generate({ span: { start: 2, end: 14 }, beats: BEATS, motif: 'ripple', seed: 11, id: 'r', axes: { weird: 1, energy: 0.5 } });
  const same = figures.generate({ span: { start: 2, end: 14 }, beats: BEATS, seed: 12, id: 'n0', axes: { weird: 1, energy: 0 }, previous, energy: 0 });
  assert.equal(same.params.motif, 'ripple');
  assert.equal(same.params.seed, previous.params.seed);
  const far = figures.generate({ span: { start: 2, end: 14 }, beats: BEATS, seed: 12, id: 'n1', axes: { weird: 1, energy: 1 }, previous, energy: 1 });
  assert.ok(figures.figureDistance(previous, far) > 0.2);
});
