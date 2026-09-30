'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const fx = require('../../renderer/js/lyrics/effects/registry.js');
require('../../renderer/js/lyrics/effects/animation.js');
require('../../renderer/js/lyrics/effects/layout.js');
require('../../renderer/js/lyrics/effects/enter.js');
require('../../renderer/js/lyrics/effects/exit.js');
require('../../renderer/js/lyrics/effects/hold.js');
require('../../renderer/js/lyrics/effects/location.js');
require('../../renderer/js/lyrics/effects/fill.js');
require('../../renderer/js/lyrics/effects/edge.js');
require('../../renderer/js/lyrics/effects/post.js');
require('../../renderer/js/lyrics/effects/background.js');
require('../../renderer/js/lyrics/effects/text-bg.js');
const random = require('../../renderer/js/lyrics/random.js');
const rng = require('../../renderer/js/lyrics/rng.js');
const projectModule = require('../../renderer/js/studio/project.js');

function fixtureProject() {
  return projectModule.defaults({
    script: {
      cues: [
        { id: 'c1', start: 0, end: 4, text: 'Achievement unlocked', meta: { kind: 'badge', badgeId: 'plays_1k', category: 'plays' } },
        { id: 'c2', start: 4.5, end: 8, text: '今日はとても良い天気', meta: { kind: 'custom' } },
      ],
    },
  });
}

test('randomize is reproducible for the same seed', () => {
  const project = fixtureProject();
  const first = random.randomize({ project, scope: 'cues', seed: 42 });
  const second = random.randomize({ project, scope: 'cues', seed: 42 });
  assert.deepEqual(first.patches, second.patches);
  assert.equal(first.patches.length, 2);
  const third = random.randomize({ project, scope: 'cues', seed: 43 });
  assert.notDeepEqual(third.patches, first.patches, 'a different seed changes the result');
});

test('randomize respects locked groups', () => {
  const project = fixtureProject();
  const result = random.randomize({
    project,
    scope: 'cues',
    seed: 7,
    locks: ['fill', 'post', 'layout', 'animation', 'exit', 'hold', 'edge'],
  });
  for (const patch of result.patches) {
    assert.equal(patch.style.fill, undefined, 'fill is locked');
    assert.equal(patch.style.post, undefined, 'post is locked');
    assert.equal(patch.style.layout, undefined, 'layout is locked');
    assert.ok(patch.style.enter, 'the only unlocked rollable group is picked');
  }
});

test('automatic randomization never picks glyph-destroying effects', () => {
  const project = fixtureProject();
  for (let seed = 1; seed <= 40; seed += 1) {
    const result = random.randomize({ project, scope: 'cues', seed, intensity: 2 });
    for (const patch of result.patches) {
      for (const [group, value] of Object.entries(patch.style)) {
        const instances = Array.isArray(value) ? value : [value];
        for (const instance of instances) {
          const descriptor = instance && instance.type ? fx.get(group, instance.type) : null;
          assert.ok(!descriptor || !descriptor.tags.includes('degrade'), `seed ${seed} picked ${group}.${instance.type}`);
        }
      }
    }
  }
});

test('randomize never touches manual overrides unless asked', () => {
  const project = fixtureProject();
  const path = 'cue:c1/beat:c1:single0/line:0/word:1/letter:0';
  project.overrides[path] = { transform: { x: 40 }, enter: { type: 'slide' } };
  const guarded = random.randomize({ project, scope: 'elements', paths: [path], seed: 11 });
  assert.equal(guarded.patches.length, 0, 'manual element is skipped');
  const forced = random.randomize({ project, scope: 'elements', paths: [path], seed: 11, overwriteManual: true });
  assert.equal(forced.patches.length, 1, 'overwriteManual allows the patch');
});

