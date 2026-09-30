'use strict';

// P-E: the subtitle background can be hidden per track (data) and per view
// (display only), and the background range is capped. The engine cannot run
// without WebGL here, so the pure decision helper plus the wiring is pinned.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
globalThis.window = globalThis;
globalThis.SA = globalThis.SA || {};
require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'engine.js'));
const project = require(path.join(ROOT, 'renderer', 'js', 'studio', 'project.js'));

test('subtitleBackgroundOn reads the track flag and the view override', () => {
  const engine = globalThis.SA.lyricsEngine;
  assert.equal(engine.subtitleBackgroundOn({ bgHidden: true }, {}), false);
  assert.equal(engine.subtitleBackgroundOn({ bgHidden: false }, {}), true);
  assert.equal(engine.subtitleBackgroundOn({}, {}), true);
  assert.equal(engine.subtitleBackgroundOn({}, { subtitleBackgrounds: false }), false);
  assert.equal(engine.subtitleBackgroundOn({ bgHidden: true }, { subtitleBackgrounds: true }), false);
  assert.equal(engine.subtitleBackgroundOn(null, null), true);
});

test('the engine renders the subtitle background conditionally and supports subtitleOnly', () => {
  const source = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'lyrics', 'engine.js'), 'utf8');
  assert.ok(source.includes('bgHiddenTracks'), 'the bgHidden set is missing');
  assert.ok(source.includes('subtitleBackgroundOn'), 'the decision helper is unused');
  assert.ok(source.includes('view.subtitleOnly'), 'subtitleOnly is not honoured');
  assert.ok(source.includes('bgHiddenTracks.has(active.trackId)'));
  assert.ok(source.includes('setView'), 'setView is not exported');
  assert.ok(source.includes('capBackground'), 'the engine does not cap the ornament range');
});

test('the background switch only silences the definition background, not the ornaments', () => {
  const source = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'lyrics', 'engine.js'), 'utf8');
  // two passes: the ornaments under the background, both behind the glyphs
  const ornAt = source.indexOf("drawBackgroundPass(active, t, project, 'orn')");
  const bgAt = source.indexOf("drawBackgroundPass(active, t, project, 'bg')");
  assert.ok(ornAt >= 0, 'the ornament pass is missing');
  assert.ok(bgAt > ornAt, 'the background pass must draw after the ornaments');
  // the off switch and the view toggle gate the background pass only; the
  // ornament call sits before the `bgActive` check
  assert.ok(ornAt < source.indexOf('if (bgActive)'), 'the ornament pass is inside the background switch');
  assert.ok(source.includes("roleRef(7, 3, paletteColors)"), 'the background does not read the TEXT_BG role');
  assert.ok(source.includes("roleRef(6, 4, paletteColors)"), 'the background does not read the TEXT_EDGE role');
});

test('migrate normalises bgHidden to a boolean and keeps it absent by default', () => {
  const doc = project.defaults({});
  doc.tracks = [
    { id: 'sub1', kind: 'subtitle', name: '字幕1', bgHidden: 1 },
    { id: 'sub2', kind: 'subtitle', name: '字幕2' },
    { id: 'mid', kind: 'backdrop', name: '後景' },
  ];
  const migrated = project.migrate(doc);
  assert.equal(migrated.ok, true);
  assert.equal(migrated.project.tracks.find((track) => track.id === 'sub1').bgHidden, true);
  assert.equal(migrated.project.tracks.find((track) => track.id === 'sub2').bgHidden, undefined);
});

test('the studio wires the background row switch, the inspector checkbox and the view menu', () => {
  const timeline = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'timeline.js'), 'utf8');
  // the subtitle track carries its own text-background row whose checkbox is
  // the off switch (`bgHidden`)
  assert.ok(timeline.includes("'bg-track'"), 'the background row is missing');
  assert.ok(timeline.includes("checkType: 'track-bg'"), 'the background checkbox is missing');
  assert.ok(timeline.includes('backgroundSpans'), 'the background spans are missing');
  assert.ok(timeline.includes('{ bgHidden: !track.bgHidden }'), 'the switch does not flip bgHidden');
  const inspector = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'inspector.js'), 'utf8');
  assert.ok(inspector.includes('bgTrackVisible'));
  const menu = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'menu.js'), 'utf8');
  assert.ok(menu.includes('toggleSubtitleBackgrounds'));
  assert.ok(menu.includes('toggleSubtitleOnly'));
  const preview = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'preview.js'), 'utf8');
  assert.ok(preview.includes('setView'));
  const i18n = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'i18n.js'), 'utf8');
  for (const key of ['textBackground', 'bgTrackVisible', 'hideBackground', 'showBackground', 'subtitleBackgrounds', 'subtitleOnly']) {
    assert.ok(i18n.includes(key), `${key} missing from i18n`);
  }
  // the display-only view options never reach the saved project
  const store = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'store.js'), 'utf8');
  assert.ok(store.includes('setSubtitleBackgroundsHidden'));
});
