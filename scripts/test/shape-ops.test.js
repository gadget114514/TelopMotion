'use strict';

// shape-ops expands one authored shape into the primitive list the GL shape
// pass draws, and normalises the trim / dash / path op the pass expects.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const ops = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'shape-ops.js'));

test('trim and dash are clamped and normalised', () => {
  assert.deepEqual(ops.normalizeTrim({ trimStart: 0.8, trimEnd: 0.2, trimOffset: 0.5 }), [0.2, 0.8, 0.5], 'reversed ranges are sorted');
  assert.deepEqual(ops.normalizeTrim({}), [0, 1, 0]);
  assert.deepEqual(ops.normalizeTrim({ trimStart: -3, trimEnd: 9 }), [0, 1, 0]);
  assert.deepEqual(ops.normalizeDash({}), [0, 0, 0], 'no dash length means no dash');
  assert.deepEqual(ops.normalizeDash({ dashOn: 0.1 }), [0.1, 0.1, 0], 'the gap defaults to the dash');
  assert.deepEqual(ops.normalizeDash({ dashOn: 0.1, dashOff: 0.05, dashOffset: 0.2 }), [0.1, 0.05, 0.2]);
});

test('the path op maps to the shader code', () => {
  assert.deepEqual(ops.normalizePathOp({}), [0, 0, 0, 0]);
  assert.deepEqual(ops.normalizePathOp({ pathOp: 'zigzag', pathOpAmount: 0.4, pathOpFreq: 3 }, 1.5), [2, 0.4, 3, 1.5]);
  assert.deepEqual(ops.normalizePathOp({ pathOp: 'nope' }), [0, 0, 0, 0]);
  assert.deepEqual(ops.PATH_OPS, ['none', 'wiggle', 'zigzag', 'pucker', 'twist']);
});

test('the repeater walks copies outwards and fades them', () => {
  const instances = ops.repeaterInstances({}, { copies: 4, offset: 0.5, width: 10, position: { x: 1, y: 0 }, scale: 0.5, startOpacity: 1, endOpacity: 0 });
  assert.equal(instances.length, 4);
  assert.deepEqual(instances.map((entry) => entry.index), [0, 1, 2, 3]);
  assert.equal(instances[0].dx, 0);
  assert.equal(instances[1].dx, 5, '0.5 offset of a 10px shape');
  assert.equal(instances[2].dx, 5 + 2.5, 'the previous copy is already scaled');
  assert.equal(instances[1].scale, 0.5);
  assert.equal(instances[3].scale, 0.125);
  assert.equal(instances[3].opacity, 0);
  assert.ok(instances[1].opacity < instances[0].opacity);
  // a single copy is the shape itself
  assert.deepEqual(ops.repeaterInstances({}, { copies: 1 }), [{ index: 0, opacity: 1, dx: 0, dy: 0, rotation: 0, scale: 1 }]);
});

test('expand turns a spec into drawable primitives', () => {
  const rects = ops.expand({ kind: 'rect', x: 10, y: 20, w: 30, h: 40, radius: 4, opacity: 0.5 }, {});
  assert.equal(rects.length, 1);
  assert.equal(rects[0].kind, 'rect');
  assert.deepEqual([rects[0].x, rects[0].y, rects[0].w, rects[0].h], [10, 20, 30, 40]);
  assert.equal(rects[0].radius, 4);
  assert.equal(rects[0].opacity, 0.5);
  const ring = ops.expand({ kind: 'ring', x: 1, y: 2, radius: 12, ring: 3 }, {});
  assert.equal(ring[0].kind, 'circle');
  assert.equal(ring[0].ring, 3);
  const line = ops.expand({ kind: 'capsule', x: 0, y: 0, length: 10, stroke: 2 }, {});
  assert.equal(line[0].kind, 'capsule');
  assert.deepEqual([line[0].p0.x, line[0].p1.x], [-5, 5]);
  const poly = ops.expand({ kind: 'polygon', radius: 8, sides: 5 }, {});
  assert.equal(poly[0].sides, 5);
  // a repeater multiplies the list and scales each copy
  const repeated = ops.expand({ kind: 'rect', w: 10, h: 10 }, { copies: 3, offset: 1, width: 10, position: { x: 1, y: 0 }, scale: 1 });
  assert.equal(repeated.length, 3);
  assert.deepEqual(repeated.map((entry) => entry.x), [0, 10, 20]);
});

test('the drive maps the beat progress to the trim', () => {
  const spec = { trimStart: 0.1, trimEnd: 0.9, speed: 0.5 };
  assert.deepEqual(ops.trimForDrive({ ...spec, drive: 'enter' }, { progress: 0.5 }), [0.1, 0.5, 0]);
  assert.deepEqual(ops.trimForDrive({ ...spec, drive: 'enter' }, { progress: 0 }), [0.1, 0.1, 0]);
  assert.deepEqual(ops.trimForDrive({ ...spec, drive: 'exit' }, { progress: 0.5 }), [0.5, 0.9, 0]);
  assert.deepEqual(ops.trimForDrive({ ...spec, drive: 'hold' }, { time: 1 }), [0.1, 0.9, 0.5]);
  assert.deepEqual(ops.trimForDrive({ ...spec, drive: 'beat' }, { time: 0.75, bpm: 120 }), [0.1, 0.9, 0.5]);
});

test('the shape pass carries the trim, dash, cap and path op', () => {
  const source = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'lyrics', 'gl', 'shapes.js'), 'utf8');
  for (const token of ['u_trim', 'u_dash', 'u_cap', 'u_warp', 'pathParam', 'warpPoint']) {
    assert.ok(source.includes(token), `shapes.js has no ${token}`);
  }
  // the trim defaults keep the previous look (no trim, no dash, round cap)
  assert.ok(source.includes('opts.trim || [0, 1, 0]'), 'the trim default changed');
  assert.ok(source.includes("Array.isArray(opts.dash) ? opts.dash : [0, 0, 0]"), 'the dash default changed');
  assert.ok(source.includes("opts.cap === 'butt' ? 0 : 1"), 'the cap default changed');
});
