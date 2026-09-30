'use strict';

// The per-channel view of the sixth axis: the raw 0..1 value the UI stores is
// mapped once, so the text side is tamed, the backdrop side saturates early and
// the legibility knobs follow the axis. Every mapping must be a no-op at 0.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const weird = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'weird.js'));

test('text maps the old 0.7 to the new 1', () => {
  assert.equal(weird.text(0), 0);
  assert.equal(weird.text(1), 0.7);
  assert.equal(weird.text(0.5), 0.35);
  assert.equal(weird.text(2), 0.7);
  assert.equal(weird.text(-1), 0);
  assert.equal(weird.text(undefined), 0);
});

test('bg reaches its full character at raw 0.4', () => {
  assert.equal(weird.bg(0), 0);
  assert.equal(weird.bg(0.2), 0.5);
  assert.equal(weird.bg(0.4), 1);
  assert.equal(weird.bg(1), 1);
  assert.equal(weird.bg(2), 1);
  assert.equal(weird.bg(-1), 0);
});

test('palette contrast climbs from 4.5 to 7', () => {
  assert.equal(weird.paletteContrast(0), 4.5);
  assert.equal(weird.paletteContrast(1), 7);
  assert.equal(weird.paletteContrast(0.5), 5.75);
  assert.equal(weird.paletteContrast(2), 7);
});

test('backdrop contrast climbs from 3 to 5.5', () => {
  assert.equal(weird.backdropContrast(0), 3);
  assert.equal(weird.backdropContrast(1), 5.5);
  assert.equal(weird.backdropContrast(0.5), 4.25);
});

test('glow scale is 1 at 0, shrinks monotonically and stops at 0.55', () => {
  assert.equal(weird.glowScale(0), 1);
  assert.equal(weird.glowScale(1), 0.55);
  let previous = Infinity;
  for (let v = 0; v <= 1.0001; v += 0.05) {
    const scale = weird.glowScale(Math.min(1, v));
    assert.ok(scale <= previous + 1e-12, `glowScale ${v} rose`);
    assert.ok(scale >= 0.55 - 1e-12 && scale <= 1 + 1e-12, `glowScale ${v} = ${scale}`);
    previous = scale;
  }
  assert.ok(weird.glowScale(0.9) >= 0.55);
});

test('raw and clamp01 stay inside 0..1 and default to 0', () => {
  assert.equal(weird.raw(0.3), 0.3);
  assert.equal(weird.raw(3), 1);
  assert.equal(weird.raw(undefined), 0);
  assert.equal(weird.clamp01(-2), 0);
  assert.equal(weird.clamp01('0.25'), 0.25);
  assert.equal(weird.clamp01('nope'), 0);
});

test('the colour development rides the raw axis', () => {
  // a cue keeps the base palette at weird 0 and re-rolls at weird 1
  assert.equal(weird.basePaletteChance({ weird: 0 }), 1);
  assert.equal(weird.basePaletteChance({ weird: 1 }), 0);
  assert.equal(weird.basePaletteChance(undefined), 1);
  assert.ok(weird.basePaletteChance({ weird: 0.5 }) > weird.basePaletteChance({ weird: 0.75 }));
  // a beat moves to another scheme at weird 1 and never at weird 0
  assert.equal(weird.colorChange({ weird: 0 }), 0);
  assert.equal(weird.colorChange({ weird: 1 }), 1);
  assert.equal(weird.colorChange(undefined), 0);
  let previous = -1;
  for (let v = 0; v <= 1.0001; v += 0.1) {
    const value = weird.colorChange({ weird: Math.min(1, v) });
    assert.ok(value >= previous, `colorChange fell at ${v}`);
    previous = value;
  }
});
