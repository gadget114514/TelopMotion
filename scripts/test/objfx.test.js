'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const fx = require('../../renderer/js/lyrics/effects/registry.js');
require('../../renderer/js/lyrics/effects/animation.js');
require('../../renderer/js/lyrics/effects/layout.js');
require('../../renderer/js/lyrics/effects/enter.js');
require('../../renderer/js/lyrics/effects/exit.js');
require('../../renderer/js/lyrics/effects/hold.js');
require('../../renderer/js/lyrics/effects/location.js');
require('../../renderer/js/lyrics/effects/objfx.js');
require('../../renderer/js/lyrics/effects/staged-presets.js');
const core = require('../../renderer/js/lyrics/objfx-core.js');
const motion = require('../../renderer/js/lyrics/motion.js');

const FRAME = { width: 1920, height: 1080 };
const SIZE = 96;

function makeScene(text, style) {
  const letters = [];
  let pen = 0;
  for (let i = 0; i < text.length; i += 1) {
    const width = SIZE * 0.6;
    letters.push({
      path: `cue:c1/beat:c1:single0/line:0/word:${i}/letter:0`,
      cueId: 'c1', beatId: 'c1:single0', lineIdx: 0, wordIdx: i, letterIdx: 0, globalIdx: i, char: text[i],
      local: { x: pen, y: SIZE, w: width, h: SIZE, cx: pen + width / 2, cy: SIZE * 0.7, penX: pen, penY: SIZE },
      advance: width, size: SIZE,
    });
    pen += width;
  }
  return {
    cueId: 'c1', beatId: 'c1:single0', kind: 'single', start: 0, end: 10, text,
    style: style || {}, letters,
    blockBBox: { x1: 0, y1: 0, x2: pen, y2: SIZE }, size: SIZE, direction: 'horizontal',
  };
}

function evaluate(scene, t, extra) {
  const beat = { id: 'c1:single0', cueId: 'c1', kind: 'single', start: 0, end: 10, text: scene.text };
  return motion.evaluateBeat(scene, t, { frame: FRAME, seed: 42, beat, ...(extra || {}) });
}

function plainStyle(holds) {
  return {
    enter: { type: 'fade', params: {}, motion: { in: { duration: 0.01, delay: 0, ease: 'linear' } } },
    hold: holds || [],
  };
}

test('timeDelay and motionFlicker are registered as pro stackable holds', () => {
  for (const type of ['timeDelay', 'motionFlicker']) {
    const entry = fx.get('hold', type);
    assert.ok(entry, `${type} is registered`);
    assert.equal(entry.pack, 'pro');
    assert.equal(entry.stackable, true);
    assert.equal(typeof entry.motionFx, 'function');
    const idle = { x: 0, y: 0, rot: 0, scaleX: 1, scaleY: 1, opacity: 1, deform: [] };
    entry.cpu(idle, 0.5, 1, {}, () => 0.5, {});
    assert.deepEqual(idle, { x: 0, y: 0, rot: 0, scaleX: 1, scaleY: 1, opacity: 1, deform: [] });
  }
});

test('still beat: objfx changes nothing', () => {
  const holds = [
    { type: 'timeDelay', params: { lag: 0.3 } },
    { type: 'motionFlicker', params: { depth: 0.7 } },
  ];
  const delayed = evaluate(makeScene('ABCDE', plainStyle(holds)), 5).letters;
  const clean = evaluate(makeScene('ABCDE', plainStyle([])), 5).letters;
  for (let i = 0; i < delayed.length; i += 1) {
    for (const key of ['x', 'y', 'rot', 'scaleX', 'scaleY', 'opacity']) {
      assert.ok(Math.abs(delayed[i][key] - clean[i][key]) < 1e-9, `letter ${i} ${key} moved while still`);
    }
  }
});

