'use strict';

// Partial decorations (`style.scoped`): the scope masks and the motion rules
// (enter / exit replace, hold adds).

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const FX_DIR = path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects');
const fx = require(path.join(FX_DIR, 'registry.js'));
for (const name of ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'warp', 'animator', 'selector', 'camera', 'shape-layer', 'softbody']) {
  require(path.join(FX_DIR, `${name}.js`));
}
const scope = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'scope.js'));
const motion = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'motion.js'));

const FRAME = { width: 1920, height: 1080 };
const SIZE = 96;

// 'HELLO WORLD' as letters: word 0 is HELLO, word 1 is WORLD
function makeScene(text, styles) {
  const letters = [];
  let pen = 0;
  let word = 0;
  for (let i = 0; i < text.length; i += 1) {
    const width = SIZE * 0.6;
    letters.push({
      path: `cue:c1/beat:c1:single0/line:0/word:${word}/letter:${i}`,
      cueId: 'c1',
      beatId: 'c1:single0',
      lineIdx: 0,
      wordIdx: word,
      letterIdx: 0,
      globalIdx: i,
      char: text[i],
      textOffset: i,
      local: { x: pen, y: SIZE, w: width, h: SIZE, cx: pen + width / 2, cy: SIZE * 0.7, penX: pen, penY: SIZE },
      bbox: { x1: 0, y1: -SIZE, x2: width, y2: 0 },
      outlineLength: 400 + i * 10,
    });
    pen += width;
    if (text[i] === ' ') word += 1;
  }
  return {
    cueId: 'c1',
    beatId: 'c1:single0',
    kind: 'single',
    start: 0,
    end: 10,
    text,
    style: styles || {},
    letters,
    blockBBox: { x1: 0, y1: 0, x2: pen, y2: SIZE },
    size: SIZE,
    direction: 'horizontal',
  };
}

function maskOf(text, scopeSpec) {
  const scene = makeScene(text);
  return Array.from(scope.scopeMask(scene, scopeSpec), (value) => (value ? 1 : 0)).join('');
}

test('range masks select the code-point offsets', () => {
  assert.equal(maskOf('ABCDE', { kind: 'range', from: 1, to: 3 }), '01100');
  assert.equal(maskOf('ABCDE', { kind: 'range', from: 3 }), '00011');
  assert.equal(maskOf('ABCDE', null), '11111');
});

test('word masks select whole words', () => {
  assert.equal(maskOf('HELLO WORLD', { kind: 'word', words: [0] }), '11111100000');
  assert.equal(maskOf('HELLO WORLD', { kind: 'word', words: [1] }), '00000011111');
});

test('keyword masks select every occurrence inside a line', () => {
  assert.equal(maskOf('HELLO WORLD', { kind: 'keyword', match: 'WORLD' }), '00000011111');
  assert.equal(maskOf('ABAB', { kind: 'keyword', match: 'AB' }), '1111');
  assert.equal(maskOf('HELLO', { kind: 'keyword', match: 'XYZ' }), '00000');
});

test('span masks follow the composition span identity', () => {
  const scene = makeScene('ABCD');
  const span = { from: 1, to: 3, scale: 1.2 };
  scene.style.text = { compose: { spans: [span] } };
  scene.letters[1].span = span;
  scene.letters[2].span = span;
  assert.equal(Array.from(scope.scopeMask(scene, { kind: 'span', spanIndex: 0 }), (v) => (v ? 1 : 0)).join(''), '0110');
});

test('nth masks take every Nth letter, word or line', () => {
  // every other letter
  assert.equal(maskOf('ABCDE', { kind: 'nth', unit: 'letter', every: 2, offset: 0 }), '10101');
  assert.equal(maskOf('ABCDE', { kind: 'nth', unit: 'letter', every: 2, offset: 1 }), '01010');
  // every third letter, and the offset wraps with the period
  assert.equal(maskOf('ABCDE', { kind: 'nth', unit: 'letter', every: 3, offset: 0 }), '10010');
  assert.equal(maskOf('ABCDE', { kind: 'nth', unit: 'letter', every: 3, offset: 3 }), '10010');
  // every 1 is everything
  assert.equal(maskOf('ABC', { kind: 'nth', unit: 'letter', every: 1, offset: 0 }), '111');
  // whole words (the space belongs to the word before it, like the `word` scope)
  assert.equal(maskOf('HELLO WORLD', { kind: 'nth', unit: 'word', every: 2, offset: 0 }), '11111000000');
  assert.equal(maskOf('HELLO WORLD', { kind: 'nth', unit: 'word', every: 2, offset: 1 }), '00000011111');
  // a single line is line 0
  assert.equal(maskOf('HELLO', { kind: 'nth', unit: 'line', every: 1, offset: 0 }), '11111');
});

