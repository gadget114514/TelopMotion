'use strict';

// The ease showcase: every tween curve must reach the generated project,
// every lyric slot that accepts an ease gets its own cue, and the whole walk
// must survive the migration and open from Help in all five languages.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const project = require(path.join(ROOT, 'renderer', 'js', 'studio', 'project.js'));
const showcase = require(path.join(ROOT, 'scripts', 'ease-showcase.js'));
const easing = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'easing.js'));

let cached = null;
function built() {
  if (!cached) cached = showcase.buildShowcase();
  return cached;
}

function outPath() {
  return path.join(ROOT, 'renderer', 'data', 'ease-showcase.json');
}

function mdPath() {
  return path.join(ROOT, 'demo', 'ease-showcase.md');
}

test('the generated showcase migrates and keeps every cue', () => {
  const b = built();
  const migrated = project.migrate(JSON.parse(JSON.stringify(b.project)));
  assert.equal(migrated.ok, true, migrated.error);
  assert.equal(migrated.project.script.cues.length, b.entries.length);
  assert.equal(b.entries.length, 49);
  assert.equal(b.total, 156);
});

test('every named curve gets its own cue on the shared entrance', () => {
  const b = built();
  const patternEntries = b.entries.filter((entry) => entry.section !== 'usecase' && entry.section !== 'parametric');
  assert.deepEqual(
    patternEntries.map((entry) => entry.value).sort(),
    easing.names.slice().sort(),
    'the walk must cover every easing.names entry'
  );
  assert.deepEqual(showcase.PARAMETRIC.length, 6);
  const cueById = new Map(b.project.script.cues.map((cue) => [cue.id, cue]));
  for (const entry of b.entries.filter((entry) => entry.section !== 'usecase')) {
    const cue = cueById.get(entry.cueId);
    assert.ok(cue, `cue ${entry.cueId} missing`);
    assert.ok(String(cue.text).includes(entry.value), `${entry.cueId} label must name ${entry.value}`);
    assert.equal(cue.meta.kind, 'ease-showcase');
    assert.equal(cue.meta.section, entry.section);
    assert.equal(cue.meta.value, entry.value);
    const container = b.project.cueStyles[entry.cueId];
    assert.ok(container && container.enter, `cue ${entry.cueId} has no enter style`);
    assert.equal(container.enter.motion.in.ease, entry.value, `cue ${entry.cueId} entrance ease`);
    assert.equal(container.exit.type, 'fade', `cue ${entry.cueId} exit type`);
  }
});

test('every parametric recipe parses and spans 0 to 1', () => {
  for (const recipe of showcase.PARAMETRIC) {
    const fn = easing.get(recipe);
    assert.equal(typeof fn, 'function', `${recipe} parses`);
    assert.ok(Math.abs(fn(0)) < 1e-6, `${recipe}(0)`);
    assert.ok(Math.abs(fn(1) - 1) < 1e-6, `${recipe}(1)`);
  }
  // the recipes really differ from linear halfway through
  const seen = new Set(showcase.PARAMETRIC.map((recipe) => easing.get(recipe)(0.5).toFixed(4)));
  assert.ok(seen.size >= 3, `parametric recipes look identical: ${[...seen].join(', ')}`);
});

test('every use-case cue pins only its own slot', () => {
  const b = built();
  const cases = b.entries.filter((entry) => entry.section === 'usecase');
  assert.equal(cases.length, showcase.USECASES.length);
  assert.deepEqual(
    cases.map((entry) => entry.usecase),
    showcase.USECASES.map((entry) => entry.id)
  );
  const styleOf = (id) => b.project.cueStyles[cases.find((entry) => entry.usecase === id).cueId];
  assert.equal(styleOf('in').enter.motion.in.ease, 'bounceOut');
  assert.equal(styleOf('out').exit.motion.out.ease, 'backIn');
  assert.equal(styleOf('stagger').animation.params.ease, 'cubicInOut');
  assert.ok(styleOf('stagger').animation.params.each >= 0.08, 'stagger demo needs a readable gap');
  assert.equal(styleOf('loop').animation.type, 'loop');
  assert.equal(styleOf('loop').animation.motion.loop.ease, 'sineInOut');
  assert.equal(styleOf('layout').layout.params.from, 'scatter');
  assert.equal(styleOf('layout').layout.motion.in.ease, 'backOut');
  assert.equal(styleOf('sequence').layout.params.sequence[0].ease, 'elasticOut');
  assert.equal(styleOf('timeWarp').animation.params.ease, 'sineInOut');
  assert.equal(styleOf('adsr').animation.motion.adsr.attackEase, 'bounceOut');
  // the keyframes cue moves the whole block with its own ease
  const keyEntry = cases.find((entry) => entry.usecase === 'keyframes');
  const keys = b.project.keyframes[`cue:${keyEntry.cueId}`]['transform.y'];
  assert.equal(keys.length, 2);
  assert.equal(keys[0].ease, 'bounceOut');
  assert.ok(keys[0].value < 0 && keys[1].value > 0, 'keyframes demo must cross the block');
});

test('every section opens a marker and is listed once', () => {
  const b = built();
  assert.equal(b.markers.length, b.sections.length);
  assert.deepEqual(
    b.markers.map((marker) => marker.label),
    b.sections.map((section) => section.label)
  );
  let lastT = -Infinity;
  for (const marker of b.markers) {
    assert.ok(marker.t >= lastT, `marker ${marker.label} out of order`);
    lastT = marker.t;
  }
});

test('the --sections filter keeps only the named sections', () => {
  const b = showcase.buildShowcase({ sections: ['parametric'] });
  assert.equal(b.entries.length, showcase.PARAMETRIC.length);
  for (const entry of b.entries) assert.equal(entry.section, 'parametric');
  assert.equal(b.markers.length, 1);
});

test('the built showcase matches the committed files (deterministic build)', () => {
  const b = built();
  assert.equal(fs.readFileSync(outPath(), 'utf8'), showcase.serialize(b.project));
  assert.equal(fs.readFileSync(mdPath(), 'utf8'), showcase.indexMarkdown(b));
});

test('the Help menu offers the ease showcase in all five languages', () => {
  const menu = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'menu.js'), 'utf8');
  assert.match(menu, /key: 'studio\.help\.easeShowcase', action: 'easeShowcase'/);
  const app = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'app.js'), 'utf8');
  assert.match(app, /easeShowcase: easeShowcaseProject/);
  assert.match(app, /openShowcaseAsset\('data\/ease-showcase\.json'\)/);

  globalThis.window = globalThis;
  globalThis.SA = globalThis.SA || {};
  require(path.join(ROOT, 'renderer', 'js', 'i18n.js'));
  const i18n = globalThis.SA.i18n;
  for (const code of ['en', 'ja', 'es', 'fr', 'ru']) {
    i18n.set(code);
    const label = i18n.t('studio.help.easeShowcase');
    assert.ok(typeof label === 'string' && label.trim().length > 0, `${code} label`);
    assert.notEqual(label, 'studio.help.easeShowcase', `${code} label is missing`);
  }
});
