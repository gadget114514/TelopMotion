'use strict';

// The 10 fixed palette slots and their contrast contract. `palette-roles` is
// the single place that says which layer uses which colour; the generators
// migrate onto it slot by slot.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const roles = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'palette-roles.js'));
const color = require(path.join(ROOT, 'renderer', 'js', 'color.js'));

const LEGACY = ['#101018', '#202838', '#eef2ff', '#ff8a3d', '#05060a', '#ffc247'];
const TEN = ['#101018', '#202838', '#2a3348', '#3a4356', '#eef2ff', '#ff8a3d', '#05060a', '#0b0d12', '#ffc247', '#9db2ff'];
const TEN2 = ['#201020', '#302838', '#3a4356', '#4a5568', '#fff2ef', '#ffaa33', '#10100a', '#140f14', '#ffd247', '#8db2ff'];

test('the slot table is complete and frozen', () => {
  assert.deepEqual(roles.MID_SLOTS, [0, 1, 2, 3]);
  assert.deepEqual(roles.TEXT_SLOTS, [4, 5, 6, 7]);
  assert.deepEqual(roles.FIG_SLOTS, [8, 9]);
  assert.equal(roles.SIZE, 10);
  assert.equal(roles.SLOT.TEXT_FILL, 4);
  assert.equal(roles.SLOT.TEXT_BG, 7);
  assert.equal(new Set(Object.values(roles.SLOT)).size, 10);
  for (const [a, b, kind] of roles.CONTRAST) {
    assert.ok(roles.MID_SLOTS.concat(roles.TEXT_SLOTS, roles.FIG_SLOTS).includes(a), `slot ${a}`);
    assert.ok(roles.MID_SLOTS.concat(roles.TEXT_SLOTS, roles.FIG_SLOTS).includes(b), `slot ${b}`);
    assert.ok(['text', 'backdrop', 'soft', 'neighbour'].includes(kind), kind);
  }
});

test('ratioFor climbs with the weird axis', () => {
  assert.equal(roles.ratioFor('text', 0), 4.5);
  assert.equal(roles.ratioFor('text', 1), 7);
  assert.equal(roles.ratioFor('backdrop', 0), 3);
  assert.equal(roles.ratioFor('backdrop', 1), 5.5);
  assert.equal(roles.ratioFor('soft', 1), 1.5);
  assert.equal(roles.ratioFor('neighbour', 1), 1.15);
});

test('every palette stores exactly the 10 slots, no derived colours', () => {
  assert.equal(roles.get(TEN, roles.SLOT.MID_A), TEN[0]);
  assert.equal(roles.get(TEN, roles.SLOT.TEXT_FILL), TEN[4]);
  assert.equal(roles.get(TEN, roles.SLOT.FIG_A), TEN[8]);
  assert.equal(roles.get(TEN, roles.SLOT.FIG_B), TEN[9]);
  // a short palette is invalid and reads as missing
  assert.equal(roles.get(LEGACY, roles.SLOT.MID_A), null);
  assert.equal(roles.get(LEGACY, roles.SLOT.TEXT_FILL), null);
  assert.equal(roles.get([], roles.SLOT.MID_A), null);
});

test('remapRefs passes slot indices through unchanged', () => {
  const style = {
    color: { fill: { kind: 'palette', index: 4 }, stroke: { kind: 'palette', index: 6 } },
    gradient: { kind: 'gradient', stops: [{ pos: 0, paletteIndex: 0 }, { pos: 1, paletteIndex: 5 }] },
    name: 'index 2 in a string',
    size: 4,
  };
  const out = roles.remapRefs(style);
  assert.equal(out, style, 'identity for slot palettes');
});

test('repairPalette makes every pair hold, then compatible() agrees', () => {
  const palette = TEN.slice();
  roles.repairPalette(palette, 0, null);
  for (const [a, b, kind] of roles.CONTRAST) {
    const ratio = roles.contrast(palette[a], palette[b]);
    assert.ok(ratio >= roles.ratioFor(kind, 0) - 1e-6, `${a}->${b} ${kind}: ${ratio}`);
  }
  assert.equal(roles.compatible(palette, palette, 0), true);
  // a broken candidate is rejected
  const broken = palette.slice();
  broken[roles.SLOT.TEXT_FILL] = palette[roles.SLOT.MID_A];
  assert.equal(roles.compatible(palette, broken, 0), false);
  // colours stay finite hex strings
  for (const hex of palette) assert.match(hex, /^#[0-9a-f]{6}$/i);
});

test('the luminance opposite keeps the text readable', () => {
  const light = roles.luminanceOpposite('#eef2ff');
  assert.ok(color.contrastRatio(color.parse('#eef2ff'), color.parse(light)) >= 4.5, `light vs ${light}`);
  const dark = roles.luminanceOpposite('#101018');
  assert.ok(color.contrastRatio(color.parse('#101018'), color.parse(dark)) >= 4.5, `dark vs ${dark}`);
});

test('the moved recolor matches moods.recolor', () => {
  const moods = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'moods.js'));
  const style = {
    color: { fill: { kind: 'palette', index: 4 }, stroke: { kind: 'solid', value: TEN[6] } },
    edge: [{ type: 'outline', params: { color: TEN[4] } }],
  };
  assert.deepEqual(roles.recolor(style, TEN, TEN2), moods.recolor(style, TEN, TEN2));
  assert.deepEqual(roles.recolor(style, [], TEN2), style);
});


