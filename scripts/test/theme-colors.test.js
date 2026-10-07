'use strict';

// The Theme decorative table: derived ramps follow the palette, weird
// rotates them strange, mono collapses them onto black/white, and the Edit
// Theme colors tab can pin any entry.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const themeColors = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'theme-colors.js'));
const doc = require(path.join(ROOT, 'renderer', 'data', 'palettes.json'));

const mono = doc.palettes.find((entry) => entry.id === 'mono').colors;
const neon = doc.palettes.find((entry) => entry.id === 'neon').colors;
const HEX = /^#[0-9a-f]{6}$/;

function assertTable(table) {
  for (const key of ['ember']) assert.equal(table[key].length, 4);
  for (const key of ['metal', 'chrome']) assert.equal(table[key].length, 3);
  assert.equal(table.stone.length, 2);
  assert.equal(table.figEmbed.length, 5);
  assert.equal(table.fxPairs.length, 3);
  for (const list of [table.ember, table.metal, table.chrome, table.stone, table.figEmbed]) {
    for (const hex of list) assert.match(hex, HEX, key => key);
  }
  for (const key of ['flare', 'flash', 'streak', 'shape']) assert.match(table[key], HEX);
  for (const pair of table.fxPairs) {
    assert.equal(pair.length, 2);
    for (const hex of pair) assert.match(hex, HEX);
  }
}

test('mono detection follows the palette saturation', () => {
  assert.equal(themeColors.isMono(mono), true);
  assert.equal(themeColors.isMono(neon), false);
  assert.equal(themeColors.isMono(['#fff']), false, 'short palettes are not a Theme');
  assert.equal(themeColors.isMono(null), false);
});

test('a mono Theme renders every ramp as grey', () => {
  const table = themeColors.embeddedFor(mono, 0);
  assert.ok(table && table.mono, 'mono flag travels with the table');
  assertTable(table);
  const grey = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return Math.abs(r - g) <= 1 && Math.abs(g - b) <= 1;
  };
  for (const list of [table.ember, table.metal, table.chrome, table.figEmbed]) {
    for (const hex of list) assert.ok(grey(hex), `${hex} is grey`);
  }
});

test('a vivid Theme keeps accent-hued ramps, weird rotates them', () => {
  const calm = themeColors.embeddedFor(neon, 0);
  assert.ok(calm && !calm.mono);
  assertTable(calm);
  assert.notEqual(calm.ember.join(), themeColors.embeddedFor(mono, 0).ember.join());
  const wild = themeColors.embeddedFor(neon, 1);
  assert.notEqual(wild.ember.join(), calm.ember.join(), 'weird moves the hues');
  assert.equal(wild.flare, neon[11], 'the flare stays the glow role');
});

test('short palettes grow to full roles instead of reading missing', () => {
  const grown = themeColors.upgrade(['#ff8a3d', '#202838']);
  assert.equal(grown.length, 12);
  const table = themeColors.embeddedFor(['#ff8a3d', '#202838'], 0);
  assert.ok(table, 'a 2-colour clip palette still resolves a table');
  assertTable(table);
  assert.equal(themeColors.embeddedFor([], 0), null);
  assert.equal(themeColors.themeOf({}), null, 'no palette means no Theme');
});

test('themeOf overlays valid Edit Theme pins and drops the rest', () => {
  const palette = { colors: neon };
  const table = themeColors.themeOf({
    palette,
    weird: 0,
    embedded: {
      flare: '#112233',
      ember: ['#111111', '#222222', '#333333', '#444444'],
      filler: { spectrum: '#123456' },
      flash: 'not-a-colour',
      metal: ['#fff'],
    },
  });
  assert.equal(table.flare, '#112233');
  assert.deepEqual(table.ember, ['#111111', '#222222', '#333333', '#444444']);
  assert.equal(table.fillerFor('spectrum'), '#123456');
  assert.equal(table.flash, neon[4], 'invalid pins fall back to auto');
  assert.equal(table.metal.length, 3, 'short pins fall back to auto');
  assert.match(table.metal[0], HEX);
});

test('filler kinds stay apart and text kinds read the text tone', () => {
  const table = themeColors.embeddedFor(neon, 0);
  assert.equal(table.fillerFor('text'), neon[4]);
  const hues = new Set(['spectrum', 'waveform', 'particles', 'shapes'].map((kind) => table.fillerFor(kind)));
  assert.ok(hues.size > 1, 'filler kinds keep distinct tones');
  const grey = themeColors.embeddedFor(mono, 0);
  assert.equal(grey.fillerFor('text'), mono[4]);
});
