'use strict';

const test = require('node:test');
const assert = require('node:assert');

const lyricsFile = require('../../renderer/js/lyrics-file');

const SRT = '1\n00:00:01,000 --> 00:00:03,000\nFirst line\n';
const LRC = '[ti:Smoke]\n[00:01.00]First line\n[00:03.00]Second line\n';

test('detect uses the extension first and sniffs the content otherwise', () => {
  assert.strictEqual(lyricsFile.detect(LRC, 'song.lrc'), 'lrc');
  assert.strictEqual(lyricsFile.detect(SRT, 'song.srt'), 'srt');
  assert.strictEqual(lyricsFile.detect('[{"start":0,"end":1,"text":"x"}]', 'song.json'), 'json');
  assert.strictEqual(lyricsFile.detect(LRC, 'song.txt'), 'lrc');
  assert.strictEqual(lyricsFile.detect(SRT, 'song.txt'), 'srt');
  assert.strictEqual(lyricsFile.detect('{"segments":[{"start":0,"end":1,"text":"x"}]}', 'song.txt'), 'json');
});

test('parse dispatches to the matching format', () => {
  const lrc = lyricsFile.parse(LRC, 'song.lrc');
  assert.strictEqual(lrc.format, 'lrc');
  assert.strictEqual(lrc.cues.length, 2);
  assert.strictEqual(lrc.meta.ti, 'Smoke');

  const srt = lyricsFile.parse(SRT, 'song.srt');
  assert.strictEqual(srt.format, 'srt');
  assert.strictEqual(srt.cues.length, 1);

  const json = lyricsFile.parse('{"cues":[{"start":0,"end":1,"text":"x"}]}', 'song.json');
  assert.strictEqual(json.format, 'json');
  assert.strictEqual(json.cues.length, 1);
  assert.strictEqual(json.cues[0].text, 'x');
});

test('parse reports empty and unreadable files', () => {
  const junk = lyricsFile.parse('this is not lyrics', 'notes.txt');
  assert.strictEqual(junk.cues.length, 0);
  assert.ok(junk.warnings.length >= 1);
  const invalid = lyricsFile.parse('{oops', 'song.json');
  assert.strictEqual(invalid.format, 'json');
  assert.strictEqual(invalid.cues.length, 0);
  assert.strictEqual(invalid.warnings[0].code, 'invalid-json');
});

test('parse flags Studio project files', () => {
  const project = lyricsFile.parse(JSON.stringify({ format: 'telopmotion', version: 1, script: { cues: [] } }), 'p.json');
  assert.strictEqual(project.project, true);
  assert.strictEqual(project.cues.length, 0);
});

test('stringify writes every supported format', () => {
  const cues = [{ id: 'a', start: 1, end: 2, text: 'Line', meta: { kind: 'custom' } }];
  assert.ok(lyricsFile.stringify(cues, 'srt').includes('00:00:01,000 --> 00:00:02,000'));
  assert.ok(lyricsFile.stringify(cues, 'lrc').startsWith('[00:01.00]Line'));
  const json = JSON.parse(lyricsFile.stringify(cues, 'json'));
  assert.deepStrictEqual(json.cues[0], { start: 1, end: 2, text: 'Line' });
  assert.strictEqual(lyricsFile.extension('lrc'), 'lrc');
  assert.strictEqual(lyricsFile.extension('nope'), 'srt');
});
