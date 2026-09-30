'use strict';

// The text mask: the glyph alpha plus a padding ring grown from the distance
// field is baked into its own target and knocked out of the clip layers, so a
// figure / backdrop accent / filler can never paint over the subtitle. The
// engine cannot run without WebGL here, so the pure helpers, the shader and the
// pipeline wiring are pinned.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
globalThis.window = globalThis;
globalThis.SA = globalThis.SA || {};
require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'engine.js'));
require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'gl', 'shaders.js'));
const engine = globalThis.SA.lyricsEngine;
const shaders = globalThis.SA.glShaders;

test('maskRadius clamps the padding to the frame band', () => {
  const height = 1080;
  // the minimum: 0.008 H
  assert.equal(engine.maskRadius(0, height), 0.008 * height);
  assert.equal(engine.maskRadius(10, height), 0.008 * height);
  // the share of the beat size while inside the band
  assert.ok(Math.abs(engine.maskRadius(120, height) - 0.16 * 120) < 1e-9);
  // the maximum: 0.03 H
  assert.equal(engine.maskRadius(10000, height), 0.03 * height);
  // a portrait frame uses its own height
  assert.equal(engine.maskRadius(0, 1920), 0.008 * 1920);
  assert.ok(engine.maskRadius(300, 1920) <= 0.03 * 1920);
  // junk sizes never escape the band
  assert.equal(engine.maskRadius(Number.NaN, 0), 0.008);
});

test('partitionPlanes tells the plane / accent arrangements apart', () => {
  const plane = (x) => ({ kind: 'convex', points: [], plane: true, x });
  const accent = (x) => ({ kind: 'circle', x });
  // planes only: single layer, never masked
  const planesOnly = engine.partitionPlanes([plane(1), plane(2)]);
  assert.equal(planesOnly.planes.length, 2);
  assert.equal(planesOnly.accents.length, 0);
  assert.equal(planesOnly.ordered, false);
  // accents only: single layer, masked
  const accentsOnly = engine.partitionPlanes([accent(1), accent(2)]);
  assert.equal(accentsOnly.planes.length, 0);
  assert.equal(accentsOnly.accents.length, 2);
  assert.equal(accentsOnly.ordered, false);
  // planes then accents: the two-layer path
  const ordered = engine.partitionPlanes([plane(1), plane(2), accent(3), accent(4)]);
  assert.equal(ordered.ordered, true);
  assert.deepEqual(ordered.planes.map((shape) => shape.x), [1, 2]);
  assert.deepEqual(ordered.accents.map((shape) => shape.x), [3, 4]);
  // mixed order: the hand-made combo stays single-layer
  const mixed = engine.partitionPlanes([accent(1), plane(2), accent(3)]);
  assert.equal(mixed.ordered, false);
  // an empty / missing list is safe
  assert.deepEqual(engine.partitionPlanes(null), { planes: [], accents: [], ordered: false });
});

test('trackTextMaskOn defaults to on and only an explicit false opts out', () => {
  assert.equal(engine.trackTextMaskOn(null), true);
  assert.equal(engine.trackTextMaskOn({}), true);
  assert.equal(engine.trackTextMaskOn({ textMask: true }), true);
  assert.equal(engine.trackTextMaskOn({ textMask: false }), false);
  assert.equal(engine.trackTextMaskOn({ textMask: 0 }), true, 'only the boolean false opts out');
});

test('MASK_FRAG reads the text alpha and the signed distance field', () => {
  const frag = shaders.MASK_FRAG;
  assert.equal(typeof frag, 'string');
  assert.ok(frag.includes('u_text'), 'the text alpha source is missing');
  assert.ok(frag.includes('u_sdf'), 'the distance field is missing');
  assert.ok(frag.includes('u_strength'), 'the strength uniform is missing');
  assert.ok(frag.includes('u_radius'), 'the radius uniform is missing');
  assert.ok(frag.includes('u_feather'), 'the feather uniform is missing');
  // the outline conversion: the padding is a smoothstep of the normalised
  // distance, clamped at zero so the inside is fully masked
  assert.ok(frag.includes('smoothstep(u_radius - u_feather, u_radius, max(distance, 0.0))'));
  // the empty-field sentinel falls back to the glyph alpha
  assert.ok(frag.includes('-900.0'), 'the sdf sentinel is not handled');
});

test('the pipeline bakes the mask target and the engine applies it', () => {
  const passes = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'lyrics', 'gl', 'passes.js'), 'utf8');
  assert.ok(passes.includes('buildTextMask'), 'buildTextMask is missing');
  assert.ok(passes.includes('maskLayer'), 'maskLayer is missing');
  assert.ok(passes.includes("mask: make(width, height)"), 'the mask target is missing');
  assert.ok(passes.includes('SA.glShaders.MASK_FRAG'), 'the mask program is missing');
  assert.ok(passes.includes("'mask'"), 'the mask target is not disposed');
  const source = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'lyrics', 'engine.js'), 'utf8');
  assert.ok(source.includes('buildFrameTextMask'), 'the engine does not bake the mask');
  assert.ok(source.includes('maskTargetsActive'), 'the mask targets are not gated');
  assert.ok(source.includes('pipeline.maskLayer()'), 'the engine never knocks a layer out');
  assert.ok(source.includes('partitionPlanes'), 'the backdrop does not split its planes');
  assert.ok(source.includes('trackTextMaskOn'), 'the track switch is not read');
  const project = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'project.js'), 'utf8');
  assert.ok(project.includes('track.textMask = !!track.textMask'), 'the track flag is not normalised');
  const timeline = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'timeline.js'), 'utf8');
  assert.ok(timeline.includes('studio.track.maskText'), 'the track menu has no mask toggle');
  assert.ok(timeline.includes('studio.track.unmaskText'), 'the track menu has no unmask toggle');
});
