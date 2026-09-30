'use strict';

// The automatic direction's profile: every parameter derives from the eight
// axes, a manual value in `styleMode.params` wins, and the weight groups are
// normalized at the point of use. weird 0 without manual values reproduces the
// classic formulas exactly.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const genParams = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'gen-params.js'));
const weird = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'weird.js'));
const moods = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'moods.js'));

const BASE = { speed: 0.6, energy: 0.55, softness: 0.4, density: 0.5, brightness: 0.45, weird: 0.6, smartness: 0.6, fear: 0 };

test('the table keys are unique and the derived values stay inside every range', () => {
  const keys = new Set();
  for (const def of genParams.PARAMS) {
    assert.ok(def.key && !keys.has(def.key), `duplicate key ${def.key}`);
    keys.add(def.key);
    assert.ok(['font', 'palette', 'axis'].includes(def.tab), `${def.key} tab ${def.tab}`);
    assert.ok(def.min < def.max, `${def.key} range`);
    for (const value of [0, 0.25, 0.5, 0.75, 1]) {
      const axes = { speed: value, energy: value, softness: value, density: value, brightness: value, weird: value, smartness: value, fear: value };
      const derived = genParams.derive(axes);
      const resolved = genParams.resolve({ axes });
      assert.ok(Number.isFinite(derived[def.key]), `${def.key} derived at ${value}`);
      assert.ok(derived[def.key] >= def.min - 1e-9 && derived[def.key] <= def.max + 1e-9, `${def.key} derived ${derived[def.key]} out of range`);
      assert.ok(resolved[def.key] >= def.min - 1e-9 && resolved[def.key] <= def.max + 1e-9, `${def.key} resolved out of range`);
    }
  }
  assert.equal(genParams.resolve({ axes: BASE }).sizeCenter != null, true);
});

test('weird 0 reproduces the classic sizeChange / colorChange / palette switch / figureDensity', () => {
  for (const energy of [0, 0.55, 1]) {
    const axes = { ...BASE, weird: 0, energy };
    const derived = genParams.derive(axes);
    assert.equal(derived.sizeChange, weird.sizeChange(axes), `sizeChange at energy ${energy}`);
    assert.equal(derived.colorChange, weird.colorChange(axes), `colorChange at energy ${energy}`);
    assert.equal(derived.paletteSwitchChance, 1 - weird.basePaletteChance(axes), `paletteSwitchChance at energy ${energy}`);
    assert.ok(Math.abs(derived.figureDensity - (0.25 + 0.6 * energy)) < 1e-9, `figureDensity at energy ${energy}`);
  }
  const derived = genParams.derive({ ...BASE, weird: 0 });
  // the new branches all collapse onto their classic counterpart at weird 0
  assert.equal(derived.fgVivid, 0);
  assert.equal(derived.fgGradient, 0);
  assert.equal(derived.fgEffect, 0);
  assert.equal(derived.decoOutline, 0);
  assert.equal(derived.decoGlow, 0);
  assert.equal(derived.planes4, 0);
  assert.equal(derived.figureBoldChance, 0);
  assert.equal(derived.postBlurChance, 0);
  assert.equal(derived.graphicChance, 0.3);
  assert.equal(derived.fgSolid, 1);
  assert.equal(derived.decoNone, 1);
});

test('a manual value wins over the axes and is clamped to the range', () => {
  const resolved = genParams.resolve({ axes: BASE, params: { sizeCenter: 0.85, decoOutline: 99, planes4: -1 } });
  assert.equal(resolved.sizeCenter, 0.85);
  assert.equal(resolved.decoOutline, 3, 'clamped to the max');
  assert.equal(resolved.planes4, 0, 'clamped to the min');
  const auto = genParams.derive(BASE);
  // the untouched keys still follow the axes
  assert.equal(resolved.sizeSpread, auto.sizeSpread);
  assert.equal(resolved.sizeChange, auto.sizeChange);
});

test('isPinned only sees a stored manual key', () => {
  assert.equal(genParams.isPinned({}, 'sizeCenter'), false);
  assert.equal(genParams.isPinned({ params: {} }, 'sizeCenter'), false);
  assert.equal(genParams.isPinned({ params: { sizeCenter: 0.2 } }, 'sizeCenter'), true);
  assert.equal(genParams.isPinned({ params: { sizeCenter: 'x' } }, 'sizeCenter'), false);
});

test('normalizeChances sums to one and returns null when nothing is left', () => {
  const chances = genParams.normalizeChances({ a: 2, b: 1, c: 1 }, ['a', 'b', 'c']);
  assert.deepEqual(chances, { a: 0.5, b: 0.25, c: 0.25 });
  assert.equal(genParams.normalizeChances({ a: 0, b: 0 }, ['a', 'b']), null);
  assert.equal(genParams.normalizeChances({ a: 3 }, ['a', 'b']).b, 0);
});