test('every random pick is a registered type with sampled params', () => {
  const project = fixtureProject();
  const result = random.randomize({ project, scope: 'cues', seed: 99, intensity: 3 });
  for (const patch of result.patches) {
    for (const [group, value] of Object.entries(patch.style)) {
      const instances = Array.isArray(value) ? value : [value];
      for (const instance of instances) {
        const descriptor = fx.get(group, instance.type);
        assert.ok(descriptor, `${group}.${instance.type} exists`);
        for (const [key, param] of Object.entries(instance.params || {})) {
          assert.ok(
            (descriptor.params || []).some((entry) => entry.key === key),
            `${group}.${instance.type}.${key} is a declared param`
          );
          assert.ok(param !== undefined && param !== null, `${key} has a value`);
        }
        assert.ok(instance.motion && instance.motion.in, `${group}.${instance.type} has motion`);
        assert.ok(Number.isFinite(instance.motion.in.duration) && instance.motion.in.duration > 0);
      }
    }
  }
});

test('avoidRepeats prefers a different type than the current one when possible', () => {
  const project = fixtureProject();
  project.style = projectModule.mergeDeep(project.style, { enter: { type: 'fade' } });
  const result = random.randomize({
    project,
    scope: 'cues',
    seed: 5,
    avoidRepeats: true,
    locks: ['animation', 'exit', 'hold', 'fill', 'edge', 'post'],
  });
  const enterTypes = result.patches.map((patch) => patch.style.enter && patch.style.enter.type);
  assert.ok(enterTypes.every((type) => type && type !== 'fade'), `types: ${enterTypes.join(',')}`);
});

test('layout fit rules keep vertical and circle for short texts', () => {
  const project = fixtureProject();
  const short = random.randomize({ project, scope: 'cues', seed: 3, allowTags: [] });
  for (const patch of short.patches) {
    if (patch.style.layout) assert.ok(fx.get('layout', patch.style.layout.type), 'layout type registered');
  }
  const longProject = fixtureProject();
  longProject.script.cues[0].text = 'A very long line of text that has far more than twenty four letters in it';
  const long = random.randomize({ project: longProject, scope: 'cues', seed: 3 });
  for (const patch of long.patches) {
    if (patch.style.layout) assert.notEqual(patch.style.layout.type, 'circle');
  }
});

test('intensity biases the recommended range but never leaves it', () => {
  const param = { key: 'amount', kind: 'number', min: 0, max: 1, default: 0.5, random: [0.1, 0.9] };
  let low = 0;
  let high = 0;
  for (let i = 0; i < 200; i += 1) {
    const lowValue = random.sampleParam(param, rng.mulberry32(i), 1, []);
    const highValue = random.sampleParam(param, rng.mulberry32(i), 3, []);
    assert.ok(lowValue >= 0.1 && lowValue <= 0.9, `low sample ${lowValue}`);
    assert.ok(highValue >= 0.1 && highValue <= 0.9, `high sample ${highValue}`);
    low += lowValue;
    high += highValue;
  }
  assert.ok(high > low, `high ${high} > low ${low}`);
});

test('numeric parameters without a recommended range keep their default', () => {
  const param = { key: 'posterize', kind: 'number', min: 0, max: 32, default: 0 };
  for (let i = 0; i < 50; i += 1) {
    assert.strictEqual(random.sampleParam(param, rng.mulberry32(i), 3, []), 0);
  }
  const vec = { key: 'offset', kind: 'vec2', default: { x: 6, y: 8 } };
  assert.deepStrictEqual(random.sampleParam(vec, rng.mulberry32(1), 3, []), { x: 6, y: 8 });
});

