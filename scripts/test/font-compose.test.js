'use strict';

// The layout engine grew a composition mode: `opts.compose` carries forced
// breaks and per-word spans (scale + a weight-specific font set). Without
// compose the output must stay exactly the old math; with spans the line
// metrics follow the tallest letter of each line.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');

global.window = global;
global.SA = global.SA || {};
require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'font.js'));
const font = global.SA.lyricsFont;

// A stand-in face: 1000 units/em, 600-unit advances, ascender 800. Every glyph
// is a simple box so bbox math is predictable.
function fakeFont(id) {
  const advanceWidth = 600;
  return {
    id,
    unitsPerEm: 1000,
    ascender: 800,
    descender: -200,
    charToGlyphIndex: () => 1,
    charToGlyph: (character) => ({
      index: String(character).codePointAt(0) || 1,
      advanceWidth,
      getBoundingBox: () => ({ x1: 0, y1: -800, x2: advanceWidth, y2: 0 }),
      getPath: () => ({ commands: [] }),
    }),
  };
}

function face(id) {
  return { id, unitsPerEm: 1000, font: fakeFont(id) };
}

const FONTS = [face('Fake-Regular')];
const STYLE = { size: 100, lineHeight: 1.2, letterSpacing: 0, align: 'left', maxWidth: 0 };

function layout(text, compose, options) {
  return font.layoutText(text, STYLE, FONTS, {
    size: 100,
    lang: 'en',
    compose: compose || undefined,
    ...(options || {}),
  });
}

test('a layout without compose keeps the original metrics', () => {
  const result = layout('AB');
  assert.equal(result.size, 100);
  assert.equal(result.ascent, 80); // 800 units at size 100
  assert.equal(result.descent, 20);
  assert.equal(result.lineHeight, 120);
  assert.equal(result.lines.length, 1);
  const line = result.lines[0];
  assert.equal(line.baseline, 80);
  assert.equal(line.y, 0);
  assert.equal(line.height, 120);
  assert.equal(result.height, 120);
  const letters = line.words[0].letters;
  assert.equal(letters.length, 2);
  assert.equal(letters[0].advance, 60);
  assert.equal(letters[0].advanceWithSpacing, 60);
  const lines = layout('A\nB');
  assert.equal(lines.lines.length, 2);
  assert.equal(lines.lines[1].baseline, 200); // 80 + 120
  assert.equal(lines.lines[1].y, 120);
  assert.equal(lines.height, 240);
});

test('a span scales the letter advance and keeps the line on one baseline', () => {
  const compose = { breaks: [], spans: [{ from: 0, to: 2, scale: 2 }] };
  const result = layout('ABCD', compose);
  const letters = result.lines[0].words[0].letters;
  assert.deepEqual(letters.map((letter) => letter.size), [200, 200, 100, 100]);
  assert.deepEqual(letters.map((letter) => letter.advance), [120, 120, 60, 60]);
  // the tallest letter owns the baseline of the whole line
  assert.equal(result.lines[0].baseline, 160);
  assert.equal(result.lines[0].height, 240);
  assert.equal(result.lines[0].y, 0);
  assert.equal(result.height, 240);
  assert.equal(letters[0].span.scale, 2);
  assert.equal(letters[2].span, undefined);
});

test('a forced break cuts the line before its code point', () => {
  const compose = { breaks: [2], spans: [] };
  const result = layout('ABCD', compose);
  assert.equal(result.lines.length, 2);
  assert.deepEqual(result.lines[0].words[0].letters.map((letter) => letter.char), ['A', 'B']);
  assert.deepEqual(result.lines[1].words[0].letters.map((letter) => letter.char), ['C', 'D']);
  // the break survives a maxWidth that alone would not wrap
  const wide = layout('ABCD', compose, { maxWidth: 1000 });
  assert.equal(wide.lines.length, 2);
});

test('a line after a tall line drops its baseline by the neighbour average', () => {
  const compose = { breaks: [2], spans: [{ from: 0, to: 2, scale: 2 }] };
  const result = layout('ABCD', compose);
  const [first, second] = result.lines;
  assert.equal(first.baseline, 160);
  // baseline += lineHeight * (tall + short) / (2 * size)
  assert.equal(second.baseline, 160 + 120 * ((200 + 100) / 200));
  assert.equal(second.y, second.baseline - 80);
  assert.equal(second.height, 120);
});

test('a span keeps its font set for its letters', () => {
  const bold = face('Fake-Bold');
  const compose = { breaks: [], spans: [{ from: 0, to: 1, scale: 1, fontSet: [bold] }] };
  const result = layout('AB', compose);
  const letters = result.lines[0].words[0].letters;
  assert.equal(letters[0].fontId, 'Fake-Bold');
  assert.equal(letters[1].fontId, 'Fake-Regular');
});

test('vertical columns step by their own tallest letter', () => {
  const compose = { breaks: [2], spans: [{ from: 0, to: 2, scale: 2 }] };
  const result = layout('ABCD', compose, { direction: 'vertical' });
  assert.equal(result.lines.length, 2);
  const first = result.lines[0].words[0].letters;
  const second = result.lines[1].words[0].letters;
  // the first column is 2 * lineHeight tall, so the next column starts there
  assert.equal(first[0].x, 0);
  assert.equal(second[0].x, -240);
  assert.equal(result.width, 200);
});

test('English in a vertical column rotates 90 instead of stacking upright', () => {
  const result = layout('愛Love 12', null, { direction: 'vertical' });
  const letters = result.lines[0].words.flatMap((word) => word.letters);
  const byChar = new Map(letters.map((letter) => [letter.char, letter]));
  // CJK stays upright
  assert.equal(byChar.get('愛').vertRotate, false);
  // every latin letter and digit is turned, so the run reads sideways
  for (const character of ['L', 'o', 'v', 'e', '1', '2']) {
    assert.equal(byChar.get(character).vertRotate, true, `${character} should rotate`);
  }
  // a space is neither rotated nor rendered sideways
  assert.equal(byChar.get(' ').vertRotate, false);
});

test('the vertical column runs a rotated letter by its own advance', () => {
  const result = layout('愛Love', null, { direction: 'vertical' });
  const letters = result.lines[0].words.flatMap((word) => word.letters);
  const [cjk, l, o, v, e] = letters;
  // the CJK letter steps by its em, then the sideways run by the glyph widths
  assert.equal(l.y, cjk.advance);
  assert.equal(o.y, l.y + l.advance);
  assert.equal(v.y, o.y + o.advance);
  assert.equal(e.y, v.y + v.advance);
  // no tate-chu-yoko: the digits keep their own advance instead of overlapping
  const digits = layout('12', null, { direction: 'vertical' }).lines[0].words.flatMap((word) => word.letters);
  assert.ok(digits[1].y > digits[0].y, 'digits step down the column');
});
