'use strict';

// The objfx showcase: a title cue plus variant cues per motion-reactive hold
// type. Every cue must survive the migration and keep its label, beats,
// plate and style.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const project = require(path.join(ROOT, 'renderer', 'js', 'studio', 'project.js'));
const showcase = require(path.join(ROOT, 'scripts', 'objfx-showcase.js'));

let cached = null;
function built() {
  if (!cached) cached = showcase.buildShowcase();
  return cached;
}

function outPath() {
  return path.join(ROOT, 'renderer', 'data', 'objfx-showcase.json');
}

function mdPath() {
  return path.join(ROOT, 'demo', 'objfx-showcase.md');
}

test('one title cue plus variant cues per type', () => {
  const b = built();
  const migrated = project.migrate(JSON.parse(JSON.stringify(b.project)));
  assert.equal(migrated.ok, true, migrated.error);
  assert.equal(migrated.project.script.cues.length, b.entries.length);
  assert.equal(b.entries.length, 1 + showcase.TYPES.reduce((sum, type) => sum + showcase.plan().filter((slot) => slot.section === type).length, 0));
  for (const type of showcase.TYPES) {
    assert.ok(b.entries.filter((entry) => entry.section === type).length >= 2, `${type} cues`);
  }
});

test('cue spans follow the showcase seconds', () => {
  const b = built();
  const cueById = new Map(b.project.script.cues.map((cue) => [cue.id, cue]));
  for (const entry of b.entries) {
    const cue = cueById.get(entry.cueId);
    assert.ok(cue, `cue ${entry.cueId} missing`);
    const want = entry.section === 'intro' ? showcase.INTRO_SECONDS : showcase.CUE_SECONDS;
    assert.equal(cue.end - cue.start, want, `${entry.cueId} span`);
    if (entry.section !== 'intro') {
      assert.ok(String(cue.text).includes(entry.type), `${entry.cueId} label must name ${entry.type}`);
    }
    assert.equal(cue.meta.kind, 'objfx-showcase');
    assert.equal(cue.meta.section, entry.section);
  }
});

test('review cues carry the type in the hold stack over a drift', () => {
  const b = built();
  for (const entry of b.entries.filter((item) => item.section !== 'intro')) {
    const style = b.project.cueStyles[entry.cueId];
    assert.ok(style, `cue ${entry.cueId} style missing`);
    const holds = Array.isArray(style.hold) ? style.hold : [];
    assert.ok(holds.some((hold) => hold && hold.type === 'drift'), `${entry.cueId} has no drift base`);
    assert.ok(holds.some((hold) => hold && hold.type === entry.type), `${entry.cueId} hold is not ${entry.type}`);
  }
});

test('every cue is two pinned beats with a plain title beat', () => {
  const b = built();
  for (const entry of b.entries) {
    const beats = b.project.beats[entry.cueId];
    assert.ok(Array.isArray(beats) && beats.length === 2, `${entry.cueId} beats`);
    for (const beat of beats) assert.equal(beat.pinned, true, `${beat.id} pinned`);
    assert.equal(beats[0].text, entry.title, `${entry.cueId} title text`);
    assert.equal(beats[1].text, entry.body, `${entry.cueId} body text`);
    const titleStyle = b.project.beatStyles[`${entry.cueId}:title`];
    assert.ok(titleStyle, `${entry.cueId} title style missing`);
    assert.equal(titleStyle.location && titleStyle.location.type, 'upperThird', `${entry.cueId} title location`);
    assert.deepEqual(titleStyle.hold, [], `${entry.cueId} title hold must be empty`);
  }
});

test('every section plays against its own plate', () => {
  const b = built();
  const cueById = new Map(b.project.script.cues.map((cue) => [cue.id, cue]));
  for (const entry of b.entries) {
    const cue = cueById.get(entry.cueId);
    const cover = (b.project.clips || []).filter(
      (clip) => clip.trackId === 'bg' && clip.start <= cue.start + 1e-4 && clip.end >= cue.end - 1e-4
    );
    assert.ok(cover.length >= 1, `cue ${entry.cueId} has no background plate`);
  }
  const plates = (b.project.clips || []).filter((clip) => String(clip.id).startsWith('clip_ox_'));
  assert.equal(plates.length, b.sections.length, `plates ${plates.length} vs sections ${b.sections.length}`);
});

test('every section opens a marker and is listed once', () => {
  const b = built();
  assert.equal(b.markers.length, b.sections.length);
  assert.deepEqual(
    b.markers.map((marker) => marker.label),
    b.sections.map((section) => section.label)
  );
});

test('the --sections filter keeps only the named sections', () => {
  const b = showcase.buildShowcase({ sections: ['motionEcho'] });
  assert.ok(b.entries.length >= 2);
  for (const entry of b.entries) assert.equal(entry.section, 'motionEcho');
  assert.equal(b.markers.length, 1);
});

test('the built showcase matches the committed files (deterministic build)', () => {
  const b = built();
  assert.equal(fs.readFileSync(outPath(), 'utf8'), showcase.serialize(b.project));
  assert.equal(fs.readFileSync(mdPath(), 'utf8'), showcase.indexMarkdown(b));
});

test('the Help menu offers the objfx showcase in all five languages', () => {
  const menu = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'menu.js'), 'utf8');
  assert.match(menu, /key: 'studio\.help\.objfxShowcase', action: 'objfxShowcase'/);
  const app = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'app.js'), 'utf8');
  assert.match(app, /objfxShowcase: objfxShowcaseProject/);
  assert.match(app, /openShowcaseAsset\('data\/objfx-showcase\.json'\)/);

  globalThis.window = globalThis;
  globalThis.SA = globalThis.SA || {};
  require(path.join(ROOT, 'renderer', 'js', 'i18n.js'));
  const i18n = globalThis.SA.i18n;
  for (const code of ['en', 'ja', 'es', 'fr', 'ru']) {
    i18n.set(code);
    const label = i18n.t('studio.help.objfxShowcase');
    assert.ok(typeof label === 'string' && label.trim().length > 0, `${code} label`);
    assert.notEqual(label, 'studio.help.objfxShowcase', `${code} label is missing`);
  }
});