test('lag = 0 and depth = 0 match the clean state', () => {
  const holds = [
    { type: 'timeDelay', params: { lag: 0 } },
    { type: 'motionFlicker', params: { depth: 0 } },
  ];
  const drifted = plainStyle([{ type: 'drift', params: { vx: 0.5, vy: 0 } }, ...holds]);
  const clean = plainStyle([{ type: 'drift', params: { vx: 0.5, vy: 0 } }]);
  const a = evaluate(makeScene('ABCDE', drifted), 3).letters;
  const b = evaluate(makeScene('ABCDE', clean), 3).letters;
  for (let i = 0; i < a.length; i += 1) {
    for (const key of ['x', 'y', 'rot', 'scaleX', 'scaleY', 'opacity']) {
      assert.ok(Math.abs(a[i][key] - b[i][key]) < 1e-9, `letter ${i} ${key} differs`);
    }
  }
});

test('timeDelay follows the past position on a constant drift', () => {
  const lag = 0.2;
  const style = plainStyle([
    { type: 'drift', params: { vx: 0.5, vy: 0 } },
    { type: 'timeDelay', params: { lag, unit: 'letter', select: 'all', props: 'pos' } },
  ]);
  const delayed = evaluate(makeScene('ABCDE', style), 3).letters;
  const earlier = evaluate(makeScene('ABCDE', plainStyle([{ type: 'drift', params: { vx: 0.5, vy: 0 } }])), 3 - lag).letters;
  for (let i = 0; i < delayed.length; i += 1) {
    assert.ok(Math.abs(delayed[i].x - earlier[i].x) < 1e-6, `letter ${i} x ${delayed[i].x} vs past ${earlier[i].x}`);
    assert.ok(Math.abs(delayed[i].y - earlier[i].y) < 1e-6, `letter ${i} y drifted`);
  }
});

test('timeDelay oddEven delays only the picked letters', () => {
  const style = plainStyle([
    { type: 'drift', params: { vx: 0.5, vy: 0 } },
    { type: 'timeDelay', params: { lag: 0.2, select: 'oddEven', oddEven: 'odd' } },
  ]);
  const delayed = evaluate(makeScene('ABCDE', style), 3).letters;
  const clean = evaluate(makeScene('ABCDE', plainStyle([{ type: 'drift', params: { vx: 0.5, vy: 0 } }])), 3).letters;
  for (let i = 0; i < delayed.length; i += 1) {
    if (i % 2 === 1) assert.ok(delayed[i].x < clean[i].x, `odd letter ${i} is delayed`);
    else assert.ok(Math.abs(delayed[i].x - clean[i].x) < 1e-9, `even letter ${i} is untouched`);
  }
});

test('motionFlicker respects the opacity floor while moving', () => {
  const style = plainStyle([
    { type: 'drift', params: { vx: 0.8, vy: 0 } },
    { type: 'motionFlicker', params: { depth: 0.7, minOpacity: 0.2, rate: 12, wave: 'random' } },
  ]);
  const base = evaluate(makeScene('ABCDE', plainStyle([{ type: 'drift', params: { vx: 0.8, vy: 0 } }])), 3).letters;
  const flick = evaluate(makeScene('ABCDE', style), 3).letters;
  for (let i = 0; i < flick.length; i += 1) {
    assert.ok(flick[i].opacity <= base[i].opacity + 1e-9, `letter ${i} flicker brightens`);
    assert.ok(flick[i].opacity + 1e-9 >= 0.2 * base[i].opacity, `letter ${i} flicker below the floor`);
  }
});

test('objfx:false matches the clean evaluation', () => {
  const style = plainStyle([
    { type: 'drift', params: { vx: 0.5, vy: 0 } },
    { type: 'timeDelay', params: { lag: 0.3 } },
    { type: 'motionFlicker', params: { depth: 0.9 } },
  ]);
  const scene = makeScene('ABCDE', style);
  const skipped = evaluate(scene, 3, { objfx: false }).letters;
  const clean = evaluate(makeScene('ABCDE', plainStyle([{ type: 'drift', params: { vx: 0.5, vy: 0 } }])), 3).letters;
  for (let i = 0; i < skipped.length; i += 1) {
    for (const key of ['x', 'y', 'rot', 'scaleX', 'scaleY', 'opacity']) {
      assert.ok(Math.abs(skipped[i][key] - clean[i][key]) < 1e-9, `letter ${i} ${key} differs with objfx:false`);
    }
  }
});

