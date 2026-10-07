'use strict';

// The shared clip placement (clip-placement.js): every visual filler layer,
// figure clip and background clip carries the same enabled / x / y / scale /
// scaleX / scaleY / rotation model.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const clipPlacement = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'clip-placement.js'));

globalThis.window = globalThis;
globalThis.SA = globalThis.SA || {};
globalThis.SA.clipPlacement = clipPlacement;
require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'engine.js'));

const engine = globalThis.SA.lyricsEngine;
const fillerRender = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'filler-render.js'));
const figures = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'figures.js'));
const fx = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects', 'registry.js'));
require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects', 'background.js'));

function bbox(shapes) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const shape of shapes) {
    const xs = [];
    const ys = [];
    if (Array.isArray(shape.points)) {
      for (const point of shape.points) {
        xs.push(point.x);
        ys.push(point.y);
      }
    }
    if (shape.kind === 'rect') {
      xs.push(shape.x, shape.x + shape.w);
      ys.push(shape.y, shape.y + shape.h);
    } else if (shape.kind === 'circle' || shape.kind === 'ring' || shape.kind === 'polygon') {
      const radius = shape.radius != null ? shape.radius : shape.r || 0;
      xs.push(shape.x - radius, shape.x + radius);
      ys.push(shape.y - radius, shape.y + radius);
    } else if (shape.kind === 'capsule') {
      xs.push(shape.x0, shape.x1);
      ys.push(shape.y0, shape.y1);
    }
    for (const x of xs) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
    }
    for (const y of ys) {
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
}

function meanX(shapes) {
  let sum = 0;
  let count = 0;
  for (const shape of shapes) {
    if (shape.kind === 'capsule') {
      sum += (shape.x0 + shape.x1) / 2;
      count += 1;
    }
  }
  return count ? sum / count : 0;
}

function waveformCtx() {
  return {
    time: 1.25,
    frame: { width: 1920, height: 1080 },
    clip: { key: 'wave', from: 0, to: 4 },
    analysis: null,
    color: '#4dc8ff',
  };
}

test('the placement model defaults to the identity', () => {
  assert.deepEqual(clipPlacement.fromParams({}), { enabled: true, x: 0, y: 0, scale: 1, scaleX: 1, scaleY: 1, rotation: 0 });
  assert.deepEqual(clipPlacement.fromSpec({}), { enabled: true, x: 0, y: 0, scale: 1, scaleX: 1, scaleY: 1, rotation: 0 });
  assert.deepEqual(clipPlacement.fromSpec(null), clipPlacement.fromParams({}));
  assert.equal(clipPlacement.isIdentity(clipPlacement.fromParams({})), true);
  assert.equal(clipPlacement.isIdentity({ x: 0.001 }), false);
  assert.equal(clipPlacement.isIdentity({ enabled: false }), true);
});

test('isEnabled sees the clip, the sidecar and the effect params', () => {
  assert.equal(clipPlacement.isEnabled(null), true);
  assert.equal(clipPlacement.isEnabled({}), true);
  assert.equal(clipPlacement.isEnabled({ type: 'waveform', params: { mode: 'line' } }), true);
  assert.equal(clipPlacement.isEnabled({ enabled: false }), false);
  assert.equal(clipPlacement.isEnabled({ disabled: true }), false);
  assert.equal(clipPlacement.isEnabled({ placement: { enabled: false } }), false);
  assert.equal(clipPlacement.isEnabled({ placement: { disabled: true } }), false);
  assert.equal(clipPlacement.isEnabled({ params: { enabled: false } }), false);
  assert.equal(clipPlacement.isEnabled({ params: { disabled: true } }), false);
  assert.equal(clipPlacement.isEnabled({ placement: { x: 0.1 } }), true);
});

