'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const variants = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'pattern-variants.js'));
const fillerRender = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'filler-render.js'));
const fx = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects', 'registry.js'));
require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects', 'background.js'));
const moods = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'moods.js'));

function shapesOf(mode, size, count, options) {
  const opts = options || {};
  return fillerRender.drawList(
    { type: 'pattern', params: { mode, size, count, speed: opts.speed == null ? 0 : opts.speed, opacity: 1, color: '#ffffff' } },
    { time: opts.time == null ? 0.5 : opts.time, frame: { width: 1920, height: 1080 }, color: '#ffffff', clip: { key: 'pattern-test' } }
  ).shapes;
}

// the y spread of the first line / ribbon (32 segments) shows the sine amplitude
function bandRange(list) {
  const ys = list.slice(0, 32).flatMap((shape) => [shape.y0, shape.y1]);
  return Math.max(...ys) - Math.min(...ys);
}

test('the pattern library has 800+ distinguishable variants', () => {
  const list = variants.variants();
  assert.ok(list.length >= 800, `variants ${list.length}`);
  assert.ok(variants.MODES.length >= 12, `modes ${variants.MODES.length}`);
  assert.equal(new Set(list.map((variant) => variant.key)).size, list.length);
  const limits = {};
  for (const param of fx.get('background', 'pattern').params) limits[param.key] = param;
  for (const variant of list) {
    assert.equal(variant.key, variants.keyOf(variant));
    assert.ok(limits.mode.options.includes(variant.mode), `mode ${variant.mode}`);
    assert.ok(variant.count >= limits.count.min && variant.count <= limits.count.max, `count ${variant.count}`);
    assert.ok(variant.size >= limits.size.min && variant.size <= limits.size.max, `size ${variant.size}`);
    assert.ok(variant.speed >= limits.speed.min && variant.speed <= limits.speed.max, `speed ${variant.speed}`);
    assert.ok(variant.speed > 0, `#${variant.index} is static`);
    assert.ok(variant.opacity >= limits.opacity.min && variant.opacity <= limits.opacity.max, `opacity ${variant.opacity}`);
  }
});

test('the library is deterministic and wraps around', () => {
  assert.deepEqual(variants.variants(), variants.variants());
  assert.equal(variants.at(0).key, variants.at(variants.count()).key);
  assert.equal(variants.at(-1).key, variants.at(variants.count() - 1).key);
});

test('consecutive variants change the mode and then the size', () => {
  const list = variants.variants();
  for (let i = 1; i < list.length; i += 1) {
    assert.notEqual(list[i - 1].mode, list[i].mode, `#${i} kept the mode`);
    if (i % variants.MODES.length === 0) assert.notEqual(list[i - 1].size, list[i].size, `#${i} kept the size`);
  }
  const sizes = new Set(list.slice(0, variants.MODES.length * variants.SIZE_STOPS.length).map((variant) => variant.size));
  assert.equal(sizes.size, variants.SIZE_STOPS.length);
});

test('every mode animates at a positive speed', () => {
  for (const mode of variants.MODES) {
    const at0 = JSON.stringify(shapesOf(mode, 1, 24, { speed: 1, time: 0 }));
    const at05 = JSON.stringify(shapesOf(mode, 1, 24, { speed: 1, time: 0.5 }));
    assert.notEqual(at0, at05, `${mode} does not move`);
  }
});

