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
