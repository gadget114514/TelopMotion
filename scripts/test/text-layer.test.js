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

test('the engine draws the background at one cell and never scales it', () => {
  const source = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'lyrics', 'engine.js'), 'utf8');
  assert.ok(!source.includes('SA.textBg.backgroundScale'), 'the background is still scaled per beat');
  assert.ok(!source.includes('bg-scale'), 'the background still draws a random size');
  // the ornament safety cap stays, so a stored style cannot paint a slab
  assert.ok(source.includes('cell: 2.4'), 'the ornament cap is gone');
});

test('the filler clips draw in front of the background and behind the lyrics', () => {
  const source = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'lyrics', 'engine.js'), 'utf8');
  const start = source.indexOf('for (const clip of activeClips(project, \'background\'))');
  const end = source.indexOf('const trackOrder = subtitleTracks.map');
  assert.ok(start >= 0 && end > start, 'the back-to-front block is missing');
  const block = source.slice(start, end);
  const index = (needle) => block.indexOf(needle);
  assert.ok(index("activeClips(project, 'background')") >= 0, 'the background clips do not draw');
  // a gap filler is scenery over the background, never behind it: the whole
  // point of filling a gap is that it is visible on top of the backdrop
  assert.ok(index('renderFillerClips(') > index('drawBackgroundLayers();'), 'the fillers draw behind the background');
  assert.ok(index('renderFillerClips(') > index("activeClips(project, 'backdrop')"), 'the fillers draw behind the backdrop');
  assert.ok(index("activeClips(project, 'figure')") > index('renderFillerClips('), 'the figure track draws behind the fillers');
  // and the lyrics still knock out of both
  assert.ok(end > index('renderFillerClips('), 'the lyric tracks draw before the fillers');
  // the timeline draws the tracks in array order, top row first, so the filler
  // row has to come before the background row to agree with the renderer
  const project = require(path.join(ROOT, 'renderer', 'js', 'studio', 'project.js'));
  const kinds = project.defaults().tracks.map((track) => track.kind);
  assert.ok(kinds.indexOf('filler') < kinds.indexOf('background'), 'the filler track sits behind the background track');
});