test('a size step moves the drawn element in every mode', () => {
  const gridSmall = shapesOf('grid', 0.2, 24);
  const gridLarge = shapesOf('grid', 2.95, 24);
  assert.equal(gridSmall.length, gridLarge.length);
  assert.ok(gridLarge[0].w > gridSmall[0].w * 2, `grid tiles ${gridSmall[0].w} -> ${gridLarge[0].w}`);
  const dotsSmall = shapesOf('dots', 0.2, 24);
  const dotsLarge = shapesOf('dots', 2.95, 24);
  assert.ok(dotsLarge[0].r > dotsSmall[0].r * 5, `dot radius ${dotsSmall[0].r} -> ${dotsLarge[0].r}`);
  const stripesSmall = shapesOf('stripes', 0.2, 24);
  const stripesLarge = shapesOf('stripes', 2.95, 24);
  assert.ok(stripesLarge[0].w > stripesSmall[0].w * 4, `stripe width ${stripesSmall[0].w} -> ${stripesLarge[0].w}`);
  assert.ok(stripesLarge[0].w < 1920 / 24, 'stripes must keep a gap');
  const ringsSmall = shapesOf('rings', 0.2, 24);
  const ringsLarge = shapesOf('rings', 2.95, 24);
  assert.ok(ringsLarge[0].thickness > ringsSmall[0].thickness * 5, `ring thickness ${ringsSmall[0].thickness} -> ${ringsLarge[0].thickness}`);
  for (const [mode, sides] of [['triangles', 3], ['diamonds', 4], ['hexes', 6]]) {
    const small = shapesOf(mode, 0.2, 24);
    const large = shapesOf(mode, 2.95, 24);
    assert.equal(large[0].kind, 'polygon', `${mode} shape`);
    assert.equal(large[0].sides, sides, `${mode} sides`);
    assert.ok(large[0].r > small[0].r * 5, `${mode} radius ${small[0].r} -> ${large[0].r}`);
  }
  const rainSmall = shapesOf('rain', 0.2, 24);
  const rainLarge = shapesOf('rain', 2.95, 24);
  assert.equal(rainLarge[0].kind, 'capsule', 'rain shape');
  assert.ok(rainLarge[0].y1 - rainLarge[0].y0 > (rainSmall[0].y1 - rainSmall[0].y0) * 5, `rain length ${rainSmall[0].y1 - rainSmall[0].y0} -> ${rainLarge[0].y1 - rainLarge[0].y0}`);
  const checksSmall = shapesOf('checks', 0.2, 24);
  const checksLarge = shapesOf('checks', 2.95, 24);
  assert.equal(checksLarge[0].kind, 'rect', 'checks shape');
  assert.ok(checksLarge[0].w > checksSmall[0].w * 2, `checker tiles ${checksSmall[0].w} -> ${checksLarge[0].w}`);
  const polkaSmall = shapesOf('polka', 0.2, 24);
  const polkaLarge = shapesOf('polka', 2.95, 24);
  assert.equal(polkaLarge[0].kind, 'circle', 'polka shape');
  assert.ok(polkaLarge[0].r > polkaSmall[0].r * 5, `polka radius ${polkaSmall[0].r} -> ${polkaLarge[0].r}`);
  const sineSmall = shapesOf('sineCurve', 0.2, 24);
  const sineLarge = shapesOf('sineCurve', 2.95, 24);
  assert.equal(sineLarge[0].kind, 'capsule', 'sineCurve shape');
  assert.ok(bandRange(sineLarge) > bandRange(sineSmall) * 5, `sine amplitude ${bandRange(sineSmall)} -> ${bandRange(sineLarge)}`);
  assert.ok(sineLarge[0].width > sineSmall[0].width * 5, `sine thickness ${sineSmall[0].width} -> ${sineLarge[0].width}`);
  const waveSmall = shapesOf('waves', 0.2, 24);
  const waveLarge = shapesOf('waves', 2.95, 24);
  assert.equal(waveLarge[0].kind, 'capsule', 'waves shape');
  assert.ok(bandRange(waveLarge) > bandRange(waveSmall) * 5, `wave amplitude ${bandRange(waveSmall)} -> ${bandRange(waveLarge)}`);
  const mosaicWidth = (list) => Math.max(...list.map((shape) => shape.w || 0));
  const mosaicSmall = Math.max(...[0, 0.3, 0.7, 1.1].map((time) => mosaicWidth(shapesOf('randomFill', 0.2, 48, { time }))));
  const mosaicLarge = Math.max(...[0, 0.3, 0.7, 1.1].map((time) => mosaicWidth(shapesOf('randomFill', 2.95, 48, { time }))));
  assert.ok(mosaicLarge > mosaicSmall * 2, `random fill tiles ${mosaicSmall} -> ${mosaicLarge}`);
});

test('a count step changes how many elements are drawn', () => {
  for (const mode of ['grid', 'dots', 'stripes', 'rings', 'triangles', 'diamonds', 'hexes', 'rain', 'checks', 'polka']) {
    assert.equal(shapesOf(mode, 1, 6).length, 6, `${mode} count 6`);
    assert.equal(shapesOf(mode, 1, 120).length, 120, `${mode} count 120`);
  }
  for (const mode of ['sineCurve', 'waves']) {
    assert.equal(shapesOf(mode, 1, 6).length, 6 * 32, `${mode} count 6`);
    assert.equal(shapesOf(mode, 1, 120).length, 120 * 32, `${mode} count 120`);
  }
  assert.ok(shapesOf('randomFill', 1, 120).length > shapesOf('randomFill', 1, 6).length * 5, 'random fill density');
});

test('backdrop generation cycles the library without repeating', () => {
  const axes = moods.normalizeAxes({ speed: 0.5, energy: 0.5, softness: 0.5, density: 0.6, brightness: 0.5 });
  const keys = new Set();
  let sampled = 0;
  for (let index = 0; index < variants.count(); index += 1) {
    const result = moods.rerollClipSpec('backdrop', { axes, seed: 12345 + index * 977, index });
    if (!result || !result.spec || result.spec.type !== 'pattern') continue;
    const params = result.spec.params;
    keys.add(`${params.mode}|${params.size}|${params.count}`);
    sampled += 1;
    const variant = variants.at(index);
    assert.equal(params.mode, variant.mode, `#${index} mode`);
    assert.ok(params.speed > 0, `#${index} static backdrop`);
  }
  assert.ok(sampled > 50, `only ${sampled} pattern backdrops were sampled`);
  assert.equal(keys.size, sampled, 'a backdrop pattern repeated');
});
