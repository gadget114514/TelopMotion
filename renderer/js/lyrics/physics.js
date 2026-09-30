(function (root, factory) {
  let warp = null;
  if (typeof module === 'object' && module.exports) {
    warp = require('./effects/warp');
    module.exports = factory(warp);
  } else {
    root.SA = root.SA || {};
    root.SA.physics = factory(root.SA.warp);
  }
})(typeof self !== 'undefined' ? self : this, function (warp) {
  'use strict';

  // ---------------------------------------------------------------------------
  // Soft-body physics core (pure, deterministic, no drawing / registry).
  //
  // One letter owns a N x N lattice of particles in *normalized* letter space
  // (the letter half-size is 1, the bbox spans -1..1 on both axes). The lattice
  // is integrated with Verlet at a fixed 1/120 s and projected with PBD
  // constraints (structural / shear / bend / area). Internal drives (pressure,
  // muscle, pulse, tremor, shapeTarget) are deterministic functions of the
  // simulation time and the lattice coordinates; external drives (rigid
  // acceleration, gravity, floor, beat kick) arrive in the `drive` argument.
  //
  // The module never reads wall-clock time: a simulation is a pure function of
  // its start state, its config and the drive timeline, so scrubbing backwards
  // is exact and a video export matches the preview.
  // ---------------------------------------------------------------------------

  const DT = 1 / 120;
  const ITERATIONS = 4;
  const CHECKPOINT_STEPS = 30; // 0.25 s
  const MAX_DISPLACEMENT = 0.8; // normalized; the safety clamp
  const TAU = Math.PI * 2;
  const EPS = 1e-6;

  function clamp(value, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return min;
    return number < min ? min : number > max ? max : number;
  }

  function clamp01(value) {
    return clamp(value, 0, 1);
  }

  function num(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback == null ? 0 : fallback;
  }

  // cheap deterministic value noise: the same (seed, index, time) always gives
  // the same value, independent of the stepping history
  function hash1(x) {
    const value = Math.sin(x * 12.9898) * 43758.5453;
    return value - Math.floor(value);
  }

  function noise3(seed, index, time) {
    const value = Math.sin(seed * 12.9898 + index * 78.233 + time * 37.719) * 43758.5453;
    return (value - Math.floor(value)) * 2 - 1;
  }

  // --- topology ---------------------------------------------------------------

  const topologies = new Map();

  function topologyOf(n) {
    if (topologies.has(n)) return topologies.get(n);
    const L0 = n > 1 ? 2 / (n - 1) : 2;
    const structural = [];
    const shear = [];
    const bend = [];
    const push = (list, a, b, scale) => list.push({ a, b, scale });
    for (let j = 0; j < n; j += 1) {
      for (let i = 0; i < n; i += 1) {
        const a = j * n + i;
        if (i + 1 < n) push(structural, a, a + 1, 1);
        if (j + 1 < n) push(structural, a, a + n, 1);
        if (i + 1 < n && j + 1 < n) {
          push(shear, a, a + n + 1, Math.SQRT2);
          push(shear, a + 1, a + n, Math.SQRT2);
        }
        if (i + 2 < n) push(bend, a, a + 2, 2);
        if (j + 2 < n) push(bend, a, a + 2 * n, 2);
      }
    }
    // the outer ring in order, for the shoelace area
    const ring = [];
    for (let i = 0; i < n; i += 1) ring.push(i);
    for (let j = 1; j < n; j += 1) ring.push(j * n + n - 1);
    for (let i = n - 2; i >= 0; i -= 1) ring.push((n - 1) * n + i);
    for (let j = n - 2; j > 0; j -= 1) ring.push(j * n);
    // the rest area of the unit square in normalized coordinates
    const area0 = 4;
    const topology = { n, L0, structural, shear, bend, ring, area0 };
    topologies.set(n, topology);
    return topology;
  }

  function createSim(grid) {
    const n = Math.max(3, Math.min(9, Math.round(num(grid, 5))));
    const count = n * n;
    const rest = new Float32Array(count * 2);
    const step = n > 1 ? 2 / (n - 1) : 0;
    for (let j = 0; j < n; j += 1) {
      for (let i = 0; i < n; i += 1) {
        const k = (j * n + i) * 2;
        rest[k] = n > 1 ? -1 + i * step : 0;
        rest[k + 1] = n > 1 ? -1 + j * step : 0;
      }
    }
    return {
      t: 0,
      steps: 0,
      grid: n,
      count,
      rest,
      nodes: rest.slice(),
      prev: rest.slice(),
      com: { x: 0, y: 0, vx: 0, vy: 0, rot: 0, vrot: 0 },
      _accel: new Float32Array(count * 2),
    };
  }

  function snapshot(sim) {
    return {
      steps: sim.steps,
      t: sim.t,
      com: { ...sim.com },
      nodes: sim.nodes.slice(),
      prev: sim.prev.slice(),
    };
  }

  function restore(sim, snap) {
    sim.steps = snap.steps;
    sim.t = snap.t;
    sim.com = { ...snap.com };
    sim.nodes.set(snap.nodes);
    sim.prev.set(snap.prev);
  }

  // --- drives -----------------------------------------------------------------

  function addNodeVelocity(sim, k, dvx, dvy, dt) {
    // in Verlet, adding velocity v means moving `prev` backwards by v*dt
    sim.prev[k] -= dvx * dt;
    sim.prev[k + 1] -= dvy * dt;
  }

  function bump(phase, center, width) {
    const t = (phase - center) / width;
    return Math.exp(-t * t * 4);
  }

  function pulseWave(phase) {
    const p = phase - Math.floor(phase);
    return bump(p, 0, 0.08) + 0.6 * bump(p, 0.18, 0.08);
  }

  // internal drive configuration -> per-step values
  function driveAmount(cfg, time, info) {
    const strength = num(cfg.strength, 0.2);
    const freq = Math.max(0.01, num(cfg.freq, 1.5));
    const mode = cfg.drive || 'pressure';
    if (mode === 'pressure') return { area: 1 + strength * Math.sin(TAU * freq * time) };
    if (mode === 'muscle') {
      const wave = (u, v) => {
        const dir = cfg.dir || 'u';
        const c = dir === 'v' ? v : dir === 'radial' ? Math.hypot(u, v) : u;
        return 1 + strength * Math.sin(TAU * (freq * time - c));
      };
      return { muscle: wave };
    }
    if (mode === 'pulse') {
      const playhead = time * freq;
      const cycle = Math.floor(playhead);
      const impulse = pulseWave(playhead);
      // re-fire only while the current cycle is fresh, so a long frame gap
      // cannot replay an old beat
      return playhead - cycle > 0.35 ? { impulse: 0 } : { impulse: impulse * strength };
    }
    if (mode === 'tremor') return { tremor: strength, tremorFreq: freq };
    if (mode === 'shapeTarget') {
      const shape = cfg.target || 'bend';
      const animated = animateShape(cfg, strength, freq, time, info);
      return { shape, amount: animated };
    }
    return {};
  }

  // The shape target reuses the warp animation timing: `pulse` breathes the
  // target, `sway` moves it through zero, and beat sync follows the tempo.
  function animateShape(cfg, strength, freq, time, info) {
    const animate = cfg.animate || 'pulse';
    const amount = Math.max(0, strength);
    if (warp && typeof warp.animateWarp === 'function') {
      const animated = warp.animateWarp(animate, amount, freq, time, cfg.sync || 'free', info, 0);
      return animated.amount;
    }
    const rate = cfg.sync === 'beat' && info && info.audioFeatures ? num(info.audioFeatures.bpm, 120) / 60 : freq;
    if (animate === 'sway') return amount * Math.sin(TAU * rate * time);
    return amount * (0.5 + 0.5 * Math.sin(TAU * rate * time));
  }

  function shapeTargetPoint(shape, u, v, amount) {
    // normalized target point for the five CPU warp shapes (the GLSL
    // counterparts live in gl/shaders.js deformOne)
    let x = u;
    let y = v;
    if (shape === 'bend') {
      const k = amount * Math.PI * 0.5;
      const radius = 1 / (Math.sign(k) * Math.max(Math.abs(k), 1e-4));
      const theta = k * u;
      x = Math.sin(theta) * radius;
      y = radius - Math.cos(theta) * radius + v;
    } else if (shape === 'bulge') {
      const r = Math.min(1, Math.hypot(u, v));
      const s = 1 + amount * (1 - r * r);
      x = u * s;
      y = v * s;
    } else if (shape === 'squash') {
      x = u * (1 + amount);
      y = v * (1 - amount);
    } else if (shape === 'stretch') {
      x = u * (1 - amount * 0.45);
      y = v * (1 + amount);
    } else if (shape === 'twist') {
      const angle = (amount * 90 * Math.PI) / 180 * v;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      x = u * c - v * s;
      y = u * s + v * c;
    }
    return { x, y };
  }

  // --- step -------------------------------------------------------------------

  function step(sim, cfg, drive, dt) {
    const n = sim.grid;
    const count = sim.count;
    const topo = topologyOf(n);
    const nodes = sim.nodes;
    const prev = sim.prev;
    const rest = sim.rest;
    const accel = sim._accel;
    const external = drive || {};
    const unit = external.unit || { x: 1, y: 1 };
    const unitX = Math.max(EPS, num(unit.x, 1));
    const unitY = Math.max(EPS, num(unit.y, 1));
    const gravity = num(cfg.gravity, 0);
    const inertia = clamp(cfg.inertia, 0, 1);
    const damping = clamp01(num(cfg.damping, 0.05));
    const kickAmount = num(external.kick, 0) * num(cfg.beatKick, 0);
    const time = sim.t;
    const internal = driveAmount(cfg, time, external);

    // 1. external accelerations (normalized units)
    accel.fill(0);
    const a = external.accel || {};
    const ax = num(a.x, 0);
    const ay = num(a.y, 0);
    const ar = (num(a.rot, 0) * Math.PI) / 180;
    for (let k = 0; k < count; k += 1) {
      const idx = k * 2;
      const u = rest[idx];
      const v = rest[idx + 1];
      let fx = 0;
      let fy = gravity;
      if (inertia > 0) {
        fx -= (inertia * ax) / unitX;
        fy -= (inertia * ay) / unitY;
        // rotational inertia: the tangential acceleration of the offset point
        fx += inertia * ar * (-v * unitY) / unitX;
        fy += inertia * ar * (u * unitX) / unitY;
      }
      if (kickAmount > 0) {
        const len = Math.hypot(u, v) || 1;
        fx += (u / len) * kickAmount;
        fy += (v / len) * kickAmount;
      }
      accel[idx] += fx;
      accel[idx + 1] += fy;
    }
    // pressure / pulse / tremor accelerations
    if (internal.impulse) {
      // an instantaneous radial velocity kick (heartbeat)
      for (let k = 0; k < count; k += 1) {
        const idx = k * 2;
        const len = Math.hypot(rest[idx], rest[idx + 1]) || 1;
        addNodeVelocity(sim, idx, (rest[idx] / len) * internal.impulse, (rest[idx + 1] / len) * internal.impulse, dt);
      }
    }
    if (internal.tremor) {
      const tf = (internal.tremorFreq || 1) * time;
      for (let k = 0; k < count; k += 1) {
        const idx = k * 2;
        accel[idx] += internal.tremor * noise3(1.7, k, tf);
        accel[idx + 1] += internal.tremor * noise3(3.1, k + 101, tf);
      }
    }

    // 2. Verlet integration
    const dt2 = dt * dt;
    for (let k = 0; k < count; k += 1) {
      const idx = k * 2;
      for (let c = 0; c < 2; c += 1) {
        const i = idx + c;
        const x = nodes[i];
        const p = prev[i];
        const next = x + (x - p) * (1 - damping) + accel[i] * dt2;
        prev[i] = x;
        nodes[i] = next;
      }
    }

    // 3. PBD constraints
    const k = 1 - Math.pow(1 - clamp01(num(cfg.stiffness, 0.7)), 1 / ITERATIONS);
    const areaK = clamp01(num(cfg.areaStiffness, 0.9));
    const areaTarget = topo.area0 * (internal.area == null ? 1 : internal.area);
    const muscle = internal.muscle || null;
    for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
      solveConstraints(nodes, rest, topo.structural, topo.L0, k, muscle, time, cfg);
      solveConstraints(nodes, rest, topo.shear, topo.L0, k * 0.8, muscle, time, cfg);
      solveConstraints(nodes, rest, topo.bend, topo.L0, k * 0.35, muscle, time, cfg);
      solveArea(nodes, topo.ring, areaTarget, iteration === ITERATIONS - 1 ? 1 : areaK);
    }

    // pinTop keeps the first row of the lattice at its rest position (gravity
    // then hangs the rest of the letter from it)
    if (cfg.pinTop) {
      for (let i = 0; i < n; i += 1) {
        nodes[i * 2] = rest[i * 2];
        nodes[i * 2 + 1] = rest[i * 2 + 1];
      }
    }

    // 4. shapeTarget: pull towards the CPU warp target
    if (internal.shape) {
      const follow = 1 - Math.exp(-Math.max(0.001, num(cfg.stiffness, 0.7)) * 6 * dt);
      for (let kk = 0; kk < count; kk += 1) {
        const idx = kk * 2;
        const target = shapeTargetPoint(internal.shape, rest[idx], rest[idx + 1], internal.amount);
        nodes[idx] += (target.x - nodes[idx]) * follow;
        nodes[idx + 1] += (target.y - nodes[idx + 1]) * follow;
      }
    }

    // 5. floor (lattice)
    const floor = external.floor;
    if (floor) {
      const floorY = num(floor.nodeY, Infinity);
      if (Number.isFinite(floorY)) {
        const restitution = num(cfg.restitution, 0.25);
        for (let kk = 0; kk < count; kk += 1) {
          const idx = kk * 2 + 1;
          if (nodes[idx] > floorY) {
            const velocity = nodes[idx] - prev[idx];
            nodes[idx] = floorY;
            // reflect only a downward velocity; an upward / resting point is
            // simply pinned (no jitter on the contact)
            prev[idx] = floorY + (velocity > 0 ? velocity * restitution : 0);
          }
        }
      }
    }

    // 6. safety: clamp the displacement and recover from NaN
    let maximum = 0;
    for (let kk = 0; kk < count; kk += 1) {
      const idx = kk * 2;
      let dx = nodes[idx] - rest[idx];
      let dy = nodes[idx + 1] - rest[idx + 1];
      const length = Math.hypot(dx, dy);
      if (!Number.isFinite(length) || !Number.isFinite(dx) || !Number.isFinite(dy)) {
        resetSim(sim);
        return;
      }
      if (length > MAX_DISPLACEMENT) {
        const scale = MAX_DISPLACEMENT / length;
        dx *= scale;
        dy *= scale;
        nodes[idx] = rest[idx] + dx;
        nodes[idx + 1] = rest[idx + 1] + dy;
      }
      const clamped = Math.min(length, MAX_DISPLACEMENT);
      if (clamped > maximum) maximum = clamped;
    }
    sim.lastMax = maximum;

    // 7. rigid body (com): gravity, kick, floor and rolling. A pinned top row
    // hangs the letter in place, so the com does not fall.
    const com = sim.com;
    const cy = num(floor && floor.comY, Infinity);
    com.vy += (cfg.pinTop ? 0 : gravity * unitY) * dt + (cfg.pinTop ? 0 : kickAmount * unitY * 0.5);
    com.vx *= 1 - damping * 0.1;
    com.vy *= 1 - damping * 0.1;
    com.x += com.vx * dt;
    com.y += com.vy * dt;
    com.rot += com.vrot * dt;
    com.vrot *= 1 - damping * 0.2;
    if (Number.isFinite(cy) && com.y >= cy) {
      com.y = cy;
      if (com.vy > 0) {
        com.vy = -num(cfg.restitution, 0.25) * com.vy;
        com.vx *= 1 - clamp01(num(cfg.friction, 0.35));
        // rolling: the contact point derives the angular velocity from vx
        com.vrot = (com.vx / Math.max(1, unitY)) * (180 / Math.PI) * 0.5;
        if (Math.abs(com.vy) < unitY * 0.02) com.vy = 0;
      }
    }
  }

  function solveConstraints(nodes, rest, list, baseLength, k, muscle, time, cfg) {
    for (let index = 0; index < list.length; index += 1) {
      const c = list[index];
      const ia = c.a * 2;
      const ib = c.b * 2;
      const ax = nodes[ia];
      const ay = nodes[ia + 1];
      const bx = nodes[ib];
      const by = nodes[ib + 1];
      let dx = bx - ax;
      let dy = by - ay;
      const distance = Math.hypot(dx, dy);
      if (distance < EPS) continue;
      let restLength = baseLength * c.scale;
      if (muscle) {
        const mu = (rest[ia] + rest[ib]) * 0.5;
        const mv = (rest[ia + 1] + rest[ib + 1]) * 0.5;
        restLength *= muscle(mu, mv);
      }
      const difference = ((distance - restLength) / distance) * 0.5 * k;
      dx *= difference;
      dy *= difference;
      nodes[ia] += dx;
      nodes[ia + 1] += dy;
      nodes[ib] -= dx;
      nodes[ib + 1] -= dy;
    }
  }

  function solveArea(nodes, ring, target, k) {
    let area = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < ring.length; i += 1) {
      const a = ring[i] * 2;
      const b = ring[(i + 1) % ring.length] * 2;
      area += nodes[a] * nodes[b + 1] - nodes[b] * nodes[a + 1];
      cx += nodes[a];
      cy += nodes[a + 1];
    }
    area *= 0.5;
    if (!(Math.abs(area) > EPS)) return;
    cx /= ring.length;
    cy /= ring.length;
    // move the boundary along its normal (a scale about the centroid)
    const ratio = Math.sqrt(Math.max(EPS, target / Math.abs(area)));
    const scale = 1 + (ratio - 1) * k;
    for (let i = 0; i < ring.length; i += 1) {
      const a = ring[i] * 2;
      nodes[a] = cx + (nodes[a] - cx) * scale;
      nodes[a + 1] = cy + (nodes[a + 1] - cy) * scale;
    }
  }

  function resetSim(sim) {
    sim.nodes.set(sim.rest);
    sim.prev.set(sim.rest);
    sim.com.x = 0;
    sim.com.y = 0;
    sim.com.vx = 0;
    sim.com.vy = 0;
    sim.com.rot = 0;
    sim.com.vrot = 0;
  }

  // --- outputs ----------------------------------------------------------------

  function output(sim, cfg) {
    const count = sim.count;
    const lattice = new Float32Array(count * 2);
    let maximum = 0;
    for (let k = 0; k < count; k += 1) {
      const idx = k * 2;
      const dx = sim.nodes[idx] - sim.rest[idx];
      const dy = sim.nodes[idx + 1] - sim.rest[idx + 1];
      lattice[idx] = dx;
      lattice[idx + 1] = dy;
      const length = Math.hypot(dx, dy);
      if (length > maximum) maximum = length;
    }
    return {
      dx: sim.com.x,
      dy: sim.com.y,
      rot: sim.com.rot,
      com: { ...sim.com },
      lattice,
      maxDisp: maximum,
      active: maximum > 1e-4,
      t: sim.t,
    };
  }

  // --- timeline simulation ----------------------------------------------------

  function simulateTo(cache, key, t, cfg, options) {
    const opts = options || {};
    const dt = opts.dt || DT;
    const maxT = opts.maxT == null ? Infinity : Math.max(0, num(opts.maxT, 0));
    const targetT = Math.max(0, Math.min(maxT, num(t, 0)));
    let entry = cache.get(key);
    if (!entry) {
      const sim = createSim(cfg && cfg.grid);
      entry = { sim, checkpoints: new Map() };
      // a phase that starts displaced (gravityDrop starts `height` above the
      // rest position) seeds the com once, when the entry is created
      if (opts.initial) {
        for (const key2 of ['x', 'y', 'rot', 'vx', 'vy', 'vrot']) {
          if (opts.initial[key2] != null) sim.com[key2] = num(opts.initial[key2], 0);
        }
      }
      cache.set(key, entry);
    }
    const targetSteps = Math.max(0, Math.round(targetT / dt));
    if (targetSteps < entry.sim.steps) {
      // rewind: restore the closest checkpoint at or before the target
      let best = null;
      for (const [step, snap] of entry.checkpoints) {
        if (step <= targetSteps && (!best || step > best.step)) best = { step, snap };
      }
      if (best) restore(entry.sim, best.snap);
      else {
        const fresh = createSim(cfg && cfg.grid);
        entry.sim = fresh;
      }
    }
    while (entry.sim.steps < targetSteps) {
      const time = entry.sim.steps * dt;
      const drive = typeof opts.driveAt === 'function' ? opts.driveAt(time, entry.sim) : opts.drive;
      step(entry.sim, cfg || {}, drive, dt);
      entry.sim.steps += 1;
      entry.sim.t = entry.sim.steps * dt;
      if (entry.sim.steps % CHECKPOINT_STEPS === 0) entry.checkpoints.set(entry.sim.steps, snapshot(entry.sim));
    }
    // keep the checkpoint map bounded for very long beats
    if (entry.checkpoints.size > 512) {
      const keep = entry.checkpoints.get(entry.sim.steps);
      entry.checkpoints.clear();
      if (keep) entry.checkpoints.set(entry.sim.steps, keep);
    }
    return output(entry.sim, cfg);
  }

  // --- onsets -----------------------------------------------------------------

  const onsetCache = new WeakMap();

  function onsetTimes(analysis) {
    if (!analysis || !Array.isArray(analysis.frames) || !analysis.frames.length) return null;
    if (onsetCache.has(analysis)) return onsetCache.get(analysis);
    const frames = analysis.frames;
    const fps = num(analysis.fps, 30) || 30;
    const flux = new Float32Array(frames.length);
    let sum = 0;
    let count = 0;
    for (let i = 1; i < frames.length; i += 1) {
      const value = Math.max(0, num(frames[i].rms) - num(frames[i - 1].rms));
      flux[i] = value;
      sum += value;
      count += 1;
    }
    const mean = count ? sum / count : 0;
    let variance = 0;
    if (count) {
      for (let i = 1; i < frames.length; i += 1) variance += (flux[i] - mean) ** 2;
      variance /= count;
    }
    const threshold = mean + Math.sqrt(variance) * 0.8 + 1e-5;
    const times = [];
    let last = -Infinity;
    for (let i = 2; i < frames.length - 1; i += 1) {
      if (flux[i] < threshold || flux[i] < flux[i - 1] || flux[i] < flux[i + 1]) continue;
      const time = i / fps;
      if (time - last < 0.12) continue;
      times.push(time);
      last = time;
    }
    onsetCache.set(analysis, times);
    return times;
  }

  // bpm grid fallback (no analysis)
  function beatGrid(bpm, duration) {
    const rate = Math.max(0.05, num(bpm, 120) / 60);
    const times = [];
    for (let time = 0; time <= duration + EPS; time += 1 / rate) times.push(time);
    return times;
  }

  // the strongest onset inside the (t - dt, t] window, 0 when there is none
  function kickAt(onsets, t, dt) {
    if (!onsets || !onsets.length) return 0;
    const from = t - (dt || 0);
    for (let i = onsets.length - 1; i >= 0; i -= 1) {
      const time = onsets[i];
      if (time > t) continue;
      if (time <= from) break;
      return 1;
    }
    return 0;
  }

  return {
    DT,
    ITERATIONS,
    CHECKPOINT_STEPS,
    MAX_DISPLACEMENT,
    createSim,
    step,
    snapshot,
    restore,
    output,
    simulateTo,
    onsetTimes,
    beatGrid,
    kickAt,
    topologyOf,
    shapeTargetPoint,
    _test: { driveAmount, noise3, solveArea, MAX_DISPLACEMENT },
  };
});
