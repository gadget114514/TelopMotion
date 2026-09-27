'use strict';

const test = require('node:test');
const assert = require('node:assert');

const lrc = require('../../renderer/js/lrc');

test('formatTime and parseTime round-trip', () => {
  assert.strictEqual(lrc.formatTime(62.34), '01:02.34');
  assert.strictEqual(lrc.formatTime(3723.5), '62:03.50');
  assert.ok(Math.abs(lrc.parseTime('[01:02.34]') - 62.34) < 1e-9);
  assert.ok(Math.abs(lrc.parseTime('02:03') - 123) < 1e-9);
  assert.ok(Math.abs(lrc.parseTime('1:02:03.5') - 3723.5) < 1e-9);
  assert.strictEqual(lrc.parseTime('nope'), 0);
});

test('parse reads metadata, multiple tags and instrumental markers', () => {
  const source = [
    '[ti:Smoke Song]',
    '[ar:Artist]',
    '[offset:+500]',
    '[00:01.00][00:10.00]Repeated line',
    '[00:05.00]',
    '[00:06.50]Second line',
    '',
  ].join('\r\n');
  const { cues, warnings, meta } = lrc.parse('\uFEFF' + source);
  assert.strictEqual(warnings.length, 0);
  assert.strictEqual(meta.ti, 'Smoke Song');
  assert.strictEqual(meta.ar, 'Artist');
  assert.strictEqual(cues.length, 3);
  assert.deepStrictEqual(cues.map((cue) => cue.text), ['Repeated line', 'Second line', 'Repeated line']);
  // offset +500 ms shifts the tags 0.5 s earlier
  assert.deepStrictEqual(cues.map((cue) => cue.start), [0.5, 6, 9.5]);
  assert.strictEqual(cues[0].end, 4.5); // closes at the instrumental marker
  assert.strictEqual(cues[1].end, 9.5); // closes at the repeated tag
  assert.ok(cues[2].end - cues[2].start >= 2.5);
  assert.strictEqual(cues[0].meta.kind, 'custom');
});

test('parse keeps enhanced word timings out of the text', () => {
  const { cues } = lrc.parse('[00:01.00]<00:01.00>Hello <00:01.50>world');
  assert.strictEqual(cues.length, 1);
  assert.strictEqual(cues[0].text, 'Hello world');
  assert.deepStrictEqual(cues[0].words, [
    { t: 1, text: 'Hello ' },
    { t: 1.5, text: 'world' },
  ]);
});

test('parse warns about lines without a time tag and fixes bad ranges', () => {
  const { cues, warnings } = lrc.parse('no time here\n[00:02.00]Only line');
  assert.strictEqual(cues.length, 1);
  assert.strictEqual(warnings.filter((warning) => warning.code === 'no-time').length, 1);
  const same = lrc.parse('[00:03.00]A\n[00:03.00]B');
  assert.strictEqual(same.warnings.filter((warning) => warning.code === 'end-before-start').length, 1);
  assert.strictEqual(same.cues[0].end, same.cues[0].start + 1);
});

test('stringify writes metadata and parses back to the same times', () => {
  const cues = [
    { id: 'a', start: 1.25, end: 3.5, text: 'First line', meta: { kind: 'custom' } },
    { id: 'b', start: 4, end: 6, text: 'Two\nlines', meta: { kind: 'custom' } },
  ];
  const text = lrc.stringify(cues, { meta: { ti: 'Title', ar: 'Artist', offset: 0 } });
  assert.ok(text.startsWith('[ti:Title]\r\n[ar:Artist]'));
  const parsed = lrc.parse(text);
  assert.strictEqual(parsed.cues.length, 2);
  assert.deepStrictEqual(parsed.cues.map((cue) => cue.start), [1.25, 4]);
  assert.strictEqual(parsed.cues[1].text, 'Two / lines');
});
