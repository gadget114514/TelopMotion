'use strict';

// GPU simulations for the figure track (gl/sim.js).
//
// The state lives in a texture, so the parts that can be checked without a GPU
// are the ones that decide *when* a step runs: the step schedule, the keyframe
// store and its LRU order, and where the audio splats land. That schedule is
// what has to be right for a scrub and a play to agree, so it is tested here
// against a reference state machine: the same numbers, reached by playing, by
// scrubbing backwards and by jumping cold, have to come out identical.
//
// The shaders are compiled in the browser (`SA.glSim` through the pipeline's
// drawField); here the genome, the figure plumbing and the embedding are checked.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const sim = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'gl', 'sim.js'));
const fields = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'gl', 'fields.js'));
const figures = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'figures.js'));

const COLORS = ['#ff4d6d', '#ffd166', '#06d6a0', '#118ab2', '#c77dff'];
const BEATS = [{ start: 2, end: 8 }, { start: 8, end: 14 }];

// --- the step schedule --------------------------------------------------------

test('a clip time lands on a fixed step, and the keyframes fall on the second', () => {
  assert.equal(sim.DT, 1 / 30);
  assert.equal(sim.KEY_STEPS, 30);
  assert.equal(sim.stepOf(0), 0);
  assert.equal(sim.stepOf(-5), 0);
  assert.equal(sim.stepOf(1 / 30 - 1e-9), 0);
  assert.equal(sim.stepOf(1 / 30), 1);
  assert.equal(sim.stepOf(2), 60);
  assert.equal(sim.stepOf(7.9), 237);
  for (let step = 0; step < 600; step += 1) {
    assert.equal(sim.keyOf(step), Math.floor(step / 30) * 30);
    assert.ok(sim.keyOf(step) <= step);
    // the walk from a keyframe never passes the next one
    assert.ok(step - sim.keyOf(step) < sim.KEY_STEPS);
  }
});

test('a short gap forward walks; anything else restores a keyframe or reseeds', () => {
  const keys = [0, 30, 60, 90, 120];
  // inside the walk window
  assert.deepEqual(sim.plan(60, keys, 75), { action: 'advance', fromStep: 60, steps: 15 });
  assert.deepEqual(sim.plan(60, keys, 60), { action: 'hold', fromStep: 60, steps: 0 });
  // a long jump forward takes the nearest keyframe at or before the target
  assert.deepEqual(sim.plan(0, keys, 200), { action: 'restore', fromStep: 120, steps: 80 });
  assert.deepEqual(sim.plan(300, keys, 200), { action: 'restore', fromStep: 120, steps: 80 });
  // backwards, even by one step, restores rather than trying to walk
  assert.deepEqual(sim.plan(61, keys, 60), { action: 'restore', fromStep: 60, steps: 0 });
  // nothing held at or before the target: start from the seed
  assert.deepEqual(sim.plan(600, [], 400), { action: 'reset', fromStep: 0, steps: 400 });
  // with a keyframe on the way back the walk is at most one keyframe apart
  const dense = Array.from({ length: 40 }, (_, i) => i * sim.KEY_STEPS);
  for (let from = 0; from < 1200; from += 1) {
    for (const to of [0, 37, 91, 200, 399, 1199]) {
      const p = sim.plan(from, dense, to);
      if (p.action === 'restore') assert.ok(p.steps < sim.KEY_STEPS, `from ${from} to ${to}: ${p.steps} steps`);
    }
  }
});

