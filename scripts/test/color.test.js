'use strict';

const test = require('node:test');
const assert = require('node:assert');

const color = require('../../renderer/js/color');

function close(a, b, tolerance) {
  assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
}

test('hex parsing and round-trip', () => {
  const parsed = color.parse('#ff8a3d');
  close(parsed.r, 1, 1e-6);
  close(parsed.g, 0x8a / 255, 1e-6);
  close(parsed.b, 0x3d / 255, 1e-6);
  close(parsed.a, 1, 1e-6);
  assert.strictEqual(color.toHex(parsed), '#ff8a3d');
  assert.strictEqual(color.toHex(color.parse('#abc')), '#aabbcc');
  assert.strictEqual(color.toHex(color.parse('#ff8a3d80')).slice(0, 7), '#ff8a3d');
});

test('rgb and hsl parsing', () => {
  const rgb = color.parse('rgb(255, 138, 61)');
  close(rgb.r, 1, 1e-6);
  close(rgb.g, 0x8a / 255, 1e-6);
  const rgba = color.parse('rgba(0, 0, 0, 0.5)');
  close(rgba.a, 0.5, 1e-6);
  const hsl = color.parse('hsl(24, 100%, 62%)');
  close(hsl.r, 1, 0.01);
  close(hsl.g, 0x8a / 255, 0.02);
});

test('OKLab round-trip error stays under 1e-4', () => {
  const samples = ['#000000', '#ffffff', '#ff8a3d', '#4d8dff', '#00ff00', '#123456'];
  for (const sample of samples) {
    const original = color.parse(sample);
    const back = color.oklabToRgb(color.rgbToOklab(original));
    close(back.r, original.r, 1e-4);
    close(back.g, original.g, 1e-4);
    close(back.b, original.b, 1e-4);
  }
});

test('mix blends in OKLab by default', () => {
  const mixed = color.mix(color.parse('#000000'), color.parse('#ffffff'), 0.5);
  close(mixed.r, mixed.g, 1e-6);
  close(mixed.g, mixed.b, 1e-6);
  assert.ok(mixed.r > 0.3 && mixed.r < 0.5, `oklab midpoint is perceptual, got ${mixed.r}`);
});

test('sampleGradient interpolates between stops', () => {
  const stops = [
    { pos: 0, color: '#000000' },
    { pos: 1, color: '#ffffff' },
  ];
  const middle = color.sampleGradient(stops, 0.5);
  close(middle.r, middle.b, 1e-6);
  const before = color.sampleGradient(stops, -1);
  close(before.r, 0, 1e-9);
  const after = color.sampleGradient(stops, 2);
  close(after.r, 1, 1e-6);
});

test('lerpColorValue handles solids, gradients and mismatches', () => {
  const a = color.resolve({ kind: 'solid', value: '#ff0000' });
  const b = color.resolve({ kind: 'solid', value: '#0000ff' });
  assert.strictEqual(color.lerpColorValue(a, b, 0).rgba.g !== undefined, true);
  const mid = color.lerpColorValue(a, b, 0.5);
  assert.strictEqual(mid.kind, 'solid');

  const g1 = color.resolve({ kind: 'gradient', type: 'linear', angle: 0, stops: [{ pos: 0, color: '#000000', alpha: 1 }, { pos: 1, color: '#ffffff', alpha: 1 }] });
  const g2 = color.resolve({ kind: 'gradient', type: 'linear', angle: 90, stops: [{ pos: 0.25, color: '#ff0000', alpha: 1 }, { pos: 1, color: '#00ff00', alpha: 1 }] });
  const gradient = color.lerpColorValue(g1, g2, 0.5);
  assert.strictEqual(gradient.kind, 'gradient');
  assert.strictEqual(gradient.stops.length, 2);
  close(gradient.angle, 45, 1e-6);

  const mismatch = color.lerpColorValue(a, g2, 0.4);
  assert.strictEqual(mismatch, a);
});

test('resolve handles palette and category values', () => {
  const palette = color.resolve({ kind: 'palette', paletteId: 'p1', index: 1 }, { palettes: [{ id: 'p1', colors: ['#111111', '#222222'] }] });
  assert.strictEqual(color.toHex(palette.rgba), '#222222');
  const category = color.resolve({ kind: 'category', which: 'tint2' }, { category: 'plays', categoryColors: { plays: { tint: '#5fd44d', tint2: '#22c07a' } } });
  assert.strictEqual(color.toHex(category.rgba), '#22c07a');
  const fallback = color.resolve({ kind: 'category', which: 'tint' }, {});
  assert.strictEqual(color.toHex(fallback.rgba), '#ff8a3d');
});
