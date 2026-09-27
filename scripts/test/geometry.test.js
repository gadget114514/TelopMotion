'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const geometry = require('../../renderer/js/lyrics/geometry.js');
const rng = require('../../renderer/js/lyrics/rng.js');

function circlePath(cx, cy, radius, segments = 72, clockwise = true) {
  const commands = [];
  const count = Math.max(8, segments);
  for (let i = 0; i < count; i += 1) {
    const t = (clockwise ? i : count - i) / count * Math.PI * 2;
    const x = cx + Math.cos(t) * radius;
    const y = cy + Math.sin(t) * radius;
    commands.push(i === 0 ? { type: 'M', x, y } : { type: 'L', x, y });
  }
  commands.push({ type: 'Z' });
  return { commands };
}

function squarePath(cx, cy, half) {
  return {
    commands: [
      { type: 'M', x: cx - half, y: cy - half },
      { type: 'L', x: cx + half, y: cy - half },
      { type: 'L', x: cx + half, y: cy + half },
      { type: 'L', x: cx - half, y: cy + half },
      { type: 'Z' },
    ],
  };
}

function areaOf(contours, groups) {
  return geometry.triangleAreaSum(geometry.triangulate(groups));
}

test('glyphContours flattens lines into a closed contour', () => {
  const path = {
    commands: [
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 10, y: 0 },
      { type: 'L', x: 10, y: 10 },
      { type: 'Z' },
    ],
  };
  const contours = geometry.glyphContours(path, 0.35);
  assert.equal(contours.length, 1);
  assert.equal(contours[0].points.length / 2, 3);
  assert.equal(contours[0].closed, true);
  assert.ok(Math.abs(contours[0].area - 50) < 1e-6, `area ${contours[0].area}`);
});

test('glyphContours adaptively subdivides curves within the tolerance', () => {
  const radius = 100;
  const path = {
    commands: [
      { type: 'M', x: radius, y: 0 },
      { type: 'C', x1: radius, y1: radius * 0.5523, x2: radius * 0.5523, y2: radius, x: 0, y: radius },
    ],
  };
  const fine = geometry.glyphContours(path, 0.05);
  const coarse = geometry.glyphContours(path, 5);
  assert.equal(fine.length, 1);
  assert.ok(fine[0].points.length > coarse[0].points.length, 'smaller tolerance means more points');
  assert.ok(coarse[0].points.length >= 2);
  let maxError = 0;
  for (let i = 0; i < fine[0].points.length; i += 2) {
    const x = fine[0].points[i];
    const y = fine[0].points[i + 1];
    maxError = Math.max(maxError, Math.abs(Math.hypot(x, y) - radius));
  }
  assert.ok(maxError < 0.2, `maxError ${maxError}`);
  const first = fine[0].points;
  assert.ok(Math.abs(first[0] - radius) < 1e-5);
  assert.ok(Math.abs(first[1]) < 1e-5);
});

test('groupContours finds the hole in an O', () => {
  const outer = geometry.glyphContours(circlePath(0, 0, 100), 0.4);
  const inner = geometry.glyphContours(circlePath(0, 0, 60, 24, false), 0.4);
  const groups = geometry.groupContours([...outer, ...inner]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].holes.length, 1);
  const area = areaOf(null, groups);
  const expected = Math.PI * (100 * 100 - 60 * 60);
  assert.ok(Math.abs(area - expected) / expected < 0.005, `area ${area} expected ${expected}`);
});

test('groupContours finds two separate outer shapes with holes in an 8', () => {
  const topOuter = geometry.glyphContours(circlePath(0, -70, 70, 48), 0.5);
  const topHole = geometry.glyphContours(circlePath(0, -70, 30, 24, false), 0.5);
  const bottomOuter = geometry.glyphContours(circlePath(0, 70, 70, 48), 0.5);
  const bottomHole = geometry.glyphContours(circlePath(0, 70, 30, 24, false), 0.5);
  const groups = geometry.groupContours([...topOuter, ...topHole, ...bottomOuter, ...bottomHole]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].holes.length, 1);
  assert.equal(groups[1].holes.length, 1);
  const area = areaOf(null, groups);
  const expected = 2 * Math.PI * (70 * 70 - 30 * 30);
  assert.ok(Math.abs(area - expected) / expected < 0.005, `area ${area} expected ${expected}`);
});