test('nth counts the letters the background variation counts', () => {
  // the spaces and the punctuation do not join the running index, so the mask
  // lines up with vary: alternate
  const spaced = maskOf('A B！C', { kind: 'nth', unit: 'letter', every: 2, offset: 0 });
  assert.equal(spaced, '10001', 'A and C take the even slots');
  assert.equal(maskOf('A B！C', { kind: 'nth', unit: 'letter', every: 2, offset: 1 }), '00100');
  // skipSpaces: false counts every code point instead
  assert.equal(maskOf('A B！C', { kind: 'nth', unit: 'letter', every: 2, offset: 0, skipSpaces: false }), '10101');
  assert.equal(maskOf('A B！C', { kind: 'nth', unit: 'letter', every: 2, offset: 1, skipSpaces: false }), '01010');
});

test('maskForText decides the scopes that do not need the layout', () => {
  const text = 'HELLO WORLD';
  const mask = (spec, compose) => Array.from(scope.maskForText(text, spec, compose), (value) => (value ? 1 : 0)).join('');
  assert.equal(mask(null), '11111111111');
  assert.equal(mask({ kind: 'range', from: 1, to: 3 }), '01100000000');
  assert.equal(mask({ kind: 'keyword', match: 'WORLD' }), '00000011111');
  assert.equal(mask({ kind: 'keyword', match: 'LL' }), '00110000000');
  // the space is skipped, so it takes no slot and the parity flips after it
assert.equal(mask({ kind: 'nth', unit: 'letter', every: 2, offset: 0 }), '10101001010');
  assert.equal(mask({ kind: 'span', spanIndex: 0 }, { spans: [{ from: 6, to: 11 }] }), '00000011111');
  assert.equal(mask({ kind: 'span', spanIndex: 3 }, { spans: [{ from: 6, to: 11 }] }), '00000000000');
  // word / line units are not decidable before the wrap
  assert.equal(mask({ kind: 'nth', unit: 'word', every: 2, offset: 0 }), '00000000000');
  assert.equal(mask({ kind: 'nth', unit: 'line', every: 1, offset: 0 }), '00000000000');
});

test('maskForText and scopeMask agree where both can decide', () => {
  // the scene mask needs the built letters; the layout mask counts the text
  for (const spec of [
    { kind: 'range', from: 1, to: 4 },
    { kind: 'keyword', match: 'WORLD' },
    { kind: 'nth', unit: 'letter', every: 2, offset: 1 },
    { kind: 'nth', unit: 'letter', every: 3, offset: 2 },
  ]) {
    const scene = makeScene('ABCDE FGH');
    const fromScene = Array.from(scope.scopeMask(scene, spec), (value) => (value ? 1 : 0)).join('');
    const fromText = Array.from(scope.maskForText('ABCDE FGH', spec), (value) => (value ? 1 : 0)).join('');
    assert.equal(fromText, fromScene, `${JSON.stringify(spec)} differs`);
  }
});

test('a scoped enter replaces the base enter only for the covered letters', () => {
  const scene = makeScene('ABCDE', {
    animation: { type: 'simultaneous' },
    enter: { type: 'fade', motion: { in: { duration: 0.4, ease: 'linear' } } },
    scoped: [
      {
        group: 'enter',
        type: 'slide',
        params: { dir: 'up', distance: 0.5 },
        motion: { in: { duration: 0.4, delay: 0, ease: 'linear' } },
        scope: { kind: 'range', from: 1, to: 2 },
      },
    ],
  });
  const beat = { id: 'c1:single0', cueId: 'c1', kind: 'single', start: 0, end: 10, text: scene.text };
  const result = motion.evaluateBeat(scene, 0.2, { frame: FRAME, seed: 42, beat });
  // letter 1 slides up, its neighbours only fade
  assert.ok(result.letters[1].y < result.letters[0].y - 50, `scoped letter did not move (${result.letters[1].y})`);
  assert.equal(result.letters[0].y, result.letters[2].y);
  // the base fade still runs for everyone
  assert.ok(result.letters[0].opacity > 0 && result.letters[0].opacity < 1);
});

test('a scoped hold is appended for the covered letters only', () => {
  const base = { animation: { type: 'simultaneous' }, enter: { type: 'fade' } };
  const plainScene = makeScene('ABCDE', base);
  const scopedScene = makeScene('ABCDE', {
    ...base,
    scoped: [{ group: 'hold', type: 'drift', params: { vx: 0.5, vy: 0 }, scope: { kind: 'range', from: 2, to: 4 } }],
  });
  const beat = { id: 'c1:single0', cueId: 'c1', kind: 'single', start: 0, end: 10, text: 'ABCDE' };
  const plain = motion.evaluateBeat(plainScene, 2, { frame: FRAME, seed: 42, beat });
  const scoped = motion.evaluateBeat(scopedScene, 2, { frame: FRAME, seed: 42, beat });
  assert.equal(scoped.letters[0].x, plain.letters[0].x);
  assert.equal(scoped.letters[1].x, plain.letters[1].x);
  assert.equal(scoped.letters[4].x, plain.letters[4].x);
  assert.ok(scoped.letters[2].x > plain.letters[2].x + 50, `letter 2 did not drift (${scoped.letters[2].x})`);
  assert.ok(scoped.letters[3].x > plain.letters[3].x + 50, `letter 3 did not drift (${scoped.letters[3].x})`);
});
