'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const fx = require('../../renderer/js/lyrics/effects/registry.js');
for (const name of ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'background', 'color', 'text-bg']) {
  require(`../../renderer/js/lyrics/effects/${name}.js`);
}
const moods = require('../../renderer/js/lyrics/moods.js');
const genres = require('../../renderer/js/lyrics/genres.js');
const color = require('../../renderer/js/color.js');

const CONTEXT = { letterCount: 8, cjk: true, hasPrevious: true, aspect: '16:9' };

function instances(style) {
  const list = [];
  for (const group of ['animation', 'layout', 'enter', 'exit', 'location', 'fill', 'bgShape', 'bgFill', 'bgMotion']) {
    if (style[group] && style[group].type) list.push([group, style[group]]);
  }
  for (const group of ['hold', 'edge', 'post', 'bgEdge']) {
    for (const instance of style[group] || []) list.push([group, instance]);
  }
  return list;
}

test('every genre generates without forbidden types', () => {
  for (const genre of genres.LIST) {
    for (let seed = 1; seed <= 100; seed += 1) {
      const style = moods.generate({ genre: genre.id, seed, context: CONTEXT }).style;
      for (const [group, instance] of instances(style)) {
        if (!instance || !instance.type) continue;
        const weight = genres.affinity(genre, group, instance.type);
        assert.ok(weight > 0, `${genre.id} seed ${seed}: forbidden ${group}.${instance.type}`);
        assert.ok(fx.get(group, instance.type), `${genre.id}: ${group}.${instance.type} registered`);
      }
    }
  }
});

test('every genre keeps text contrast at 4.5 or better', () => {
  for (const genre of genres.LIST) {
    for (let seed = 1; seed <= 50; seed += 1) {
      const style = moods.generate({ genre: genre.id, seed, context: CONTEXT }).style;
      const colors = style.palette.colors;
      const ratio = color.contrastRatio(color.parse(colors[2]), color.parse(colors[0]));
      assert.ok(ratio >= 4.5, `${genre.id} seed ${seed}: contrast ${ratio.toFixed(2)}`);
    }
  }
});

test('every genre uses one of its allowed palette families', () => {
  for (const genre of genres.LIST) {
    if (!genre.palettes) continue;
    for (let seed = 1; seed <= 50; seed += 1) {
      const result = moods.generate({ genre: genre.id, seed, context: CONTEXT });
      const family = result.style.palette && result.style.palette.name;
      assert.ok(genre.palettes.includes(family), `${genre.id}: palette ${family}`);
    }
  }
});

test('a signature is always applied for the project scope', () => {
  for (const genre of genres.LIST) {
    if (!genre.signature || !genre.signature.length) continue;
    for (let seed = 1; seed <= 30; seed += 1) {
      const result = moods.generate({ genre: genre.id, seed, context: CONTEXT, ensureSignature: true });
      assert.ok(result.signature, `${genre.id} seed ${seed}: no signature`);
    }
  }
});

test('emphasis lines push the energy and prefer the emphasis signatures', () => {
  const genre = genres.get('horror');
  const ids = new Set(genre.emphasis.signature);
  for (let seed = 1; seed <= 30; seed += 1) {
    const result = moods.generate({ genre: 'horror', seed, context: CONTEXT, emphasis: true });
    assert.ok(ids.has(result.signature), `emphasis signature ${result.signature}`);
    assert.ok(result.axes.energy >= genre.axes.energy, 'energy raised');
  }
});

test('genre backgrounds appear at roughly the configured rate', () => {
  for (const id of ['horror', 'love', 'party']) {
    const genre = genres.get(id);
    let hits = 0;
    const count = 200;
    for (let seed = 1; seed <= count; seed += 1) {
      const style = moods.generate({ genre: id, seed, context: CONTEXT }).style;
      if (style.bgShape && style.bgShape.type && style.bgShape.type !== 'none') hits += 1;
    }
    // signatures may add a background on top of the base chance
    const rate = hits / count;
    assert.ok(rate >= genre.bg.chance - 0.1, `${id}: rate ${rate}`);
    assert.ok(rate <= genre.bg.chance + 0.35, `${id}: rate ${rate}`);
  }
});

test('the same seed produces the same genre result', () => {
  const a = moods.generate({ genre: 'love', seed: 42, context: CONTEXT });
  const b = moods.generate({ genre: 'love', seed: 42, context: CONTEXT });
  assert.deepEqual(a.style, b.style);
  assert.equal(a.signature, b.signature);
});

test('isEmphasis detects exclamations, short lines and choruses', () => {
  assert.equal(moods.isEmphasis({ text: '走れ！' }), true);
  assert.equal(moods.isEmphasis({ text: 'go!' }), true);
  assert.equal(moods.isEmphasis({ text: 'はい' }), true);
  assert.equal(moods.isEmphasis({ text: 'a long line without emphasis', meta: {} }), false);
  assert.equal(moods.isEmphasis({ text: 'a long line', meta: { section: 'chorus' } }), true);
});

test('genre presets resolve through presets.list when moods is present', () => {
  const presets = require('../../renderer/js/lyrics/presets.js');
  const previous = global.SA;
  global.SA = { moods, genres, project: require('../../renderer/js/studio/project.js'), fx };
  try {
    const list = presets.list();
    assert.ok(list.some((entry) => entry.id === 'horrorBlood'), 'horror preset present');
    assert.ok(list.some((entry) => entry.id === 'varietyBox'), 'generic bg preset present');
    const blood = presets.get('horrorBlood');
    assert.ok(blood.style.bgShape || blood.style.edge, 'signature patch applied');
  } finally {
    if (previous === undefined) delete global.SA;
    else global.SA = previous;
  }
});
