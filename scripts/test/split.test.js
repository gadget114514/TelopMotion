'use strict';

// Phase 4: the backdrop split geometry. Every layout must tile the frame with
// convex regions, paint exactly `coverage` of the area and stay deterministic.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const split = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'split.js'));

const FRAME = { width: 1920, height: 1080 };
const COLORS = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'];

function ctx(extra) {
  return { frame: FRAME, time: 1.25, seed: 7, clipKey: 3, ...(extra || {}) };
}

function paintedArea(regions) {
  return regions.filter((region) => region.painted).reduce((sum, region) => sum + region.area, 0);
}

function isConvex(points) {
  let sign = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const c = points[(i + 2) % points.length];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-6) continue;
    if (sign === 0) sign = Math.sign(cross);
    else if (Math.sign(cross) !== sign) return false;
  }
  return true;
}

test('every layout tiles the frame with convex regions', () => {
  const total = FRAME.width * FRAME.height;
  for (const layout of split.LAYOUTS) {
    const regions = split.regions({ layout, parts: 5, coverage: 0.6, colors: COLORS }, ctx());
    assert.ok(regions.length >= 2, `${layout}: ${regions.length} regions`);
    const sum = regions.reduce((acc, region) => acc + region.area, 0);
    assert.ok(Math.abs(sum - total) < total * 0.01, `${layout}: area ${sum} vs ${total}`);
    for (const region of regions) {
      assert.ok(region.points.length >= 3, `${layout}: region with ${region.points.length} points`);
      assert.ok(isConvex(region.points), `${layout}: region is not convex`);
    }
  }
});

test('the painted share follows the coverage within 5%', () => {
  const total = FRAME.width * FRAME.height;
  for (const layout of split.LAYOUTS) {
    for (const coverage of [0.2, 0.5, 0.85, 1]) {
      const regions = split.regions({ layout, parts: 5, coverage, colors: COLORS }, ctx());
      const share = paintedArea(regions) / total;
      assert.ok(Math.abs(share - coverage) <= 0.05, `${layout} @ ${coverage}: painted ${share}`);
    }
  }
});

test('regionAt finds the containing region', () => {
  const regions = split.regions({ layout: 'halves', coverage: 0.5, colors: COLORS }, ctx());
  const inside = split.regionAt(regions, 100, 100);
  assert.ok(inside >= 0);
  assert.equal(split.regionAt([], 100, 100), -1);
  const center = split.centroid(regions[inside].points);
  assert.equal(split.regionAt(regions, center.x, center.y), inside);
});

test('the regions are deterministic for one seed', () => {
  const first = split.regions({ layout: 'mondrian', parts: 6, coverage: 0.7, colors: COLORS }, ctx());
  const second = split.regions({ layout: 'mondrian', parts: 6, coverage: 0.7, colors: COLORS }, ctx());
  assert.deepEqual(first.map((region) => region.points), second.map((region) => region.points));
  assert.deepEqual(first.map((region) => region.color), second.map((region) => region.color));
});

test('the biggest painted region gets the primary colour (60-30-10)', () => {
  const regions = split.regions({ layout: 'mondrian', parts: 6, coverage: 0.8, colors: COLORS }, ctx());
  const painted = regions.filter((region) => region.painted).sort((a, b) => b.area - a.area);
  assert.equal(painted[0].color, COLORS[0]);
  if (painted[1]) assert.equal(painted[1].color, COLORS[1]);
});

test('motion breathes, slides and rotates with the time', () => {
  const still = split.regions({ layout: 'halves', coverage: 0.5, colors: COLORS }, ctx({ time: 0 })).map((region) => region.points);
  const slid = split.regions({ layout: 'halves', coverage: 0.5, colors: COLORS, motion: 'slide', amp: 0.2, speed: 0.5 }, ctx({ time: 0.5 })).map((region) => region.points);
  assert.notDeepEqual(still, slid);
  const b0 = split.regions({ layout: 'halves', coverage: 0.5, colors: COLORS, motion: 'breathe', amp: 0.2 }, ctx({ time: 1, beatPhase: 0 })).map((region) => region.points);
  const b1 = split.regions({ layout: 'halves', coverage: 0.5, colors: COLORS, motion: 'breathe', amp: 0.2 }, ctx({ time: 1, beatPhase: 0.25 })).map((region) => region.points);
  assert.notDeepEqual(b0, b1);
});

test('swap rotates the colour assignment on the rhythm cuts', () => {
  const params = { layout: 'bands', parts: 4, coverage: 0.75, colors: COLORS, motion: 'swap', cuts: [0.4, 0.8] };
  const before = split.regions(params, ctx({ time: 0.2 })).filter((region) => region.painted).map((region) => region.color);
  const after = split.regions(params, ctx({ time: 1.0 })).filter((region) => region.painted).map((region) => region.color);
  assert.notDeepEqual(before, after);
});

test('lines() carries the first cut for the text sync', () => {
  const lines = split.lines({ layout: 'halves', coverage: 0.5, angle: 0 }, ctx());
  assert.equal(lines.length, 1);
  const line = lines[0];
  assert.ok(Math.abs(line.a * FRAME.width / 2 + line.b * FRAME.height / 2 + line.c) < 1.5, 'the cut runs through the solved offset');
  assert.deepEqual(split.lines({ layout: 'mondrian' }, ctx()), []);
});

// --- filler-render integration ------------------------------------------------

const fillerRender = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'filler-render.js'));

test('the split clip draws only the painted convex planes', () => {
  const list = fillerRender.drawList(
    { type: 'split', params: { layout: 'bands', parts: 4, coverage: 0.5, colors: COLORS } },
    { time: 1, frame: FRAME, seed: 7, clip: { key: 'clip_mid_0', start: 0, end: 10 } }
  );
  assert.ok(list.shapes.length >= 2);
  const painted = list.shapes.reduce((sum, shape) => sum + split.area(shape.points), 0);
  assert.ok(Math.abs(painted / (FRAME.width * FRAME.height) - 0.5) < 0.05);
  assert.ok(list.shapes.every((shape) => shape.kind === 'convex'));
  assert.ok(new Set(list.shapes.map((shape) => shape.color)).size >= 2, 'the planes use the palette');
});

test('animate pulses, drifts and transitions the shapes', () => {
  const list = fillerRender.drawList(
    { type: 'pattern', params: { mode: 'grid', count: 12, color: '#ffffff' } },
    { time: 5, frame: FRAME, seed: 1, clip: { key: 'c', start: 5, end: 10 } }
  );
  const before = JSON.parse(JSON.stringify(list.shapes[0]));
  fillerRender.animate(list, {
    motion: { pulse: 0.1, drift: 0.02, transition: 'wipe', duration: 0.35 },
    t: 5.175,
    clip: { start: 5, end: 10 },
    bpm: 120,
    frame: FRAME,
  });
  assert.notDeepEqual(list.shapes[0], before);
  for (const shape of list.shapes) {
    assert.ok(Number.isFinite(shape.x === undefined ? shape.x0 : shape.x), 'finite after animate');
    assert.ok(shape.opacity >= 0 && shape.opacity <= 1);
  }
});