test('core: motionAmount rises with speed and releases after a stop', () => {
  const speed = 2; // shortSide units per second
  const src = (i, t) => ({ x: speed * 1000 * t, y: 0, rot: 0, scaleX: 1, scaleY: 1 });
  const cfg = { v0: 0.02, v1: 0.6, sensitivity: 1, release: 0.3, maxT: 10 };
  assert.ok(core.motionAmount(src, 0, 1, cfg, 1000) > 0.99, 'full speed saturates');
  assert.equal(core.motionAmount(src, 0, 1, { ...cfg, release: 0 }, 1000), core.motionAmount(src, 0, 1, cfg, 1000));
  const still = () => ({ x: 0, y: 0, rot: 0, scaleX: 1, scaleY: 1 });
  assert.equal(core.motionAmount(still, 0, 1, cfg, 1000), 0);
});

test('colorShift is registered as a pro stackable hold', () => {
  const entry = fx.get('hold', 'colorShift');
  assert.ok(entry, 'colorShift is registered');
  assert.equal(entry.pack, 'pro');
  assert.equal(entry.stackable, true);
  assert.equal(typeof entry.motionFx, 'function');
  const idle = { x: 0, y: 0, rot: 0, scaleX: 1, scaleY: 1, opacity: 1, deform: [] };
  entry.cpu(idle, 0.5, 1, {}, () => 0.5, {});
  assert.ok(!('tint' in idle), 'cpu is a no-op');
});

test('still beat: colorShift leaves no tint', () => {
  const style = plainStyle([{ type: 'colorShift', params: { driver: 'distance', palette: 'hueCycle' } }]);
  const letters = evaluate(makeScene('ABCDE', style), 5).letters;
  for (let i = 0; i < letters.length; i += 1) {
    assert.equal(letters[i].tint, undefined, `letter ${i} tinted while still`);
  }
});

test('colorShift distance holds its colour after a stop', () => {
  const shift = { type: 'colorShift', params: { driver: 'distance', palette: 'gradient', mix: 0.85, cycles: 1 } };
  const drift = { type: 'drift', params: { vx: 0.8, vy: 0 } };
  const moving = evaluate(makeScene('ABCDE', plainStyle([drift, shift])), 2).letters;
  for (let i = 0; i < moving.length; i += 1) {
    assert.ok(moving[i].tint && moving[i].tint.m > 0.5, `letter ${i} has no distance tint`);
  }
  const stopped = evaluate(makeScene('ABCDE', plainStyle([drift, shift])), 9.5).letters;
  for (let i = 0; i < stopped.length; i += 1) {
    assert.ok(stopped[i].tint && stopped[i].tint.m > 0.5, `letter ${i} lost its tint at rest`);
  }
});

test('colorShift speed fades back at rest', () => {
  const shift = { type: 'colorShift', params: { driver: 'speed', palette: 'gradient', mix: 0.85, cycles: 1 } };
  const drift = { type: 'drift', params: { vx: 0.8, vy: 0 } };
  const moving = evaluate(makeScene('ABCDE', plainStyle([drift, shift])), 2).letters;
  assert.ok(moving.some((state) => state.tint && state.tint.m > 0), 'no speed tint while moving');
  const stopped = evaluate(makeScene('ABCDE', plainStyle([drift, shift])), 9.5).letters;
  for (let i = 0; i < stopped.length; i += 1) {
    assert.ok(!stopped[i].tint || stopped[i].tint.m < 0.05, `letter ${i} keeps a speed tint at rest`);
  }
});

test('core: distanceAt is monotonic and scrub-stable', () => {
  const src = (i, t) => ({ x: 500 * t, y: 0, rot: 0, scaleX: 1, scaleY: 1 });
  const checkpoints = new Map();
  const d1 = core.distanceAt(src, 0, 1, checkpoints, 10, 1000);
  const d2 = core.distanceAt(src, 0, 2, checkpoints, 10, 1000);
  assert.ok(d2 > d1, 'distance grows with travel');
  assert.ok(Math.abs(d1 - 0.5) < 0.02, `expected ~0.5, got ${d1}`);
  const back = core.distanceAt(src, 0, 0.5, checkpoints, 10, 1000);
  const fwd = core.distanceAt(src, 0, 0.5, new Map(), 10, 1000);
  assert.ok(Math.abs(back - fwd) < 1e-9, 'scrubbing back rewinds deterministically');
});

