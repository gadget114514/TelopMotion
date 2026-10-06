'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
globalThis.window = globalThis;
globalThis.SA = globalThis.SA || {};
require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'engine.js'));
const project = require(path.join(ROOT, 'renderer', 'js', 'studio', 'project.js'));

test('subtitleTextOn reads track.textHidden, view override, and style.text.enabled', () => {
  const engine = globalThis.SA.lyricsEngine;
  assert.equal(engine.subtitleTextOn({ textHidden: true }, {}, {}), false);
  assert.equal(engine.subtitleTextOn({ textHidden: false }, {}, {}), true);
  assert.equal(engine.subtitleTextOn({}, {}, {}), true);
  assert.equal(engine.subtitleTextOn({}, { subtitleText: false }, {}), false);
  assert.equal(engine.subtitleTextOn({ textHidden: true }, { subtitleText: true }, {}), false);
  assert.equal(engine.subtitleTextOn({}, {}, { text: { enabled: false } }), false);
  assert.equal(engine.subtitleTextOn({}, {}, { text: { enabled: true } }), true);
  assert.equal(engine.subtitleTextOn({ textHidden: false }, {}, { text: { enabled: false } }), false);
  assert.equal(engine.subtitleTextOn(null, null, null), true);
});

test('the engine renders subtitle text conditionally and skips glyph passes when off', () => {
  const source = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'lyrics', 'engine.js'), 'utf8');
  assert.ok(source.includes('textHiddenTracks'), 'the textHidden set is missing');
  assert.ok(source.includes('subtitleTextOn'), 'the decision helper is unused');
  assert.ok(source.includes('textActiveBeats'), 'the textActiveBeats filter is missing');
  assert.ok(source.includes('buildFrameTextMask(textActiveBeats'), 'buildFrameTextMask does not use textActiveBeats');
  assert.ok(source.includes('textHiddenTracks.has(active.trackId)'), 'track textHidden check missing in loop');
  // the knockout mask is built even with the text body hidden (Text
  // Foreground off), so the background keeps its glyph-shaped holes
  assert.ok(source.includes('const maskNeeded = textOn || !!variation'), 'the mask is not built when the text is hidden');
  assert.ok(source.includes('if (maskNeeded) {\n          pipeline.text'), 'pipeline.text is not conditioned on maskNeeded');
  assert.ok(source.includes('if (maskNeeded) {\n          pipeline.letterBlur'), 'pipeline.letterBlur is not conditioned on maskNeeded');
  assert.ok(source.includes('if (variation) {\n          pipeline.knockout();'), 'pipeline.knockout does not run with the text hidden');
  assert.ok(source.includes('textOn ? pipeline.sdf() : null'), 'sdfTarget is not conditioned on textOn');
  // edges (outline, shadow, glow ...) paint on and around the glyphs, so
  // they follow Text FG with the text body, not the Graphics switch
  assert.ok(source.includes('const edges = textOn'), 'edges do not follow Text FG');
});

test('migrate normalises textHidden to a boolean and keeps it absent by default', () => {
  const doc = project.defaults({});
  doc.tracks = [
    { id: 'sub1', kind: 'subtitle', name: '字幕1', textHidden: 1 },
    { id: 'sub2', kind: 'subtitle', name: '字幕2' },
    { id: 'mid', kind: 'backdrop', name: '後景' },
  ];
  const migrated = project.migrate(doc);
  assert.equal(migrated.ok, true);
  assert.equal(migrated.project.tracks.find((track) => track.id === 'sub1').textHidden, true);
  assert.equal(migrated.project.tracks.find((track) => track.id === 'sub2').textHidden, undefined);
});

test('the studio wires inspector text visibility, text.enabled row, timeline menu and i18n keys', () => {
  const timeline = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'timeline.js'), 'utf8');
  assert.ok(timeline.includes('track.textHidden ? t(\'studio.track.showText\') : t(\'studio.track.hideText\')'), 'timeline menu toggle missing');
  assert.ok(timeline.includes('row.track.textHidden'), 'timeline cue track does not check textHidden');

  const inspector = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'inspector.js'), 'utf8');
  assert.ok(inspector.includes('textTrackVisible'), 'textTrackVisible missing from inspector');
  assert.ok(inspector.includes('TEXT_GROUPS'), 'TEXT_GROUPS missing from inspector');
  assert.ok(inspector.includes('textTrackOff'), 'textTrackOff missing from inspector');
  assert.ok(inspector.includes('text.enabled'), 'text.enabled row missing from inspector');

  const i18n = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'i18n.js'), 'utf8');
  for (const key of ['textTrackOff', 'textTrackVisible', 'hideText', 'showText']) {
    assert.ok(i18n.includes(key), `${key} missing from i18n`);
  }
});
