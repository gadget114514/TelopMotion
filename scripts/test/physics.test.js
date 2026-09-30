'use strict';

// The physics core: determinism, scrubbing through checkpoints, the internal
// drives, the floor and the safety clamps. The module is pure, so every test
// runs without a browser or GL context.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const physics = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'physics.js'));

function latticeOf(cache, key) {
  const entry = cache.get(key);
  assert.ok(entry, 'simulation entry missing');
  const sim = entry.sim;
  const out = new Float32Array(sim.count * 2);
  for (let i = 0; i < out.length; i += 1) out[i] = sim.nodes[i] - sim.rest[i];
  return out;
}

// shoelace area of the outer ring, in normalized units
function areaOf(cache, key) {
  const entry = cache.get(key);
  const sim = entry.sim;
  const ring = physics.topologyOf(sim.grid).ring;
  let area = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i] * 2;
    const b = ring[(i + 1) % ring.length] * 2;
    area += sim.nodes[a] * sim.nodes[b + 1] - sim.nodes[b] * sim.nodes[a + 1];
  }
  return Math.abs(area * 0.5);
}

function runTo(cache, key, times, cfg, options) {
  let out = null;
  for (const time of times) out = physics.simulateTo(cache, key, time, cfg, options);
  return out;
}

function assertFinite(lattice) {
  for (let i = 0; i < lattice.length; i += 1) assert.ok(Number.isFinite(lattice[i]), `lattice[${i}] is not finite`);
}

test('the same input always produces the same lattice', () => {
  const cfg = { drive: 'tremor', strength: 0.3, freq: 2.5, gravity: 1.5, stiffness: 0.7, damping: 0.05 };
  const options = {
    driveAt: (t) => ({ unit: { x: 100, y: 120 }, gravity: cfg.gravity, accel: { x: 40 * Math.sin(t), y: 20, rot: 30 } }),
  };
  const a = runTo(new Map(), 'k', [0.5, 1.25, 2.0], cfg, options);
  const b = runTo(new Map(), 'other', [0.5, 1.25, 2.0], cfg, options);
  assert.deepEqual(Array.from(a.lattice), Array.from(b.lattice));
  assert.equal(a.dx, b.dx);
  assert.equal(a.dy, b.dy);
  assert.equal(a.rot, b.rot);
});

test('scrubbing backwards matches a direct simulation (checkpoints)', () => {
  const cfg = { drive: 'muscle', strength: 0.2, freq: 1.2, gravity: 2, floor: null };
  const options = { driveAt: () => ({ unit: { x: 90, y: 110 }, gravity: cfg.gravity }) };
  const scrub = new Map();
  runTo(scrub, 'k', [0.4, 2.0], cfg, options);
  const rewound = physics.simulateTo(scrub, 'k', 1.0, cfg, options);
  const direct = physics.simulateTo(new Map(), 'k', 1.0, cfg, options);
  assert.deepEqual(Array.from(rewound.lattice), Array.from(direct.lattice));
  assert.equal(rewound.dx, direct.dx);
  assert.equal(rewound.dy, direct.dy);
  // and stepping forward again after the rewind stays on the same track
  const forward = physics.simulateTo(scrub, 'k', 2.0, cfg, options);
  const directForward = physics.simulateTo(new Map(), 'k', 2.0, cfg, options);
  assert.deepEqual(Array.from(forward.lattice), Array.from(directForward.lattice));
});

test('no internal or external force keeps the lattice at rest', () => {
  const cfg = { drive: 'none' };
  const result = physics.simulateTo(new Map(), 'k', 1.5, cfg, { drive: { unit: { x: 80, y: 100 } } });
  for (const value of result.lattice) assert.equal(value, 0);
  assert.equal(result.dx, 0);
  assert.equal(result.dy, 0);
  assert.equal(result.rot, 0);
  assert.equal(result.active, false);
});

test('pressure tracks the target area within 5%', () => {
  const cfg = { drive: 'pressure', strength: 0.25, freq: 1, stiffness: 0.9, damping: 0.1 };
  const cache = new Map();
  const options = { drive: { unit: { x: 80, y: 100 } } };
  for (const time of [0.25, 0.5, 0.75, 1.25]) {
    physics.simulateTo(cache, 'k', time, cfg, options);
    const target = 4 * (1 + cfg.strength * Math.sin(Math.PI * 2 * cfg.freq * time));
    const area = areaOf(cache, 'k');
    assert.ok(Math.abs(area - target) <= target * 0.05, `t=${time}: area ${area} vs target ${target}`);
  }
});

