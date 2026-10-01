'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

require('../../renderer/js/lyrics/effects/registry.js');
require('../../renderer/js/lyrics/effects/text-bg.js');
const vary = require('../../renderer/js/lyrics/effects/vary.js');

function letters(chars) {
  return chars.map((char, index) => ({ char, lineIdx: 0, wordIdx: 0, path: `l${index}` }));
}

test('classIndex classifies scripts', () => {
  assert.equal(vary.classIndex('漢'), 0);
  assert.equal(vary.classIndex('あ'), 1);
  assert.equal(vary.classIndex('ア'), 2);
  assert.equal(vary.classIndex('ー'), 2);
  assert.equal(vary.classIndex('A'), 3);
  assert.equal(vary.classIndex('1'), 4);
  assert.equal(vary.classIndex('！'), 5);
  assert.equal(vary.classIndex('。'), 5);
});

test('alternate alternates the colour between visible letters', () => {
  const params = { vary: 'alternate', varyColors: ['#000000', '#ffffff'], skipSpaces: false };
  const result = vary.letterVariation(params, letters(['a', 'b', 'c', 'd']), [], 'seed');
  const first = result[0].color;
  const second = result[1].color;
  assert.notDeepEqual(first, second);
  assert.deepEqual(result[0].color, result[2].color);
  assert.deepEqual(result[1].color, result[3].color);
});

test('cycle runs through the colour list', () => {
  const params = { vary: 'cycle', varyColors: ['#000000', '#808080', '#ffffff'], skipSpaces: false };
  const result = vary.letterVariation(params, letters(['a', 'b', 'c', 'd']), [], 'seed');
  assert.deepEqual(result[0].color, result[3].color);
  assert.notDeepEqual(result[0].color, result[1].color);
  assert.notDeepEqual(result[1].color, result[2].color);
});

test('skipSpaces does not count skipped characters', () => {
  const params = { vary: 'alternate', varyColors: ['#000000', '#ffffff'], skipSpaces: true };
  const result = vary.letterVariation(params, letters(['a', ' ', 'b', '！', 'c']), [], 'seed');
  assert.equal(result[1].visible, false, 'space skipped');
  assert.equal(result[3].visible, false, 'punctuation skipped');
  assert.deepEqual(result[0].color, result[4].color, 'alternate counts only visible letters');
  assert.notDeepEqual(result[0].color, result[2].color);
});

test('first and last keep only the line edge letters visible', () => {
  const first = vary.letterVariation({ vary: 'first', skipSpaces: true }, letters(['a', 'b', 'c']), [], 'seed');
  assert.deepEqual(first.map((entry) => entry.visible), [true, false, false]);
  const last = vary.letterVariation({ vary: 'last', skipSpaces: true }, letters(['a', 'b', 'c']), [], 'seed');
  assert.deepEqual(last.map((entry) => entry.visible), [false, false, true]);
});

test('the same seed produces the same result', () => {
  const params = { vary: 'random', varyColors: ['#111111', '#222222', '#333333'], varySize: 0.5, varyOffset: 0.4, varyRotation: 30 };
  const a = vary.letterVariation(params, letters(['a', 'b', 'c', 'd']), [], 'same');
  const b = vary.letterVariation(params, letters(['a', 'b', 'c', 'd']), [], 'same');
  assert.deepEqual(a, b);
  const c = vary.letterVariation(params, letters(['a', 'b', 'c', 'd']), [], 'other');
  assert.notDeepEqual(a, c);
});

test('skipRate leaves at least one background per line', () => {
  const params = { vary: 'none', skipRate: 1, skipSpaces: false };
  const result = vary.letterVariation(params, letters(['a', 'b', 'c']), [], 'seed');
  assert.ok(result.some((entry) => entry.visible), 'one letter is restored');
});

test('fgAutoContrast returns a readable foreground colour', () => {
  const result = vary.letterVariation(
    { vary: 'none', fgAutoContrast: true, varyColors: [], skipSpaces: false },
    letters(['a']),
    [],
    'seed'
  );
  assert.ok(result[0].fgColor, 'fgColor present');
  assert.ok(result[0].fgColor[0] < 0.2, 'dark text on a bright mask default');
});

