'use strict';

const test = require('node:test');
const assert = require('node:assert');

const tween = require('../../renderer/js/lyrics/tween');
const color = require('../../renderer/js/color');

test('number tween with linear ease', () => {
  assert.strictEqual(tween.value('number', 10, 20, 0.5, 'linear'), 15);
  assert.strictEqual(tween.value('number', 10, 20, 0, 'linear'), 10);
  assert.strictEqual(tween.value('number', 10, 20, 1, 'linear'), 20);
});

test('ease is applied exactly once', () => {
  assert.strictEqual(tween.value('number', 0, 1, 0.5, 'quadIn'), 0.25);
  assert.strictEqual(tween.value('number', 0, 1, 0.5, 'quadOut'), 0.75);
});

test('int rounds, bool switches at half, step switches at one', () => {
  assert.strictEqual(tween.value('int', 0, 10, 0.44, 'linear'), 4);
  assert.strictEqual(tween.value('int', 0, 10, 0.46, 'linear'), 5);
  assert.strictEqual(tween.value('bool', 'before', 'after', 0.49, 'linear'), 'before');
  assert.strictEqual(tween.value('bool', 'before', 'after', 0.51, 'linear'), 'after');
  assert.strictEqual(tween.value('step', 'a', 'b', 0.99, 'linear'), 'a');
  assert.strictEqual(tween.value('step', 'a', 'b', 1, 'linear'), 'b');
});

test('vec2 and points interpolate', () => {
  const vec = tween.value('vec2', [0, 0], [10, 20], 0.5, 'linear');
  assert.deepStrictEqual(vec, [5, 10]);
  const points = tween.value('points', [{ x: 0, y: 0 }], [{ x: 0, y: 0 }, { x: 10, y: 10 }], 0.5, 'linear');
  assert.strictEqual(points.length, 2);
  assert.strictEqual(points[1].x, 5);
});

test('color tween matches OKLab lerpColorValue', () => {
  const a = color.resolve({ kind: 'solid', value: '#ff0000' });
  const b = color.resolve({ kind: 'solid', value: '#0000ff' });
  const tweened = tween.value('color', a, b, 0.5, 'linear');
  const expected = color.lerpColorValue(a, b, 0.5);
  assert.strictEqual(color.toHex(tweened.rgba), color.toHex(expected.rgba));
});

test('segment clamps before the first and after the last key', () => {
  const track = { kind: 'number', keys: [{ t: 1, value: 10, ease: 'linear' }, { t: 3, value: 30, ease: 'linear' }] };
  assert.strictEqual(tween.segment(track, 0), 10);
  assert.strictEqual(tween.segment(track, 2), 20);
  assert.strictEqual(tween.segment(track, 9), 30);
});

test('segment uses the starting key ease', () => {
  const track = { kind: 'number', keys: [{ t: 0, value: 0, ease: 'quadIn' }, { t: 1, value: 1, ease: 'linear' }] };
  assert.strictEqual(tween.segment(track, 0.5), 0.25);
});