test('the keyframe store holds at most MAX_KEYS, dropping the oldest and pinning the start', () => {
  const store = new Map();
  let tick = 0;
  // sequential playback fills it up
  for (let step = 0; step <= sim.KEY_STEPS * 200; step += sim.KEY_STEPS) {
    sim.touchKey(store, step, tick);
    tick += 1;
  }
  assert.equal(store.size, sim.MAX_KEYS);
  assert.ok(store.has(0), 'the seeded start must stay');
  assert.ok(store.has(sim.KEY_STEPS * 200), 'the newest must be there');
  // the ones it dropped are the ones it has not touched for longest
  assert.equal(store.has(sim.KEY_STEPS), false);

  // with room, nothing is dropped and the answer says so
  const roomy = new Map();
  assert.equal(sim.touchKey(roomy, 0, 1), -1);
  assert.equal(sim.touchKey(roomy, 30, 2), -1);
  assert.equal(roomy.size, 2);
  // once full, the least recently used goes
  const full = new Map();
  for (let step = 0; step < sim.MAX_KEYS; step += 1) full.set(step, step);
  const dropped = sim.touchKey(full, 999, 999);
  assert.equal(dropped, 1, 'the oldest was not the one dropped');
  assert.equal(full.size, sim.MAX_KEYS);
  assert.ok(full.has(999) && full.has(0));

  // re-touching an existing step is free and refreshes it
  const again = new Map();
  sim.touchKey(again, 0, 1);
  sim.touchKey(again, 30, 2);
  sim.touchKey(again, 0, 3);
  assert.equal(again.size, 2);
  assert.equal(again.get(0), 3);
});

test('scrubbing and playing reach the same state, whatever order the times arrive in', () => {
  // A stand-in for the step shader: a pure function of (state, absolute step).
  // The mechanism under test - the schedule, not the arithmetic - is what makes
  // the two routes agree, so any deterministic step works here.
  const seeded = { seed: 5, v: 0 };
  const step = (state, at) => ({ seed: state.seed, v: state.v * 0.5 + at * 0.25 + Math.sin(at) * 0.1 });
  // the reference: played straight through, one step at a time
  const playedTo = (upTo) => {
    let state = { ...seeded };
    for (let at = 1; at <= upTo; at += 1) state = step(state, at);
    return state;
  };
  const reference = playedTo(300);

  // one clip: a state at a step, plus the keyframes it holds
  function machine() {
    let current = -1;
    let state = { ...seeded };
    const keys = new Map();
    const keyState = new Map();
    let tick = 0;
    const last = () => ({ step: current, state: { ...state } });
    return {
      seek(target) {
        const p = sim.plan(current, Array.from(keys.keys()), target);
        if (p.action === 'reset' || current < 0) {
          state = { ...seeded };
          current = 0;
          keys.set(0, tick);
          keyState.set(0, { ...state });
          tick += 1;
        } else if (p.action === 'restore') {
          state = { ...keyState.get(p.fromStep) };
          current = p.fromStep;
        }
        const limit = Math.min(p.steps, sim.CATCHUP_CAP);
        for (let i = 0; i < limit; i += 1) {
          current += 1;
          state = step(state, current);
          if (current % sim.KEY_STEPS === 0 && !keys.has(current)) {
            keys.set(current, tick);
            keyState.set(current, { ...state });
            tick += 1;
            // the same LRU the runner uses
            while (keys.size > sim.MAX_KEYS) {
              let victim = -1;
              let oldest = Infinity;
              keys.forEach((seen, k) => { if (k > 0 && seen < oldest) { oldest = seen; victim = k; } });
              if (victim < 0) break;
              keys.delete(victim);
              keyState.delete(victim);
            }
          }
        }
        return last();
      },
      state: () => last().state,
    };
  }

  // played in order, one step at a time
  const played = machine();
  for (let at = 0; at <= 300; at += 1) played.seek(at);
  assert.deepEqual(played.state(), reference, 'playing in order');

  // scrubbed: forwards, backwards, and jumped cold, ending on the same time
  const scrubbed = machine();
  for (const at of [210, 60, 285, 0, 126, 300, 30, 201, 99, 300, 240, 300]) scrubbed.seek(at);
  assert.deepEqual(scrubbed.state(), reference, 'scrubbing around');

  // a cold clip reaches a time inside the catch-up cap in one call, exactly
  assert.deepEqual(machine().seek(60).state, playedTo(60), 'a cold jump inside the cap');
  assert.deepEqual(machine().seek(sim.CATCHUP_CAP).state, playedTo(sim.CATCHUP_CAP), 'a cold jump at the cap');

  // further than that it runs a bounded amount per call and catches up over the
  // next few frames - never one long stall, and never a different answer
  const cold = machine();
  let first = cold.seek(300);
  assert.equal(first.step, sim.CATCHUP_CAP, 'the first cold frame ran the whole clip');
  let guard = 0;
  while (cold.seek(300).step < 300) {
    guard += 1;
    assert.ok(guard < 50, 'the catch-up never converges');
  }
  assert.deepEqual(cold.state(), reference, 'a cold jump that has caught up');
});

