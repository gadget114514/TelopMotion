'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const layout = require('../../renderer/js/lyrics/layout.js');
const rng = require('../../renderer/js/lyrics/rng.js');

const FRAME = { width: 1920, height: 1080 };
const SHORT = 1080;

function lettersFrom(text, size = 96) {
  const letters = [];
  let pen = 0;
  for (let i = 0; i < text.length; i += 1) {
    const w = /[\u3000-\u9fff\uff00-\uffef]/.test(text[i]) ? size : size * 0.55;
    letters.push({
      char: text[i],
      lineIdx: 0,
      wordIdx: text[i] === ' ' ? 0 : i,
      advance: w,
      local: { x: pen, w, h: size, cx: pen + w / 2, cy: size * 0.7 },
    });
    pen += w;
  }
  const blockBBox = { x1: 0, y1: 0, x2: pen, y2: size };
  return { letters, blockBBox };
}

function assertFinite(points) {
  for (const point of points) {
    assert.ok(Number.isFinite(point.x), `x is ${point.x}`);
    assert.ok(Number.isFinite(point.y), `y is ${point.y}`);
    assert.ok(Number.isFinite(point.rot), `rot is ${point.rot}`);
    assert.ok(Number.isFinite(point.scale), `scale is ${point.scale}`);
  }
}

test('row formation is centred on the block', () => {
  const { letters, blockBBox } = lettersFrom('ABCDE');
  const points = layout.formation('row', {}, letters, blockBBox, FRAME, rng.mulberry32(1));
  assert.equal(points.length, letters.length);
  assertFinite(points);
  const centerX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  assert.ok(Math.abs(centerX) < 1, `not centred: ${centerX}`);
});

test('circle formation keeps every letter at the radius', () => {
  const { letters, blockBBox } = lettersFrom('ABCDEFGH');
  const radius = 0.28;
  const points = layout.formation('circle', { radius }, letters, blockBBox, FRAME, rng.mulberry32(2));
  assertFinite(points);
  for (const point of points) {
    const distance = Math.hypot(point.x, point.y);
    assert.ok(Math.abs(distance - radius * SHORT) < 0.5, `distance ${distance}`);
  }
  const first = points[0];
  const theta = (Math.atan2(first.y, first.x) * 180) / Math.PI;
  assert.ok(Math.abs(first.rot - (theta + 90)) < 1e-6, `first rot ${first.rot} theta ${theta}`);
});

test('vertical formation fills columns top to bottom and right to left', () => {
  const { letters, blockBBox } = lettersFrom('あいうえおかきくけこ');
  const points = layout.formation('vertical', { columnGap: 1.2 }, letters, blockBBox, FRAME, rng.mulberry32(3));
  assertFinite(points);
  const perColumn = Math.floor((FRAME.height * 0.84) / (96 * 1.15));
  assert.ok(perColumn >= 2, `perColumn ${perColumn}`);
  for (let i = 1; i < points.length; i += 1) {
    const sameColumn = Math.floor(i / perColumn) === Math.floor((i - 1) / perColumn);
    if (sameColumn) {
      assert.ok(points[i].y > points[i - 1].y, 'letters go top to bottom');
      assert.equal(points[i].x, points[i - 1].x);
    } else {
      assert.ok(points[i].x < points[i - 1].x, 'columns go right to left');
    }
  }
});

test('wave formation follows the sine and the tangent', () => {
  const { letters, blockBBox } = lettersFrom('ABCDEFGH');
  const points = layout.formation('wave', { amp: 0.1, wavelength: 0.5 }, letters, blockBBox, FRAME, rng.mulberry32(4));
  assertFinite(points);
  const row = layout.formation('row', {}, letters, blockBBox, FRAME, rng.mulberry32(4));
  const amp = 0.1 * SHORT;
  for (let i = 0; i < points.length; i += 1) {
    assert.ok(Math.abs(points[i].y - row[i].y) <= amp + 1, `y ${points[i].y}`);
  }
  const hasTilt = points.some((point) => Math.abs(point.rot) > 1);
  assert.ok(hasTilt, 'wave letters follow the tangent');
});

