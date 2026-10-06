'use strict';

// The subtitle track's text foreground graphics sit on their own row: the
// track's fgHidden flag (data) drops the text-attached extras (ornaments,
// page decor, edges, repeats, clones, strike, scoped decor, text-target
// posts, motion trails, the typewriter cursor) while the base glyphs (solid
// fill) stay. The style data is never touched. The engine cannot run without
// WebGL here, so the pure decision helper plus the wiring are pinned.

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

test('subtitleForegroundOn reads the track flag', () => {
  const engine = globalThis.SA.lyricsEngine;
  assert.equal(typeof engine.subtitleForegroundOn, 'function');
  assert.equal(engine.subtitleForegroundOn({ fgHidden: true }, {}), false);
  assert.equal(engine.subtitleForegroundOn({ fgHidden: false }, {}), true);
  assert.equal(engine.subtitleForegroundOn({}, {}), true);
  assert.equal(engine.subtitleForegroundOn(null, null), true);
});

test('migrate normalises fgHidden to a boolean and keeps it absent by default', () => {
  const doc = project.defaults({});
  doc.tracks = [
    { id: 'sub1', kind: 'subtitle', name: '字幕1', fgHidden: 1 },
    { id: 'sub2', kind: 'subtitle', name: '字幕2' },
    { id: 'mid', kind: 'backdrop', name: '後景' },
  ];
  const migrated = project.migrate(doc);
  assert.equal(migrated.ok, true);
  assert.equal(migrated.project.tracks.find((track) => track.id === 'sub1').fgHidden, true);
  assert.equal(migrated.project.tracks.find((track) => track.id === 'sub2').fgHidden, undefined);
});

test('the engine gates the foreground extras on fgOn and keeps the base glyphs', () => {
  const engine = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'lyrics', 'engine.js'), 'utf8');
  assert.ok(engine.includes('fgHiddenTracks'), 'the fgHidden set is missing');
  assert.ok(engine.includes('subtitleForegroundOn'), 'the decision helper is unused');
  assert.ok(engine.includes('fgHiddenTracks.has(active.trackId)'));
  // ornaments and page decor hide with the foreground row, not the background one
  assert.ok(engine.includes('const ornActive = fgOn'), 'the ornament pass is not gated on fgOn');
  assert.ok(engine.includes('if (fgOn) drawPageDecor(active, t)'), 'the page decor is not gated on fgOn');
  // the fill effect falls back to solid so the base text stays readable
  assert.ok(engine.includes("type: 'solid', params: {}, motion: {}, enabled: true"), 'the solid fill fallback is missing');
  // repeats / clones / strike / trails / scoped decor / cursor hide with it
  assert.ok(engine.includes('if (textOn && fgOn)'), 'repeats / clones are not gated on fgOn');
  assert.ok(engine.includes('textOn && fgOn ? buildStrike'), 'strike is not gated on fgOn');
  assert.ok(engine.includes('if (fgOn) drawScopedDecor'), 'scoped decor is not gated on fgOn');
  assert.ok(engine.includes("enterInstance.type === 'typewriter'"), 'the typewriter cursor check is missing');
  // text-target posts hide with the foreground row, frame-wide ones with graphicsOn
  assert.ok(engine.includes('!SA.fx.isGraphicsPost(instance)) continue'), 'text-target posts are not skipped when fg is off');
  // edges resolve to nothing when off (no outline / shadow / glow pass)
  assert.ok(engine.includes('const edges = fgOn'), 'edges are not gated on fgOn');
});

test('the studio wires the foreground row switch, the inspector checkbox and the menu', () => {
  const timeline = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'timeline.js'), 'utf8');
  assert.ok(timeline.includes("'fg-track'"), 'the foreground row is missing');
  assert.ok(timeline.includes("checkType: 'track-fg-check'"), 'the foreground checkbox is missing');
  assert.ok(timeline.includes('foregroundSpans'), 'the foreground spans are missing');
  assert.ok(timeline.includes('{ fgHidden: !track.fgHidden }'), 'the switch does not flip fgHidden');
  assert.ok(timeline.includes('track-fg-check'), 'the hit handling is missing');
  const inspector = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'inspector.js'), 'utf8');
  assert.ok(inspector.includes('fgTrackVisible'), 'fgTrackVisible missing from inspector');
  assert.ok(inspector.includes('FG_GROUPS'), 'FG_GROUPS missing from inspector');
  assert.ok(inspector.includes('fgTrackOff'), 'fgTrackOff missing from inspector');
  assert.ok(inspector.includes('fgPostOff'), 'text-target post dimming is missing');
  const i18n = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'i18n.js'), 'utf8');
  for (const key of ['textForeground', 'fgTrackVisible', 'fgTrackOff', 'hideForeground', 'showForeground']) {
    assert.ok(i18n.includes(key), `${key} missing from i18n`);
  }
});