test('triangulate keeps a square hole exact', () => {
  const outer = geometry.glyphContours(squarePath(0, 0, 100), 0.1);
  const hole = geometry.glyphContours(squarePath(0, 0, 50), 0.1);
  const tris = geometry.triangulate(geometry.groupContours([...outer, ...hole]));
  assert.equal(tris.needsStencil, false);
  const area = geometry.triangleAreaSum(tris);
  const expected = 200 * 200 - 100 * 100;
  assert.ok(Math.abs(area - expected) / expected < 0.005, `area ${area} expected ${expected}`);
});

test('sampleInterior stays inside the triangle and is deterministic', () => {
  const tris = geometry.triangulate([
    { outer: { points: Float32Array.from([0, 0, 100, 0, 0, 100]) }, holes: [] },
  ]);
  const random = rng.mulberry32(7);
  const points = geometry.sampleInterior(tris, 200, random);
  assert.equal(points.length, 400);
  for (let i = 0; i < points.length; i += 2) {
    const x = points[i];
    const y = points[i + 1];
    assert.ok(x >= -1e-4 && y >= -1e-4 && x + y <= 100 + 1e-3, `outside ${x},${y}`);
  }
  const again = geometry.sampleInterior(tris, 200, rng.mulberry32(7));
  assert.deepEqual([...points], [...again]);
});

test('sampleOutline spaces points along the outline', () => {
  const square = geometry.glyphContours(squarePath(0, 0, 50), 0.1);
  const points = geometry.sampleOutline(square, 8);
  assert.equal(points.length, 16);
  for (let i = 0; i < points.length; i += 2) {
    const x = Math.abs(points[i]);
    const y = Math.abs(points[i + 1]);
    const onEdge = Math.abs(x - 50) < 1e-3 || Math.abs(y - 50) < 1e-3;
    assert.ok(onEdge, `point not on the square: ${points[i]},${points[i + 1]}`);
  }
});

test('pieces duplicates vertices per triangle', () => {
  const outer = geometry.glyphContours(circlePath(0, 0, 80, 24), 0.5);
  const hole = geometry.glyphContours(circlePath(0, 0, 40, 16, false), 0.5);
  const tris = geometry.triangulate(geometry.groupContours([...outer, ...hole]));
  const split = geometry.pieces(tris);
  assert.equal(split.positions.length, tris.indices.length * 2);
  assert.equal(split.centroids.length, tris.indices.length * 2);
  assert.equal(split.triIds.length, tris.indices.length);
  assert.equal(split.areas.length, tris.indices.length);
  let area = 0;
  for (let i = 0; i < split.areas.length; i += 3) area += split.areas[i];
  const expected = Math.PI * (80 * 80 - 40 * 40);
  assert.ok(Math.abs(area - expected) / expected < 0.01, `area ${area}`);
});

test('strokeRibbon builds two offset vertices per outline point', () => {
  const square = geometry.glyphContours(squarePath(0, 0, 50), 0.1);
  const ribbon = geometry.strokeRibbon(square, 4);
  const count = square[0].points.length / 2;
  assert.equal(ribbon.positions.length / 4, (count + 1) * 2);
  assert.equal(ribbon.indices.length, count * 6);
  for (const value of ribbon.positions) assert.ok(Number.isFinite(value));
});

test('bounds and centroid work on a polygon', () => {
  const square = Float32Array.from([0, 0, 100, 0, 100, 80, 0, 80]);
  const box = geometry.bounds(square);
  assert.deepEqual(box, { x0: 0, y0: 0, x1: 100, y1: 80, width: 100, height: 80 });
  const center = geometry.centroid(square);
  assert.ok(Math.abs(center.x - 50) < 1e-4);
  assert.ok(Math.abs(center.y - 40) < 1e-4);
  assert.ok(Math.abs(center.area - 8000) < 1e-4);
});

test('the geometry cache is keyed by font, glyph and size bucket', () => {
  let built = 0;
  const first = geometry.cached(geometry.cacheKey('NotoSans-Regular', 36, 100), () => {
    built += 1;
    return { value: 'a' };
  });
  const second = geometry.cached(geometry.cacheKey('NotoSans-Regular', 36, 104), () => {
    built += 1;
    return { value: 'b' };
  });
  assert.equal(built, 1);
  assert.equal(first, second);
  geometry.clearCache();
  const third = geometry.cached(geometry.cacheKey('NotoSans-Regular', 36, 100), () => {
    built += 1;
    return { value: 'c' };
  });
  assert.equal(built, 2);
  assert.notEqual(first, third);
});