test('core: tintFor maps every palette', () => {
  const base = [1, 1, 1];
  // hue rotation of a saturated red by half a turn is cyan
  const hue = core.tintFor('hueCycle', 0.5, [1, 0, 0], [], [1, 0, 0], [0, 0, 1]);
  assert.ok(Math.abs(hue[0] - 0) < 0.02 && Math.abs(hue[1] - 1) < 0.02 && Math.abs(hue[2] - 1) < 0.02, `hue 0.5 of red is cyan, got ${hue}`);
  // white has no saturation, so it stays white
  assert.deepEqual(core.tintFor('hueCycle', 0.5, base, []).map((v) => Math.round(v)), [1, 1, 1]);
  const grad = core.tintFor('gradient', 0, base, [], [1, 0, 0], [0, 0, 1]);
  assert.deepEqual(grad.map((v) => Math.round(v * 100) / 100), [1, 0, 0]);
  const mid = core.tintFor('gradient', 0.5, base, [], [1, 0, 0], [0, 0, 1]);
  assert.deepEqual(mid.map((v) => Math.round(v * 100) / 100), [0, 0, 1]);
  const stops = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  assert.deepEqual(core.tintFor('beatPalette', 0, base, stops).map((v) => Math.round(v)), [1, 0, 0]);
  assert.deepEqual(core.tintFor('beatPalette', 0.5, base, stops).map((v) => Math.round(v * 100) / 100), [0, 0.5, 0.5]);
});

test('timeDisplacement is registered as a pro stackable hold', () => {
  const entry = fx.get('hold', 'timeDisplacement');
  assert.ok(entry, 'timeDisplacement is registered');
  assert.equal(entry.pack, 'pro');
  assert.equal(entry.stackable, true);
  assert.equal(typeof entry.motionFx, 'function');
  const idle = { x: 0, y: 0, rot: 0, scaleX: 1, scaleY: 1, opacity: 1, deform: [] };
  entry.cpu(idle, 0.5, 1, {}, () => 0.5, {});
  assert.ok(!('softLattice' in idle), 'cpu is a no-op');
});

test('still beat: displacement and region leave no lattice', () => {
  const style = plainStyle([
    { type: 'timeDisplacement', params: { unit: 'letter', map: 'alongVelocity', maxLag: 0.15 } },
    { type: 'timeDelay', params: { unit: 'region', lag: 0.2, band: 'top' } },
  ]);
  const letters = evaluate(makeScene('ABCDE', style), 5).letters;
  for (let i = 0; i < letters.length; i += 1) {
    assert.equal(letters[i].softLattice, undefined, `letter ${i} has a lattice while still`);
  }
});

test('timeDisplacement shears a translating letter', () => {
  const disp = { type: 'timeDisplacement', params: { unit: 'letter', map: 'linearX', maxLag: 0.15 } };
  const drift = { type: 'drift', params: { vx: 0.8, vy: 0 } };
  const letters = evaluate(makeScene('ABCDE', plainStyle([drift, disp])), 3).letters;
  for (let i = 0; i < letters.length; i += 1) {
    const lattice = letters[i].softLattice;
    assert.ok(lattice && lattice.length === 50, `letter ${i} has no grid`);
    // right side lags behind: the rightmost node trails left (negative x)
    const left = lattice[0 * 2];
    const right = lattice[4 * 2];
    assert.ok(right < left - 0.02, `letter ${i} is not sheared (left ${left}, right ${right})`);
    // centre node is recentered to zero for pure translation
    assert.ok(Math.abs(lattice[12 * 2]) < 1e-9, `letter ${i} centre moved ${lattice[12 * 2]}`);
  }
});

test('timeDisplacement block bends the whole line', () => {
  const disp = { type: 'timeDisplacement', params: { unit: 'block', map: 'linearX', maxLag: 0.2 } };
  const drift = { type: 'drift', params: { vx: 0.8, vy: 0 } };
  const letters = evaluate(makeScene('ABCDE', plainStyle([drift, disp])), 3).letters;
  const clean = evaluate(makeScene('ABCDE', plainStyle([drift])), 3).letters;
  const lagOf = (k) => clean[k].x - letters[k].x;
  assert.ok(lagOf(4) > lagOf(0) + 5, 'the lag grows from the left end to the right end');
  assert.ok(lagOf(0) < 5, 'the left end barely lags');
});

