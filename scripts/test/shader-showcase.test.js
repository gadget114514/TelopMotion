'use strict';

// The shader showcase: a title cue plus four cues per shader-break family
// (full arc, enter, hold, exit). Every cue must survive the migration and
// keep its label, beats, plate and style.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const project = require(path.join(ROOT, 'renderer', 'js', 'studio', 'project.js'));
const showcase = require(path.join(ROOT, 'scripts', 'shader-showcase.js'));

let cached = null;
function built() {
  if (!cached) cached = showcase.buildShowcase();
  return cached;
}

function outPath() {
  return path.join(ROOT, 'renderer', 'data', 'shader-showcase.json');
}

function mdPath() {
  return path.join(ROOT, 'demo', 'shader-showcase.md');
}

test('one title cue plus four cues per family', () => {
  const b = built();
  const migrated = project.migrate(JSON.parse(JSON.stringify(b.project)));
  assert.equal(migrated.ok, true, migrated.error);
  assert.equal(migrated.project.script.cues.length, b.entries.length);
  assert.equal(b.entries.length, 1 + showcase.FAMILIES.length * 4);
  for (const type of showcase.FAMILIES) {
    assert.equal(b.entries.filter((entry) => entry.section === type).length, 4, `${type} cues`);
  }
});

test('cue spans follow the phase seconds', () => {
  const b = built();
  const cueById = new Map(b.project.script.cues.map((cue) => [cue.id, cue]));
  for (const entry of b.entries) {
    const cue = cueById.get(entry.cueId);
    assert.ok(cue, `cue ${entry.cueId} missing`);
    const want = entry.section === 'intro' ? showcase.INTRO_SECONDS : showcase.PHASE_SECONDS[entry.phase];
    assert.equal(cue.end - cue.start, want, `${entry.cueId} span`);
    if (entry.section !== 'intro') {
      assert.ok(String(cue.text).includes(entry.type), `${entry.cueId} label must name ${entry.type}`);
    }
    assert.equal(cue.meta.kind, 'shader-showcase');
    assert.equal(cue.meta.section, entry.section);
    assert.equal(cue.meta.phase, entry.phase);
  }
});

test('full cues carry the family in enter, hold and exit', () => {
  const b = built();
  for (const entry of b.entries.filter((item) => item.phase === 'full')) {
    const style = b.project.cueStyles[entry.cueId];
    assert.ok(style, `cue ${entry.cueId} style missing`);
    assert.equal(style.enter && style.enter.type, entry.type, `${entry.cueId} enter`);
    assert.equal(style.exit && style.exit.type, entry.type, `${entry.cueId} exit`);
    assert.ok(Array.isArray(style.hold) && style.hold.length === 1, `${entry.cueId} hold`);
    assert.equal(style.hold[0].type, entry.type, `${entry.cueId} hold type`);
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

test('every family section plays against its own plate', () => {
  const b = built();
  const cueById = new Map(b.project.script.cues.map((cue) => [cue.id, cue]));
  for (const entry of b.entries) {
    const cue = cueById.get(entry.cueId);
    const cover = (b.project.clips || []).filter(
      (clip) => clip.trackId === 'bg' && clip.start <= cue.start + 1e-4 && clip.end >= cue.end - 1e-4
    );
    assert.ok(cover.length >= 1, `cue ${entry.cueId} has no background plate`);
  }
  const plates = (b.project.clips || []).filter((clip) => String(clip.id).startsWith('clip_sh_'));
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
  const b = showcase.buildShowcase({ sections: ['windBreak'] });
  assert.equal(b.entries.length, 4);
  for (const entry of b.entries) assert.equal(entry.section, 'windBreak');
  assert.equal(b.markers.length, 1);
});

test('the built showcase matches the committed files (deterministic build)', () => {
  const b = built();
  assert.equal(fs.readFileSync(outPath(), 'utf8'), showcase.serialize(b.project));
  assert.equal(fs.readFileSync(mdPath(), 'utf8'), showcase.indexMarkdown(b));
});

test('the Help menu offers the shader showcase in all five languages', () => {
  const menu = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'menu.js'), 'utf8');
  assert.match(menu, /key: 'studio\.help\.shaderShowcase', action: 'shaderShowcase'/);
  const app = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'app.js'), 'utf8');
  assert.match(app, /shaderShowcase: shaderShowcaseProject/);
  assert.match(app, /openShowcaseAsset\('data\/shader-showcase\.json'\)/);

  globalThis.window = globalThis;
  globalThis.SA = globalThis.SA || {};
  require(path.join(ROOT, 'renderer', 'js', 'i18n.js'));
  const i18n = globalThis.SA.i18n;
  for (const code of ['en', 'ja', 'es', 'fr', 'ru']) {
    i18n.set(code);
    const label = i18n.t('studio.help.shaderShowcase');
    assert.ok(typeof label === 'string' && label.trim().length > 0, `${code} label`);
    assert.notEqual(label, 'studio.help.shaderShowcase', `${code} label is missing`);
  }
});
