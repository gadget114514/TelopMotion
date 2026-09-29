'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const fontSet = require('../../renderer/js/lyrics/fontset.js');

const CATALOG = {
  'NotoSans-Regular': { fontClass: 'sans', cjk: false },
  'NotoSerif-Regular': { fontClass: 'serif', cjk: false },
  'DelaGothicOne-Regular': { fontClass: 'display', cjk: true },
  'user:aaaa': { cjk: true },
  'user:bbbb': { cjk: false },
};
const info = (id) => CATALOG[id] || null;

test('normalize drops duplicates, unknown classes and defaults to exclusive', () => {
  const set = fontSet.normalize({ fonts: ['user:aaaa', { id: 'user:aaaa' }, { id: 'user:bbbb', fontClass: 'nope' }, { id: 'NotoSerif-Regular', fontClass: 'serif' }] });
  assert.equal(set.exclusive, true);
  assert.deepEqual(set.fonts, [
    { id: 'user:aaaa', fontClass: null },
    { id: 'user:bbbb', fontClass: null },
    { id: 'NotoSerif-Regular', fontClass: 'serif' },
  ]);
  assert.equal(fontSet.normalize(null).exclusive, false, 'an empty set is the default set');
  assert.equal(fontSet.normalize({ exclusive: false, fonts: ['user:aaaa'] }).exclusive, false);
});

test('exclusive mode maps every requested font onto the set', () => {
  const set = fontSet.normalize({ fonts: [{ id: 'user:aaaa', fontClass: 'round' }, { id: 'user:bbbb', fontClass: 'serif' }] });
  assert.equal(fontSet.resolveId(set, 'user:bbbb', info), 'user:bbbb', 'a member stays itself');
  assert.equal(fontSet.resolveId(set, 'NotoSerif-Regular', info), 'user:bbbb', 'same class wins');
  assert.equal(fontSet.resolveId(set, 'DelaGothicOne-Regular', info), 'user:aaaa', 'otherwise the main font');
  assert.equal(fontSet.resolveId(set, null, info), 'user:aaaa');
});

test('non-exclusive and empty sets leave the requested font alone', () => {
  const loose = fontSet.normalize({ exclusive: false, fonts: ['user:aaaa'] });
  assert.equal(fontSet.resolveId(loose, 'NotoSerif-Regular', info), 'NotoSerif-Regular');
  assert.equal(fontSet.resolveId(fontSet.normalize(null), 'NotoSerif-Regular', info), 'NotoSerif-Regular');
});

test('order puts the resolved font first, then the set, then fallbacks', () => {
  const set = fontSet.normalize({ fonts: ['user:bbbb', 'user:aaaa'] });
  const list = ['NotoSans-Regular', 'user:aaaa', 'user:bbbb'].map((id) => ({ id }));
  assert.deepEqual(fontSet.order(list, 'user:aaaa', set, info).map((entry) => entry.id), ['user:aaaa', 'user:bbbb', 'NotoSans-Regular']);
  assert.deepEqual(fontSet.order(list, 'NotoSerif-Regular', set, info).map((entry) => entry.id), ['user:bbbb', 'user:aaaa', 'NotoSans-Regular']);
});

test('only set fonts carry a variation class in exclusive mode', () => {
  const set = fontSet.normalize({ fonts: [{ id: 'user:aaaa', fontClass: 'hand' }, 'NotoSerif-Regular'] });
  assert.equal(fontSet.classOf(set, 'user:aaaa', info), 'hand');
  assert.equal(fontSet.classOf(set, 'NotoSerif-Regular', info), 'serif', 'bundled class when none is set');
  assert.equal(fontSet.classOf(set, 'NotoSans-Regular', info), null, 'fallback fonts do not vary');
});

test('the random pool prefers set fonts with Japanese glyphs for Japanese text', () => {
  const set = fontSet.normalize({ fonts: ['user:bbbb', 'user:aaaa'] });
  assert.deepEqual(fontSet.pool(set, false, info), ['user:bbbb', 'user:aaaa']);
  assert.deepEqual(fontSet.pool(set, true, info), ['user:aaaa']);
  assert.deepEqual(fontSet.pool(fontSet.normalize({ exclusive: false, fonts: ['user:aaaa'] }), true, info), []);
  assert.equal(fontSet.userId('0123456789abcdef0123'), 'user:0123456789abcdef');
});