test('the audio splats are a function of the step, the seed and the beats', () => {
  const p = sim.genome('reactionDiffusion', 3, 1);
  const beats = [0.5, 1.5, 2.5];
  // the same question always gets the same answer
  for (const step of [0, 7, 15, 30, 45, 300]) {
    assert.deepEqual(sim.splatsAt(p, 3, beats, step), sim.splatsAt(p, 3, beats, step));
  }
  // a different seed puts them somewhere else (step 0 always splats: 0 % rate is 0)
  const distinct = new Set();
  for (let seed = 1; seed <= 40; seed += 1) {
    distinct.add(JSON.stringify(sim.splatsAt(p, seed, beats, 0)));
  }
  assert.ok(distinct.size > 20, `only ${distinct.size} distinct splat patterns of 40 seeds`);
  // every splat is inside the grid and finite
  for (let seed = 1; seed <= 30; seed += 1) {
    for (let step = 0; step < 400; step += 7) {
      for (const s of sim.splatsAt(p, seed, beats, step) || []) {
        assert.ok(Number.isFinite(s.x) && s.x >= 0 && s.x <= 1, `x ${s.x}`);
        assert.ok(Number.isFinite(s.y) && s.y >= 0 && s.y <= 1, `y ${s.y}`);
        assert.ok(Number.isFinite(s.radius) && s.radius > 0, `radius ${s.radius}`);
        assert.ok(Number.isFinite(s.strength) && s.strength > 0, `strength ${s.strength}`);
      }
    }
  }
  // a beat step always splats, even between the free ones
  const rate = Math.max(1, Math.round(p[10]));
  const beatStep = sim.stepOf(1.5);
  assert.equal(sim.stepOf(1.5), 45);
  assert.ok(sim.splatsAt(p, 3, beats, beatStep), 'a beat does not splat');
  void rate;
  // a beat lands nearer the middle than a free splat does
  const onBeat = sim.splatsAt(p, 3, beats, beatStep)[0];
  const free = sim.splatsAt(p, 3, beats, rate * 7)[0];
  if (free) assert.ok(Math.abs(onBeat.x - 0.5) <= Math.abs(free.x - 0.5) + 1e-9);
  // no beats at all still gives the free ones
  assert.ok(sim.splatsAt(p, 3, null, 0) || sim.splatsAt(p, 3, null, rate));
  assert.equal(sim.splatsAt(p, 3, null, 1), null, 'a step between the free ones does not splat');
});

// --- the simulations themselves ------------------------------------------------

test('every simulation has a step shader, a seeded start and a finite genome', () => {
  assert.deepEqual(sim.SIMS, ['reactionDiffusion', 'wave2d', 'fluid', 'cellular']);
  for (const id of sim.SIMS) {
    const def = sim.SIM_DEFS[id];
    assert.ok(def, `${id} has no definition`);
    assert.ok(def.step.includes('void main()'), `${id} step shader`);
    assert.ok(def.reset.includes('void main()'), `${id} reset shader`);
    // the step shader keeps a bad texel from spreading over the grid
    assert.ok(def.step.includes('sane('), `${id} does not guard against a NaN`);
    for (let seed = 1; seed <= 30; seed += 1) {
      for (const rand of [0, 0.5, 1]) {
        const g = sim.genome(id, seed * 7 + 1, rand);
        assert.equal(g.length, 16, id);
        assert.ok(g.every(Number.isFinite), `${id} seed ${seed} rand ${rand} not finite`);
        for (let i = 12; i < 16; i += 1) assert.ok(g[i] >= 0 && g[i] <= 1, `${id} embedding slot ${i}`);
        // the variant slot is a small whole number the shader can switch on
        assert.ok(g[8] >= 0 && g[8] <= 3 && Number.isInteger(g[8]), `${id} kind ${g[8]}`);
      }
    }
  }
});

