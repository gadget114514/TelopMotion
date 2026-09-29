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

// --- clip animation modes (filler-render.animate) ----------------------------

function animated(motion, time, extra) {
  const list = { shapes: [{ kind: 'rect', x: 100, y: 100, w: 200, h: 100 }], texts: [] };
  fillerRender.animate(list, {
    motion,
    t: time,
    clip: { start: 0, end: 8 },
    bpm: 120,
    frame: FRAME,
    ...(extra || {}),
  });
  return list.shapes[0];
}

test('an exit / enter cut keeps the clip fully on, scale collapses instead', () => {
  const stepped = animated({ transition: 'scale', pulse: 0 }, 0);
  assert.ok(stepped.w < 1, `scale transition at the clip start shrinks (${stepped.w})`);
  const cut = animated({ transition: 'cut', pulse: 0 }, 0);
  assert.equal(cut.w, 200, 'a cut has no enter transition');
  const cutEnd = animated({ transition: 'cut', pulse: 0 }, 8);
  assert.equal(cutEnd.w, 200, 'a cut has no exit transition');
});

test('mode none is the legacy per-beat pulse', () => {
  const legacy = animated({ pulse: 0.1 }, 1.125);
  const pulse = animated({ mode: 'pulse', pulse: 0.1 }, 1.125);
  assert.deepEqual(legacy, pulse);
  const opposite = animated({ pulse: 0.1 }, 1.375);
  assert.ok(legacy.w > opposite.w, 'the sine breathes with the beat');
});

test('accent hits on the downbeat and decays', () => {
  const motion = { mode: 'accent', pulse: 0.1, every: 2, transition: 'cut' };
  const hit = animated(motion, 0.01);
  const tail = animated(motion, 0.9);
  assert.ok(hit.w > 200, `the downbeat swells (${hit.w})`);
  assert.ok(tail.w < hit.w - 1, `the accent decays (${tail.w} vs ${hit.w})`);
  assert.ok(Math.abs(tail.w - 200) < 2, 'after the decay the clip sits at its base size');
});

test('swell breathes over several beats instead of every beat', () => {
  const motion = { mode: 'swell', pulse: 0.1, every: 4, transition: 'cut' };
  const base = animated(motion, 0);
  const middle = animated(motion, 1);
  const full = animated(motion, 2);
  assert.ok(middle.w > base.w, `half way through the period (${middle.w} vs ${base.w})`);
  assert.ok(Math.abs(full.w - base.w) < 0.5, 'the period closes');
});

test('sway rocks the clip, drift and still cover the frame', () => {
  const sway = { mode: 'sway', sway: 0.05, pulse: 0, every: 4, transition: 'cut' };
  const level = animated(sway, 0);
  const rocked = animated(sway, 0.5);
  assert.notDeepEqual(rocked, level, 'sway rotates the clip');
  for (const mode of ['drift', 'still']) {
    const shape = animated({ mode, drift: 0.02, pulse: 0, transition: 'cut' }, 0.4);
    assert.ok(shape.w > 200, `${mode} scales past the frame (${shape.w})`);
  }
});

test('breathe honours the every period', () => {
  const params = { layout: 'halves', coverage: 0.5, colors: COLORS, motion: 'breathe', amp: 0.2 };
  const flat = split.regions({ ...params, motion: 'none' }, ctx({ time: 1, beatPhase: 0.5 })).map((region) => region.points);
  const same = split.regions(params, ctx({ time: 1, beatPhase: 0.5 })).map((region) => region.points);
  assert.deepEqual(same, flat, 'every 1 breathes to zero at half a beat');
  const slower = split.regions({ ...params, every: 2 }, ctx({ time: 1, beatPhase: 0.5 })).map((region) => region.points);
  assert.notDeepEqual(slower, flat, 'every 2 is half way through its period');
});

// --- text kicks (filler-render.animate sync + kicks) -------------------------

test('a text kick swells the clip at the kick and decays after it', () => {
  const motion = { mode: 'still', drift: 0.02, transition: 'cut', duration: 0.35, sync: 0.15 };
  const hit = animated(motion, 2, { kicks: [2] });
  const tail = animated(motion, 2.4, { kicks: [2] });
  assert.ok(hit.w > 200, `the kick swells (${hit.w})`);
  assert.ok(tail.w < hit.w, `the kick decays (${tail.w} vs ${hit.w})`);
  assert.deepEqual(animated(motion, 2, { kicks: [2] }), hit, 'deterministic for one kick');
  // a kick in the future does not fire early
  const before = animated(motion, 1.5, { kicks: [2] });
  const quiet = animated({ ...motion, sync: 0 }, 1.5, { kicks: [2] });
  assert.deepEqual(before, quiet);
});

test('a clip without motion.sync ignores its kicks (saved clips unchanged)', () => {
  const motion = { mode: 'still', drift: 0.02, transition: 'cut', duration: 0.35 };
  const withKicks = animated(motion, 2, { kicks: [2] });
  const without = animated(motion, 2);
  assert.deepEqual(withKicks, without);
  assert.equal(motion.sync, undefined);
});

test('a kick rotates the planes apart in opposite directions', () => {
  const plane = (x) => ({
    kind: 'convex',
    points: [{ x, y: 0 }, { x: x + 100, y: 0 }, { x: x + 100, y: 100 }, { x, y: 100 }],
    color: '#ffffff',
  });
  const list = { shapes: [plane(100), plane(300)], texts: [] };
  fillerRender.animate(list, {
    motion: { mode: 'still', pulse: 0, drift: 0, transition: 'cut', duration: 0.35, sync: 0.15 },
    t: 2,
    clip: { start: 0, end: 8 },
    bpm: 120,
    frame: FRAME,
    kicks: [2],
  });
  const edgeAngle = (shape) => Math.atan2(shape.points[1].y - shape.points[0].y, shape.points[1].x - shape.points[0].x);
  assert.ok(edgeAngle(list.shapes[0]) > 0.05, `the first plane leans one way (${edgeAngle(list.shapes[0])})`);
  assert.ok(edgeAngle(list.shapes[1]) < -0.05, `the next plane leans the other way (${edgeAngle(list.shapes[1])})`);
});
