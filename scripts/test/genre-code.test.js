const test = require('node:test');
const assert = require('node:assert');
const genres = require('../../renderer/js/lyrics/genres.js');

test('every genre carries a 4-byte axis code that decodes back to its axes', () => {
  for (const genre of genres.LIST) {
    assert.ok(Number.isInteger(genre.code) && genre.code >= 0 && genre.code <= 0xffffffff, genre.id);
    assert.strictEqual(genre.code >>> 28, 0, 'top nibble reserved');
    const back = genres.decodeAxes(genre.code);
    for (const axis of ['speed', 'energy', 'softness', 'density', 'brightness']) {
      assert.ok(Math.abs(back[axis] - genre.axes[axis]) <= 1 / 30 + 1e-9, `${genre.id}.${axis}`);
    }
    assert.strictEqual(genres.encodeAxes(back), genre.code);
  }
});

test('nibble order and range', () => {
  assert.strictEqual(genres.encodeAxes({ speed: 1, energy: 0, softness: 0, density: 0, brightness: 0, weird: 0, smartness: 0 }), 0xf000000);
  assert.strictEqual(genres.encodeAxes({ speed: 0, energy: 0, softness: 0, density: 0, brightness: 0, weird: 0, smartness: 1 }), 0xf);
});
