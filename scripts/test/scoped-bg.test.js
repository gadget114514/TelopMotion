'use strict';

// The scoped background attributes (`style.scoped` on `bgFill` / `bgShape`):
// a scoped solid colour paints the covered letters' square, a scoped `none`
// hides it, and a scoped opacity multiplies it. The work rides the variation
// entry the vary key already writes, so no new draw path is needed.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const FX_DIR = path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects');
require(path.join(FX_DIR, 'registry.js'));
for (const name of ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'background', 'color', 'text-bg', 'vary']) {
  require(path.join(FX_DIR, `${name}.js`));
}
const color = require(path.join(ROOT, 'renderer', 'js', 'color.js'));
const scope = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'scope.js'));
const fx = require(path.join(FX_DIR, 'registry.js'));
require(path.join(FX_DIR, 'staged-presets.js'));
const vary = require(path.join(FX_DIR, 'vary.js'));
const textBg = require(path.join(FX_DIR, 'text-bg.js'));

// engine.js assigns onto the global SA (it is a plain browser script)
global.window = global;
global.SA = { color, scope, fx };
require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'engine.js'));
const engine = global.SA.lyricsEngine;

const SIZE = 96;

function makeScene(text) {
  const letters = [];
  for (let i = 0; i < text.length; i += 1) {
    letters.push({
      path: `cue:c1/beat:c1:single0/line:0/word:0/letter:${i}`,
      cueId: 'c1',
      beatId: 'c1:single0',
      lineIdx: 0,
      wordIdx: 0,
      letterIdx: i,
      globalIdx: i,
      char: text[i],
      textOffset: i,
      local: { x: i * SIZE * 0.6, y: SIZE, w: SIZE * 0.6, h: SIZE, cx: i * SIZE * 0.6, cy: SIZE * 0.7, penX: i * SIZE * 0.6, penY: SIZE },
      bbox: { x1: 0, y1: -SIZE, x2: SIZE * 0.6, y2: 0 },
    });
  }
  return { cueId: 'c1', beatId: 'c1:single0', kind: 'single', start: 0, end: 10, text, letters, size: SIZE, direction: 'horizontal' };
}

// the variation the engine draws from, before any scoped override
function baseVariation(scene, params) {
  const letters = scene.letters.map((letter) => ({ char: letter.char, lineIdx: letter.lineIdx, wordIdx: letter.wordIdx, path: letter.path }));
  return vary.letterVariation({ vary: 'alternate', varyColors: ['#000000', '#ffffff'], skipSpaces: false, ...(params || {}) }, letters, [], 'seed');
}

function rgb(entry) {
  return entry && entry.color ? entry.color.slice(0, 3).map((value) => Math.round(value * 255)) : null;
}

test('scopedBgEntries keeps only the enabled background entries', () => {
  const style = {
    scoped: [
      { group: 'bgFill', type: 'solid', params: { color: '#1e50ff' } },
      { group: 'bgShape', type: 'none', params: {} },
      { group: 'bgFill', type: 'solid', params: { color: '#ffffff' }, enabled: false },
      { group: 'fill', type: 'solid', params: { color: '#ffffff' } },
      { group: 'text', type: 'span', params: { scale: 2 } },
      null,
    ],
  };
  const entries = engine.scopedBgEntries(style);
  assert.deepEqual(entries.map((entry) => `${entry.group}.${entry.type}`), ['bgFill.solid', 'bgShape.none']);
  assert.deepEqual(engine.scopedBgEntries({}), []);
  assert.deepEqual(engine.scopedBgEntries(null), []);
});