test('toTransform maps frame fractions to pixels and degrees to radians', () => {
  const moved = clipPlacement.toTransform({ x: 0.25, y: -0.1, scale: 2, scaleX: 1, scaleY: 0.5, rotation: 90 }, { width: 1920, height: 1080 });
  assert.equal(moved.originX, 960);
  assert.equal(moved.originY, 540);
  assert.equal(moved.dx, 480);
  assert.equal(moved.dy, -108);
  assert.equal(moved.scale, 2);
  assert.equal(moved.scaleX, 1);
  assert.equal(moved.scaleY, 0.5);
  assert.ok(Math.abs(moved.rotate - Math.PI / 2) < 1e-12);
});

test('toCamera maps the placement onto the background-shader camera', () => {
  // the shader samples `uv + offset`, so a pattern moved right (+x) needs a
  // negative camera offset; +y already moves the pattern down; rotation
  // matches the CPU transform (clockwise-positive on screen)
  assert.deepEqual(clipPlacement.toCamera({ x: 0, y: 0, scale: 1, rotation: 0 }), [0, 0, 1, 0]);
  const camera = clipPlacement.toCamera({ x: 0.1, y: 0.2, scale: 1.5, rotation: 45 });
  assert.equal(camera[0], -0.1);
  assert.equal(camera[1], 0.2);
  assert.equal(camera[2], 1.5);
  assert.ok(Math.abs(camera[3] - Math.PI / 4) < 1e-12);
  assert.deepEqual(clipPlacement.toPlaceScale({ scaleX: 2, scaleY: 0.5 }), [2, 0.5]);
  assert.deepEqual(clipPlacement.toPlaceScale({}), [1, 1]);
});

test('every visual filler layer exposes the same placement keys', () => {
  const keys = (type) => fillerRender.paramsOf(type).map((param) => param.key);
  for (const type of ['waveform', 'spectrum', 'sineWave', 'shapes', 'particles']) {
    for (const key of ['enabled', 'x', 'y', 'scale', 'scaleX', 'scaleY', 'rotation']) {
      assert.ok(keys(type).includes(key), `${type} is missing ${key}`);
    }
  }
  // pattern / split already own `enabled`
  assert.deepEqual(keys('pattern').filter((key) => key === 'enabled').length, 1);
  assert.deepEqual(keys('split').filter((key) => key === 'enabled').length, 1);
  for (const key of ['x', 'y', 'scale', 'scaleX', 'scaleY', 'rotation']) {
    assert.ok(keys('pattern').includes(key), `pattern is missing ${key}`);
    assert.ok(keys('split').includes(key), `split is missing ${key}`);
  }
  // figures keeps its legacy keys and gains the missing ones
  for (const key of ['enabled', 'scale', 'x', 'y', 'scaleX', 'scaleY', 'rotation']) {
    assert.ok(keys('figures').includes(key), `figures is missing ${key}`);
  }
  // text layers only gain the on/off toggle (their own params own the layout)
  for (const type of ['countdown', 'progress', 'textAnim']) {
    assert.ok(keys(type).includes('enabled'), `${type} is missing enabled`);
    assert.ok(!keys(type).includes('rotation'), `${type} must not gain rotation`);
  }
});

test('placement defaults render exactly like the old presets', () => {
  const bare = { mode: 'line', thickness: 2.5, amp: 1, color: '#4dc8ff' };
  const plain = fillerRender.drawList({ type: 'waveform', params: bare }, waveformCtx());
  const placed = fillerRender.drawList({ type: 'waveform', params: { ...bare, ...fillerRender.paramDefaults('waveform') } }, waveformCtx());
  assert.ok(plain.shapes.length > 0);
  assert.deepEqual(placed.shapes, plain.shapes);
});

