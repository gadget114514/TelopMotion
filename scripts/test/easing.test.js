'use strict';

const test = require('node:test');
const assert = require('node:assert');

const easing = require('../../renderer/js/lyrics/easing');

function close(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} != ${expected}`);
}

test('at least 30 named tween curves are registered', () => {
  assert.ok(easing.names.length >= 30, `only ${easing.names.length} curves`);
});

test('every curve starts at 0 and ends at 1', () => {
  for (const name of easing.names) {
    const fn = easing.get(name);
    close(fn(0), 0, 1e-6, `${name}(0)`);
    close(fn(1), 1, 1e-6, `${name}(1)`);
  }
});

test('every name resolves through parse and get', () => {
  for (const name of easing.names) {
    assert.strictEqual(typeof easing.parse(name), 'function');
    assert.strictEqual(typeof easing.get(name), 'function');
  }
});

test('parameterized forms parse', () => {
  close(easing.parse('cubic-bezier(0.25, 0.1, 0.25, 1)')(0.5), 0.8024, 1e-3, 'cubic-bezier');
  close(easing.parse('spring(170,26,1)')(0), 0, 1e-6, 'spring(0)');
  close(easing.parse('spring(170,26,1)')(1), 1, 1e-6, 'spring(1)');
  close(easing.parse('steps(4,end)')(0.6), 0.5, 1e-9, 'steps end');
  close(easing.parse('steps(4,start)')(0.6), 0.75, 1e-9, 'steps start');
  close(easing.parse('hold')(0.99), 0, 1e-9, 'hold before end');
  close(easing.parse('hold')(1), 1, 1e-9, 'hold at end');
  close(easing.parse('unknown-name')(0.5), 0.5, 1e-9, 'fallback linear');
});

test('ease-prefixed aliases resolve to the canonical curves', () => {
  assert.strictEqual(easing.canonical('easeOutCubic'), 'cubicOut');
  assert.strictEqual(easing.canonical('easeInOutSine'), 'sineInOut');
  assert.strictEqual(easing.canonical('easeOutBack'), 'backOut');
  assert.strictEqual(easing.canonical('easeOutElastic'), 'elasticOut');
  assert.strictEqual(easing.canonical('ease'), 'cubicInOut');
  assert.strictEqual(easing.canonical('cubicOut'), 'cubicOut');
  assert.strictEqual(easing.canonical('spring(170,26,1)'), 'spring(170,26,1)');
  close(easing.get('easeOutCubic')(0.5), easing.get('cubicOut')(0.5), 1e-12, 'easeOutCubic');
  close(easing.get('easeOutQuart')(0.3), easing.get('quartOut')(0.3), 1e-12, 'easeOutQuart');
});

test('cubic-bezier reference value', () => {
  close(easing.cubicBezier(0.25, 0.1, 0.25, 1)(0.5), 0.8024, 1e-3, 'bezier(0.5)');
});

test('InOut curves are symmetric', () => {
  for (const name of easing.names) {
    if (!name.endsWith('InOut')) continue;
    const fn = easing.get(name);
    for (const t of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      close(fn(t) + fn(1 - t), 1, 1e-6, `${name}(${t})`);
    }
  }
});

test('spring endpoints hold for other configurations', () => {
  for (const options of [{ stiffness: 100, damping: 10 }, { stiffness: 200, damping: 40 }, { stiffness: 60, damping: 8 }]) {
    const fn = easing.spring(options);
    close(fn(0), 0, 1e-6, 'spring(0)');
    close(fn(1), 1, 1e-6, 'spring(1)');
  }
});
