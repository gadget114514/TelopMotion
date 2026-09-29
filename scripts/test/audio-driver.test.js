'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const driver = require('../../renderer/js/lyrics/audio-driver.js');

function fakeAnalysis() {
  const frames = [];
  for (let i = 0; i < 60; i += 1) {
    const loud = i < 30;
    const bands = new Float32Array(128);
    if (loud) {
      bands[5] = 0.8;
      bands[30] = 0.4;
      bands[80] = 0.1;
    }
    frames.push({ rms: loud ? 0.5 : 0, bands, wave: new Float32Array(4) });
  }
  return { fps: 30, frameCount: frames.length, frames };
}

test('frameAt maps time to frames and clamps at both ends', () => {
  const analysis = fakeAnalysis();
  assert.equal(driver.frameAt(analysis, 0), analysis.frames[0]);
  assert.equal(driver.frameAt(analysis, 0.5), analysis.frames[15]);
  assert.equal(driver.frameAt(analysis, 999), analysis.frames[59]);
  assert.equal(driver.frameAt(analysis, -3), analysis.frames[0]);
  assert.equal(driver.frameAt(null, 1), null);
});

test('band presets read low, mid, high and rms levels', () => {
  const analysis = fakeAnalysis();
  const at = (band) => driver.sample(analysis, 0.25, { band, gain: 1 });
  const low = at('low');
  const mid = at('mid');
  const high = at('high');
  const rms = at('rms');
  assert.ok(low > mid && mid > high && high > 0, `low ${low} mid ${mid} high ${high}`);
  assert.ok(low > 0.05, `low ${low}`);
  assert.equal(rms, 0.5);
  assert.ok(Math.abs(driver.sample(analysis, 0.25, { band: 80 }) - 0.1) < 1e-6);
  assert.ok(Math.abs(driver.sample(analysis, 0.25, { band: 30 }) - 0.4) < 1e-6);
  assert.equal(driver.level(null, 'mid'), 0);
});

test('sample applies gain, offset and clamping', () => {
  const analysis = fakeAnalysis();
  assert.ok(Math.abs(driver.sample(analysis, 0.25, { band: 80, gain: 8 }) - 0.8) < 1e-6);
  assert.equal(driver.sample(analysis, 0.25, { band: 80, gain: 100, max: 1 }), 1);
  assert.ok(Math.abs(driver.sample(analysis, 0.25, { band: 'rms', gain: 2, offset: -0.5 }) - 0.5) < 1e-6);
  assert.equal(driver.sample(analysis, 1.9, { band: 'rms', gain: 5 }), 0, 'silent half stays at zero');
});

test('resolveParams replaces audio objects and keeps plain values', () => {
  const analysis = fakeAnalysis();
  const params = { width: 4, glow: { audio: { band: 'mid', gain: 3 } }, nested: { a: 1 } };
  const resolved = driver.resolveParams(params, analysis, 0.25);
  assert.notEqual(resolved, params);
  assert.equal(resolved.width, 4);
  assert.equal(resolved.nested, params.nested);
  const expectedGlow = driver.level(driver.frameAt(analysis, 0.25), 'mid') * 3;
  assert.ok(Math.abs(resolved.glow - expectedGlow) < 1e-6, `glow ${resolved.glow} vs ${expectedGlow}`);
  const untouched = driver.resolveParams({ width: 4 }, analysis, 0.25);
  assert.equal(untouched.width, 4);
});

test('resolveStyle walks single and stacked groups without mutating the input', () => {
  const analysis = fakeAnalysis();
  const style = {
    enter: { type: 'fade', params: { amount: { audio: { band: 'rms', gain: 2 } } } },
    edge: [
      { type: 'outline', params: { width: { audio: { band: 'mid', gain: 10 } } } },
      { type: 'neonGlow', params: { radius: 4 } },
    ],
    fill: { type: 'solid', params: { amount: 1 } },
  };
  const before = JSON.stringify(style);
  const resolved = driver.resolveStyle(style, analysis, 0.25);
  assert.equal(JSON.stringify(style), before, 'input style is untouched');
  assert.equal(resolved.enter.params.amount, 1);
  assert.ok(resolved.edge[0].params.width > 0, 'outline width reacts');
  assert.equal(resolved.edge[1], style.edge[1], 'static instances are reused');
  assert.equal(resolved.fill, style.fill);
  const quiet = driver.resolveStyle(style, analysis, 1.5);
  assert.equal(quiet.enter.params.amount, 0);
  assert.equal(quiet.edge[0].params.width, 0);
  assert.equal(driver.resolveStyle(style, null, 1), style, 'no analysis means no resolution');
});

test('rangeEnergy normalises a beat against the song p90', () => {
  const analysis = fakeAnalysis();
  assert.equal(driver.rangeEnergy(analysis, 0, 1), 1, 'a fully loud second saturates');
  assert.equal(driver.rangeEnergy(analysis, 1, 2), 0, 'a silent second is zero');
  const mixed = driver.rangeEnergy(analysis, 0.75, 1.25);
  assert.ok(Math.abs(mixed - 0.5) < 1e-6, `mixed ${mixed}`);
  assert.equal(driver.rangeEnergy(null, 0, 1), null);
  assert.equal(driver.rangeEnergy({ fps: 30, frames: [] }, 0, 1), null);
});

test('reactiveParams lists the audio-bound parameters for the inspector', () => {
  const style = {
    post: [{ type: 'digitalNoise', params: { amount: { audio: { band: 'high' } }, speed: 1 } }],
    fill: { type: 'solid', params: {} },
  };
  const list = driver.reactiveParams(style);
  assert.equal(list.length, 1);
  assert.equal(list[0].group, 'post');
  assert.equal(list[0].key, 'amount');
  assert.equal(list[0].audio.band, 'high');
});