test('the genome is deterministic, varies with the seed and is plain at randomness 0', () => {
  for (const id of sim.SIMS) {
    assert.deepEqual(sim.genome(id, 7, 1), sim.genome(id, 7, 1));
    const plain = sim.genome(id, 1, 0);
    for (let seed = 2; seed <= 20; seed += 1) assert.deepEqual(sim.genome(id, seed, 0), plain, `${id} not plain at 0`);
    const distinct = new Set();
    for (let seed = 1; seed <= 60; seed += 1) distinct.add(sim.genome(id, seed, 1).map((v) => v.toFixed(3)).join(','));
    assert.ok(distinct.size > 50, `${id} draws only ${distinct.size} distinct genomes of 60`);
  }
});

test('the fluid projection reads the divergence and a pressure that is not its own target', () => {
  // the pass list is where a fluid goes wrong quietly: a sweep that overwrites
  // the divergence it is reading, or a final pass that projects with the pressure
  // it just wrote
  const def = sim.SIM_DEFS.fluid;
  assert.equal(def.scratch, 3);
  const passes = def.passes({ u_p1: [8, 8, 2, 1] }, 1);
  assert.equal(passes.length, 1 + 8 + 1);
  assert.equal(passes[0].pass, 0);
  assert.equal(passes[0].target, 'div');
  assert.equal(passes[passes.length - 1].pass, 2);
  assert.equal(passes[passes.length - 1].target, 'alt');
  // each sweep reads and writes the other pressure buffer, starting from a zeroed one
  for (let i = 1; i < passes.length - 1; i += 1) {
    const item = passes[i];
    assert.equal(item.pass, 1, `sweep ${i}`);
    assert.notEqual(item.target, item.press, `sweep ${i} reads the buffer it writes`);
    assert.notEqual(item.target, 'div', `sweep ${i} overwrites the divergence`);
  }
  // the projection reads the pressure the last sweep left behind
  const last = passes[passes.length - 2];
  assert.equal(passes[passes.length - 1].press, last.target, 'the step projects with the wrong pressure');
  // the iteration count is clamped into something the shader can run
  assert.equal(def.passes({ u_p1: [0, 999, 0, 0] }, 0).length, 1 + 24 + 1);
  assert.equal(def.passes({ u_p1: [0, 0, 0, 0] }, 0).length, 1 + 1 + 1);
  // the sweep count is genome slot 5, not the spin in slot 4
  const many = def.passes({ u_p1: [0.5, 7, 0, 0] }, 0);
  assert.equal(many.length, 1 + 7 + 1, 'the spin was read as the sweep count');
});

test('no pass of any simulation samples the buffer it writes', () => {
  // A sampler left pointing at the texture a pass renders into is a feedback
  // loop: the driver rejects the draw outright, so the fluid would never appear.
  // Every pass therefore names every buffer it reads.
  for (const id of sim.SIMS) {
    const def = sim.SIM_DEFS[id];
    const passLists = def.passes
      ? [0, 1, 2, 3, 8, 24].map((n) => def.passes({ u_p1: [0, n, 0, 0] }, 1))
      : [[{ pass: 0, target: 'alt', state: true }]];
    for (const passes of passLists) {
      for (const item of passes) {
        for (const key of ['div', 'press']) {
          if (item[key] == null) continue;
          assert.notEqual(item[key], item.target, `${id} pass ${item.pass} reads ${key} from the buffer it writes`);
        }
        // the live pair is written only by the last pass, which swaps it in
        assert.notEqual(item.target, 'state', `${id} pass ${item.pass} writes the live state in place`);
      }
    }
  }
});

// --- the field side ------------------------------------------------------------

test('each simulation is a field that draws its state texture', () => {
  for (const id of sim.SIMS) {
    assert.ok(fields.IDS.includes(id), `${id} is not a figure motif`);
    assert.equal(fields.simOf(id), id);
    const source = fields.fragment(id);
    assert.ok(source.startsWith('#version 300 es'), id);
    assert.ok(source.includes('vec4 fieldColor(vec2 p, float t)'), `${id} lacks fieldColor`);
    // it reads the simulation and leaves the lyrics their feathered window
    assert.ok(source.includes('u_sim'), `${id} does not sample the state`);
    assert.ok(source.includes('simLookup'), `${id} does not map the frame onto the grid`);
    assert.ok(source.includes('u_textBox'), `${id} does not keep clear of the lyrics`);
    // the closed form fields do not pretend to be simulations
    assert.equal(fields.simOf('fractal'), null);
  }
});