test('a scoped bgFill paints the covered letters only', () => {
  const scene = makeScene('ABCDEF');
  const style = {
    scoped: [{ group: 'bgFill', type: 'solid', params: { color: '#1e50ff' }, scope: { kind: 'nth', unit: 'letter', every: 2, offset: 0 } }],
  };
  const result = engine.applyScopedBg(baseVariation(scene), scene, style);
  assert.deepEqual(rgb(result[0]), [0x1e, 0x50, 0xff]);
  assert.deepEqual(rgb(result[2]), [0x1e, 0x50, 0xff]);
  assert.deepEqual(rgb(result[4]), [0x1e, 0x50, 0xff]);
  // the odd letters keep the vary colours
  assert.deepEqual(rgb(result[1]), [255, 255, 255]);
  assert.deepEqual(rgb(result[3]), [255, 255, 255]);
  assert.deepEqual(rgb(result[5]), [255, 255, 255]);
});

test('the blue / white pair: two scoped entries cover every letter', () => {
  const scene = makeScene('ABCDEF');
  const pair = (offset, bg, fg) => [
    { group: 'bgFill', type: 'solid', params: { color: bg }, scope: { kind: 'nth', unit: 'letter', every: 2, offset } },
    { group: 'fill', type: 'solid', params: { color: fg }, scope: { kind: 'nth', unit: 'letter', every: 2, offset } },
  ];
  const result = engine.applyScopedBg(baseVariation(scene), scene, { scoped: [...pair(0, '#1e50ff', '#ffffff'), ...pair(1, '#ffffff', '#1e50ff')] });
  assert.deepEqual(result.map((entry) => rgb(entry).join(',')), [
    '30,80,255', '255,255,255', '30,80,255', '255,255,255', '30,80,255', '255,255,255',
  ]);
});

test('a later entry wins over an earlier one on the same letters', () => {
  const scene = makeScene('ABCD');
  const all = null;
  const style = {
    scoped: [
      { group: 'bgFill', type: 'solid', params: { color: '#ff0000' }, scope: { kind: 'range', from: 0, to: 2 } },
      { group: 'bgFill', type: 'solid', params: { color: '#00ff00' }, scope: { kind: 'range', from: 1, to: 3 } },
      { group: 'bgFill', type: 'solid', params: { color: '#0000ff' }, scope: all },
    ],
  };
  const result = engine.applyScopedBg(baseVariation(scene), scene, style);
  assert.deepEqual(rgb(result[0]), [0, 0, 255], 'the catch-all came last');
  assert.deepEqual(rgb(result[1]), [0, 0, 255]);
  assert.deepEqual(rgb(result[3]), [0, 0, 255]);
});

test('a scoped bgShape hides and shows single letters', () => {
  const scene = makeScene('ABCD');
  const style = {
    scoped: [
      { group: 'bgShape', type: 'none', params: {}, scope: { kind: 'range', from: 1, to: 2 } },
      { group: 'bgShape', type: 'square', params: { opacity: 0.25 }, scope: { kind: 'range', from: 2, to: 3 } },
    ],
  };
  const result = engine.applyScopedBg(baseVariation(scene), scene, style);
  assert.deepEqual(result.map((entry) => entry.visible), [true, false, true, true]);
  assert.equal(result[2].opacity, 0.25, 'the opacity reaches the shape state');
  assert.equal(result[0].opacity, undefined, 'the untouched letters carry no override');
});

test('a scoped opacity multiplies the shape opacity it is drawn with', () => {
  const scene = makeScene('AB');
  const letterState = () => ({ opacity: 1, px: 1 });
  const variation = engine.applyScopedBg(baseVariation(scene), scene, {
    scoped: [
      { group: 'bgShape', type: 'square', params: { opacity: 0.5 }, scope: { kind: 'range', from: 0, to: 1 } },
      { group: 'bgShape', type: 'square', params: { opacity: 0 }, scope: { kind: 'range', from: 1, to: 2 } },
    ],
  });
  const shape = { type: 'square', params: { opacity: 1 } };
  const states = textBg.evaluateBg(shape, { type: 'follow', params: {} }, [letterState(), letterState()], variation, null, 2, { seed: 1, group: 'bgShape' });
  assert.equal(states.states[0].opacity, 0.5);
  assert.equal(states.states[1].opacity, 0, 'a zero override hides the square');
});

