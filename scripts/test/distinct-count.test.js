'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const counting = require('../distinct-count.js');
const fx = require('../../renderer/js/lyrics/effects/registry.js');
require('../../renderer/js/lyrics/effects/repeat.js');
const repeat = require('../../renderer/js/lyrics/effects/repeat.js');

test('speed buckets: ±10% is the same, 2x is different', () => {
  assert.equal(counting.timeBucket(0.2), counting.timeBucket(0.22));
  assert.notEqual(counting.timeBucket(0.2), counting.timeBucket(0.4));
});

test('easing families: quadOut and cubicOut match, backOut differs', () => {
  assert.equal(counting.easeFamily('quadOut'), counting.easeFamily('cubicOut'));
  assert.notEqual(counting.easeFamily('quadOut'), counting.easeFamily('backOut'));
  assert.equal(counting.easeFamily('linear'), 'linear');
  assert.equal(counting.easeFamily('spring(170,26,1)'), 'elastic');
});

test('size buckets: 1.2x is the same, 1.6x is different', () => {
  assert.equal(counting.sizeBucket(1.2), counting.sizeBucket(1));
  assert.notEqual(counting.sizeBucket(1.6), counting.sizeBucket(1));
});

test('count bins follow the design table', () => {
  assert.equal(repeat.countBin('stackV', { copies: 2 }), repeat.countBin('stackV', { copies: 3 }), 'straight 3 and 4 copies are the same');
  assert.notEqual(repeat.countBin('grid', { copies: 2 }), repeat.countBin('grid', { copies: 3 }), 'grid tri and quad differ');
  assert.notEqual(repeat.countBin('grid', { copies: 3 }), repeat.countBin('grid', { copies: 'many' }), 'quad and many differ');
  assert.equal(repeat.countBin('stackV', { copies: 'many' }), 'many');
  assert.equal(repeat.countBin('grid', { copies: 'many' }), 'many');
});

test('many covers 6 and 9 copies with one bin', () => {
  assert.equal(repeat.expectedTotal('stackV', { copies: 'many' }), 6);
  assert.equal(repeat.expectedTotal('grid', { copies: 'many' }), 9);
  assert.equal(repeat.countBin('stackV', { copies: 'many' }), repeat.countBin('grid', { copies: 'many' }));
});

test('two copies degrade alternate to oddOne', () => {
  const alternate = repeat.normalize('stackV', { copies: 2, var1Attr: 'size', var1Rule: 'alternate' });
  const oddOne = repeat.normalize('stackV', { copies: 2, var1Attr: 'size', var1Rule: 'oddOne' });
  assert.equal(alternate.var1Rule, 'oddOne');
  assert.deepEqual(alternate, oddOne);
});

test('copy gaps below 1em read as an echo', () => {
  assert.equal(counting.overlapClass(0.8), 'echo');
  assert.equal(counting.overlapClass(1.0), 'separated');
  assert.equal(counting.overlapClass(2.5), 'separated');
});

test('hue shifts quantize to the basic colour names', () => {
  assert.equal(counting.hueName(0), counting.hueName(360));
  assert.notEqual(counting.hueName(0), counting.hueName(60));
});

test('the acceptance targets are met', () => {
  const report = counting.countSignatures();
  assert.ok(report.repeat.signatures >= 300, `repeat signatures ${report.repeat.signatures}`);
  assert.ok(report.total >= 800, `total signatures ${report.total}`);
  assert.ok(report.groups.post > 0 && report.groups.repeat > 0);
});
