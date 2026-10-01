'use strict';

// Colour-only re-roll: `moods.rerollClipColors` keeps the clip's layout,
// motion and timing and only moves its literal colours onto the new palette.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const fx = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects', 'registry.js'));
for (const name of ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'background']) {
  require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects', `${name}.js`));
}
const moods = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'moods.js'));
const rng = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'rng.js'));
const color = require(path.join(ROOT, 'renderer', 'js', 'color.js'));

const FROM = ['#101018', '#202838', '#ffffff', '#ff0000', '#000000'];
const TO = ['#0a1a10', '#12301c', '#f0fff0', '#00c060', '#001008'];
const HEX = /^#([0-9a-f]{6}|[0-9a-f]{8})$/i;

function backdropClip() {
  return {
    id: 'mid1',
    auto: true,
    spec: {
      type: 'combo',
      params: {
        list: [
          { type: 'split', params: { layout: 'halves', parts: 2, motion: 'slide', scheme: 'tonal', speed: 0.5, amp: 0.03, colors: ['#ff0000', '#00ff00'], cuts: [1, 2] } },
          { type: 'pattern', params: { mode: 'grid', count: 12, speed: 0.4, opacity: 0.6, color: '#ff0000' } },
        ],
        animate: { mode: 'sway', pulse: 0.05, drift: 0.02, transition: 'wipe', duration: 0.35, sway: 0.02 },
      },
    },
    colors: ['#ff0000', '#00ff00'],
  };
}

test('rerollClipColors keeps layout, motion and timing and only moves colours', () => {
  const clip = backdropClip();
  const before = JSON.parse(JSON.stringify(clip));
  const result = moods.rerollClipColors('backdrop', clip, { palette: { colors: TO }, from: FROM, axes: { weird: 0.8 }, seed: 5 });
  assert.ok(result && result.spec);
  // the input is never mutated
  assert.deepEqual(clip, before);
  const planes = result.spec.params.list[0].params;
  const pattern = result.spec.params.list[1].params;
  assert.equal(planes.layout, 'halves');
  assert.equal(planes.parts, 2);
  assert.equal(planes.motion, 'slide');
  assert.equal(planes.speed, 0.5);
  assert.equal(planes.amp, 0.03);
  assert.deepEqual(planes.cuts, [1, 2]);
  assert.deepEqual(result.spec.params.animate, before.spec.params.animate);
  assert.equal(pattern.mode, 'grid');
  assert.equal(pattern.count, 12);
  assert.equal(pattern.speed, 0.4);
  assert.equal(pattern.opacity, 0.6);
  // the colours moved: the split planes were re-drawn from the new palette and
  // the literal red of the pattern is no longer the old red
  assert.ok(planes.colors.every((hex) => HEX.test(hex)), `split colours ${planes.colors}`);
  assert.notDeepEqual(planes.colors, before.spec.params.list[0].params.colors);
  assert.notEqual(pattern.color, '#ff0000');
  assert.ok(HEX.test(pattern.color), `pattern colour ${pattern.color}`);
  assert.notDeepEqual(result.colors, before.colors);
});

test('a background clip keeps its scale / speed and takes the first two roles', () => {
  const clip = { id: 'bg1', spec: { type: 'noiseGradient', params: { scale: 2.5, speed: 0.3, colors: ['#ff0000', '#00ff00'] } }, colors: ['#ff0000', '#00ff00'] };
  const result = moods.rerollClipColors('background', clip, { palette: { colors: TO }, from: FROM, axes: {}, seed: 3 });
  assert.equal(result.spec.type, 'noiseGradient');
  assert.equal(result.spec.params.scale, 2.5);
  assert.equal(result.spec.params.speed, 0.3);
  assert.deepEqual(result.colors, [TO[0], TO[1]]);
  assert.notEqual(result.spec.params.colors[0], '#ff0000');
});

test('the split scheme obeys smartness', () => {
  const clip = backdropClip();
  for (let seed = 1; seed <= 40; seed += 1) {
    const result = moods.rerollClipColors('backdrop', clip, { palette: { colors: TO }, from: FROM, axes: { weird: 0.8, smartness: 1 }, seed });
    assert.equal(result.spec.params.list[0].params.scheme, 'neutralAccent', `seed ${seed}`);
  }
});

test('jitterPalette with spread omitted gives the old result', () => {
  const palette = { name: 'p', colors: ['#101018', '#202838', '#ffffff', '#ff0000', '#000000', '#ffcc00'] };
  const plain = moods.jitterPalette(rng.mulberry32(9), palette, { weird: 0.5 });
  const explicit = moods.jitterPalette(rng.mulberry32(9), palette, { weird: 0.5 }, 1);
  assert.deepEqual(plain, explicit);
  const wide = moods.jitterPalette(rng.mulberry32(9), palette, { weird: 0.5 }, 2.5);
  assert.notDeepEqual(plain.colors, wide.colors);
  // no palette at all still falls back to a generated theme
  const generated = moods.jitterPalette(rng.mulberry32(2), null, { weird: 0 });
  assert.ok(generated && generated.colors.length >= 3);
});

test('the two per-colour re-rolls: family nudge vs full hue jump', () => {
  const distanceFromRed = (hex) => {
    const hue = color.rgbToHsv(color.parse(hex)).h;
    return Math.min(hue, 360 - hue);
  };
  let far = 0;
  for (let seed = 1; seed <= 60; seed += 1) {
    // the local ↻ stays inside the family (about ±54°)
    const nudged = moods.jitterPalette(rng.mulberry32(seed), { colors: ['#ff0000'] }, { weird: 0 }, 2.5).colors[0];
    assert.ok(distanceFromRed(nudged) <= 56, `seed ${seed}: the family nudge left red (${nudged})`);
    // the big jump can land on the other side of the wheel
    const jumped = moods.rerollColor(rng.mulberry32(seed), '#ff0000', { weird: 0 });
    assert.match(jumped, /^#[0-9a-f]{6}$/i);
    if (distanceFromRed(jumped) > 120) far += 1;
  }
  assert.ok(far >= 10, `only ${far}/60 jumps left the red family`);
});
