import test from 'node:test';
import assert from 'node:assert';
import adsr from '../../renderer/js/lyrics/adsr.js';

test('adsr.def returns null for missing/non-object', () => {
  assert.strictEqual(adsr.def(null, 10), null);
  assert.strictEqual(adsr.def(undefined, 10), null);
  assert.strictEqual(adsr.def('string', 10), null);
  assert.strictEqual(adsr.def(123, 10), null);
});

test('adsr.level shape with linear eases', () => {
  const a = { peak: 1.5, sustain: 0.5, decay: 1 };
  // t=0 should be 0
  assert.strictEqual(adsr.level(a, 0, 0, 1, 8, 1, (x) => x, (x) => x), 0);
  // t=1 (end of attack) should be peak (1.5)
  assert.strictEqual(adsr.level(a, 1, 0, 1, 8, 1, (x) => x, (x) => x), 1.5);
  // t=2.5 (middle of decay: peak + (sustain - peak) * 0.5) should be sustain (0.5)
  // decay ease is easeOutCubic, so actual value will be different but should converge
  const level25 = adsr.level(a, 2.5, 0, 1, 8, 1, (x) => x, (x) => x);
  assert(level25 > 0.4 && level25 < 1.0, `level at t=2.5 should be between sustain and peak, got ${level25}`);
  // t=9 (in exit window of 1s, at the end) should be 0
  assert.strictEqual(adsr.level(a, 9, 0, 1, 8, 1, (x) => x, (x) => x), 0);
  // t=8.5 (middle of exit) should be around 0.25 (half of sustain level)
  const level85 = adsr.level(a, 8.5, 0, 1, 8, 1, (x) => x, (x) => x);
  assert(Math.abs(level85 - 0.25) < 0.01, `level at t=8.5 should be ~0.25, got ${level85}`);
});

test('adsr.clipLevel returns null without adsr', () => {
  assert.strictEqual(adsr.clipLevel(null, 5, 0, 10, 0.5, 0.5), null);
  assert.strictEqual(adsr.clipLevel(undefined, 5, 0, 10, 0.5, 0.5), null);
});

test('adsr.clipLevel with attack, decay, sustain, release', () => {
  const raw = { sustain: 0.5, decay: 1, peak: 1 };
  // clip from 0..10, fadeIn/fadeOut 0.5
  // attack = 0.5 (from fadeIn), release = 0.5 (from fadeOut)
  // decay: peak 1 -> sustain 0.5 over 1s

  // t=0: level should be 0 (before attack starts)
  const level0 = adsr.clipLevel(raw, 0, 0, 10, 0.5, 0.5);
  assert.strictEqual(level0, 0);

  // t=0.5: end of attack (level 1)
  const level05 = adsr.clipLevel(raw, 0.5, 0, 10, 0.5, 0.5);
  assert(Math.abs(level05 - 1) < 0.01, `level at t=0.5 should be ~1, got ${level05}`);

  // t=2: in decay phase (peak 1 -> sustain 0.5)
  const level2 = adsr.clipLevel(raw, 2, 0, 10, 0.5, 0.5);
  assert(level2 > 0.4 && level2 < 1, `level at t=2 should be between sustain and peak, got ${level2}`);

  // t=10: in exit window, should be 0
  const level10 = adsr.clipLevel(raw, 10, 0, 10, 0.5, 0.5);
  assert.strictEqual(level10, 0);
});

test('adsr.clipLevel with attack override', () => {
  const raw = { attack: 2, sustain: 0.5, decay: 1, peak: 1 };
  // attack overrides fadeIn (which would be 0.5)

  // t=0.25: 25% through 2s attack
  const level025 = adsr.clipLevel(raw, 0.25, 0, 10, 0.5, 0.5);
  assert(level025 > 0 && level025 < 1, `level at t=0.25 should be partial attack, got ${level025}`);

  // t=1: 50% through attack
  const level1 = adsr.clipLevel(raw, 1, 0, 10, 0.5, 0.5);
  assert(Math.abs(level1 - 0.5) < 0.1, `level at t=1 should be ~0.5, got ${level1}`);
});

test('adsr.PRESETS exist', () => {
  assert(adsr.PRESETS.pluck);
  assert(adsr.PRESETS.stab);
  assert(adsr.PRESETS.pad);
  assert(adsr.PRESETS.swell);
  assert.strictEqual(adsr.PRESETS.pluck.peak, 1.5);
  assert.strictEqual(adsr.PRESETS.pluck.punch, 0.2);
});

