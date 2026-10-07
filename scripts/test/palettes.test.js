'use strict';

// The built-in palette library lives in renderer/data/palettes.json and the
// generated UMD mirror (renderer/js/studio/palettes-data.js) exposes it to
// the renderer synchronously. studio/colors.js must read the mirror instead
// of hardcoding the values.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const JSON_PATH = path.join(ROOT, 'renderer', 'data', 'palettes.json');
const MIRROR_PATH = path.join(ROOT, 'renderer', 'js', 'studio', 'palettes-data.js');
const COLORS_PATH = path.join(ROOT, 'renderer', 'js', 'studio', 'colors.js');
const HTML_PATH = path.join(ROOT, 'renderer', 'studio.html');

function readJson() {
  return JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
}

test('palettes.json validates and the mirror is in sync', () => {
  const { build } = require('../palettes-build.js');
  const result = build({ check: true });
  assert.ok(result.doc.palettes.length > 0, 'at least one palette');
  const mirrorDoc = require(MIRROR_PATH);
  assert.deepEqual(mirrorDoc, readJson(), 'mirror must equal the canonical JSON');
});

test('palettes have unique ids and ten lowercase #rrggbb slots', () => {
  const doc = readJson();
  assert.equal(doc.format, 'telopmotion-palettes');
  assert.equal(doc.version, 1);
  const ids = new Set();
  for (const entry of doc.palettes) {
    assert.match(entry.id, /^[A-Za-z][A-Za-z0-9]*$/);
    assert.ok(!ids.has(entry.id), `duplicate id ${entry.id}`);
    ids.add(entry.id);
    assert.ok(typeof entry.name === 'string' && entry.name.trim(), `${entry.id} needs a name`);
    assert.equal(entry.colors.length, 10, `${entry.id} needs 10 slots`);
    for (const color of entry.colors) assert.match(color, /^#[0-9a-f]{6}$/, `${entry.id}: ${color}`);
  }
  const pastel = doc.palettes.find((entry) => entry.id === 'pastel');
  assert.ok(pastel, 'pastel must exist');
  assert.deepEqual(pastel.colors.slice(4), ['#9080b9', '#ec84a6', '#b1bace', '#ffffff', '#ffb190', '#70e3fe']);
});

test('studio.html loads the mirror before colors.js', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const mirrorAt = html.indexOf('js/studio/palettes-data.js');
  const colorsAt = html.indexOf('js/studio/colors.js');
  assert.ok(mirrorAt !== -1, 'mirror script must be included');
  assert.ok(colorsAt !== -1, 'colors.js script must be included');
  assert.ok(mirrorAt < colorsAt, 'mirror must load before colors.js');
});

test('colors.js reads the library from SA.palettesData', () => {
  const source = fs.readFileSync(COLORS_PATH, 'utf8');
  assert.match(source, /SA\.palettesData/, 'colors.js must read SA.palettesData');
  assert.doesNotMatch(source, /id: 'pastel'/, 'colors.js must not hardcode the palette table');
});

test('SA.colors.BUILTIN_PALETTES matches the JSON library', () => {
  globalThis.window = globalThis;
  globalThis.SA = globalThis.SA || {};
  globalThis.SA.palettesData = require(MIRROR_PATH);
  delete require.cache[COLORS_PATH];
  require(COLORS_PATH);
  const builtin = globalThis.SA.colors.BUILTIN_PALETTES;
  const doc = readJson();
  assert.equal(builtin.length, doc.palettes.length);
  for (let i = 0; i < doc.palettes.length; i += 1) {
    assert.equal(builtin[i].id, doc.palettes[i].id);
    assert.equal(builtin[i].name, doc.palettes[i].name);
    assert.equal(builtin[i].builtin, true);
    assert.deepEqual(builtin[i].colors, doc.palettes[i].colors);
  }
  // the export must be a copy: mutating it must not poison the mirror
  builtin[0].colors[0] = '#000000';
  assert.notEqual(globalThis.SA.palettesData.palettes[0].colors[0], '#000000');
});