test('scatter keeps letters inside the safe area and apart', () => {
  const { letters, blockBBox } = lettersFrom('ABCDEFGH');
  const points = layout.formation('scatter', { spread: 1, safeArea: 0.1 }, letters, blockBBox, FRAME, rng.mulberry32(5));
  assertFinite(points);
  for (const point of points) {
    assert.ok(Math.abs(point.x) <= FRAME.width * 0.5, `x ${point.x}`);
    assert.ok(Math.abs(point.y) <= FRAME.height * 0.5, `y ${point.y}`);
  }
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const distance = Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y);
      assert.ok(distance >= 96 * 0.8 - 1e-6, `distance ${distance}`);
    }
  }
});

test('path formation follows a straight path with a matching tangent', () => {
  const { letters, blockBBox } = lettersFrom('ABCDE');
  const points = layout.formation('path', { points: [{ x: 0.1, y: 0.5 }, { x: 0.9, y: 0.5 }], smooth: false }, letters, blockBBox, FRAME, rng.mulberry32(6));
  assertFinite(points);
  for (const point of points) {
    assert.ok(Math.abs(point.y) < 1, `y ${point.y}`);
    assert.ok(Math.abs(point.rot) < 1e-6, `rot ${point.rot}`);
  }
  assert.ok(points[0].x < points[points.length - 1].x, 'letters are ordered along the path');
});

test('startFormation point puts every letter at the same point', () => {
  const targets = [{ x: 100, y: 50 }, { x: 200, y: 80 }];
  const points = layout.startFormation('point', { x: 0.5, y: 0.5, spread: 0 }, targets, FRAME, rng.mulberry32(7));
  assertFinite(points);
  assert.equal(points[0].x, 0);
  assert.equal(points[0].y, 0);
  assert.equal(points[1].x, 0);
});

test('startFormation ring and mirror follow the targets', () => {
  const targets = [{ x: 100, y: 0 }];
  const ring = layout.startFormation('ring', {}, targets, FRAME, rng.mulberry32(8));
  assertFinite(ring);
  assert.ok(Math.abs(ring[0].x - (100 - 0.7 * SHORT)) < 1e-6, `ring x ${ring[0].x}`);
  const mirror = layout.startFormation('mirror', {}, targets, FRAME, rng.mulberry32(9));
  assert.equal(mirror[0].x, -100);
  assert.equal(mirror[0].y, 0);
});

test('formation start positions can come from another formation', () => {
  const { letters, blockBBox } = lettersFrom('ABCDE');
  const circle = layout.formation('circle', { radius: 0.3 }, letters, blockBBox, FRAME, rng.mulberry32(10));
  assertFinite(circle);
  const radius = Math.hypot(circle[0].x, circle[0].y);
  assert.ok(Math.abs(radius - 0.3 * SHORT) < 0.5);
});

test('bezier blending curves to the requested side', () => {
  const start = { x: 0, y: 0 };
  const end = { x: 100, y: 0 };
  const straight = layout.bezierPoint(start, end, 0.5, 0, 1);
  assert.ok(Math.abs(straight.x - 50) < 1e-6 && Math.abs(straight.y) < 1e-6);
  const left = layout.bezierPoint(start, end, 0.5, 0.5, layout.curveSign('left'));
  const right = layout.bezierPoint(start, end, 0.5, 0.5, layout.curveSign('right'));
  assert.ok(left.y < 0 && right.y > 0, 'left and right curve directions differ');
  assert.ok(Math.abs(left.y + right.y) < 1e-6);
  const mid = layout.bezierPoint(start, end, 0.5, 1, 1);
  assert.ok(Math.abs(mid.x - 50) < 1e-6);
  assert.ok(Math.abs(mid.y - 50) < 1e-6);
});

test('every formation returns finite values for every letter count', () => {
  for (const type of layout.FORMATION_TYPES) {
    for (const text of ['A', 'ABCD', 'あいうえお']) {
      const { letters, blockBBox } = lettersFrom(text);
      const points = layout.formation(type, {}, letters, blockBBox, FRAME, rng.mulberry32(11));
      assert.equal(points.length, letters.length, `${type} on ${text}`);
      assertFinite(points);
    }
  }
});

test('every start formation returns finite values', () => {
  const targets = [{ x: 10, y: -20 }, { x: 120, y: 30 }];
  for (const type of layout.START_TYPES.filter((entry) => entry !== 'previousCue')) {
    const points = layout.startFormation(type, {}, targets, FRAME, rng.mulberry32(12));
    assert.equal(points.length, targets.length, type);
    assertFinite(points);
  }
});
