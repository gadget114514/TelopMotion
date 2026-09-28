'use strict';

// The sixth axis (`weird`) gates the extended primitives and makes every
// effect's parameters reach for the ends of their ranges; the five classic
// axes keep deciding durations, easing, texture and stacking. The default
// draws must stay byte-identical, so weird = 0 behaves exactly as before.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const FX_DIR = path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects');
const fx = require(path.join(FX_DIR, 'registry.js'));
for (const name of ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'background', 'color', 'text-bg', 'vary', 'repeat', 'warp', 'animator', 'selector', 'camera', 'shape-layer']) {
  require(path.join(FX_DIR, `${name}.js`));
}
const moods = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'moods.js'));
const random = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'random.js'));
const classify = require(path.join(ROOT, 'scripts', 'looks-classify.js'));

test('the sixth axis is declared and defaults to zero', () => {
  assert.deepEqual(moods.AXES, ['speed', 'energy', 'softness', 'density', 'brightness', 'weird']);
  assert.deepEqual(moods.MATCH_AXES, ['speed', 'energy', 'softness', 'density', 'brightness']);
  assert.equal(moods.normalizeAxes({}).weird, 0);
  assert.equal(moods.EXT_REVEAL, 0.5);
});

test('the extended pool opens with the sixth axis and stays closed at zero', () => {
  const plain = { speed: 0.5, energy: 0.5, softness: 0.5, density: 0.5, brightness: 0.5, weird: 0 };
  const weird = { ...plain, weird: 1 };
  for (const group of ['enter', 'exit', 'hold', 'post', 'background']) {
    const closed = moods.poolFor(group, plain);
    const open = moods.poolFor(group, weird);
    for (const type of Object.keys(moods.EXT_TRAITS[group] || {})) {
      assert.equal(closed[type], undefined, `${group}.${type} must not be in the plain pool`);
      assert.ok(open[type], `${group}.${type} must be in the weird pool`);
    }
  }
  // the classic tables are untouched
  assert.equal(moods.poolFor('hold', plain), moods.TRAITS.hold);
});

test('flags gate an effect by the axes it needs', () => {
  const calm = { speed: 0.1, energy: 0.1, softness: 0.9, density: 0.3, brightness: 0.4, weird: 0.2 };
  const loud = { speed: 0.8, energy: 0.9, softness: 0.2, density: 0.7, brightness: 0.8, weird: 0.9 };
  const strobe = moods.EXT_TRAITS.post.strobeFlash;
  assert.equal(moods.allowed('post', strobe, { letterCount: 5 }, 'horizontal', calm), false);
  assert.equal(moods.allowed('post', strobe, { letterCount: 5 }, 'horizontal', loud), true);
  // a plain mood never allows a weird-only type even when it is loud
  const plainLoud = { ...loud, weird: 0.1 };
  assert.equal(moods.allowed('hold', moods.EXT_TRAITS.hold.fontSize, { letterCount: 5 }, 'horizontal', plainLoud), false);
});

test('the weird axis scores the effect against the mood', () => {
  const axes = { speed: 0.5, energy: 0.5, softness: 0.5, density: 0.5, brightness: 0.5, weird: 0 };
  const plainEffect = [0.5, 0.5];
  const weirdEffect = [0.5, 0.5, {}, 1];
  assert.ok(moods.score(plainEffect, axes) > moods.score(weirdEffect, axes));
  const weirdAxes = { ...axes, weird: 1 };
  assert.ok(moods.score(weirdEffect, weirdAxes) > moods.score(plainEffect, weirdAxes));
});

test('generation is identical without the sixth axis and varies with it', () => {
  const base = { speed: 0.5, energy: 0.5, softness: 0.5, density: 0.5, brightness: 0.5 };
  const without = moods.generate({ axes: base, seed: 7, context: { cjk: true, letterCount: 8 } });
  const zero = moods.generate({ axes: { ...base, weird: 0 }, seed: 7, context: { cjk: true, letterCount: 8 } });
  assert.equal(JSON.stringify(without.style), JSON.stringify(zero.style), 'weird 0 must not change the draw');
  const noisy = moods.generate({ axes: { ...base, weird: 1 }, seed: 7, context: { cjk: true, letterCount: 8 } });
  assert.notEqual(JSON.stringify(noisy.style), JSON.stringify(zero.style), 'the sixth axis must change the draw');
});

test('the automatic picker draws the extended pack only for weird looks', () => {
  const base = {
    script: { cues: [{ id: 'c1', text: 'テスト', start: 0, end: 2 }] },
    output: { aspect: '16:9' },
  };
  const typesOf = (patches) =>
    new Set(
      patches
        .flatMap((patch) => Object.values(patch.style))
        .flatMap((value) => (Array.isArray(value) ? value : [value]))
        .map((value) => value && value.type)
        .filter(Boolean)
    );
  const extended = new Set(Object.values(moods.EXT_TRAITS).flatMap((table) => Object.keys(table || {})));
  let weirdHits = 0;
  for (let seed = 1; seed <= 12; seed += 1) {
    const plain = random.randomize({ project: { ...base, styleMode: { axes: { energy: 0.5, speed: 0.5, weird: 0 } } }, scope: 'cues', seed });
    for (const type of typesOf(plain.patches)) {
      assert.ok(!extended.has(type), `${type} leaked into a plain draw (seed ${seed})`);
    }
    const odd = random.randomize({ project: { ...base, styleMode: { axes: { energy: 0.9, speed: 0.9, weird: 1 } } }, scope: 'cues', seed });
    for (const type of typesOf(odd.patches)) if (extended.has(type)) weirdHits += 1;
  }
  assert.ok(weirdHits > 0, 'the sixth axis never reached the extended pack in 12 seeds');
});

test('the classifier scores the sixth axis from the look', () => {
  const plain = { group: 'enter', style: { enter: { type: 'fade' }, layout: { type: 'row' } } };
  const odd = {
    group: 'post',
    style: {
      post: [{ type: 'glitchBlocks' }, { type: 'turbulentDisplace' }],
      hold: [{ type: 'letterWarp' }, { type: 'fillScreen' }],
      edge: [{ type: 'drip' }],
      background: { type: 'tunnel' },
      enter: { type: 'scramble' },
    },
  };
  assert.ok(classify.weirdOf(plain) < 0.3, `plain scored ${classify.weirdOf(plain)}`);
  assert.ok(classify.weirdOf(odd) > 0.6, `odd scored ${classify.weirdOf(odd)}`);
  const axes = classify.axesOf(odd, 0.5);
  assert.ok(axes.weird > 0.6);
  assert.ok(classify.axesDistance(axes, { ...axes }) < 0.001);
  assert.ok(classify.axesDistance(axes, { ...axes, weird: 0 }) > 0.05);
});
