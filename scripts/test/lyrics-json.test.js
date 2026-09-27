'use strict';

const test = require('node:test');
const assert = require('node:assert');

const lyricsJson = require('../../renderer/js/lyrics-json');

test('parse accepts an array of cue objects', () => {
  const { cues, warnings } = lyricsJson.parse(
    JSON.stringify([
      { start: 0.5, end: 2, text: 'Hello' },
      { start: 2.5, end: 4, text: 'World' },
    ])
  );
  assert.strictEqual(warnings.length, 0);
  assert.strictEqual(cues.length, 2);
  assert.deepStrictEqual(cues.map((cue) => cue.start), [0.5, 2.5]);
  assert.strictEqual(cues[1].end, 4);
  assert.strictEqual(cues[0].meta.kind, 'custom');
});

test('parse accepts Whisper-style segments and derives missing ends', () => {
  const { cues } = lyricsJson.parse({
    segments: [
      { start: 1, end: 2, text: 'One' },
      { start: 3, text: 'Two' },
      { start: 4, text: 'Three' },
    ],
  });
  assert.deepStrictEqual(cues.map((cue) => cue.end), [2, 4, cues[2].end]);
  assert.ok(cues[2].end - cues[2].start >= 2.5);
});

test('parse accepts cues with startTime/endTime, durations and time strings', () => {
  const { cues } = lyricsJson.parse({
    cues: [
      { startTime: '00:01.50', endTime: '00:03.00', lyric: 'First' },
      { from: '00:04', duration: 1.5, line: 'Second' },
      { time: 6, to: 7.5, content: 'Third' },
    ],
  });
  assert.deepStrictEqual(cues.map((cue) => cue.start), [1.5, 4, 6]);
  assert.deepStrictEqual(cues.map((cue) => cue.end), [3, 5.5, 7.5]);
});

test('parse detects millisecond files and honours an explicit unit', () => {
  const detected = lyricsJson.parse(JSON.stringify([{ start: 1000, end: 2500, text: 'ms' }, { start: 60000, end: 63000, text: 'ms two' }]));
  assert.deepStrictEqual(detected.cues.map((cue) => cue.start), [1, 60]);
  const explicit = lyricsJson.parse(JSON.stringify([{ start: 500, end: 900, text: 'short ms' }]), { unit: 'ms' });
  assert.deepStrictEqual(explicit.cues.map((cue) => cue.start), [0.5]);
  const seconds = lyricsJson.parse(JSON.stringify([{ start: 500, end: 900, text: 'seconds' }]));
  assert.deepStrictEqual(seconds.cues.map((cue) => cue.start), [500]);
});

test('parse joins word arrays, skips empty entries and warns', () => {
  const { cues, warnings } = lyricsJson.parse({
    cues: [
      { start: 0, end: 1, words: [{ text: 'Hello' }, { word: 'there' }] },
      { start: 1, end: 2, text: '' },
    ],
  });
  assert.strictEqual(cues.length, 1);
  assert.strictEqual(cues[0].text, 'Hello there');
  assert.strictEqual(warnings.filter((warning) => warning.code === 'empty-cue').length, 1);
});

test('parse reports junk input', () => {
  assert.strictEqual(lyricsJson.parse('not json').cues.length, 0);
  assert.strictEqual(lyricsJson.parse({ foo: 1 }).cues.length, 0);
  assert.ok(lyricsJson.parse({ foo: 1 }).warnings.length >= 1);
});

test('stringify round-trips through parse', () => {
  const cues = [
    { id: 'a', start: 0.25, end: 1.5, text: 'One', meta: { kind: 'custom' } },
    { id: 'b', start: 2, end: 3, text: 'Two', meta: { kind: 'custom' } },
  ];
  const text = lyricsJson.stringify(cues);
  const parsed = lyricsJson.parse(text);
  assert.strictEqual(parsed.cues.length, 2);
  assert.deepStrictEqual(parsed.cues.map((cue) => cue.start), [0.25, 2]);
  assert.deepStrictEqual(parsed.cues.map((cue) => cue.text), ['One', 'Two']);
  const ms = lyricsJson.parse(lyricsJson.stringify(cues, { unit: 'ms' }));
  assert.deepStrictEqual(ms.cues.map((cue) => cue.start), [0.25, 2]);
});
