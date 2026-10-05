'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const project = require(path.join(ROOT, 'renderer', 'js', 'studio', 'project.js'));
const showcase = require(path.join(ROOT, 'scripts', 'showcase.js'));

let cached = null;
function built() {
  if (!cached) cached = showcase.buildShowcase();
  return cached;
}

function filePath() {
  return path.join(ROOT, 'renderer', 'data', 'showcase.json');
}

test('the generated showcase migrates and keeps every cue', () => {
  const b = built();
  const migrated = project.migrate(JSON.parse(JSON.stringify(b.project)));
  assert.equal(migrated.ok, true, migrated.error);
  assert.equal(migrated.project.script.cues.length, b.project.script.cues.length);
  assert.equal(b.project.script.cues.length, b.effects.length + b.pages.length);
  assert.ok(b.effects.length >= 150, `effects ${b.effects.length}`);
  assert.equal(b.pages.length, 19);
  assert.equal(b.project.script.cues.length, b.effects.length + 19);
});

test('every cue carries a page style or an effect style/clip', () => {
  const b = built();
  const doc = b.project;
  const cueById = new Map(doc.script.cues.map((cue) => [cue.id, cue]));
  for (const { entry, cueId } of b.effects) {
    const cue = cueById.get(cueId);
    assert.ok(cue, `cue ${cueId} missing`);
    if (entry.apply === 'style') {
      const container = doc.cueStyles[cueId];
      assert.ok(container && container[entry.group], `cue ${cueId} lost ${entry.group}`);
      const instance = Array.isArray(container[entry.group]) ? container[entry.group][0] : container[entry.group];
      assert.equal(instance.type, entry.type, `cue ${cueId} ${entry.group}`);
    } else {
      assert.equal(entry.apply, 'clip');
      const start = Math.max(0, cue.start - 0.12);
      const clip = (doc.clips || []).find((item) => item.trackId === 'bg' && Math.abs(item.start - start) < 1e-4);
      assert.ok(clip, `cue ${cueId} has no background clip`);
      assert.equal(clip.spec.type, entry.type);
    }
  }
  for (const { type, cueId } of b.pages) {
    const container = doc.cueStyles[cueId];
    assert.ok(container && container.page, `page cue ${cueId} has no page style`);
    assert.equal(container.page.type, type, `page cue ${cueId} type`);
  }
});

test('every page preset but none is used', () => {
  const b = built();
  const registered = b.pageTypes.slice().sort();
  const used = [...new Set(b.pages.map((page) => page.type))].sort();
  assert.deepEqual(used, registered);
  assert.ok(!used.includes('none'));
  assert.equal(used.length, 19);
});

test('every page cue stays a single beat', () => {
  const b = built();
  for (const { cueId } of b.pages) {
    const beats = b.project.beats[cueId] || [];
    assert.equal(beats.length, 1, `page cue ${cueId} has ${beats.length} beats`);
  }
});

test('the catalogue contributes one variant-1 entry per type', () => {
  const b = built();
  const types = new Set(b.catalog.effects.filter((entry) => entry.variant === 1).map((entry) => `${entry.group}.${entry.type}`));
  // the `repeat` group is not part of the fx400 catalogue; the showcase adds one
  // entry per repeat type of its own
  assert.equal(b.effects.filter(({ entry }) => entry.group !== 'repeat').length, types.size);
  assert.deepEqual(new Set(b.effects.map(({ entry }) => entry.variant)), new Set([1]));
});

test('the --groups filter keeps only the named groups', () => {
  const b = showcase.buildShowcase({ groups: ['post'], pages: false });
  assert.ok(b.effects.length > 0);
  for (const { entry } of b.effects) assert.equal(entry.group, 'post');
  assert.equal(b.pages.length, 0);
});

test('the built showcase matches the committed file (deterministic build)', () => {
  const b = built();
  const text = fs.readFileSync(filePath(), 'utf8');
  assert.equal(text, showcase.serialize(b.project));
});