test('the field hands the simulation its own genome, so one seed drives state and colour', () => {
  for (const id of sim.SIMS) {
    assert.deepEqual(fields.genome(id, 7, 1), sim.genome(id, 7, 1), `${id} genome does not come from the simulation`);
  }
});

test('the sim uniform block reaches the shader, and the state texture has its own unit', () => {
  const u = fields.uniformsOf(
    { id: 'fluid', p: sim.genome('fluid', 4, 1), seed: 9, time: 1.5, opacity: 0.4, colors: COLORS, textBox: { x0: 0, y0: 0, x1: 100, y1: 50 } },
    { width: 1920, height: 1080 },
    () => [1, 0, 0]
  );
  // the grid is stretched over the frame, so the half-extent is the frame's own
  assert.deepEqual(u.u_simHalf, [1920 / 1080 * 0.5, 0.5]);
  assert.equal(u.u_time, 1.5);
  // the sampler is not a number: it is bound by the pipeline, never by a uniform
  assert.equal(u.u_sim, undefined);
});

// --- the figure plumbing -------------------------------------------------------

test('sim motifs plug into the figure pipeline and name the state they read', () => {
  assert.deepEqual(Array.from(figures.SIM_MOTIFS).sort(), sim.SIMS.slice().sort());
  for (const motif of figures.SIM_MOTIFS) {
    assert.ok(figures.MOTIFS.includes(motif));
    assert.ok(figures.FIELD_MOTIFS.includes(motif));
    const spec = figures.generate({ span: { start: 2, end: 14 }, beats: BEATS, motif, seed: 9, id: `s_${motif}`, axes: { weird: 1, energy: 0.5 } });
    assert.equal(spec.params.motif, motif);
    assert.ok(Number.isFinite(Number(spec.params.seed)));
    assert.equal(spec.params.rand, 1);
    const draw = (time) => figures.drawList(spec, {
      time,
      frame: { width: 1920, height: 1080 },
      clip: { key: 'c', start: 2, end: 14, spec },
      seed: 7,
      colors: COLORS,
      beats: BEATS,
    });
    const a = draw(4);
    const b = draw(4);
    assert.deepEqual(a, b, `${motif} is not deterministic`);
    assert.equal(a.shapes.length, 0);
    assert.ok(a.field && a.field.id === motif);
    assert.equal(a.field.sim.key, `c|${spec.params.seed}|1`);
    assert.ok(a.field.opacity > 0 && a.field.opacity <= 0.6, `${motif} opacity ${a.field.opacity}`);
    // the state is on the clip's own clock
    assert.ok(Math.abs(draw(9.5).field.time - 7.5) < 1e-9);
    // the state identity does not move with the playhead
    assert.equal(draw(11).field.sim.key, a.field.sim.key);
  }
});

test('the splat schedule is written down once, from the whole clip, not from the beats under the playhead', () => {
  const spec = figures.generate({ span: { start: 2, end: 14 }, beats: BEATS, motif: 'fluid', seed: 4, id: 'sb', axes: { weird: 1, energy: 0.5 } });
  assert.ok(Array.isArray(spec.params.simBeats), 'no frozen splat schedule');
  // seconds from the start of the clip, and inside it
  for (const at of spec.params.simBeats) {
    assert.ok(Number.isFinite(at) && at >= 0, `splat time ${at}`);
    assert.ok(at <= 12, `splat time ${at} is past the clip`);
  }
  assert.ok(spec.params.simBeats.length > 0, 'the schedule is empty');
  // the frozen times drive the splats: they are in the set of steps the sim hits
  const p = sim.genome('fluid', spec.params.seed, spec.params.rand);
  const steps = new Set();
  for (let step = 0; step < sim.stepOf(12); step += 1) {
    for (const s of sim.splatsAt(p, spec.params.seed, spec.params.simBeats, step) || []) {
      assert.ok(Number.isFinite(s.x) && s.x >= 0 && s.x <= 1);
      steps.add(step);
    }
  }
  assert.ok(steps.size > 0, 'no step splats at all');
  for (const at of spec.params.simBeats) assert.ok(steps.has(sim.stepOf(at)), `no splat on the beat at ${at}`);
  // a non-simulated field carries no schedule at all
  const plain = figures.generate({ span: { start: 2, end: 14 }, beats: BEATS, motif: 'fractal', seed: 4, id: 'np', axes: { weird: 1, energy: 0.5 } });
  assert.equal(plain.params.simBeats, undefined);
  assert.equal(figures.drawList(plain, { time: 4, frame: { width: 1920, height: 1080 }, clip: { key: 'c', start: 2, end: 14 }, seed: 7, colors: COLORS, beats: BEATS }).field.sim, undefined);
});

