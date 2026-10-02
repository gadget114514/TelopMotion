'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
globalThis.window = globalThis;
globalThis.SA = globalThis.SA || {};
require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'engine.js'));
const engine = globalThis.SA.lyricsEngine;
const fillerRender = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'filler-render.js'));
const figures = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'figures.js'));

test('isClipDisabled recognizes clip-level and spec.params-level disabled / enabled flags', () => {
  assert.equal(engine.isClipDisabled(null), false);
  assert.equal(engine.isClipDisabled({}), false);
  assert.equal(engine.isClipDisabled({ disabled: false }), false);
  assert.equal(engine.isClipDisabled({ enabled: true }), false);

  assert.equal(engine.isClipDisabled({ disabled: true }), true);
  assert.equal(engine.isClipDisabled({ enabled: false }), true);

  assert.equal(engine.isClipDisabled({ spec: { type: 'figure', params: { disabled: true } } }), true);
  assert.equal(engine.isClipDisabled({ spec: { type: 'figure', params: { enabled: false } } }), true);
  assert.equal(engine.isClipDisabled({ spec: { type: 'figure', params: { disabled: false } } }), false);
});

test('activeClips filters out disabled clips', () => {
  const project = {
    tracks: [
      { id: 'trk_fig', kind: 'figure', hidden: false },
      { id: 'trk_hid', kind: 'figure', hidden: true },
    ],
    clips: [
      { id: 'c1', trackId: 'trk_fig', start: 0, end: 5 },
      { id: 'c2', trackId: 'trk_fig', start: 5, end: 10, disabled: true },
      { id: 'c3', trackId: 'trk_fig', start: 10, end: 15, spec: { params: { disabled: true } } },
      { id: 'c4', trackId: 'trk_fig', start: 15, end: 20 },
      { id: 'c5', trackId: 'trk_hid', start: 20, end: 25 },
    ],
  };

  const active = engine.activeClips(project, 'figure');
  assert.deepEqual(active.map((c) => c.id), ['c1', 'c4']);
});

test('figures descriptor provides enabled bool control at the top', () => {
  const params = fillerRender.paramsOf('figures');
  assert.ok(params.length > 0);
  assert.equal(params[0].key, 'enabled');
  assert.equal(params[0].kind, 'bool');
  assert.equal(params[0].default, true);
});

test('figures.drawList and fillerRender.drawList drop disabled figure clips', () => {
  const spec = figures.generate({ span: { start: 0, end: 4 }, motif: 'orbit', seed: 42, id: 'f1' });
  const ctx = {
    time: 2,
    frame: { width: 1920, height: 1080 },
    clip: { key: 'f1', start: 0, end: 4 },
    seed: 42,
    colors: ['#ffffff'],
    beats: [{ start: 0, end: 4 }],
  };

  const normal = figures.drawList(spec, ctx);
  assert.ok(normal.shapes.length > 0);

  const disabledSpec = { ...spec, params: { ...spec.params, disabled: true } };
  const disabledDraw = figures.drawList(disabledSpec, ctx);
  assert.deepEqual(disabledDraw, { shapes: [], texts: [] });

  const fillerNormal = fillerRender.drawList({ type: 'figures', params: spec.params }, ctx);
  assert.ok(fillerNormal.shapes.length > 0);

  const fillerDisabled = fillerRender.drawList({ type: 'figures', params: { ...spec.params, enabled: false } }, ctx);
  assert.deepEqual(fillerDisabled, { shapes: [], texts: [] });
});
