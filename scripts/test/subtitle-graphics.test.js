'use strict';

// The subtitle track's frame-wide graphics sit on their own row: the track's
// graphicsHidden flag (data) and the subtitle-only view drop every frame post
// (light leaks, vignette, camera moves, the shape layer), while the posts that
// move with the letters (text posts, bgShape, edges, clones) stay with the
// lyrics. The engine cannot run without WebGL here, so the pure decision
// helpers plus the wiring are pinned.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const FX_DIR = path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects');
const fx = require(path.join(FX_DIR, 'registry.js'));
for (const name of ['post', 'camera', 'shape-layer']) {
  require(path.join(FX_DIR, `${name}.js`));
}
globalThis.window = globalThis;
globalThis.SA = globalThis.SA || {};
require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'engine.js'));
const project = require(path.join(ROOT, 'renderer', 'js', 'studio', 'project.js'));

test('postTarget resolves the instance, the defaults and the registry', () => {
  assert.equal(fx.postTarget({ type: 'vignette' }), 'frame');
  assert.equal(fx.postTarget({ type: 'sparkles' }), 'text');
  assert.equal(fx.postTarget({ type: 'vignette', target: 'text' }), 'text');
  assert.equal(fx.postTarget({ type: 'sparkles', defaults: { target: 'frame' } }), 'frame');
});

test('isGraphicsPost puts every frame post on the graphics row', () => {
  assert.equal(fx.isGraphicsPost({ type: 'vignette' }), true);
  assert.equal(fx.isGraphicsPost({ type: 'lightLeak' }), true);
  assert.equal(fx.isGraphicsPost({ type: 'camera' }), true);
  assert.equal(fx.isGraphicsPost({ type: 'crt' }), true);
  assert.equal(fx.isGraphicsPost({ type: 'shapeLayer' }), true);
  assert.equal(fx.isGraphicsPost({ type: 'shapeLayer', enabled: false }), false);
  assert.equal(fx.isGraphicsPost({ type: 'sparkles' }), false);
  assert.equal(fx.isGraphicsPost({ type: 'godRays' }), false);
  assert.equal(fx.isGraphicsPost({ type: 'vignette', enabled: false }), false);
  assert.equal(fx.isGraphicsPost(null), false);
});

test('subtitleGraphicsOn reads the track flag and the subtitle-only view', () => {
  const engine = globalThis.SA.lyricsEngine;
  assert.equal(engine.subtitleGraphicsOn({ graphicsHidden: true }, {}), false);
  assert.equal(engine.subtitleGraphicsOn({ graphicsHidden: false }, {}), true);
  assert.equal(engine.subtitleGraphicsOn({}, {}), true);
  assert.equal(engine.subtitleGraphicsOn({}, { subtitleOnly: true }), false);
  assert.equal(engine.subtitleGraphicsOn({ graphicsHidden: true }, { subtitleOnly: true }), false);
  assert.equal(engine.subtitleGraphicsOn(null, null), true);
});

test('migrate normalises graphicsHidden to a boolean and keeps it absent by default', () => {
  const doc = project.defaults({});
  doc.tracks = [
    { id: 'sub1', kind: 'subtitle', name: '字幕1', graphicsHidden: 1 },
    { id: 'sub2', kind: 'subtitle', name: '字幕2' },
    { id: 'mid', kind: 'backdrop', name: '後景' },
  ];
  const migrated = project.migrate(doc);
  assert.equal(migrated.ok, true);
  assert.equal(migrated.project.tracks.find((track) => track.id === 'sub1').graphicsHidden, true);
  assert.equal(migrated.project.tracks.find((track) => track.id === 'sub2').graphicsHidden, undefined);
});

test('the engine drops the track graphics and the timeline draws their row', () => {
  const engine = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'lyrics', 'engine.js'), 'utf8');
  assert.ok(engine.includes('graphicsHiddenTracks'), 'the graphicsHidden set is missing');
  assert.ok(engine.includes('subtitleGraphicsOn'), 'the decision helper is unused');
  assert.ok(engine.includes('graphicsHiddenTracks.has(active.trackId)'));
  assert.ok(engine.includes('isGraphicsPost'), 'the engine does not skip graphics posts');
  assert.ok(engine.includes('graphicsOn'), 'the per-beat graphics decision is missing');
  const timeline = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'timeline.js'), 'utf8');
  assert.ok(timeline.includes("'graphics-track'"), 'the graphics row is missing');
  assert.ok(timeline.includes("'track-graphics-check'"), 'the graphics checkbox is missing');
  assert.ok(timeline.includes('graphicsSpans'), 'the graphics spans are missing');
  const i18n = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'i18n.js'), 'utf8');
  for (const key of ['graphics', 'hideGraphics', 'showGraphics']) {
    assert.ok(i18n.includes(key), `${key} missing from i18n`);
  }
});