test('core: lag maps cover their range', () => {
  assert.equal(core.lagMapValue('linearX', -1, 0, null), 0);
  assert.equal(core.lagMapValue('linearX', 1, 0, null), 1);
  assert.equal(core.lagMapValue('linearY', 0, 1, null), 1);
  assert.ok(Math.abs(core.lagMapValue('radial', 0, 0, null)) < 1e-9);
  assert.ok(Math.abs(core.lagMapValue('radial', 1, 1, null) - 1) < 1e-9);
  assert.equal(core.lagMapValue('alongVelocity', 1, 0, { x: 1, y: 0 }), 0);
  assert.equal(core.lagMapValue('alongVelocity', -1, 0, { x: 1, y: 0 }), 1);
  const noise = core.lagMapValue('noise', 0.3, -0.2, null, 1.5, 3);
  assert.ok(noise >= 0 && noise <= 1, 'noise map stays in range');
});

test('motionBend is registered with a lead physics hook', () => {
  const entry = fx.get('hold', 'motionBend');
  assert.ok(entry, 'motionBend is registered');
  assert.equal(entry.pack, 'pro');
  assert.equal(typeof entry.physics, 'function');
  const cfg = entry.physics({ leadSide: 'auto', leadWidth: 0.3, stiffness: 0.25, damping: 0.08, inertia: 1.4, maxStretch: 0.9, rotLag: 0.5 }, 'hold');
  assert.deepEqual(cfg.lead, { side: 'auto', width: 0.3, rotLag: 0.5 });
  assert.equal(cfg.maxStretch, 0.9);
  assert.equal(entry.physics({}, 'enter'), null);
  const idle = { x: 0, y: 0, rot: 0, scaleX: 1, scaleY: 1, opacity: 1, deform: [] };
  entry.cpu(idle, 0.5, 1, {}, () => 0.5, {});
  assert.ok(!('softLattice' in idle), 'cpu is a no-op');
});

test('still beat: motionBend leaves no lattice', () => {
  const style = plainStyle([{ type: 'motionBend', params: {} }]);
  const letters = evaluate(makeScene('ABCDE', style), 5).letters;
  for (let i = 0; i < letters.length; i += 1) {
    const lattice = letters[i].softLattice;
    assert.ok(!lattice || lattice.every((v) => Math.abs(v) < 1e-6), `letter ${i} bent while still`);
  }
});

test('motionBend pins the leading edge of a slide', () => {
  const style = {
    enter: { type: 'slide', params: { dir: 'left', distance: 0.4 }, motion: { in: { duration: 1.2, delay: 0, ease: 'linear' } } },
    hold: [{ type: 'motionBend', params: {} }],
  };
  const letters = evaluate(makeScene('ABCDE', style), 0.6).letters;
  let pinned = 0;
  let trailing = 0;
  for (let i = 0; i < letters.length; i += 1) {
    const lattice = letters[i].softLattice;
    assert.ok(lattice && lattice.length === 50, `letter ${i} has no bend lattice`);
    // rightmost column (leading, +x motion) stays near rest, leftmost trails
    let lead = 0;
    let tail = 0;
    for (let j = 0; j < 5; j += 1) {
      lead += Math.abs(lattice[(j * 5 + 4) * 2]) + Math.abs(lattice[(j * 5 + 4) * 2 + 1]);
      tail += Math.abs(lattice[(j * 5) * 2]) + Math.abs(lattice[(j * 5) * 2 + 1]);
    }
    if (lead < 0.02) pinned += 1;
    if (tail > lead) trailing += 1;
  }
  assert.ok(pinned >= 3, `leading edge not pinned (${pinned}/5)`);
  assert.ok(trailing >= 3, `tail does not trail (${trailing}/5)`);
});

