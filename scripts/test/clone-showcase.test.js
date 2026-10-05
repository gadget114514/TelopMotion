'use strict';

// The clone showcase: the same string three times in parallel, one clone axis
// per cue. Every cue must carry three clones, survive the migration and keep
// its label.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const project = require(path.join(ROOT, 'renderer', 'js', 'studio', 'project.js'));
const showcase = require(path.join(ROOT, 'scripts', 'clone-showcase.js'));

let cached = null;
function built() {
  if (!cached) cached = showcase.buildShowcase();
  return cached;
}

function outPath() {
  return path.join(ROOT, 'renderer', 'data', 'clone-showcase.json');
}

function mdPath() {
  return path.join(ROOT, 'demo', 'clone-showcase.md');
}

test('the generated showcase migrates and keeps every cue', () => {
  const b = built();
  const migrated = project.migrate(JSON.parse(JSON.stringify(b.project)));
  assert.equal(migrated.ok, true, migrated.error);
  assert.equal(migrated.project.script.cues.length, b.entries.length);
  assert.equal(b.entries.filter((entry) => entry.section === 'offset').length, 2);
  assert.equal(b.entries.filter((entry) => entry.section === 'motion').length, showcase.MOTIONS.length);
  for (const section of ['scale', 'rotate', 'opacity', 'hue', 'delay']) {
    assert.equal(b.entries.filter((entry) => entry.section === section).length, 1, `${section} has no cue`);
  }
  assert.equal(b.entries.length, 13);
});

test('every cue draws the string three times in parallel', () => {
  const b = built();
  const cueById = new Map(b.project.script.cues.map((cue) => [cue.id, cue]));
  for (const entry of b.entries) {
    const cue = cueById.get(entry.cueId);
    assert.ok(cue, `cue ${entry.cueId} missing`);
    assert.equal(cue.end - cue.start, showcase.CLONE_SECONDS, `${entry.cueId} span`);
    assert.ok(String(cue.text).includes(entry.value), `${entry.cueId} label must name ${entry.value}`);
    assert.equal(cue.meta.kind, 'clone-showcase');
    assert.equal(cue.meta.section, entry.section);
    assert.equal(cue.meta.value, entry.value);
    const clones = b.project.cueStyles[entry.cueId] && b.project.cueStyles[entry.cueId].clones;
    assert.ok(Array.isArray(clones) && clones.length === 3, `cue ${entry.cueId} must carry three clones`);
    // the trio spreads across the frame so the copies read as parallel strings
    assert.deepEqual(clones.map((clone) => clone.dx), showcase.SPREAD, `cue ${entry.cueId} spread`);
    for (const clone of clones) {
      assert.equal(typeof clone.opacity, 'number', `cue ${entry.cueId} opacity`);
      assert.ok(clone.motion && typeof clone.motion.type === 'string', `cue ${entry.cueId} motion shape`);
    }
  }
});

test('each section varies only its own axis', () => {
  const b = built();
  const clonesOf = (section, value) => {
    const entry = b.entries.find((entry) => entry.section === section && (value == null || entry.value === value));
    return b.project.cueStyles[entry.cueId].clones;
  };
  assert.deepEqual(clonesOf('scale').map((clone) => clone.scale), [0.75, 1, 1.25]);
  assert.deepEqual(clonesOf('rotate').map((clone) => clone.rotate), [-10, 0, 10]);
  assert.deepEqual(clonesOf('opacity').map((clone) => clone.opacity), [0.25, 0.5, 0.8]);
  assert.deepEqual(clonesOf('hue').map((clone) => clone.hue), [-70, 0, 70]);
  assert.deepEqual(clonesOf('delay').map((clone) => clone.delay), [0, 0.25, 0.5]);
  // off-axis params stay neutral so neighbouring cues differ only in the axis
  for (const clone of clonesOf('scale')) assert.equal(clone.rotate, 0, 'scale cue must not rotate');
  for (const clone of clonesOf('rotate')) assert.equal(clone.scale, 1, 'rotate cue must not scale');
  // the motion cues pin one motion type on all three copies
  assert.deepEqual(
    b.entries.filter((entry) => entry.section === 'motion').map((entry) => entry.value),
    showcase.MOTIONS
  );
  for (const entry of b.entries.filter((entry) => entry.section === 'motion')) {
    const clones = b.project.cueStyles[entry.cueId].clones;
    for (const clone of clones) assert.equal(clone.motion.type, entry.value, `cue ${entry.cueId} motion`);
  }
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
  const b = showcase.buildShowcase({ sections: ['motion'] });
  assert.equal(b.entries.length, showcase.MOTIONS.length);
  for (const entry of b.entries) assert.equal(entry.section, 'motion');
  assert.equal(b.markers.length, 1);
});

test('the built showcase matches the committed files (deterministic build)', () => {
  const b = built();
  assert.equal(fs.readFileSync(outPath(), 'utf8'), showcase.serialize(b.project));
  assert.equal(fs.readFileSync(mdPath(), 'utf8'), showcase.indexMarkdown(b));
});

test('the Help menu offers the clone showcase in all five languages', () => {
  const menu = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'menu.js'), 'utf8');
  assert.match(menu, /key: 'studio\.help\.cloneShowcase', action: 'cloneShowcase'/);
  const app = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'app.js'), 'utf8');
  assert.match(app, /cloneShowcase: cloneShowcaseProject/);
  assert.match(app, /openShowcaseAsset\('data\/clone-showcase\.json'\)/);

  globalThis.window = globalThis;
  globalThis.SA = globalThis.SA || {};
  require(path.join(ROOT, 'renderer', 'js', 'i18n.js'));
  const i18n = globalThis.SA.i18n;
  for (const code of ['en', 'ja', 'es', 'fr', 'ru']) {
    i18n.set(code);
    const label = i18n.t('studio.help.cloneShowcase');
    assert.ok(typeof label === 'string' && label.trim().length > 0, `${code} label`);
    assert.notEqual(label, 'studio.help.cloneShowcase', `${code} label is missing`);
  }
});
