'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const keywords = require('../../renderer/js/lyrics/keywords.js');

// one letter per code unit, all on one line
function line(text, lineIdx) {
  return [...text].map((char, i) => ({ char, lineIdx: lineIdx == null ? 0 : lineIdx, wordIdx: 0, letterIdx: i }));
}

// wordIdx from a space-separated text: a word owns its trailing space
function words(text) {
  const letters = line(text);
  let word = 0;
  for (let i = 0; i < text.length; i += 1) {
    letters[i].wordIdx = word;
    if (text[i] === ' ') word += 1;
  }
  return letters;
}

test('strength ramps from the weird threshold', () => {
  assert.equal(keywords.strength(0.3), 0);
  assert.ok(Math.abs(keywords.strength(0.65) - 0.5) < 1e-9);
  assert.equal(keywords.strength(1), 1);
  assert.equal(keywords.strength(0.2), 0);
  assert.equal(keywords.strength(2), 1);
});

test('mark finds a Japanese word as a substring', () => {
  const { runOf, runs } = keywords.mark(line('愛してる'), ['愛']);
  assert.deepEqual([...runOf], [0, -1, -1, -1]);
  assert.equal(runs, 1);
});

test('mark keeps adjacent hits in one run', () => {
  const { runOf, runs } = keywords.mark(line('永遠に'), ['永遠']);
  assert.deepEqual([...runOf], [0, 0, -1]);
  assert.equal(runs, 1);
});

test('mark starts a new run on the next line', () => {
  const letters = [...line('愛', 0), ...line('愛', 1)];
  const { runOf, runs } = keywords.mark(letters, ['愛']);
  assert.deepEqual([...runOf], [0, 1]);
  assert.equal(runs, 2);
});

test('mark matches English words with a plural and -ing tolerance', () => {
  const love = keywords.mark(words('I love you'), ['love']);
  assert.deepEqual([...love.runOf], [-1, -1, 0, 0, 0, 0, -1, -1, -1, -1]);
  assert.equal(love.runs, 1);
  assert.ok([...keywords.mark(words('loves'), ['love']).runOf].every((run) => run >= 0));
  assert.ok([...keywords.mark(words('loving'), ['love']).runOf].every((run) => run >= 0));
  assert.ok([...keywords.mark(words('glove'), ['love']).runOf].every((run) => run === -1));
});

test('listFor merges presets, extra and exclude', () => {
  const cfg = keywords.listFor({ keywords: { extra: ['ラーメン'], exclude: ['love'] } });
  assert.ok(cfg.words.includes('ラーメン'));
  assert.ok(!cfg.words.includes('love'));
  assert.ok(cfg.words.includes('夢'));
  assert.equal(cfg.enabled, true);
  assert.equal(keywords.listFor({ keywords: { enabled: false } }).enabled, false);
  assert.equal(keywords.listFor(undefined).enabled, true);
  assert.deepEqual(keywords.cleanList('a, b、c\nd'), ['a', 'b', 'c', 'd']);
});

test('SA.config.keywordEmphasis = false disables the feature app-wide', () => {
  const previous = globalThis.SA;
  try {
    globalThis.SA = { config: { keywordEmphasis: false } };
    assert.equal(keywords.globallyEnabled(), false);
    assert.equal(keywords.listFor({}).enabled, false);
  } finally {
    if (previous === undefined) delete globalThis.SA;
    else globalThis.SA = previous;
  }
});
