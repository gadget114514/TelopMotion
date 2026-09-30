'use strict';

// The frame base is the background track's own colour: a track-governed
// object that toggles with the track's checkbox. Unset, hidden or fully
// transparent = a transparent canvas; the chroma key green is a preset of that
// colour, never an implicit engine default. The engine cannot run without
// WebGL here, so the pure decision helper plus the wiring is pinned.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
globalThis.window = globalThis;
globalThis.SA = globalThis.SA || {};
globalThis.SA.color = require(path.join(ROOT, 'renderer', 'js', 'color.js'));
require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'engine.js'));
const project = require(path.join(ROOT, 'renderer', 'js', 'studio', 'project.js'));
const engine = globalThis.SA.lyricsEngine;

const TRANSPARENT = [0, 0, 0, 0];

function doc(patch) {
  return {
    tracks: [{ id: 'bg', kind: 'background' }],
    layers: [],
    clips: [],
    ...(patch || {}),
  };
}

test('no background colour clears to transparent', () => {
  assert.deepEqual(engine.backgroundBaseColor(doc()), TRANSPARENT);
  assert.deepEqual(engine.backgroundBaseColor(null), TRANSPARENT);
  assert.deepEqual(engine.backgroundBaseColor({ tracks: [], layers: [], clips: [] }), TRANSPARENT);
});

test('the background track colour becomes the base, premultiplied', () => {
  const hex = engine.backgroundBaseColor(doc({ tracks: [{ id: 'bg', kind: 'background', color: '#00b140' }] }));
  assert.ok(Math.abs(hex[0]) < 1e-6, 'red is 0');
  assert.ok(Math.abs(hex[1] - 177 / 255) < 1e-6, 'green channel');
  assert.ok(Math.abs(hex[2] - 64 / 255) < 1e-6, 'blue channel');
  assert.equal(hex[3], 1);
  const half = engine.backgroundBaseColor(
    doc({ tracks: [{ id: 'bg', kind: 'background', color: { kind: 'solid', value: '#ffffff', alpha: 0.5 } }] })
  );
  assert.deepEqual(half, [0.5, 0.5, 0.5, 0.5]);
});

test('a hidden track or a fully transparent colour is not a base', () => {
  assert.deepEqual(
    engine.backgroundBaseColor(doc({ tracks: [{ id: 'bg', kind: 'background', hidden: true, color: '#00b140' }] })),
    TRANSPARENT
  );
  assert.deepEqual(
    engine.backgroundBaseColor(doc({ tracks: [{ id: 'bg', kind: 'background', color: { kind: 'solid', value: '#00b140', alpha: 0 } }] })),
    TRANSPARENT
  );
});

test('the engine wires the base into the clear and the composite keeps alpha', () => {
  const source = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'lyrics', 'engine.js'), 'utf8');
  assert.ok(source.includes('backgroundBaseColor(project)'), 'the pipeline clear uses the base');
  assert.ok(!source.includes('CLEAR_COLOR') && !source.includes('BASE_COLOR'), 'the implicit colours are gone');
  assert.ok(source.includes('TRANSPARENT'), 'the transparent clear is missing');
  const fallback = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'lyrics', 'canvas2d-fallback.js'), 'utf8');
  assert.ok(fallback.includes('backgroundBaseColor'), 'the fallback follows the same rule');
  assert.ok(!fallback.includes('00b140'), 'the fallback has no implicit green');
  const shaders = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'lyrics', 'gl', 'shaders.js'), 'utf8');
  assert.ok(shaders.includes('u_clearColor.a'), 'the composite keeps the base alpha');
});

test('migrate normalises the background track colour and drops junk', () => {
  const base = project.defaults({});
  base.tracks = [
    { id: 'bg', kind: 'background', color: '#00b140' },
    { id: 'sub1', kind: 'subtitle' },
  ];
  const migrated = project.migrate(base);
  assert.equal(migrated.ok, true);
  assert.deepEqual(migrated.project.tracks.find((track) => track.id === 'bg').color, { kind: 'solid', value: '#00b140', alpha: 1 });
  const junk = project.defaults({});
  junk.tracks = [{ id: 'bg', kind: 'background', color: 'red' }];
  const migratedJunk = project.migrate(junk);
  assert.equal('color' in migratedJunk.project.tracks.find((track) => track.id === 'bg'), false);
});