test('adsr.def keeps ease names; empty string / non-string → null', () => {
  const raw1 = { attackEase: 'easeInQuad', decayEase: '', releaseEase: 123 };
  const result1 = adsr.def(raw1, 10);
  assert.strictEqual(result1.attackEase, 'easeInQuad');
  assert.strictEqual(result1.decayEase, null);
  assert.strictEqual(result1.releaseEase, null);
});

test('adsr.level with no eases equals previous results (defaults unchanged)', () => {
  const a = { peak: 1.5, sustain: 0.5, decay: 1, attackEase: null, decayEase: null, releaseEase: null };
  // Same test as before: level should work the same
  assert.strictEqual(adsr.level(a, 0, 0, 1, 8, 1, (x) => x, (x) => x), 0);
  assert.strictEqual(adsr.level(a, 1, 0, 1, 8, 1, (x) => x, (x) => x), 1.5);
  const level85 = adsr.level(a, 8.5, 0, 1, 8, 1, (x) => x, (x) => x);
  assert(Math.abs(level85 - 0.25) < 0.01, `level at t=8.5 should be ~0.25, got ${level85}`);
});

test('attackEase overrides caller ease: easeInQuad at t=0.5 should be ~0.25', () => {
  const a = { peak: 1, sustain: 0.5, decay: 0, attackEase: 'easeInQuad', decayEase: null, releaseEase: null };
  const level = adsr.level(a, 0.5, 0, 1, 10, 1, (x) => x, (x) => x);
  // easeInQuad(0.5) = 0.5^2 = 0.25
  assert(Math.abs(level - 0.25) < 0.01, `level at t=0.5 should be ~0.25, got ${level}`);
});

test('releaseEase overrides caller ease: easeInQuad in release', () => {
  const a = { peak: 1, sustain: 1, decay: 0, attackEase: null, decayEase: null, releaseEase: 'easeInQuad' };
  const level = adsr.level(a, 9.5, 0, 1, 9, 1, (x) => x, (x) => x);
  // At t=9.5 (middle of exit from 9..10): px = 0.5
  // easeInQuad(0.5) = 0.25, so level = sustain * (1 - 0.25) = 1 * 0.75 = 0.75
  assert(Math.abs(level - 0.75) < 0.01, `level at t=9.5 should be ~0.75, got ${level}`);
});

test('decayEase: linear gives exact midpoint between peak and sustain', () => {
  const a = { peak: 2, sustain: 0, decay: 2, attackEase: null, decayEase: 'linear', releaseEase: null };
  const level = adsr.level(a, 2, 0, 1, 10, 1, (x) => x, (x) => x);
  // At t=2 (middle of decay from 1..3): midpoint between peak 2 and sustain 0
  assert(Math.abs(level - 1) < 0.01, `level at t=2 should be ~1, got ${level}`);
});

test('attackEase: backOut creates overshoot past peak', () => {
  const a = { peak: 1, sustain: 0, decay: 0, attackEase: 'backOut', decayEase: null, releaseEase: null };
  // backOut has overshoot; sample at some point in the attack should exceed peak
  const level = adsr.level(a, 0.7, 0, 1, 10, 1, null, null);
  assert(level > 1, `level with backOut overshoot should exceed peak 1, got ${level}`);
});

test('every PRESETS entry ease names resolve to valid functions', async () => {
  const easing = (await import('../../renderer/js/lyrics/easing.js')).default;
  for (const [name, preset] of Object.entries(adsr.PRESETS)) {
    const attackFn = easing.get(preset.attackEase);
    const decayFn = easing.get(preset.decayEase);
    const releaseFn = easing.get(preset.releaseEase);

    const attackValue = attackFn(1);
    const decayValue = decayFn(1);
    const releaseValue = releaseFn(1);

    assert(Math.abs(attackValue - 1) < 0.01, `${name}.attackEase should map 1→≈1, got ${attackValue}`);
    assert(Math.abs(decayValue - 1) < 0.01, `${name}.decayEase should map 1→≈1, got ${decayValue}`);
    assert(Math.abs(releaseValue - 1) < 0.01, `${name}.releaseEase should map 1→≈1, got ${releaseValue}`);
  }
});
