'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
globalThis.window = globalThis;
globalThis.SA = globalThis.SA || {};
require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'engine.js'));
const engine = globalThis.SA.lyricsEngine;
const layers = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'gl', 'layers.js'));
const project = require(path.join(ROOT, 'renderer', 'js', 'studio', 'project.js'));

const ids = (segment) => [...segment.ids];

test('drawSegments carries the tracks back to front in order', () => {
  const tracks = project.defaults().tracks;
  const segments = engine.drawSegments(tracks);
  assert.equal(segments.length, 1);
  // back to front = the bottom row first, the top row last
  assert.deepEqual(segments[0].order, [...tracks].reverse().map((track) => track.id));
  assert.deepEqual([...segments[0].ids].sort(), tracks.map((track) => track.id).sort());
});

test('drawSegments splits the list at a video track, back to front', () => {
  const tracks = [
    { id: 'fg', kind: 'foreground' },
    { id: 'sub2', kind: 'subtitle' },
    { id: 'video1', kind: 'video' },
    { id: 'sub1', kind: 'subtitle' },
    { id: 'fig', kind: 'figure' },
    { id: 'mid', kind: 'backdrop' },
    { id: 'bg', kind: 'background' },
  ];
  const segments = engine.drawSegments(tracks);
  assert.deepEqual(segments.map((segment) => segment.type), ['tracks', 'video', 'tracks']);
  assert.deepEqual(ids(segments[0]), ['bg', 'mid', 'fig', 'sub1']);
  assert.deepEqual(segments[0].order, ['bg', 'mid', 'fig', 'sub1'], 'order follows the same back-to-front list');
  assert.equal(segments[1].track.id, 'video1');
  assert.deepEqual(ids(segments[2]), ['sub2', 'fg']);
  assert.deepEqual(segments[2].order, ['sub2', 'fg']);
});

test('drawSegments handles a video track at either end and back-to-back videos', () => {
  const segments = engine.drawSegments([
    { id: 'v1', kind: 'video' },
    { id: 'v2', kind: 'video' },
    { id: 'sub1', kind: 'subtitle' },
  ]);
  assert.deepEqual(segments.map((segment) => segment.type), ['tracks', 'video', 'video']);
  assert.deepEqual(segments.slice(1).map((segment) => segment.track.id), ['v2', 'v1']);
  const only = engine.drawSegments([{ id: 'v1', kind: 'video' }]);
  assert.deepEqual(only.map((segment) => segment.type), ['video', 'tracks']);
});

test('activeClips narrows to one draw group', () => {
  const doc = {
    tracks: [
      { id: 'fig', kind: 'figure' },
      { id: 'fig2', kind: 'figure' },
    ],
    clips: [
      { id: 'a', trackId: 'fig', start: 0, end: 1 },
      { id: 'b', trackId: 'fig2', start: 0, end: 1 },
    ],
  };
  assert.deepEqual(engine.activeClips(doc, 'figure').map((clip) => clip.id), ['a', 'b']);
  assert.deepEqual(engine.activeClips(doc, 'figure', new Set(['fig2'])).map((clip) => clip.id), ['b']);
});

test('chroma key removes the key colour and keeps other colours', () => {
  const chroma = { enabled: true, color: '#00b140' };
  assert.equal(layers.chromaAlpha([0, 0.694, 0.251], chroma), 0, 'the key colour is cut out');
  assert.ok(layers.chromaAlpha([0.1, 0.65, 0.3], chroma) < 0.05, 'a near-key green screen is cut out');
  assert.equal(layers.chromaAlpha([0.8, 0.6, 0.5], chroma), 1, 'skin tone stays');
  assert.equal(layers.chromaAlpha([0.5, 0.5, 0.5], chroma), 1, 'grey stays');
  assert.equal(layers.chromaAlpha([0, 0.694, 0.251], { ...chroma, enabled: false }), 1, 'off keeps everything');
  assert.equal(layers.chromaState(null).on, false);
  const state = layers.chromaState({ enabled: true, similarity: 0.3 });
  assert.equal(state.on, true);
  assert.equal(state.params[0], 0.3);
  assert.equal(state.params[1], layers.CHROMA_DEFAULTS.smoothness);
});
