'use strict';

// The motion showcase: all 424 gallery presets must reach the 16 sequential
// parts, survive the migration with their single custom motion, match the
// committed files byte for byte, and open from Help in all five languages
// (16 parts plus the interruptible play-all run).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const project = require(path.join(ROOT, 'renderer', 'js', 'studio', 'project.js'));
const showcase = require(path.join(ROOT, 'scripts', 'motion-showcase.js'));

let cached = null;
function built() {
  if (!cached) cached = showcase.buildShowcase();
  return cached;
}

function motionPresets() {
  return require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'motion.js')).motionPresets();
}

test('the 424 presets split into 16 parts of 26–27 cues', () => {
  const b = built();
  assert.equal(b.slots.length, 424);
  assert.equal(b.parts.length, 16);
  assert.deepEqual(
    b.parts.map((part) => part.entries.length),
    [27, 27, 27, 27, 27, 27, 27, 27, 26, 26, 26, 26, 26, 26, 26, 26]
  );
  for (const part of b.parts) {
    assert.equal(part.total, part.entries.length * showcase.MOTION_SECONDS);
  }
});

test('every preset gets exactly one cue with its own custom motion', () => {
  const b = built();
  const seen = new Map();
  for (const part of b.parts) {
    const migrated = project.migrate(JSON.parse(JSON.stringify(part.project)));
    assert.equal(migrated.ok, true, `part ${part.part}: ${migrated.error}`);
    assert.equal(migrated.project.script.cues.length, part.entries.length);
    assert.equal(Object.keys(migrated.project.cueStyles || {}).length, part.entries.length);
    for (const entry of part.entries) {
      assert.ok(!seen.has(entry.presetId), `duplicate preset ${entry.presetId}`);
      seen.set(entry.presetId, entry);
      const style = part.project.cueStyles[entry.cueId];
      assert.ok(style, `missing cue style for ${entry.cueId}`);
      assert.equal(Array.isArray(style.motions) && style.motions.length, 1, `${entry.cueId} carries one motion`);
      assert.equal(style.motions[0].type, entry.type);
      assert.equal(style.motions[0].phase, entry.phase);
    }
  }
  assert.equal(seen.size, motionPresets().length);
  for (const preset of motionPresets()) {
    assert.ok(seen.has(preset.id), `preset ${preset.id} has no cue`);
  }
});

test('the built parts match the committed files (deterministic build)', () => {
  const b = built();
  for (const part of b.parts) {
    const file = path.join(ROOT, 'renderer', 'data', `motion-showcase-${part.part}.json`);
    assert.equal(fs.readFileSync(file, 'utf8'), showcase.serialize(part.project), `part ${part.part}`);
  }
  assert.equal(
    fs.readFileSync(path.join(ROOT, 'demo', 'motion-showcase.md'), 'utf8'),
    showcase.indexMarkdown(b)
  );
});

test('the Help submenu offers the 16 parts and the play-all run in all five languages', () => {
  const menu = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'menu.js'), 'utf8');
  assert.match(menu, /key: 'studio\.help\.motionShowcase', items: /);
  assert.match(menu, /key: 'studio\.help\.motionShowcaseAll', action: 'motionShowcaseAll'/);
  for (let at = 1; at <= 16; at += 1) {
    const part = String(at).padStart(2, '0');
    assert.ok(menu.includes(`action: 'motionShowcase', args: ['${part}']`), `part ${part} leaf`);
  }
  const app = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'app.js'), 'utf8');
  assert.match(app, /motionShowcase: motionShowcaseProject/);
  assert.match(app, /motionShowcaseAll: motionShowcaseAllProject/);
  assert.match(app, /data\/motion-showcase-\$\{/);
  // the play-all run restores the loop mode, pauses on teardown and can be
  // stopped from its dialog, with Escape, or by taking over the transport
  assert.match(app, /motionShowcaseAllProject/);
  assert.match(app, /setLoop\(wasLoop\)/);
  assert.match(app, /motionAutoStop = true/);

  globalThis.window = globalThis;
  globalThis.SA = globalThis.SA || {};
  require(path.join(ROOT, 'renderer', 'js', 'i18n.js'));
  const i18n = globalThis.SA.i18n;
  for (const code of ['en', 'ja', 'es', 'fr', 'ru']) {
    i18n.set(code);
    for (const key of [
      'studio.help.motionShowcase',
      'studio.help.motionShowcaseAll',
      'studio.motionShowcase.autoTitle',
      'studio.motionShowcase.stop',
    ]) {
      const label = i18n.t(key);
      assert.ok(typeof label === 'string' && label.trim().length > 0, `${code} ${key}`);
      assert.notEqual(label, key, `${code} ${key} is missing`);
    }
  }
});