test('waveform answers enabled, position, zoom and tilt', () => {
  const base = { mode: 'line', thickness: 2.5, amp: 1, color: '#4dc8ff' };
  const plain = fillerRender.drawList({ type: 'waveform', params: base }, waveformCtx());
  assert.ok(plain.shapes.length > 0);

  const off = fillerRender.drawList({ type: 'waveform', params: { ...base, enabled: false } }, waveformCtx());
  assert.deepEqual(off, { shapes: [], texts: [] });

  const moved = fillerRender.drawList({ type: 'waveform', params: { ...base, x: 0.1 } }, waveformCtx());
  assert.ok(Math.abs(meanX(moved.shapes) - meanX(plain.shapes) - 192) < 1);

  const zoomed = fillerRender.drawList({ type: 'waveform', params: { ...base, scale: 2 } }, waveformCtx());
  assert.ok(bbox(zoomed.shapes).width > bbox(plain.shapes).width * 1.9);

  const tilted = fillerRender.drawList({ type: 'waveform', params: { ...base, rotation: 90 } }, waveformCtx());
  const flat = bbox(plain.shapes);
  const stood = bbox(tilted.shapes);
  assert.ok(flat.width > 1500 && flat.height < 400, `flat ${flat.width}x${flat.height}`);
  assert.ok(stood.width < 500 && stood.height > 1200, `tilted ${stood.width}x${stood.height}`);

  const stretched = fillerRender.drawList({ type: 'waveform', params: { ...base, scaleX: 2, scaleY: 0.5 } }, waveformCtx());
  const box = bbox(stretched.shapes);
  assert.ok(box.width > flat.width * 1.9);
  assert.ok(box.height < flat.height * 0.6);
});

test('combo parts place themselves independently', () => {
  const base = { mode: 'line', thickness: 2.5, amp: 1, color: '#4dc8ff' };
  const combo = fillerRender.drawList({
    type: 'combo',
    params: {
      list: [
        { type: 'waveform', params: { ...base, x: -0.2 } },
        { type: 'waveform', params: { ...base, x: 0.2, enabled: true } },
      ],
    },
  }, waveformCtx());
  assert.ok(combo.shapes.length > 0);
  const left = meanX(combo.shapes.slice(0, combo.shapes.length / 2));
  const right = meanX(combo.shapes.slice(combo.shapes.length / 2));
  assert.ok(right - left > 700, `parts did not separate: ${left} vs ${right}`);

  const muted = fillerRender.drawList({
    type: 'combo',
    params: {
      list: [
        { type: 'waveform', params: { ...base, enabled: false } },
        { type: 'waveform', params: { ...base, x: 0.2 } },
      ],
    },
  }, waveformCtx());
  assert.ok(muted.shapes.length > 0);
  assert.ok(meanX(muted.shapes) > 960);
});

test('transformShapes stretches non-uniformly and tilts', () => {
  const rect = [{ kind: 'rect', x: 860, y: 490, w: 200, h: 100, color: '#fff', opacity: 1 }];
  figures.transformShapes(rect, { originX: 960, originY: 540, scale: 1, scaleX: 2, scaleY: 0.5, dx: 0, dy: 0, rotate: 0 });
  assert.equal(rect[0].w, 400);
  assert.equal(rect[0].h, 50);

  const bar = [{ kind: 'rect', x: 460, y: 530, w: 1000, h: 20, color: '#fff', opacity: 1 }];
  figures.transformShapes(bar, { originX: 960, originY: 540, scale: 1, dx: 0, dy: 0, rotate: Math.PI / 2 });
  const box = bbox(bar);
  assert.ok(box.width < 60 && box.height > 900, `tilted bar ${box.width}x${box.height}`);

  // uniform callers (the clip pulse / drift) behave exactly as before
  const dot = [{ kind: 'circle', x: 1060, y: 540, r: 10, color: '#fff', opacity: 1 }];
  figures.transformShapes(dot, { originX: 960, originY: 540, scale: 2, dx: 0, dy: 0, rotate: 0 });
  assert.equal(dot[0].x, 1160);
  assert.equal(dot[0].r, 20);
});

test('figure clips tilt through the shared placement', () => {
  const spec = figures.generate({ span: { start: 0, end: 4 }, motif: 'orbit', seed: 42, id: 'tilt-fig' });
  const ctx = {
    time: 2,
    frame: { width: 1920, height: 1080 },
    clip: { key: 'tilt-fig', start: 0, end: 4 },
    seed: 42,
    colors: ['#ffffff'],
    beats: [{ start: 0, end: 4 }],
  };
  const plain = figures.drawList(spec, ctx);
  assert.ok(plain.shapes.length > 0);
  const tilted = figures.drawList({ type: 'figure', params: { ...spec.params, rotation: 90 } }, ctx);
  assert.ok(tilted.shapes.length > 0);
  assert.notDeepEqual(bbox(tilted.shapes), bbox(plain.shapes));
  const shifted = figures.drawList({ type: 'figure', params: { ...spec.params, x: 0.1, y: 0.1 } }, ctx);
  assert.ok(shifted.shapes.length > 0);
});

