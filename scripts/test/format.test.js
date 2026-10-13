'use strict';

const test = require('node:test');
const assert = require('node:assert');

// Setup global window and SA.i18n mock/module for format.js
global.window = global.window || global;
require('../../renderer/js/i18n');
require('../../renderer/js/format');

const format = global.SA.format;

test('esc escapes special HTML characters', () => {
  assert.strictEqual(format.esc('hello & world'), 'hello &amp; world');
  assert.strictEqual(format.esc('<div class="test">\'it\'s\'</div>'), '&lt;div class=&quot;test&quot;&gt;&#39;it&#39;s&#39;&lt;/div&gt;');
  assert.strictEqual(format.esc(null), '');
  assert.strictEqual(format.esc(undefined), '');
  assert.strictEqual(format.esc(123), '123');
});

test('fmtInt formats integers according to locale', () => {
  const result = format.fmtInt(1234567);
  assert.ok(result.includes('1') && result.includes('234') && result.includes('567'));
  assert.strictEqual(format.fmtInt(0), '0');
  assert.strictEqual(format.fmtInt(null), '0');
});

test('fmtNum uses compact notation for numbers >= 10000 and fmtInt for smaller numbers', () => {
  const small = format.fmtNum(9999);
  assert.ok(small.includes('9') && small.includes('999'));

  const large = format.fmtNum(50000);
  assert.ok(large.includes('50') || large.includes('5'));
});

test('fmtDate formats valid ISO dates and returns empty string for invalid dates', () => {
  const dateStr = format.fmtDate('2026-01-15T00:00:00Z');
  assert.ok(dateStr.includes('2026'));
  assert.strictEqual(format.fmtDate(''), '');
  assert.strictEqual(format.fmtDate(null), '');
  assert.strictEqual(format.fmtDate('invalid-date'), '');
});

test('fmtDuration formats seconds into hours and minutes', () => {
  assert.strictEqual(format.fmtDuration(0), '—');
  assert.strictEqual(format.fmtDuration(null), '—');
  assert.strictEqual(format.fmtDuration(300), '5m');
  assert.strictEqual(format.fmtDuration(3660), '1h 1m');
  assert.strictEqual(format.fmtDuration(7200), '2h 0m');
});

test('fmtClock formats seconds into M:SS clock string', () => {
  assert.strictEqual(format.fmtClock(0), '');
  assert.strictEqual(format.fmtClock(null), '');
  assert.strictEqual(format.fmtClock(65), '1:05');
  assert.strictEqual(format.fmtClock(3600), '60:00');
  assert.strictEqual(format.fmtClock(9.2), '0:09');
});

test('detailText formats badge details for song, count, and date', () => {
  assert.strictEqual(format.detailText({}), '');
  assert.strictEqual(format.detailText({ detail: null }), '');

  const songDetail = {
    detail: {
      type: 'song',
      stat: 'plays',
      song: { title: 'My Song', plays: 1200 },
    },
  };
  const songText = format.detailText(songDetail);
  assert.ok(songText.startsWith('My Song · '));

  const countDetail = {
    detail: { type: 'count', n: 5 },
  };
  assert.ok(format.detailText(countDetail).includes('5'));

  const dateDetail = {
    detail: { type: 'date', value: '2026-05-10T00:00:00Z' },
  };
  assert.ok(format.detailText(dateDetail).includes('2026'));
});
