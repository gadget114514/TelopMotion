'use strict';

// doc/text-layer-design.md: the text background / ornaments commit as a layer
// of their own before the glyph body, so a `post(target:'text')` can only
// touch the glyphs. The engine cannot run without WebGL here, so the wiring is
// pinned on the source (the same pattern as subtitle-bg.test.js).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');

test('the engine commits the background layer before the glyph body', () => {
  const source = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'lyrics', 'engine.js'), 'utf8');
  const start = source.indexOf('const bgActive =');
  const end = source.indexOf('for (const copy of echoPlan');
  assert.ok(start >= 0 && end > start, 'the beat body is missing');
  const body = source.slice(start, end);
  const index = (needle, from) => body.indexOf(needle, from);
  // the ornaments draw under the background
  assert.ok(index("drawBackgroundPass(active, t, project, 'orn')") < index("drawBackgroundPass(active, t, project, 'bg')"), 'the ornament pass must draw before the background');
  // A: knockout -> commit the shape layer -> take a fresh layer, all before
  // the repeat copies / glyph body
  const knockout = index('pipeline.knockout();');
  const commit = index('pipeline.commitLayer(1);', knockout);
  const fresh = index('pipeline.beginLayer();', commit);
  const repeat = index('drawRepeatCopies(');
  assert.ok(knockout >= 0, 'the knockout is missing');
  assert.ok(commit > knockout, 'the shape layer must commit after the knockout');
  assert.ok(fresh > commit, 'a fresh layer must be taken after the commit');
  assert.ok(repeat > fresh, 'the glyph body must draw after the shape layer committed');
  // the text posts run on the glyph layer, after the fresh beginLayer
  assert.ok(index('SA.fx.postUniforms') > fresh, 'text posts must run on the glyph layer');
});

test('the engine applies background scaling and cap', () => {
  const source = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'lyrics', 'engine.js'), 'utf8');
  assert.ok(source.includes('SA.textBg.backgroundScale'), 'the background scale is not wired');
  // the ornament safety cap stays, so a stored style cannot paint a slab
  assert.ok(source.includes('cell: 2.4'), 'the ornament cap is gone');
});

test('clip and subtitle tracks draw back to front in track order (upper = front)', () => {
  const source = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'lyrics', 'engine.js'), 'utf8');
  // the layer order is the track order: one ordered pass draws every clip /
  // subtitle track back to front (bottom track first, top track last)
  assert.ok(source.includes('orderedTrackIdsFor'), 'the ordered track pass is missing');
  assert.ok(source.includes('drawTrackClips'), 'the per-track clip pass is missing');
  assert.ok(source.includes('upper = front'), 'the upper=front rule is not documented');
  // the fixed kind order is gone: no single back-to-front block draws
  // background -> backdrop -> filler -> figure in code order
  assert.equal(source.includes('const drawClipTracks = (segment)'), false, 'the fixed kind-order block must be gone');
  // and the lyrics draw inside the same ordered pass, not after all clips
  const orderAt = source.indexOf('orderedTrackIdsFor(segment)');
  assert.ok(orderAt >= 0, 'the ordered segment pass is missing');
  const tail = source.slice(orderAt, orderAt + 2000);
  assert.ok(tail.includes('drawActiveBeat'), 'the lyrics must draw inside the ordered pass');
  assert.ok(tail.includes('drawTrackClips'), 'the clips must draw inside the ordered pass');
  // the timeline lists tracks top to bottom and the fixed ends stay put:
  // foreground first (front), background last (back), every movable track
  // between them
  const project = require(path.join(ROOT, 'renderer', 'js', 'studio', 'project.js'));
  const kinds = project.defaults().tracks.map((track) => track.kind);
  assert.equal(kinds[0], 'foreground', 'the foreground stays on top');
  assert.equal(kinds[kinds.length - 1], 'background', 'the background stays at the bottom');
  for (const kind of ['subtitle', 'figure', 'backdrop', 'filler']) {
    assert.ok(kinds.indexOf(kind) > kinds.indexOf('foreground'), `${kind} sits below the foreground`);
    assert.ok(kinds.indexOf(kind) < kinds.indexOf('background'), `${kind} sits above the background`);
  }
});