test('motionBend is deterministic across evaluations', () => {
  const style = {
    enter: { type: 'slide', params: { dir: 'left', distance: 0.4 }, motion: { in: { duration: 1.2, delay: 0, ease: 'linear' } } },
    hold: [{ type: 'motionBend', params: {} }],
  };
  const scene = makeScene('ABCDE', style);
  const beat = { id: 'c1:single0', cueId: 'c1', kind: 'single', start: 0, end: 10, text: scene.text };
  const ctx = { frame: FRAME, seed: 42, beat };
  const a = motion.evaluateBeat(scene, 0.6, ctx).letters;
  const b = motion.evaluateBeat(scene, 0.6, ctx).letters;
  for (let i = 0; i < a.length; i += 1) {
    assert.deepEqual(Array.from(a[i].softLattice || []), Array.from(b[i].softLattice || []));
  }
});

test('core physics: lead overshoots after a stop, then settles', () => {
  const physics = require('../../renderer/js/lyrics/physics.js');
  const cfg = { drive: 'none', stiffness: 0.25, damping: 0.08, inertia: 1, gravity: 0, lead: { side: 'auto', width: 0.3, rotLag: 0.5 } };
  const go = { unit: { x: 100, y: 100 }, accel: { x: 2000, y: 0, rot: 0 }, vel: { x: 2, y: 0 }, velGate: 1 };
  const stop = { unit: { x: 100, y: 100 }, accel: { x: 0, y: 0, rot: 0 }, vel: { x: 0, y: 0 }, velGate: 0 };
  const options = { driveAt: (t) => (t < 0.5 ? go : stop) };
  const tail = (cache) => {
    const sim = cache.get('k').sim;
    const k = (2 * sim.grid + 0) * 2;
    return sim.nodes[k] - sim.rest[k];
  };
  const cache = new Map();
  physics.simulateTo(cache, 'k', 0.4, cfg, options);
  assert.ok(tail(cache) < -0.005, 'the tail lags while driving');
  physics.simulateTo(cache, 'k', 0.6, cfg, options);
  assert.ok(tail(cache) > 0, 'the tail overshoots after the stop');
  physics.simulateTo(cache, 'k', 3.0, cfg, options);
  assert.ok(Math.abs(tail(cache)) < 1e-4, 'the tail settles');
});

test('core physics: maxStretch caps the bend', () => {
  const physics = require('../../renderer/js/lyrics/physics.js');
  const drive = { unit: { x: 100, y: 100 }, accel: { x: 200000, y: 0, rot: 0 }, vel: { x: 20, y: 0 }, velGate: 1 };
  const options = { driveAt: () => drive };
  for (const maxStretch of [0.5, 0.9]) {
    const cache = new Map();
    physics.simulateTo(cache, 'k', 1.0, { drive: 'none', stiffness: 0.25, damping: 0.08, inertia: 1, gravity: 0, maxStretch, lead: { side: 'auto', width: 0.3, rotLag: 0.5 } }, options);
    const sim = cache.get('k').sim;
    let peak = 0;
    for (let k = 0; k < sim.count; k += 1) {
      peak = Math.max(peak, Math.hypot(sim.nodes[k * 2] - sim.rest[k * 2], sim.nodes[k * 2 + 1] - sim.rest[k * 2 + 1]));
    }
    assert.ok(peak <= maxStretch + 1e-6, `peak ${peak} exceeds ${maxStretch}`);
  }
});

test('motionEcho and strokeTrail register with count-proportional cost', () => {
  const echo = fx.get('hold', 'motionEcho');
  const stroke = fx.get('hold', 'strokeTrail');
  assert.ok(echo && stroke, 'both trail types are registered');
  assert.equal(echo.pack, 'pro');
  assert.equal(stroke.pack, 'pro');
  assert.ok(echo.costOf({ count: 5 }) > echo.costOf({ count: 2 }), 'echo cost grows with count');
  assert.ok(stroke.costOf({ count: 6 }) > stroke.costOf({ count: 1 }), 'stroke cost grows with count');
  const cfg = echo.motionFx({});
  assert.equal(cfg.kind, 'motionEcho');
  assert.equal(cfg.count, 3);
  assert.equal(cfg.behind, true);
  for (const entry of [echo, stroke]) {
    const idle = { x: 0, y: 0, rot: 0, scaleX: 1, scaleY: 1, opacity: 1, deform: [] };
    entry.cpu(idle, 0.5, 1, {}, () => 0.5, {});
    assert.ok(!('softLattice' in idle) && !('tint' in idle), 'trail cpu is a no-op');
  }
});

