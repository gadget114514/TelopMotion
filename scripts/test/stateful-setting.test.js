'use strict';

// Stateful figures (the GPU simulations) are off by default: never drawn at
// random, never offered in the inspector, and a clip that carries one draws
// nothing. Turning the setting on brings them back.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const figures = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'figures.js'));
const fillerRender = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'filler-render.js'));

const SPAN = { start: 2, end: 14 };
const BEATS = [{ start: 2, end: 8 }, { start: 8, end: 14 }];
const COLORS = ['#ff4d6d', '#ffd166', '#06d6a0', '#118ab2', '#c77dff'];

const draw = (spec, time) => figures.drawList(spec, { time, frame: { width: 1920, height: 1080 }, clip: { key: 'c', start: 2, end: 14 }, seed: 7, colors: COLORS, beats: BEATS });

test('the stateful setting is off by default', () => {
  assert.equal(figures.isStatefulAllowed(), false);
  assert.ok(figures.SIM_MOTIFS.size >= 4);
});

test('with the setting off no random draw is a simulation', () => {
  figures.setStatefulAllowed(false);
  const picked = new Set();
  for (let seed = 1; seed <= 1500; seed += 1) {
    picked.add(figures.generate({ span: SPAN, beats: BEATS, seed, id: `off_${seed}`, axes: { weird: 1, energy: 0.5 } }).params.motif);
  }
  for (const motif of figures.SIM_MOTIFS) assert.ok(!picked.has(motif), `${motif} was drawn with the setting off`);
  assert.ok(picked.size > 20, `only ${picked.size} motifs are still drawn`);
});

test('with the setting off a clip that carries a simulation draws nothing, and the clip is kept', () => {
  figures.setStatefulAllowed(true);
  const motif = Array.from(figures.SIM_MOTIFS)[0];
  const spec = figures.generate({ span: SPAN, beats: BEATS, motif, seed: 5, id: 'keep', axes: { weird: 1, energy: 0.5 } });
  assert.ok(draw(spec, 5).field, 'the simulation does not draw with the setting on');
  figures.setStatefulAllowed(false);
  const list = draw(spec, 5);
  assert.equal(list.field, undefined);
  assert.equal(list.shapes.length, 0);
  // the saved clip is untouched, so turning the setting back on restores it
  assert.equal(spec.params.motif, motif);
  figures.setStatefulAllowed(true);
  assert.ok(draw(spec, 5).field);
  figures.setStatefulAllowed(false);
});

test('the inspector offers the simulations only while the setting is on', () => {
  const options = () => fillerRender.paramsOf('figures').find((param) => param.key === 'motif').options;
  figures.setStatefulAllowed(false);
  for (const motif of figures.SIM_MOTIFS) assert.ok(!options().includes(motif), `${motif} is offered with the setting off`);
  assert.ok(options().includes('fractal'), 'the stateless fields stay offered');
  figures.setStatefulAllowed(true);
  for (const motif of figures.SIM_MOTIFS) assert.ok(options().includes(motif), `${motif} is missing with the setting on`);
  figures.setStatefulAllowed(false);
});

test('the setting is wired into the menu and the app', () => {
  const fs = require('node:fs');
  const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
  assert.match(read('renderer/js/studio/menu.js'), /studio\.settings\.stateful/);
  assert.match(read('renderer/js/studio/app.js'), /toggleStateful/);
  assert.match(read('renderer/js/studio/app.js'), /sa\.stateful/);
  const i18n = read('renderer/js/i18n.js');
  assert.equal((i18n.match(/stateful: '/g) || []).length, 5, 'one label per language');
});
