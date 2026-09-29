'use strict';

// Phase 2 of the auto-direct rework: the composition library. The templates are
// pure data, so the tests here guard the two contracts that matter: every
// effect id a composition names exists in the registry, and the analysis /
// pick / build trio is deterministic and stays inside the text.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const fx = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects', 'registry.js'));
for (const name of ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'background']) {
  require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects', `${name}.js`));
}
const shapeOps = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'shape-ops.js'));
require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects', 'shape-layer.js'));
require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects', 'animator.js'));
require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects', 'selector.js'));
require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects', 'staged-presets.js'));

const rng = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'rng.js'));
const keywords = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'keywords.js'));
const textflow = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'textflow.js'));
globalThis.SA = { fx, rng, keywords, textflow };
const compositions = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'compositions.js'));

function rangeText(analysis) {
  const chars = Array.from(analysis.text);
  return chars.slice(analysis.hero.from, analysis.hero.to).join('');
}

const WORDS = keywords.listFor(null).words;

test('every composition names registered effects and shapes', () => {
  assert.ok(compositions.LIST.length >= 10, `compositions ${compositions.LIST.length}`);
  for (const comp of compositions.LIST) {
    assert.equal(typeof comp.id, 'string');
    assert.ok(['large', 'medium', 'small'].includes(comp.scaleClass), `${comp.id} scaleClass`);
    assert.ok(comp.size > 0 && comp.size <= 0.5, `${comp.id} size`);
    assert.ok(fx.get('location', comp.location.type), `${comp.id} location ${comp.location.type}`);
    if (comp.layout) assert.ok(fx.get('layout', comp.layout.type), `${comp.id} layout ${comp.layout.type}`);
    for (const group of ['enter', 'exit']) {
      const list = comp[group];
      assert.ok(Array.isArray(list) && list.length, `${comp.id} ${group}`);
      for (const entry of list) {
        const type = typeof entry === 'string' ? entry : entry.type;
        assert.ok(fx.get(group, type), `${comp.id} ${group} ${type}`);
      }
    }
    if (comp.graphic) {
      assert.equal(comp.graphic.type, 'shapeLayer');
      assert.ok(shapeOps.SHAPES.includes(comp.graphic.params.shape), `${comp.id} shape ${comp.graphic.params.shape}`);
      assert.ok(fx.get('post', 'shapeLayer'), 'post.shapeLayer is registered');
    }
  }
  assert.equal(compositions.get('heroCenter').id, 'heroCenter');
  assert.equal(compositions.get('nope'), null);
});

test('analyzeBeat picks the keyword, the scripted and the short hero', () => {
  const ja = compositions.analyzeBeat('君を離さない', 'ja', WORDS);
  assert.equal(rangeText(ja), '君');
  assert.equal(ja.cjk, true);
  assert.equal(ja.chars, 6);

  const tonight = compositions.analyzeBeat('今夜は踊ろう', 'ja', WORDS);
  assert.equal(rangeText(tonight), '今夜');
  const particle = tonight.tokens.find((token) => token.text === 'は');
  assert.equal(particle.role, 'particle');

  const en = compositions.analyzeBeat('I will never let you go', 'en', WORDS);
  assert.equal(rangeText(en), 'never');
  assert.equal(en.cjk, false);

  const short = compositions.analyzeBeat('I go', 'en', WORDS);
  assert.equal(short.hero.from, 0);
  assert.equal(short.hero.to, Array.from(short.text).length);
  const kanji = compositions.analyzeBeat('走り出す', 'ja', WORDS);
  assert.equal(rangeText(kanji), '走り出す');
  const noKeyword = compositions.analyzeBeat('川の流れを見て', 'ja', WORDS);
  assert.equal(rangeText(noKeyword), '流れ');
});

test('pick is deterministic and never repeats the previous composition', () => {
  const features = { chars: 10, words: 3, duration: 3, cjk: true, portrait: false, energy: 0.5 };
  const first = compositions.pick(features, { seed: 7, beatId: 'b1', w: 0.5 });
  const again = compositions.pick(features, { seed: 7, beatId: 'b1', w: 0.5 });
  assert.equal(first.id, again.id);

  const history = [];
  let previous = null;
  for (let i = 0; i < 60; i += 1) {
    const comp = compositions.pick(features, { seed: 11, beatId: `beat:${i}`, w: 0.8, history });
    if (previous) assert.notEqual(comp.id, previous.id, `beat ${i} repeated ${comp.id}`);
    history.push(comp);
    previous = comp;
  }
});