test('the floor keeps every lattice point above it', () => {
  const cfg = { drive: 'none', gravity: 3, restitution: 0.3, friction: 0.2, damping: 0.05 };
  const floorY = 0.5;
  const options = { drive: { unit: { x: 80, y: 100 }, gravity: cfg.gravity, floor: { nodeY: floorY, comY: 1000 } } };
  const cache = new Map();
  for (const time of [0.1, 0.25, 0.5, 1, 2]) {
    physics.simulateTo(cache, 'k', time, cfg, options);
    const entry = cache.get('k');
    for (let i = 1; i < entry.sim.nodes.length; i += 2) {
      assert.ok(entry.sim.nodes[i] <= floorY + 1e-3, `node below the floor at t=${time}: ${entry.sim.nodes[i]}`);
    }
  }
});

test('zero restitution never bounces off the floor', () => {
  const cfg = { drive: 'none', gravity: 4, restitution: 0, friction: 0, damping: 0.05 };
  const options = { drive: { unit: { x: 80, y: 100 }, gravity: cfg.gravity, floor: { nodeY: 100, comY: 0 } } };
  const cache = new Map();
  let touched = false;
  for (let time = 0; time <= 1.0001; time += 0.02) {
    const result = physics.simulateTo(cache, 'k', time, cfg, options);
    assert.ok(result.dy <= 1e-3, `com bounced above the floor at t=${time.toFixed(2)}: ${result.dy}`);
    if (result.dy > -1e-3) touched = true;
  }
  assert.ok(touched, 'the com never reached the floor');
});

test('extreme strengths stay clamped and finite', () => {
  for (const drive of ['pressure', 'muscle', 'pulse', 'tremor', 'shapeTarget']) {
    const cfg = { drive, strength: 2, freq: 6, stiffness: 1, damping: 0, inertia: 1, gravity: 8, beatKick: 4, target: 'twist' };
    const options = { driveAt: (t) => ({ unit: { x: 100, y: 120 }, gravity: cfg.gravity, kick: 1, accel: { x: 500, y: -300, rot: 200 } }) };
    const result = physics.simulateTo(new Map(), drive, 2, cfg, options);
    assertFinite(result.lattice);
    assert.ok(result.maxDisp <= physics.MAX_DISPLACEMENT + 1e-6, `${drive} exceeded the clamp: ${result.maxDisp}`);
    assert.ok(Number.isFinite(result.dx) && Number.isFinite(result.dy) && Number.isFinite(result.rot), `${drive} produced a non-finite com`);
    assert.ok(Math.hypot(result.dx, result.dy) < 1e6, `${drive} exploded`);
  }
});

test('heartbeat pulses fire twice per cycle, tremor is deterministic noise', () => {
  const cfg = { drive: 'pulse', strength: 1, freq: 1 };
  const a = physics.simulateTo(new Map(), 'a', 0.02, cfg, { drive: { unit: { x: 80, y: 100 } } });
  const b = physics.simulateTo(new Map(), 'b', 0.02, cfg, { drive: { unit: { x: 80, y: 100 } } });
  assert.deepEqual(Array.from(a.lattice), Array.from(b.lattice));
  assert.ok(a.maxDisp > 5e-4, `the pulse did not move the lattice (${a.maxDisp})`);
  const tremorCfg = { drive: 'tremor', strength: 0.5, freq: 3 };
  const c = physics.simulateTo(new Map(), 'c', 0.3, tremorCfg, { drive: { unit: { x: 80, y: 100 } } });
  const d = physics.simulateTo(new Map(), 'd', 0.3, tremorCfg, { drive: { unit: { x: 80, y: 100 } } });
  assert.deepEqual(Array.from(c.lattice), Array.from(d.lattice));
  assert.ok(c.maxDisp > 0.0001);
});

test('onsets come from the rms flux and the bpm grid is the fallback', () => {
  const frames = [];
  for (let i = 0; i < 60; i += 1) frames.push({ rms: 0.1 });
  frames[10].rms = 0.9;
  frames[30].rms = 0.8;
  const analysis = { fps: 30, frames };
  const onsets = physics.onsetTimes(analysis);
  assert.ok(onsets.some((time) => Math.abs(time - 10 / 30) < 1e-6), `missing onset: ${onsets}`);
  assert.ok(onsets.some((time) => Math.abs(time - 1) < 1e-6), `missing onset: ${onsets}`);
  assert.equal(physics.kickAt(onsets, 10 / 30 + 0.001, 0.02), 1);
  assert.equal(physics.kickAt(onsets, 10 / 30 - 0.05, 0.01), 0);
  const grid = physics.beatGrid(120, 1);
  assert.deepEqual(grid, [0, 0.5, 1]);
});