test('applyScopedBg leaves the variation alone without a scoped entry', () => {
  const scene = makeScene('ABC');
  const plain = baseVariation(scene);
  assert.deepEqual(engine.applyScopedBg(plain, scene, {}), plain);
  assert.deepEqual(engine.applyScopedBg(plain, scene, { scoped: [{ group: 'fill', type: 'solid', params: { color: '#ff0000' } }] }), plain);
  assert.deepEqual(engine.applyScopedBg(plain, scene, null), plain);
});

test('a letter-wise preset applies its defaults, not just its scope', () => {
  const scene = makeScene('ABCDEF');
  // the inspector writes an entry with the type and no params: the preset's own
  // values (the colour, the hidden square) have to come from its defaults
  const style = {
    scoped: [
      { group: 'bgFill', type: 'bgEveryOther', params: {}, scope: { kind: 'nth', unit: 'letter', every: 2, offset: 0 } },
      { group: 'bgShape', type: 'bgHideEveryOther', params: {}, scope: { kind: 'nth', unit: 'letter', every: 2, offset: 1 } },
    ],
  };
  const entries = engine.scopedBgEntries(style);
  assert.deepEqual(entries.map((entry) => `${entry.group}:${entry.type}`), ['bgFill:solid', 'bgShape:none'], 'a preset expands to its primitive');
  const result = engine.applyScopedBg(baseVariation(scene), scene, style);
  // bgEveryOther paints #ff8a3d on the even letters
  assert.deepEqual(rgb(result[0]), [255, 138, 61]);
  assert.deepEqual(rgb(result[2]), [255, 138, 61]);
  assert.deepEqual(rgb(result[1]), [255, 255, 255], 'the odd letters keep the vary colour');
  // bgHideEveryOther hides the odd squares
  assert.deepEqual(result.map((entry) => entry.visible), [true, false, true, false, true, false]);
});

test('the scoped background signature changes with the scope', () => {
  // the engine caches the variation per beat, so the key has to carry the
  // scoped entries: a colour or a scope edit must not reuse the old entry
  const scene = makeScene('ABCD');
  const keyFor = (style) => {
    const scoped = engine.scopedBgEntries(style);
    return scoped.length
      ? JSON.stringify(scoped.map((entry) => [entry.group, entry.type, entry.params || {}, entry.scope || null]))
      : '';
  };
  const plain = keyFor({});
  const blue = keyFor({ scoped: [{ group: 'bgFill', type: 'solid', params: { color: '#1e50ff' }, scope: { kind: 'nth', unit: 'letter', every: 2, offset: 0 } }] });
  assert.notEqual(plain, blue, 'no scoped entry is an empty key');
  assert.notEqual(
    blue,
    keyFor({ scoped: [{ group: 'bgFill', type: 'solid', params: { color: '#1e50ff' }, scope: { kind: 'nth', unit: 'letter', every: 2, offset: 1 } }] }),
    'the scope is part of the key'
  );
  assert.notEqual(
    blue,
    keyFor({ scoped: [{ group: 'bgFill', type: 'solid', params: { color: '#00ff00' }, scope: { kind: 'nth', unit: 'letter', every: 2, offset: 0 } }] }),
    'the colour is part of the key'
  );
  assert.equal(
    blue,
    keyFor({ scoped: [{ group: 'bgFill', type: 'solid', params: { color: '#1e50ff' }, scope: { kind: 'nth', unit: 'letter', every: 2, offset: 0 } }] }),
    'the same style keeps the same key'
  );
  // ... and the override really does land on the letters
  const result = engine.applyScopedBg(baseVariation(scene), scene, {
    scoped: [{ group: 'bgFill', type: 'solid', params: { color: '#1e50ff' }, scope: { kind: 'nth', unit: 'letter', every: 2, offset: 0 } }],
  });
  assert.deepEqual(rgb(result[0]), [0x1e, 0x50, 0xff]);
});