test('randomize fills repeat with the documented distribution', () => {
  const project = fixtureProject();
  let repeatPicks = 0;
  let brickFill = 0;
  const copies = new Map();
  let variation1 = 0;
  let variation2 = 0;
  let preset = 0;
  let targets = 0;
  for (let seed = 1; seed <= 200; seed += 1) {
    const result = random.randomize({ project, scope: 'cues', seed });
    for (const patch of result.patches) {
      targets += 1;
      const instance = patch.style.repeat;
      if (!instance || instance.type === 'none') continue;
      repeatPicks += 1;
      copies.set(instance.params.copies, (copies.get(instance.params.copies) || 0) + 1);
      if (instance.type === 'brick' || instance.type === 'fill') brickFill += 1;
      if (instance.params.variationPreset !== 'custom') preset += 1;
      const attrs = [instance.params.var1Attr, instance.params.var2Attr].filter((attr) => attr && attr !== 'none');
      assert.ok(attrs.length <= 2, `at most two variation attributes (${attrs.join(',')})`);
      if (attrs.length) assert.notEqual(instance.params.var1Attr, instance.params.var2Attr, 'the two variations differ');
      if (attrs.length === 1) variation1 += 1;
      if (attrs.length === 2) variation2 += 1;
      if (instance.type === 'brick' || instance.type === 'fill') assert.equal(instance.params.copies, 'many');
    }
  }
  const rate = repeatPicks / targets;
  assert.ok(rate > 0.2 && rate < 0.4, `repeat appears ${rate}`);
  assert.ok(brickFill / repeatPicks <= 0.15, `brick/fill share ${brickFill / repeatPicks}`);
  for (const value of [1, 2, 3, 'many']) assert.ok((copies.get(value) || 0) > 0, `copies ${value} occurs`);
  assert.ok(variation1 > 0 && variation2 > 0 && preset > 0, 'all variation shapes occur');
});

test('repeat never combines with duplicated layouts or dissolves', () => {
  const project = fixtureProject();
  const conflicts = ['circle', 'spiral', 'path', 'scatter'];
  for (let seed = 1; seed <= 60; seed += 1) {
    const result = random.randomize({ project, scope: 'project', seed });
    const patch = result.patches[0];
    if (!patch) continue;
    const merged = projectModule.mergeDeep(project.style, patch.style);
    const repeat = merged.repeat;
    if (!repeat || repeat.type === 'none') continue;
    assert.ok(!conflicts.includes(merged.layout && merged.layout.type), `seed ${seed}: repeat with ${merged.layout.type}`);
    assert.notEqual(merged.enter && merged.enter.type, 'morphFromPrevious', `seed ${seed}: repeat with morph`);
    if (repeat.type === 'fill') {
      for (const post of merged.post || []) {
        assert.ok(!/dissolve/i.test(post.type) && post.type !== 'kaleidoscope' && post.type !== 'mirror', `seed ${seed}: fill with ${post.type}`);
      }
    }
  }
});

test('9:16 rowH keeps a single copy', () => {
  const project = fixtureProject();
  project.output.aspect = '9:16';
  let rowH = 0;
  for (let seed = 1; seed <= 200 && rowH < 5; seed += 1) {
    const result = random.randomize({ project, scope: 'cues', seed });
    for (const patch of result.patches) {
      const instance = patch.style.repeat;
      if (!instance || instance.type !== 'rowH') continue;
      rowH += 1;
      assert.equal(instance.params.copies, 1, `seed ${seed}: rowH copies ${instance.params.copies}`);
    }
  }
  assert.ok(rowH > 0, 'rowH was sampled');
});

test('presets are JSON-safe partial style sets', () => {
  const presets = require('../../renderer/js/lyrics/presets.js');
  const list = presets.list();
  assert.ok(list.length >= 14, `presets ${list.length}`);
  const known = new Set(['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'background', 'color', 'text', 'bgShape', 'bgFill', 'bgEdge', 'bgMotion', 'ornShape', 'ornFill', 'ornEdge', 'ornMotion']);
  for (const preset of list) {
    assert.ok(preset.id && preset.style, preset.id);
    for (const key of Object.keys(preset.style)) assert.ok(known.has(key), `${preset.id}: ${key}`);
    assert.doesNotThrow(() => JSON.stringify(preset.style));
  }
});

test('every preset references registered effect types', () => {
  const presets = require('../../renderer/js/lyrics/presets.js');
  for (const preset of presets.list()) {
    for (const [group, value] of Object.entries(preset.style)) {
      if (!['hold', 'edge', 'post'].includes(group)) continue;
      for (const instance of value) {
        assert.ok(fx.get(group, instance.type), `${preset.id}: ${group}.${instance.type}`);
      }
    }
    for (const group of ['animation', 'layout', 'enter', 'exit', 'location', 'fill', 'background']) {
      const instance = preset.style[group];
      if (instance) assert.ok(fx.get(group, instance.type), `${preset.id}: ${group}.${instance.type}`);
    }
  }
});