test('typeWeight defaults to 1 and lookTypeWeight reads the minimum of a style', () => {
  assert.equal(genParams.typeWeight({}, 'enter', 'fade'), 1);
  assert.equal(genParams.typeWeight({ typeWeights: { enter: { glitchIn: 0 } } }, 'enter', 'fade'), 1);
  assert.equal(genParams.typeWeight({ typeWeights: { enter: { glitchIn: 0 } } }, 'enter', 'glitchIn'), 0);
  const style = { enter: { type: 'fade' }, hold: [{ type: 'pulse' }, { type: 'drift' }] };
  assert.equal(genParams.lookTypeWeight({ typeWeights: {} }, style), 1);
  assert.equal(genParams.lookTypeWeight({ typeWeights: { hold: { pulse: 0.4, drift: 0.8 } } }, style), 0.4);
  assert.equal(genParams.lookTypeWeight({ typeWeights: { enter: { fade: 0 } } }, style), 0);
});

test('sizeSpread widens with weird and sizeCenter follows the documented curve', () => {
  const low = genParams.derive({ ...BASE, weird: 0 });
  const high = genParams.derive({ ...BASE, weird: 1 });
  assert.ok(high.sizeSpread > low.sizeSpread);
  assert.ok(high.sizeCenter > low.sizeCenter);
  const half = genParams.derive({ ...BASE, weird: 0.6, energy: 0.5 });
  assert.ok(Math.abs(half.sizeCenter - 0.6) < 1e-9, `sizeCenter at w 0.6 is ${half.sizeCenter}`);
});

test('the planes weights match the documented w 0.6 distribution', () => {
  const derived = genParams.derive({ ...BASE, weird: 0.6 });
  const total = derived.planes1 + derived.planes2 + derived.planes3 + derived.planes4;
  assert.ok(Math.abs(derived.planes1 / total - 0.1304) < 0.01, `${derived.planes1 / total}`);
  assert.ok(Math.abs(derived.planes2 / total - 0.5217) < 0.01, `${derived.planes2 / total}`);
  assert.ok(Math.abs(derived.planes3 / total - 0.3478) < 0.01, `${derived.planes3 / total}`);
  assert.equal(derived.planes4, 0);
  void moods;
});

test('every row declares a kind, chance rows span 0..1 and the keys are unique', () => {
  const keys = new Set();
  for (const def of genParams.PARAMS) {
    assert.ok(['chance', 'weight', 'amount'].includes(def.kind), `${def.key} kind ${def.kind}`);
    assert.ok(!keys.has(def.key), `duplicate ${def.key}`);
    keys.add(def.key);
    if (def.kind === 'chance') {
      assert.equal(def.min, 0, `${def.key} chance min`);
      assert.equal(def.max, 1, `${def.key} chance max`);
    }
    assert.ok(Number.isFinite(def.step) && def.step > 0, `${def.key} step`);
  }
});

test('keysOf returns the weight groups in table order', () => {
  assert.deepEqual(genParams.keysOf('fg'), ['fgSolid', 'fgVivid', 'fgGradient', 'fgEffect']);
  assert.deepEqual(genParams.keysOf('deco'), ['decoNone', 'decoOutline', 'decoShadow', 'decoExtrude', 'decoLongShadow', 'decoDouble', 'decoGlow']);
  assert.deepEqual(genParams.keysOf('planes'), ['planes1', 'planes2', 'planes3', 'planes4']);
  assert.deepEqual(genParams.keysOf('textBg'), ['bgEnclose', 'bgAccent', 'bgUnderlay']);
  assert.deepEqual(genParams.FG_KEYS, genParams.keysOf('fg'));
  assert.deepEqual(genParams.DECO_KEYS, genParams.keysOf('deco'));
  assert.deepEqual(genParams.PLANE_KEYS, genParams.keysOf('planes'));
  assert.deepEqual(genParams.TEXT_BG_KEYS, genParams.keysOf('textBg'));
});

test('roll consumes no random at chance 0 and pickWeighted ignores zero weights', () => {
  let calls = 0;
  const random = () => {
    calls += 1;
    return 0.25;
  };
  assert.equal(genParams.roll(random, 0), false);
  assert.equal(calls, 0, 'a zero chance must not draw');
  assert.equal(genParams.roll(random, 1), true);
  assert.equal(calls, 1);
  calls = 0;
  assert.equal(genParams.pickWeighted(random, { a: 0, b: 0 }, ['a', 'b']), null);
  assert.equal(calls, 0, 'an empty group must not draw');
  assert.equal(genParams.pickWeighted(random, { a: 0, b: 1 }, ['a', 'b']), 'b');
  assert.equal(calls, 1);
});

test('every chance is off at weird 0 except the documented ones', () => {
  const derived = genParams.derive({ ...BASE, weird: 0 });
  const alwaysOn = new Set(['sizeChange', 'boldChance', 'graphicChance', 'pulseChance', 'textBgChance', 'bgVaryChance', 'bgEdgeChance']);
  for (const def of genParams.PARAMS) {
    if (def.kind !== 'chance' || alwaysOn.has(def.key)) continue;
    assert.equal(derived[def.key], 0, `${def.key} at weird 0`);
  }
  for (const key of alwaysOn) assert.ok(derived[key] > 0, `${key} stays on at weird 0`);
});

test('display rounds for the UI but resolve keeps the full precision', () => {
  assert.equal(genParams.display(0.123456), 0.123);
  assert.equal(genParams.display(0.9999), 1);
  assert.equal(genParams.display(Number.NaN), 0);
  const resolved = genParams.resolve({ axes: BASE });
  assert.equal(typeof resolved.paletteSwitchChance, 'number');
});