test('a sim motif never comes up on a plain run', () => {
  for (const motif of figures.SIM_MOTIFS) {
    for (let seed = 1; seed <= 40; seed += 1) {
      const spec = figures.generate({ span: { start: 0, end: 8 }, beats: [{ start: 0, end: 8 }], seed, id: `p${seed}`, axes: { weird: 0, energy: 0.5, fear: 0 } });
      assert.notEqual(spec.params.motif, motif, `${motif} was drawn at weird 0 (seed ${seed})`);
    }
  }
});

test('each sim sits at its own place in direction space, and the position follows the genome', () => {
  const positions = Array.from(figures.SIM_MOTIFS).map((motif) => figures.embedFigure(figures.generate({ span: { start: 2, end: 14 }, beats: BEATS, motif, seed: 3, id: `e_${motif}`, axes: { weird: 1, energy: 0.5 } })));
  for (const v of positions) assert.ok(v.every((x) => Number.isFinite(x) && x >= 0 && x <= 1));
  for (let i = 0; i < positions.length; i += 1) {
    for (let j = i + 1; j < positions.length; j += 1) {
      assert.ok(figures.figureDistance(positions[i], positions[j]) > 0.01, `two sims sit together`);
    }
  }
  const a = figures.generate({ span: { start: 2, end: 14 }, beats: BEATS, motif: 'cellular', seed: 1, id: 'c1', axes: { weird: 1, energy: 0.5 } });
  const b = figures.generate({ span: { start: 2, end: 14 }, beats: BEATS, motif: 'cellular', seed: 2, id: 'c2', axes: { weird: 1, energy: 0.5 } });
  assert.ok(figures.figureDistance(a, b) > 0);
});

test('energy 0 keeps a sim figure exactly, energy 1 moves away from it', () => {
  const previous = figures.generate({ span: { start: 2, end: 14 }, beats: BEATS, motif: 'reactionDiffusion', seed: 11, id: 'r', axes: { weird: 1, energy: 0.5 } });
  const same = figures.generate({ span: { start: 2, end: 14 }, beats: BEATS, seed: 12, id: 'n0', axes: { weird: 1, energy: 0 }, previous, energy: 0 });
  assert.equal(same.params.motif, 'reactionDiffusion');
  assert.equal(same.params.seed, previous.params.seed);
  const far = figures.generate({ span: { start: 2, end: 14 }, beats: BEATS, seed: 12, id: 'n1', axes: { weird: 1, energy: 1 }, previous, energy: 1 });
  assert.ok(figures.figureDistance(previous, far) > 0.2);
});

// --- the memory bound ----------------------------------------------------------

test('the keyframe budget is a minute per clip, and it is counted in bytes', () => {
  assert.equal(sim.RES, 256);
  assert.equal(sim.MAX_KEYS * sim.MAX_KEY_BYTES, 60 * 256 * 256 * 4 * 2);
  // a minute of keyframes is about 30 MB, which is the ceiling for one clip
  assert.ok(sim.MAX_KEYS * sim.MAX_KEY_BYTES <= 32 * 1024 * 1024);
  // a cold clip runs a bounded catch-up rather than the whole clip in one frame
  assert.ok(sim.CATCHUP_CAP >= sim.KEY_STEPS && sim.CATCHUP_CAP <= 600, `catch-up cap ${sim.CATCHUP_CAP}`);
});