test('fgColors pairs the text colour with the background colour per letter', () => {
  const params = {
    vary: 'alternate',
    varyColors: ['#1e50ff', '#ffffff'],
    fgColors: ['#ffffff', '#1e50ff'],
    skipSpaces: false,
  };
  const result = vary.letterVariation(params, letters(['a', 'b', 'c', 'd']), [], 'seed');
  // the inverted pair: blue square / white text, then white square / blue text
  assert.deepEqual(result[0].color.slice(0, 3), [0x1e / 255, 0x50 / 255, 0xff / 255]);
  assert.deepEqual(result[0].fgColor.slice(0, 3), [1, 1, 1]);
  assert.deepEqual(result[1].fgColor.slice(0, 3), [0x1e / 255, 0x50 / 255, 0xff / 255]);
  assert.deepEqual(result[2].fgColor, result[0].fgColor, 'index 2 repeats index 0');
  assert.deepEqual(result[3].fgColor, result[1].fgColor, 'index 3 repeats index 1');
});

test('fgColors wraps by its own length, not the background list', () => {
  // three background colours, two text colours: the vary key runs 0,1,2 but
  // the text colour wraps on its own pair
  const wide = {
    vary: 'cycle',
    varyColors: ['#000000', '#808080', '#c0c0c0'],
    fgColors: ['#111111', '#222222'],
    skipSpaces: false,
  };
  const six = 'abcdef'.split('');
  const result = vary.letterVariation(wide, letters(six), [], 'seed');
  assert.notDeepEqual(result[0].color, result[1].color);
  assert.notDeepEqual(result[1].color, result[2].color);
  assert.deepEqual(result[0].fgColor, [0x11 / 255, 0x11 / 255, 0x11 / 255, 1]);
  assert.deepEqual(result[1].fgColor, [0x22 / 255, 0x22 / 255, 0x22 / 255, 1]);
  assert.deepEqual(result[2].fgColor, result[0].fgColor, 'the pair wraps at index 2, not 3');
  assert.deepEqual(result[3].fgColor, result[1].fgColor);
  assert.deepEqual(result[4].fgColor, result[0].fgColor);
  assert.deepEqual(result[5].fgColor, result[1].fgColor);
  // the other way round: two background colours, three text colours. The vary
  // key only reaches 1, so the third colour never comes up
  const narrow = { ...wide, varyColors: ['#000000', '#808080'] };
  const wrapped = vary.letterVariation(narrow, letters(six), [], 'seed');
  assert.deepEqual(wrapped.map((entry) => entry.fgColor), [wrapped[0].fgColor, wrapped[1].fgColor, wrapped[0].fgColor, wrapped[1].fgColor, wrapped[0].fgColor, wrapped[1].fgColor]);
  assert.deepEqual(wrapped[1].fgColor, [0x22 / 255, 0x22 / 255, 0x22 / 255, 1]);
});

test('fgColors wins over fgAutoContrast', () => {
  const params = {
    vary: 'alternate',
    varyColors: ['#ffffff', '#000000'],
    fgColors: ['#1e50ff', '#1e50ff'],
    fgAutoContrast: true,
    skipSpaces: false,
  };
  const result = vary.letterVariation(params, letters(['a', 'b']), [], 'seed');
  assert.deepEqual(result[0].fgColor.slice(0, 3), [0x1e / 255, 0x50 / 255, 0xff / 255]);
  assert.deepEqual(result[1].fgColor, result[0].fgColor);
});

test('a skipped letter keeps no fgColor', () => {
  const params = { vary: 'alternate', varyColors: ['#000000', '#ffffff'], fgColors: ['#ff0000', '#00ff00'], skipSpaces: true };
  const result = vary.letterVariation(params, letters(['a', ' ', 'b']), [], 'seed');
  assert.ok(result[0].fgColor, 'a visible letter');
  assert.equal(result[1].fgColor, null, 'the space carries no text colour');
  assert.ok(result[2].fgColor, 'b visible');
  assert.notDeepEqual(result[0].fgColor, result[2].fgColor, 'alternate counts only visible letters');
});

test('only the first letter keeps a fgColor in first mode', () => {
  const result = vary.letterVariation(
    { vary: 'first', varyColors: ['#000000', '#ffffff'], fgColors: ['#ff0000', '#00ff00'], skipSpaces: false },
    letters(['a', 'b', 'c']),
    [],
    'seed'
  );
  assert.deepEqual(result.map((entry) => entry.visible), [true, false, false]);
  assert.ok(result[0].fgColor, 'the line head is coloured');
  assert.equal(result[1].fgColor, null, 'a hidden letter has no text colour');
  assert.equal(result[2].fgColor, null);
});

test('an empty fgColors leaves every letter on the beat fill', () => {
  const params = { vary: 'alternate', varyColors: ['#000000', '#ffffff'], fgColors: [], skipSpaces: false };
  const result = vary.letterVariation(params, letters(['a', 'b']), [], 'seed');
  assert.equal(result[0].fgColor, null);
  assert.equal(result[1].fgColor, null);
});