test('the weird gate keeps the bold compositions out at weird 0', () => {
  const features = { chars: 10, words: 3, duration: 3, cjk: true, portrait: false, energy: 0.5 };
  let seen = new Set();
  for (let i = 0; i < 200; i += 1) {
    const comp = compositions.pick(features, { seed: i, beatId: `b${i}`, w: 0 });
    seen.add(comp.id);
  }
  assert.ok(!seen.has('diagonalJump'), 'diagonalJump needs weird');
  assert.ok(!seen.has('bleedHero'), 'bleedHero needs weird');
  assert.ok(seen.size >= 4, `plain comps still vary (${seen.size})`);
});

test('verticalRight stays out of latin beats', () => {
  const features = { chars: 10, words: 3, duration: 3, cjk: false, portrait: false, energy: 0.5 };
  for (let i = 0; i < 100; i += 1) {
    const comp = compositions.pick(features, { seed: i, beatId: `b${i}`, w: 0.8 });
    assert.notEqual(comp.id, 'verticalRight', `seed ${i}`);
  }
});

test('build stays inside the text and clears jitter', () => {
  const analysis = compositions.analyzeBeat('君を離さない', 'ja', WORDS);
  const length = Array.from(analysis.text).length;
  const patch = compositions.build(compositions.get('heroCenter'), analysis, {
    seed: 5,
    beatId: 'b1',
    w: 0.4,
    screen: 1080,
    themeStyle: { post: [{ type: 'vignette', enabled: true }, { type: 'shapeLayer', params: { shape: 'box' } }] },
  });
  assert.equal(patch.text.compose.text, analysis.text);
  for (const at of patch.text.compose.breaks) assert.ok(at > 0 && at < length, `break ${at}`);
  for (const span of patch.text.compose.spans) {
    assert.ok(span.from >= 0 && span.to <= length && span.from < span.to, `span ${span.from}-${span.to}`);
  }
  const hero = patch.text.compose.spans[0];
  assert.equal(hero.from, analysis.hero.from);
  assert.equal(hero.to, analysis.hero.to);
  // no palette was handed in, so the slot indices fall back to the legacy
  // 7-colour positions (TEXT_FILL 2, TEXT_FILL2 3)
  assert.equal(hero.paletteIndex, 3);
  assert.deepEqual(patch.hold, []);
  assert.deepEqual(patch.transform, { rotate: 0, tiltX: 0, tiltY: 0 });
  assert.equal(patch.text.size, Math.round(0.15 * (1 + 0.3 * 0.4) * 1080));
  // the song post survives, its old shape layer is replaced by the graphic
  assert.ok(patch.post.some((entry) => entry.type === 'vignette'));
  assert.equal(patch.post.filter((entry) => entry.type === 'shapeLayer').length, 0);
  assert.deepEqual(patch.color, { fill: { kind: 'palette', index: 2 }, fill2: { kind: 'palette', index: 3 } });
  // with a 10-slot palette the references keep the role indices
  const slots = compositions.build(compositions.get('heroCenter'), analysis, {
    seed: 5,
    beatId: 'b1',
    w: 0.4,
    screen: 1080,
    palette: ['#000000', '#111111', '#222222', '#333333', '#f0f0f0', '#ff8800', '#444444', '#ffffff', '#00aaff', '#aa00ff'],
  });
  assert.equal(slots.text.compose.spans[0].paletteIndex, 5);
  assert.deepEqual(slots.color, { fill: { kind: 'palette', index: 4 }, fill2: { kind: 'palette', index: 5 } });

  const headed = compositions.build(compositions.get('leftHeadline'), analysis, { seed: 5, beatId: 'b2', w: 0, screen: 1080 });
  const shapes = headed.post.filter((entry) => entry.type === 'shapeLayer');
  assert.equal(shapes.length, 1);
  assert.equal(shapes[0].params.shape, 'underline');
  assert.equal(headed.location.params.edgeX, -1);
  assert.equal(headed.layout.type, 'row');
});

test('the hero accepts no colour patch when a composition asks for none', () => {
  const comp = { ...compositions.get('heroCenter'), hierarchy: { ...compositions.get('heroCenter').hierarchy, accentHero: false } };
  const analysis = compositions.analyzeBeat('君を離さない', 'ja', WORDS);
  const patch = compositions.build(comp, analysis, { seed: 1, beatId: 'b', w: 0, screen: 1080 });
  assert.equal(patch.color, undefined);
  assert.equal(patch.text.compose.spans[0].paletteIndex, undefined);
});
