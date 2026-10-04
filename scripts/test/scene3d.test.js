'use strict';

// Pseudo-3D figure scenes: a camera, a projection and a few integrated physical
// systems that all end up as plain 2D shapes.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const scene3d = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'scene3d.js'));
const figures = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'figures.js'));

const FRAME = { width: 1920, height: 1080, cx: 960, cy: 540, short: 1080 };
const COLORS = ['#ff4d6d', '#ffd166', '#06d6a0', '#118ab2', '#c77dff'];
const KINDS = new Set(['circle', 'ring', 'capsule']);

function render(name, seed, rand, t) {
  return scene3d.render(name, { seed, rand, t, frame: FRAME, grow: 1, opacity: 1, color: (i) => COLORS[Math.abs(Math.round(i)) % COLORS.length], variant: 0 });
}

test('every scene is deterministic, finite and inside the shape budget', () => {
  for (const name of scene3d.SCENES) {
    for (const rand of [0, 0.5, 1]) {
      for (let seed = 1; seed <= 12; seed += 1) {
        for (const t of [0, 1.7, 6.3]) {
          const a = render(name, seed, rand, t);
          const b = render(name, seed, rand, t);
          assert.deepEqual(a, b, `${name} seed ${seed} not deterministic`);
          assert.ok(a.length > 0 && a.length <= scene3d.SHAPE_CAP, `${name} seed ${seed} draws ${a.length} shapes`);
          for (const shape of a) {
            assert.ok(KINDS.has(shape.kind), `${name} draws a ${shape.kind}`);
            for (const key of ['x', 'y', 'r', 'x0', 'y0', 'x1', 'y1', 'width', 'thickness', 'opacity']) {
              if (shape[key] != null) assert.ok(Number.isFinite(shape[key]), `${name} ${key} at ${t}`);
            }
          }
        }
      }
    }
  }
});

test('integrated scenes read the same at a time however it is reached (seek independence)', () => {
  for (const name of ['nbody', 'pendulum', 'attractor']) {
    scene3d.clearCache();
    const direct = render(name, 5, 1, 9.4);
    scene3d.clearCache();
    for (const t of [30, 2, 17.5, 0.1]) render(name, 5, 1, t);
    assert.deepEqual(render(name, 5, 1, 9.4), direct, `${name} depends on the order of the times asked`);
  }
});

test('the figure-eight three-body orbit returns to its start after one period', () => {
  const tr = scene3d.nbodyTrajectory(1, 'eight', 3, 0);
  const at = (t) => scene3d.sampleAt(tr.samples, tr.frames, t, tr.N * 3);
  const period = 6.3259;
  // the trajectory is stored scaled to fit the view, so compare the shape of the
  // orbit with itself one period later
  const a = at(1.2);
  const b = at(1.2 + period);
  let worst = 0;
  for (let i = 0; i < a.length; i += 1) worst = Math.max(worst, Math.abs(a[i] - b[i]));
  // the softened force shifts the period a little
  assert.ok(worst < 0.15, `the orbit drifts by ${worst} per period`);
});

test('a single pendulum keeps its energy', () => {
  const lens = [1];
  const masses = [1];
  const tr = scene3d.pendulumTrajectory(1, 1, lens, masses, [1.2], 0);
  const G = 9.81;
  const energy = (f) => {
    const th = tr.samples[f];
    const next = tr.samples[Math.min(tr.frames - 1, f + 1)];
    const prev = tr.samples[Math.max(0, f - 1)];
    const omega = (next - prev) / (2 / 60);
    return 0.5 * omega * omega - G * Math.cos(th);
  };
  const first = energy(60);
  for (const f of [300, 900, 1500]) assert.ok(Math.abs(energy(f) - first) < 0.15, `energy ${energy(f)} vs ${first}`);
});

test('the camera projects the origin to the frame centre and nearer points larger', () => {
  const T = scene3d.tools(3, 'cam', 0);
  const g = scene3d.cameraGenome(T);
  assert.equal(g.kind, 'static');
  const cam = scene3d.cameraAt(g, 0, FRAME);
  const o = cam.project([0, 0, 0]);
  assert.ok(Math.abs(o.x - FRAME.cx) < 1e-6 && Math.abs(o.y - FRAME.cy) < 1e-6, `origin at ${o.x},${o.y}`);
  // a point moved toward the camera has a larger scale than the origin
  const pos = [Math.cos(g.az0) * Math.cos(g.elev0), Math.sin(g.elev0), Math.sin(g.az0) * Math.cos(g.elev0)];
  const near = cam.project(pos.map((c) => c * 0.5));
  assert.ok(near.s > o.s, 'a nearer point is not larger');
  assert.ok(near.z < o.z);
  // a static camera does not move
  assert.deepEqual(cam.project([0.3, 0.2, 0.1]), scene3d.cameraAt(g, 5, FRAME).project([0.3, 0.2, 0.1]));
});