test('motion meta carries the trail configs', () => {
  const scene = makeScene('ABCDE', plainStyle([
    { type: 'motionEcho', params: { count: 3 } },
    { type: 'strokeTrail', params: { count: 4, behind: false } },
  ]));
  const beat = { id: 'c1:single0', cueId: 'c1', kind: 'single', start: 0, end: 10, text: scene.text };
  const meta = motion.evaluateBeat(scene, 3, { frame: FRAME, seed: 42, beat }).meta;
  assert.equal(meta.trails.length, 2);
  assert.equal(meta.trails[0].type, 'echo');
  assert.equal(meta.trails[0].cfg.count, 3);
  assert.equal(meta.trails[1].type, 'stroke');
  assert.equal(meta.trails[1].cfg.behind, false);
  const clean = makeScene('ABCDE', plainStyle([]));
  const cleanMeta = motion.evaluateBeat(clean, 3, { frame: FRAME, seed: 42, beat }).meta;
  assert.deepEqual(cleanMeta.trails, []);
});

test('core: trail copies decay and recolour oldest-first', () => {
  const cfg = { decay: 0.35, scaleDecay: 0.1, widthDecay: 0.3 };
  const newest = core.trailCopy(cfg, 1, 3);
  const oldest = core.trailCopy(cfg, 3, 3);
  assert.equal(newest.opacityMul, 1);
  assert.ok(Math.abs(oldest.opacityMul - 0.65 * 0.65) < 1e-9);
  assert.ok(Math.abs(newest.scaleMul - 0.9) < 1e-9);
  assert.ok(Math.abs(oldest.scaleMul - 0.7) < 1e-9);
  assert.equal(newest.colorT, 0);
  assert.equal(oldest.colorT, 1);
  assert.equal(core.trailCopy(cfg, 1, 1).colorT, 0);
});

test('core: trail shadows vanish on the body', () => {
  assert.equal(core.trailLetterFade(0, 0, 96, 0.08), 0);
  assert.equal(core.trailLetterFade(100, 0, 96, 0.08), 1);
  const partial = core.trailLetterFade(0.08 * 96 * 1.5, 0, 96, 0.08);
  assert.ok(partial > 0 && partial < 1, 'the gap ramps smoothly');
});

test('O6 presets resolve to their primitives', () => {
  const wants = {
    lagTail: 'timeDelay',
    chromaWalk: 'colorShift',
    speedStrobe: 'motionFlicker',
    rainbowEcho: 'motionEcho',
    neonTrail: 'strokeTrail',
    shearDrag: 'timeDisplacement',
    rubberLead: 'motionBend',
  };
  for (const [type, primitive] of Object.entries(wants)) {
    const entry = fx.get('hold', type);
    assert.ok(entry && entry.preset, `${type} preset is registered`);
    assert.equal(entry.preset.primitive, primitive);
    const expanded = fx.expandPreset({ type, params: {} }, 'hold');
    assert.equal(expanded.type, primitive);
  }
});

test('core: selectWeight covers every mode', () => {
  const helpers = { unitRank: (i) => ({ rank: i, count: 4 }), hash01: (i) => (i === 0 ? 0.1 : 0.9), inScope: () => true };
  assert.equal(core.selectWeight('all', {}, 0, 4, helpers), 1);
  assert.equal(core.selectWeight('every', { n: 2, offset: 0 }, 2, 4, helpers), 1);
  assert.equal(core.selectWeight('every', { n: 2, offset: 0 }, 1, 4, helpers), 0);
  assert.equal(core.selectWeight('oddEven', { oddEven: 'odd' }, 1, 4, helpers), 1);
  assert.equal(core.selectWeight('rank', { units: 'letter', from: 0, to: 0.5 }, 0, 4, helpers), 1);
  assert.equal(core.selectWeight('rank', { units: 'letter', from: 0, to: 0.5 }, 3, 4, helpers), 0);
  assert.equal(core.selectWeight('random', { fraction: 0.5 }, 0, 4, helpers), 1);
  assert.equal(core.selectWeight('random', { fraction: 0.5 }, 1, 4, helpers), 0);
});
