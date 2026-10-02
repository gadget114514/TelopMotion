'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const FX_DIR = path.join(ROOT, 'renderer/js/lyrics/effects');
const fx = require(path.join(FX_DIR, 'registry.js'));
require(path.join(FX_DIR, 'enter.js'));
require(path.join(FX_DIR, 'exit.js'));
require(path.join(FX_DIR, 'hold.js'));
require(path.join(FX_DIR, 'animation.js'));
require(path.join(FX_DIR, 'layout.js'));
require(path.join(FX_DIR, 'location.js'));

const textEffectsData = require(path.join(ROOT, 'renderer/js/lyrics/text-effects-data.js'));
const motion = require(path.join(ROOT, 'renderer/js/lyrics/motion.js'));

test('textEffectsData contains all 376 effects from CSV', () => {
  const list = textEffectsData.list();
  assert.equal(list.length, 376);

  const first = list[0];
  assert.equal(first.nameEn, 'Fade In');
  assert.equal(first.nameJa, 'フェードイン');
  assert.equal(first.categoryEn, 'Entrance');
  assert.equal(first.categoryJa, '出現');
  assert.equal(first.phase, 'enter');
  assert.equal(first.type, 'fade');

  for (const item of list) {
    assert.ok(item.nameEn, 'Missing nameEn');
    assert.ok(item.nameJa, 'Missing nameJa');
    assert.ok(item.descEn, 'Missing descEn');
    assert.ok(item.descJa, 'Missing descJa');
    assert.ok(item.categoryEn, 'Missing categoryEn');
    assert.ok(item.categoryJa, 'Missing categoryJa');
    assert.ok(['entrance', 'emphasis', 'exit'].includes(item.group), `Invalid group: ${item.group}`);
    assert.ok(['enter', 'hold', 'exit'].includes(item.phase), `Invalid phase: ${item.phase}`);
    assert.ok(fx.get(item.phase, item.type), `Unregistered fx: ${item.phase}.${item.type}`);
    assert.ok(item.duration > 0, 'Invalid duration');
  }
});

test('motion.motionPresets integrates textEffectsData', () => {
  const presets = motion.motionPresets();
  assert.ok(presets.length >= 376);

  const found = presets.find((p) => p.nameEn === 'Fade In' && p.nameJa === 'フェードイン');
  assert.ok(found, 'Integrated Fade In preset not found');
  assert.equal(found.phase, 'enter');
  assert.equal(found.type, 'fade');
});

test('searching by effect name and effect description works', () => {
  const presets = motion.motionPresets();

  // Search by English name
  const queryNameEn = 'bounce in';
  const matchNameEn = presets.filter((p) =>
    [p.nameJa, p.nameEn, p.descJa, p.descEn].filter(Boolean).join(' ').toLowerCase().includes(queryNameEn)
  );
  assert.ok(matchNameEn.length > 0);
  assert.ok(matchNameEn.some((p) => p.nameEn === 'Bounce In'));

  // Search by Japanese name
  const queryNameJa = 'バウンスイン';
  const matchNameJa = presets.filter((p) =>
    [p.nameJa, p.nameEn, p.descJa, p.descEn].filter(Boolean).join(' ').toLowerCase().includes(queryNameJa)
  );
  assert.ok(matchNameJa.length > 0);
  assert.ok(matchNameJa.some((p) => p.nameJa === 'バウンスイン'));

  // Search by English description keyword
  const queryDescEn = 'transparent to opaque';
  const matchDescEn = presets.filter((p) =>
    [p.nameJa, p.nameEn, p.descJa, p.descEn].filter(Boolean).join(' ').toLowerCase().includes(queryDescEn)
  );
  assert.ok(matchDescEn.length > 0);
  assert.ok(matchDescEn.some((p) => p.nameEn === 'Fade In'));

  // Search by Japanese description keyword
  const queryDescJa = '徐々に不透明';
  const matchDescJa = presets.filter((p) =>
    [p.nameJa, p.nameEn, p.descJa, p.descEn].filter(Boolean).join(' ').toLowerCase().includes(queryDescJa)
  );
  assert.ok(matchDescJa.length > 0);
  assert.ok(matchDescJa.some((p) => p.nameJa === 'フェードイン'));
});