test('scene motifs plug into the figure pipeline with a seed and a randomness level', () => {
  assert.equal(figures.SCENE_MOTIFS.length, scene3d.SCENES.length);
  const beats = [{ start: 2, end: 8 }, { start: 8, end: 14 }];
  for (const motif of figures.SCENE_MOTIFS) {
    const spec = figures.generate({ span: { start: 2, end: 14 }, beats, motif, seed: 11, id: `scene_${motif}`, axes: { weird: 1, energy: 0.5 } });
    assert.equal(spec.params.motif, motif);
    assert.ok(Number.isFinite(Number(spec.params.seed)));
    assert.equal(spec.params.rand, 1);
    let drawn = 0;
    for (const time of [3, 6, 9.5, 12.5]) {
      const list = figures.drawList(spec, { time, frame: { width: 1920, height: 1080 }, clip: { key: 'c', start: 2, end: 14 }, seed: 7, colors: COLORS, beats });
      drawn = Math.max(drawn, list.shapes.length);
      assert.ok(list.shapes.length <= 480, `${motif} draws ${list.shapes.length}`);
    }
    assert.ok(drawn > 0, `${motif} draws nothing`);
  }
});

test('the scenes keep clear of the text box', () => {
  const textBox = { x0: 520, y0: 440, x1: 1400, y1: 640 };
  const beats = [{ start: 2, end: 14 }];
  for (const motif of figures.SCENE_MOTIFS) {
    const spec = figures.generate({ span: { start: 2, end: 14 }, beats, motif, seed: 21, id: `clear_${motif}`, axes: { weird: 1, energy: 0.5 } });
    for (const time of [4, 8, 12]) {
      const list = figures.drawList(spec, { time, frame: { width: 1920, height: 1080 }, clip: { key: 'c', start: 2, end: 14 }, seed: 7, colors: COLORS, beats, textBox });
      for (const shape of list.shapes) {
        const x0 = Math.min(shape.x0 ?? shape.x - (shape.r || 0), shape.x1 ?? shape.x);
        const x1 = Math.max(shape.x0 ?? shape.x + (shape.r || 0), shape.x1 ?? shape.x);
        const y0 = Math.min(shape.y0 ?? shape.y - (shape.r || 0), shape.y1 ?? shape.y);
        const y1 = Math.max(shape.y0 ?? shape.y + (shape.r || 0), shape.y1 ?? shape.y);
        const inside = x1 > textBox.x0 && x0 < textBox.x1 && y1 > textBox.y0 && y0 < textBox.y1;
        assert.ok(!inside, `${motif} reaches the text box at ${time}`);
      }
    }
  }
});

test('the 2D camera moves a figure and never at randomness 0', () => {
  const beats = [{ start: 2, end: 14 }];
  const base = figures.generate({ span: { start: 2, end: 14 }, beats, motif: 'orbit', seed: 4, id: 'cam', axes: { weird: 0, energy: 0.5 } });
  assert.equal(base.params.camera, undefined);
  let cameras = 0;
  for (let seed = 1; seed <= 200; seed += 1) {
    const spec = figures.generate({ span: { start: 2, end: 14 }, beats, seed, id: `cam_${seed}`, axes: { weird: 1, energy: 0.5 } });
    if (spec.params.camera) cameras += 1;
  }
  assert.ok(cameras > 60 && cameras < 160, `${cameras}/200 clips carry a camera`);
  const still = figures.generate({ span: { start: 2, end: 14 }, beats, motif: 'orbit', seed: 4, id: 'cam', axes: { weird: 1, energy: 0.5 }, camera: 'none' });
  const pushed = JSON.parse(JSON.stringify(still));
  pushed.params.camera = 'push';
  const c = (time) => ({ time, frame: { width: 1920, height: 1080 }, clip: { key: 'c', start: 2, end: 14 }, seed: 7, colors: COLORS, beats });
  const early = figures.drawList(pushed, c(3)).shapes;
  const late = figures.drawList(pushed, c(13)).shapes;
  assert.ok(early.length > 0 && late.length > 0);
  const flat = figures.drawList(still, c(13)).shapes;
  assert.notDeepEqual(late, flat);
});