test('background uniforms carry the placement without changing defaults', () => {
  const plain = fx.backgroundUniforms({ type: 'gradient', params: {} }, { time: 1, theme: null });
  assert.deepEqual(Array.from(plain.u_camera), [0, 0, 1, 0]);
  assert.deepEqual(Array.from(plain.u_place), [1, 1]);

  const placed = fx.backgroundUniforms(
    { type: 'gradient', params: {} },
    { time: 1, theme: null, camera: [-0.1, 0.2, 1.5, Math.PI / 4], placeScale: [2, 0.5] }
  );
  assert.deepEqual(Array.from(placed.u_camera), [-0.1, 0.2, 1.5, Math.PI / 4]);
  assert.deepEqual(Array.from(placed.u_place), [2, 0.5]);
});

test('isClipDisabled honours the placement sidecar', () => {
  assert.equal(engine.isClipDisabled({ spec: { type: 'gradient', params: {}, placement: { enabled: false } } }), true);
  assert.equal(engine.isClipDisabled({ spec: { type: 'gradient', params: {}, placement: { disabled: true } } }), true);
  assert.equal(engine.isClipDisabled({ spec: { type: 'gradient', params: {}, placement: { x: 0.1 } } }), false);
  assert.equal(engine.isClipDisabled({ spec: { type: 'gradient', params: {} } }), false);
});

test('figure sub-beats mute individually', () => {
  const spec = figures.generate({ span: { start: 0, end: 4 }, motif: 'orbit', seed: 7, id: 'mute-fig' });
  const beats = spec.params.beats;
  assert.ok(beats.length > 0);
  const ctxFor = (t) => ({
    time: t,
    frame: { width: 1920, height: 1080 },
    clip: { key: 'mute-fig', start: 0, end: 4 },
    seed: 7,
    colors: ['#ffffff'],
    beats: [{ start: 0, end: 4 }],
  });
  const first = beats[0];
  const at = (first.start + first.end) / 2;
  const plain = figures.drawList(spec, ctxFor(at));
  assert.ok(plain.shapes.length > 0, 'the sub-beat draws while enabled');
  const mutedBeats = beats.map((beat, index) => (index === 0 ? { ...beat, disabled: true } : beat));
  const muted = figures.drawList({ type: 'figure', params: { ...spec.params, beats: mutedBeats } }, ctxFor(at));
  assert.deepEqual(muted, { shapes: [], texts: [] });
  const switchedOff = figures.drawList({ type: 'figure', params: { ...spec.params, beats: beats.map((beat, index) => (index === 0 ? { ...beat, enabled: false } : beat)) } }, ctxFor(at));
  assert.deepEqual(switchedOff, { shapes: [], texts: [] });
});

test('filler segments mute spans like backdrop segments', () => {
  const clip = {
    id: 'fil',
    trackId: 'filler',
    start: 0,
    end: 8,
    spec: { type: 'waveform', params: { mode: 'line' } },
    segments: [{ start: 0, end: 4, disabled: true }, { start: 4, end: 8 }],
  };
  assert.equal(engine.segmentDisabledAt(clip, 2), true);
  assert.equal(engine.segmentDisabledAt(clip, 6), false);
  assert.equal(engine.segmentClipAt(clip, 6).spec.type, 'waveform');
  const over = { ...clip, segments: [{ start: 0, end: 4, disabled: true }, { start: 4, end: 8, spec: { type: 'spectrum', params: {} } }] };
  assert.equal(engine.segmentClipAt(over, 6).spec.type, 'spectrum');
  assert.equal(engine.segmentDisabledAt({ spec: { type: 'waveform', params: {} } }, 2), false);
});
