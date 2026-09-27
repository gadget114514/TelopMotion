'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const srt = require('../../renderer/js/srt');

const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');

test('formatTime and parseTime round-trip', () => {
  assert.strictEqual(srt.formatTime(62.345), '00:01:02,345');
  assert.strictEqual(srt.formatTime(3723.5), '01:02:03,500');
  assert.ok(Math.abs(srt.parseTime('00:01:02,345') - 62.345) < 1e-9);
  assert.ok(Math.abs(srt.parseTime('00:01:02.345') - 62.345) < 1e-9);
  assert.ok(Math.abs(srt.parseTime('1:02.3') - 62.3) < 1e-9);
  assert.strictEqual(srt.parseTime('not a time'), 0);
});

test('parse accepts BOM, CRLF, dot milliseconds, bad indexes and position suffixes', () => {
  const raw = `\uFEFF${fixture('basic.srt')}`.replace(/\n/g, '\r\n');
  const { cues, warnings } = srt.parse(raw);
  assert.strictEqual(cues.length, 5);
  assert.deepStrictEqual(cues.map((cue) => cue.start), [1, 4.25, 7, 9, 11]);
  assert.strictEqual(cues[1].text, 'Second line\nwrapped in two lines');
  assert.strictEqual(cues[2].text, 'Position suffix ignored');
  assert.strictEqual(cues[4].text, 'Last cue');
  assert.strictEqual(warnings.filter((warning) => warning.code === 'end-before-start').length, 1);
  assert.strictEqual(cues[3].end, 10);
  for (const cue of cues) {
    assert.ok(cue.id.startsWith('c_'));
    assert.deepStrictEqual(cue.meta, { kind: 'custom' });
  }
});

test('parse extracts the fx tag', () => {
  const { cues } = srt.parse(fixture('fx.srt'));
  assert.strictEqual(cues.length, 1);
  assert.deepStrictEqual(cues[0].fx, { enter: 'scramble', exit: 'explode', layout: 'circle', fill: 'chrome' });
  assert.strictEqual(cues[0].text, 'Scramble me');
});

test('parse handles escapes and tags', () => {
  const { cues } = srt.parse(fixture('japanese.srt'));
  assert.strictEqual(cues.length, 3);
  assert.strictEqual(cues[0].text, '日本語のテスト\n二行目\n三行目');
  const first = cues[0].spans;
  assert.strictEqual(first, undefined);

  const second = cues[1];
  assert.ok(second.text.includes('\u00a0'), '\\h becomes a non-breaking space');
  assert.ok(second.text.includes('テスト'));
  assert.ok(second.text.includes('強調'));
  assert.ok(second.text.includes('赤字'));
  assert.ok(second.text.includes('下線'));
  const spans = second.spans;
  assert.ok(Array.isArray(spans) && spans.length >= 4);
  const styleOf = (needle, field) => {
    const from = second.text.indexOf(needle);
    const found = spans.find((span) => span.from <= from && span.to >= from + needle.length && span[field]);
    return found ? found[field] : null;
  };
  assert.strictEqual(styleOf('テスト', 'italic'), true);
  assert.strictEqual(styleOf('強調', 'bold'), true);
  assert.strictEqual(styleOf('赤字', 'color'), '#ff0000');
  assert.strictEqual(styleOf('下線', 'underline'), true);

  assert.strictEqual(cues[2].text, 'ページ\\P区切り');
});

test('parse warns about missing time and empty cues', () => {
  const { cues, warnings } = srt.parse('no timing here at all\n\n1\n00:00:00,000 --> 00:00:01,000\n');
  assert.strictEqual(cues.length, 0);
  assert.ok(warnings.some((warning) => warning.code === 'missing-time'));
  assert.ok(warnings.some((warning) => warning.code === 'empty-cue'));
});

test('stringify writes CRLF, indexes from 1, and keeps the fx tag when asked', () => {
  const { cues } = srt.parse(fixture('fx.srt'));
  const text = srt.stringify(cues, { includeFx: true });
  assert.ok(text.includes('\r\n'));
  assert.ok(text.startsWith('1\r\n'));
  assert.ok(text.includes('{fx:enter=scramble,exit=explode,layout=circle,fill=chrome} Scramble me'));
  const without = srt.stringify(cues);
  assert.ok(!without.includes('{fx:'));
});

test('round-trip preserves timing, text, spans and fx', () => {
  for (const name of ['basic.srt', 'japanese.srt', 'fx.srt']) {
    const first = srt.parse(fixture(name)).cues;
    const second = srt.parse(srt.stringify(first, { includeFx: true })).cues;
    assert.strictEqual(second.length, first.length, name);
    for (let i = 0; i < first.length; i += 1) {
      assert.ok(Math.abs(second[i].start - first[i].start) < 1e-6, `${name} start ${i}`);
      assert.ok(Math.abs(second[i].end - first[i].end) < 1e-6, `${name} end ${i}`);
      assert.strictEqual(second[i].text, first[i].text, `${name} text ${i}`);
      assert.deepStrictEqual(second[i].fx || null, first[i].fx || null, `${name} fx ${i}`);
      const normalize = (spans) => (spans || []).map((span) => ({ from: span.from, to: span.to, bold: !!span.bold, italic: !!span.italic, underline: !!span.underline, color: span.color || null }));
      assert.deepStrictEqual(normalize(second[i].spans), normalize(first[i].spans), `${name} spans ${i}`);
    }
  }
});

test('stripTags returns plain text with spans', () => {
  const { plain, spans } = srt.stripTags('a<b>bold</b><i>c</i><font color="#00ff00">d</font>');
  assert.strictEqual(plain, 'aboldcd');
  assert.deepStrictEqual(spans[0], { from: 1, to: 5, bold: true });
  assert.deepStrictEqual(spans[1], { from: 5, to: 6, italic: true });
  assert.deepStrictEqual(spans[2], { from: 6, to: 7, color: '#00ff00' });
});
