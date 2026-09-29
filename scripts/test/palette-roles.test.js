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
    assert.ok(['text', 'backdrop', 'soft'].includes(kind), kind);
  }
});

test('ratioFor climbs with the weird axis', () => {
  assert.equal(roles.ratioFor('text', 0), 4.5);
  assert.equal(roles.ratioFor('text', 1), 7);
  assert.equal(roles.ratioFor('backdrop', 0), 3);
  assert.equal(roles.ratioFor('backdrop', 1), 5.5);
  assert.equal(roles.ratioFor('soft', 1), 1.5);
});

test('upgrade maps a legacy 6-colour palette onto the slots and is idempotent', () => {
  const upgraded = roles.upgradePalette({ id: 'p', name: 'p', colors: LEGACY });
  assert.equal(upgraded.roles, 2);
  assert.equal(upgraded.colors.length, 10);
  assert.equal(upgraded.colors[0], LEGACY[0]);
  assert.equal(upgraded.colors[1], LEGACY[1]);
  assert.equal(upgraded.colors[4], LEGACY[2]);
  assert.equal(upgraded.colors[5], LEGACY[3]);
  assert.equal(upgraded.colors[6], LEGACY[4]);
  assert.equal(upgraded.colors[8], LEGACY[5]);
  assert.notEqual(upgraded.colors[2], undefined);
  assert.notEqual(upgraded.colors[9], undefined);
  const again = roles.upgradePalette(upgraded);
  assert.equal(again, upgraded, 'idempotent by the roles marker');
});

test('get derives a missing slot from a short palette', () => {
  assert.equal(roles.get(LEGACY, roles.SLOT.MID_A), LEGACY[0]);
  assert.equal(roles.get(LEGACY, roles.SLOT.TEXT_FILL), LEGACY[2]);
  const fig = roles.get(LEGACY, roles.SLOT.FIG_A);
  assert.equal(fig, LEGACY[5]);
  assert.notEqual(roles.get(LEGACY, roles.SLOT.MID_C), null);
});

test('remapRefs rewrites palette refs and gradient stops only', () => {
  const style = {
    color: { fill: { kind: 'palette', index: 2 }, stroke: { kind: 'palette', index: 4 } },
    gradient: { kind: 'gradient', stops: [{ pos: 0, paletteIndex: 0 }, { pos: 1, paletteIndex: 3 }] },
    name: 'index 2 in a string',
    size: 4,
  };
  const out = roles.remapRefs(style);
  assert.deepEqual(out.color.fill, { kind: 'palette', index: roles.SLOT.TEXT_FILL });
  assert.deepEqual(out.color.stroke, { kind: 'palette', index: roles.SLOT.TEXT_EDGE });
  assert.deepEqual(out.gradient.stops, [{ pos: 0, paletteIndex: roles.SLOT.MID_A }, { pos: 1, paletteIndex: roles.SLOT.TEXT_FILL2 }]);
  assert.equal(out.name, 'index 2 in a string');
  assert.equal(out.size, 4);
  // the source is untouched
  assert.equal(style.color.fill.index, 2);
});

test('repairPalette makes every pair hold, then compatible() agrees', () => {
  const palette = roles.upgradePalette({ colors: LEGACY }).colors;
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
