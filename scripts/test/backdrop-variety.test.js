'use strict';

// The backdrop's variety: gradient4 colours come from one family, the plane
// accent can be a figure layer and never repeats its neighbour, and the split
// depth stays off unless asked for.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const fx = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects', 'registry.js'));
require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects', 'background.js'));
const color = require(path.join(ROOT, 'renderer', 'js', 'color.js'));
const moods = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'moods.js'));
const fillerRender = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'filler-render.js'));

const PALETTE = { colors: ['#223a8c', '#ff0000', '#00ff00', '#ffee00'] };

test('gradient4 with a harmony derives its four colours from the first one', () => {
  const uniforms = fx.backgroundUniforms({ type: 'gradient4', params: { harmony: 'tonal', grain: 0.3 } }, { palette: PALETTE });
  const hues = [uniforms.u_colorA, uniforms.u_colorB, uniforms.u_colorC, uniforms.u_colorD].map((rgb) => color.rgbToHsv({ r: rgb[0], g: rgb[1], b: rgb[2] }).h);
  for (const hue of hues) assert.ok(Math.abs(hue - hues[0]) < 3, `tonal hues ${hues}`);
  const plain = fx.backgroundUniforms({ type: 'gradient4', params: {} }, { palette: PALETTE });
  assert.notDeepEqual(Array.from(plain.u_colorB), Array.from(uniforms.u_colorB), 'no harmony keeps the palette slots');
});

test('the plane backdrop accent skips the neighbouring accent and figures can be drawn', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 200; seed += 1) {
    const result = moods.rerollClipSpec('backdrop', {
      axes: { weird: 0.9 },
      seed,
      coverage: 0.9,
      rawW: 0.9,
      planes: { planes2: 1, planes3: 1, planes4: 1 },
      avoid: { accent: 'pattern' },
    });
    const accent = result.spec.params.list.find((part) => part.type !== 'split');
    assert.notEqual(accent.type, 'pattern');
    seen.add(accent.type);
  }
  assert.ok(seen.has('figures'), `accent kinds ${[...seen]}`);
});

test('the split depth is optional: flat by default, shadow and inset panel when set', () => {
  const params = { layout: 'halves', parts: 2, coverage: 1, colors: ['#204080', '#406020'] };
  const ctx = { frame: { width: 1920, height: 1080 }, time: 1, seed: 3 };
  const flat = fillerRender.drawList({ type: 'split', params }, ctx).shapes;
  const deep = fillerRender.drawList({ type: 'split', params: { ...params, depth: 0.8 } }, ctx).shapes;
  assert.ok(flat.length >= 2);
  assert.ok(deep.length > flat.length, `flat ${flat.length} deep ${deep.length}`);
  assert.deepEqual(flat, fillerRender.drawList({ type: 'split', params: { ...params, depth: 0 } }, ctx).shapes);
});
