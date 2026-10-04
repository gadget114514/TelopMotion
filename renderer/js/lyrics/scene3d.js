(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rng'));
  else {
    root.SA = root.SA || {};
    root.SA.scene3d = factory(root.SA.rng);
  }
})(typeof self !== 'undefined' ? self : this, function (rng) {
  'use strict';

  // Pseudo-3D figure scenes: a camera, a projection and a handful of physical
  // systems (planets, n-body, pendulums, a gravity well, polyhedra, attractors,
  // knots, a starfield) that all end up as the plain 2D shapes the shape pass
  // draws. Everything is a pure function of (seed, level, clip time): the
  // systems that need integration are integrated once at a fixed step, cached by
  // key, and read back by time, so scrubbing and exporting agree.
  //
  // The randomness level (weird) works as in the procedural motif: every
  // parameter is drawn from its full range, then slid to a plain default as the
  // level falls (numbers), or kept with probability `level` (names and flags).

  const TAU = Math.PI * 2;
  const SCENES = ['solarSystem', 'nbody', 'pendulum', 'pendulumWave', 'newtonCradle', 'chain', 'gravityWell', 'polyhedra', 'attractor', 'knot', 'starfield'];
  const CAMERA_KINDS = ['static', 'orbit', 'dolly', 'push', 'crane', 'whip', 'handheld'];
  const SHAPE_CAP = 440;

  function clamp(value, lo, hi) {
    return Math.max(lo, Math.min(hi, value));
  }

  function smooth(t) {
    const x = clamp(t, 0, 1);
    return x * x * (3 - 2 * x);
  }

  // ---------------------------------------------------------------------------
  // drawing tools

  function tools(seed, name, level) {
    const draw = rng.rngFor(seed, 'scene', name);
    const gate = rng.rngFor(seed, 'scene-gate', name);
    const lvl = clamp(level == null ? 1 : level, 0, 1);
    return {
      level: lvl,
      draw,
      range(plain, lo, hi) {
        const v = lo + (hi - lo) * draw();
        return plain + (v - plain) * lvl;
      },
      int(plain, lo, hi) {
        const v = lo + Math.floor(draw() * (hi - lo + 1));
        return Math.round(plain + (v - plain) * lvl);
      },
      pick(plain, list) {
        const v = list[Math.min(list.length - 1, Math.floor(draw() * list.length))];
        return gate() < lvl ? v : plain;
      },
      chance(plain, p) {
        const v = draw() < p;
        return gate() < lvl ? v : plain;
      },
    };
  }

  function cameraGenome(T) {
    return {
      kind: T.pick('static', CAMERA_KINDS),
      az0: T.range(0.7, 0, TAU),
      elev0: T.range(0.5, 0.08, 0.95),
      fov: T.range(55, 38, 90),
      dist: T.range(1, 0.85, 1.35),
      azSpeed: T.range(0.14, -0.5, 0.5),
      elevAmp: T.range(0.2, 0.08, 0.45),
      elevFreq: T.range(0.35, 0.2, 0.7),
      dollyAmp: T.range(0.2, 0.1, 0.4),
      roll: T.range(0, 0, 0.3),
      shake: T.range(0, 0.006, 0.03),
    };
  }

  // A camera at time t: project(p) -> { x, y, s, z, fog } or null behind the lens.
  function cameraAt(g, t, frame) {
    const half = Math.tan((g.fov * Math.PI) / 360);
    // the camera stands where the scene's bounding sphere (radius ~1.25) fills
    // about half the frame, whatever the lens: a wide lens comes closer
    const base = (1.2 * g.dist) / Math.sin((g.fov * Math.PI) / 360);
    let az = g.az0;
    let elev = g.elev0;
    let dist = base;
    let roll = 0;
    let jx = 0;
    let jy = 0;
    let jz = 0;
    if (g.kind === 'orbit') az += g.azSpeed * t;
    else if (g.kind === 'dolly') {
      az += g.azSpeed * 0.3 * t;
      dist = base * (1 + g.dollyAmp * Math.sin(0.55 * t));
    } else if (g.kind === 'push') {
      const u = Math.abs((((t / 9) % 2) + 2) % 2 - 1);
      dist = base * (1.4 - 0.7 * smooth(u));
      az += g.azSpeed * 0.15 * t;
    } else if (g.kind === 'crane') {
      elev = g.elev0 + g.elevAmp * Math.sin(g.elevFreq * t * 2);
      az += g.azSpeed * 0.2 * t;
    } else if (g.kind === 'whip') {
      const step = Math.floor(t / 2.4);
      const into = smooth((t - step * 2.4) / 0.45);
      az += (step + into) * (1.1 * Math.sign(g.azSpeed || 1));
    } else if (g.kind === 'handheld') {
      az += g.azSpeed * 0.1 * t;
      jx = g.shake * (Math.sin(2.3 * t) + 0.6 * Math.sin(5.1 * t + 1)) * base;
      jy = g.shake * (Math.sin(1.9 * t + 2) + 0.6 * Math.sin(4.3 * t)) * base;
      jz = g.shake * 0.5 * Math.sin(3.1 * t + 4) * base;
      roll = g.roll * Math.sin(0.9 * t);
    }
    if (g.kind !== 'handheld') roll = g.roll * 0.4 * Math.sin(0.4 * t);
    const ce = Math.cos(elev);
    const pos = [dist * ce * Math.cos(az) + jx, dist * Math.sin(elev) + jy, dist * ce * Math.sin(az) + jz];
    // look at the origin: forward, right, up
    let fx = -pos[0];
    let fy = -pos[1];
    let fz = -pos[2];
    const fl = Math.hypot(fx, fy, fz) || 1;
    fx /= fl;
    fy /= fl;
    fz /= fl;
    // right = forward x world-up, up = right x forward
    let rx = -fz;
    let rz = fx;
    const rl = Math.hypot(rx, rz) || 1;
    rx /= rl;
    rz /= rl;
    const upx = -rz * fy;
    const upy = rz * fx - rx * fz;
    const upz = rx * fy;
    const cr = Math.cos(roll);
    const sr = Math.sin(roll);
    const focal = frame.short / 2 / half;
    const near = 0.05;
    const zNear = dist - 1.4;
    const zSpan = 2.8;
    return {
      focal,
      project(p) {
        const dx = p[0] - pos[0];
        const dy = p[1] - pos[1];
        const dz = p[2] - pos[2];
        const z = dx * fx + dy * fy + dz * fz;
        if (z <= near) return null;
        let x = dx * rx + dz * rz;
        let y = dx * upx + dy * upy + dz * upz;
        const xr = x * cr - y * sr;
        const yr = x * sr + y * cr;
        const s = focal / z;
        return { x: frame.cx + xr * s, y: frame.cy - yr * s, s, z, fog: clamp(1.1 - 0.55 * ((z - zNear) / zSpan), 0.22, 1) };
      },
    };
  }

  // Collects projected dots and segments, then emits them far-to-near as plain shapes.
  function stage(args, cam) {
    const items = [];
    const alphaOf = (a, fog) => Math.max(0.05, Math.min(1, a * fog * args.opacity));
    return {
      dot(p, r, ci, alpha, ring, thick) {
        const q = cam.project(p);
        if (!q || items.length >= SHAPE_CAP) return;
        items.push({ z: q.z, kind: ring ? 'ring' : 'circle', x: q.x, y: q.y, r: Math.max(0.7, r * q.s * args.grow), thick: Math.max(1, (thick || 0.012) * q.s * args.grow), ci, a: alphaOf(alpha == null ? 1 : alpha, q.fog) });
      },
      seg(p, p2, w, ci, alpha) {
        const a = cam.project(p);
        const b = cam.project(p2);
        if (!a || !b || items.length >= SHAPE_CAP) return;
        items.push({ z: (a.z + b.z) / 2, kind: 'capsule', x0: a.x, y0: a.y, x1: b.x, y1: b.y, w: Math.max(1.2, 1.8 * w * ((a.s + b.s) / 2) * args.grow), ci, a: alphaOf(alpha == null ? 1 : alpha, (a.fog + b.fog) / 2) });
      },
      shapes() {
        items.sort((u, v) => v.z - u.z);
        const out = [];
        for (const it of items) {
          const color = args.color(it.ci);
          if (it.kind === 'capsule') out.push({ kind: 'capsule', x0: it.x0, y0: it.y0, x1: it.x1, y1: it.y1, width: it.w, color, opacity: it.a });
          else if (it.kind === 'ring') out.push({ kind: 'ring', x: it.x, y: it.y, r: it.r, thickness: it.thick, color, opacity: it.a });
          else out.push({ kind: 'circle', x: it.x, y: it.y, r: it.r, color, opacity: it.a });
        }
        return out;
      },
      count() {
        return items.length;
      },
    };
  }

  // scene-grown scale about the origin: the pop-in of the figure
  function scaled(p, k) {
    return [p[0] * k, p[1] * k, p[2] * k];
  }

  // ---------------------------------------------------------------------------
  // integration cache

  const cache = new Map();
  function cached(key, build) {
    if (cache.has(key)) {
      const hit = cache.get(key);
      cache.delete(key);
      cache.set(key, hit);
      return hit;
    }
    const value = build();
    cache.set(key, value);
    while (cache.size > 24) cache.delete(cache.keys().next().value);
    return value;
  }

  // frame i of a 60 Hz sample array that loops every `count` frames, linear in between
  function sampleAt(samples, count, t, per) {
    const f = (((t * 60) % count) + count) % count;
    const i = Math.floor(f);
    const j = (i + 1) % count;
    const u = f - i;
    const out = new Array(per);
    for (let k = 0; k < per; k += 1) out[k] = samples[i * per + k] * (1 - u) + samples[j * per + k] * u;
    return out;
  }

  function rotY(p, a) {
    const c = Math.cos(a);
    const s = Math.sin(a);
    return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
  }

  function rotX(p, a) {
    const c = Math.cos(a);
    const s = Math.sin(a);
    return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c];
  }

  function rotZ(p, a) {
    const c = Math.cos(a);
    const s = Math.sin(a);
    return [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]];
  }

  // ---------------------------------------------------------------------------
  // scenes

  function solarSystem(T, args, cam, st, t) {
    const speed = T.range(1, 0.5, 1.8);
    const n = T.int(4, 3, 7);
    const spacing = T.range(0.17, 0.12, 0.22);
    const sunR = T.range(0.12, 0.08, 0.2);
    const orbitLines = T.chance(true, 0.75);
    const comet = T.chance(false, 0.4);
    const tilt = T.range(0, 0, 0.6);
    const yaw = T.range(0, 0, TAU);
    const planets = [];
    for (let i = 0; i < n; i += 1) {
      planets.push({
        a: 0.38 + i * spacing + T.range(0, 0, 0.05),
        e: T.range(0.02, 0, 0.5),
        inc: T.range(0, -0.5, 0.5) * (0.4 + tilt),
        node: T.range(0, 0, TAU),
        peri: T.range(0, 0, TAU),
        m0: T.range(i, 0, TAU),
        r: T.range(0.035, 0.018, 0.07),
        moon: T.chance(false, 0.4),
        moonR: T.range(0.1, 0.07, 0.17),
        moonP: T.range(2, 1, 3.5),
        ringed: T.chance(false, 0.25),
      });
    }
    const place = (pl, M) => {
      let E = M;
      for (let k = 0; k < 6; k += 1) E = M + pl.e * Math.sin(E);
      const x = pl.a * (Math.cos(E) - pl.e);
      const z = pl.a * Math.sqrt(1 - pl.e * pl.e) * Math.sin(E);
      let p = [x, 0, z];
      p = rotY(p, pl.peri);
      p = rotX(p, pl.inc);
      p = rotY(p, pl.node + yaw);
      return p;
    };
    // the Sun
    st.dot([0, 0, 0], sunR, 0, 1);
    st.dot([0, 0, 0], sunR * 1.55, 0, 0.35, true, 0.012);
    planets.forEach((pl, i) => {
      const period = (7 * Math.pow(pl.a / 0.5, 1.5)) / speed;
      if (orbitLines) {
        const S = 30;
        let prev = place(pl, 0);
        for (let k = 1; k <= S; k += 1) {
          const cur = place(pl, (k / S) * TAU);
          st.seg(scaled(prev, 1), scaled(cur, 1), 0.0032, 1 + (i % 4), 0.32);
          prev = cur;
        }
      }
      const M = pl.m0 + (TAU * t) / period;
      const pos = place(pl, M);
      st.dot(pos, pl.r, 1 + (i % 4), 1);
      if (pl.ringed) {
        let prev = null;
        for (let k = 0; k <= 14; k += 1) {
          const a = (k / 14) * TAU;
          const q = [pos[0] + Math.cos(a) * pl.r * 1.9, pos[1] + Math.sin(a) * pl.r * 0.35, pos[2] + Math.sin(a) * pl.r * 1.9];
          if (prev) st.seg(prev, q, 0.004, 2, 0.8);
          prev = q;
        }
      }
      if (pl.moon) {
        const ma = (TAU * t) / (pl.moonP / speed) + i;
        st.dot([pos[0] + Math.cos(ma) * pl.moonR, pos[1] + Math.sin(ma * 0.7) * pl.moonR * 0.4, pos[2] + Math.sin(ma) * pl.moonR], pl.r * 0.35, 4, 0.9);
      }
    });
    if (comet) {
      const pl = { a: 1.1, e: 0.82, inc: 0.5, node: 1, peri: 2, m0: 0.5 };
      const period = 26 / speed;
      for (let k = 0; k < 9; k += 1) {
        const p = place(pl, pl.m0 + (TAU * (t - k * 0.09)) / period);
        st.dot(p, 0.03 * (1 - k / 10), 3, 0.8 - k * 0.08);
      }
    }
  }

  function nbodyTrajectory(seed, kind, n, variant) {
    const key = `nbody|${seed}|${kind}|${n}|${variant}`;
    return cached(key, () => {
      const r = rng.rngFor(seed, 'nbody', variant);
      const m = [];
      const p = [];
      const v = [];
      if (kind === 'eight') {
        m.push(1, 1, 1);
        p.push([0.97000436, -0.24308753, 0], [-0.97000436, 0.24308753, 0], [0, 0, 0]);
        v.push([0.46620369, 0.43236573, 0], [0.46620369, 0.43236573, 0], [-0.93240737, -0.86473146, 0]);
      } else if (kind === 'ring') {
        let s = 0;
        for (let k = 1; k < n; k += 1) s += 1 / Math.sin((Math.PI * k) / n);
        const speed = Math.sqrt(s / 4);
        for (let i = 0; i < n; i += 1) {
          const a = (i / n) * TAU;
          m.push(1);
          p.push([Math.cos(a), Math.sin(a), 0.02 * (r() - 0.5)]);
          v.push([-Math.sin(a) * speed, Math.cos(a) * speed, 0]);
        }
      } else {
        for (let i = 0; i < n; i += 1) {
          m.push(0.6 + r() * 0.9);
          const u = r() * TAU;
          const w = Math.acos(2 * r() - 1);
          const rad = 0.3 + 0.6 * Math.cbrt(r());
          p.push([rad * Math.sin(w) * Math.cos(u), rad * Math.sin(w) * Math.sin(u), rad * Math.cos(w)]);
          v.push([(r() - 0.5) * 0.7, (r() - 0.5) * 0.7, (r() - 0.5) * 0.7]);
        }
      }
      const N = m.length;
      // zero the centre of mass motion
      const total = m.reduce((a, b) => a + b, 0);
      const com = [0, 0, 0];
      const cv = [0, 0, 0];
      for (let i = 0; i < N; i += 1) for (let k = 0; k < 3; k += 1) {
        com[k] += (m[i] * p[i][k]) / total;
        cv[k] += (m[i] * v[i][k]) / total;
      }
      for (let i = 0; i < N; i += 1) for (let k = 0; k < 3; k += 1) {
        p[i][k] -= com[k];
        v[i][k] -= cv[k];
      }
      const eps2 = 0.06 * 0.06;
      const acc = () => p.map((pi, i) => {
        const a = [0, 0, 0];
        for (let j = 0; j < N; j += 1) {
          if (j === i) continue;
          const dx = p[j][0] - pi[0];
          const dy = p[j][1] - pi[1];
          const dz = p[j][2] - pi[2];
          const d2 = dx * dx + dy * dy + dz * dz + eps2;
          const inv = m[j] / (d2 * Math.sqrt(d2));
          a[0] += dx * inv;
          a[1] += dy * inv;
          a[2] += dz * inv;
        }
        return a;
      });
      const dt = 1 / 240;
      const frames = 60 * 40;
      const samples = new Float32Array(frames * N * 3);
      let a = acc();
      for (let f = 0; f < frames; f += 1) {
        for (let i = 0; i < N; i += 1) for (let k = 0; k < 3; k += 1) samples[(f * N + i) * 3 + k] = p[i][k];
        for (let s = 0; s < 4; s += 1) {
          for (let i = 0; i < N; i += 1) for (let k = 0; k < 3; k += 1) {
            v[i][k] += 0.5 * dt * a[i][k];
            p[i][k] += dt * v[i][k];
          }
          a = acc();
          for (let i = 0; i < N; i += 1) for (let k = 0; k < 3; k += 1) v[i][k] += 0.5 * dt * a[i][k];
        }
      }
      // auto-framing: the scene is scaled by the (smoothed) RMS radius of the
      // bodies, so a cluster that collapses or a body that is thrown out never
      // leaves the view empty
      const rms = new Float32Array(frames);
      for (let f = 0; f < frames; f += 1) {
        let sum = 0;
        for (let i = 0; i < N; i += 1) sum += samples[(f * N + i) * 3] ** 2 + samples[(f * N + i) * 3 + 1] ** 2 + samples[(f * N + i) * 3 + 2] ** 2;
        rms[f] = Math.sqrt(sum / N);
      }
      const smoothed = new Float32Array(frames);
      const win = 45;
      for (let f = 0; f < frames; f += 1) {
        let sum = 0;
        for (let k = -win; k <= win; k += 1) sum += rms[(((f + k) % frames) + frames) % frames];
        smoothed[f] = sum / (2 * win + 1);
      }
      return { samples, frames, N, m, rms: smoothed };
    });
  }

  function nbody(T, args, cam, st, t) {
    const kind = T.pick('eight', ['eight', 'ring', 'chaos']);
    const n = kind === 'eight' ? 3 : T.int(4, 3, 8);
    const speed = T.range(1, 0.6, 1.6);
    const trail = T.int(24, 14, 44);
    const tiltX = T.range(0.4, 0, 1.2);
    const tiltY = T.range(0, 0, TAU);
    const tr = nbodyTrajectory(args.seed, kind, n, args.variant % 2);
    const at = (tt, i) => {
      const s = sampleAt(tr.samples, tr.frames, tt, tr.N * 3);
      const radius = sampleAt(tr.rms, tr.frames, tt, 1)[0];
      const fit = 1 / clamp(radius * 1.1, 0.25, 4);
      return rotY(rotX([s[i * 3] * fit, s[i * 3 + 1] * fit, s[i * 3 + 2] * fit], tiltX), tiltY);
    };
    for (let i = 0; i < tr.N; i += 1) {
      let prev = at(t * speed, i);
      const size = 0.03 + 0.03 * Math.sqrt(tr.m[i]);
      for (let k = 1; k <= trail; k += 1) {
        const cur = at(t * speed - (k * 2) / 60, i);
        st.seg(prev, cur, 0.0055 * (1 - k / (trail + 4)), i, 0.85 * (1 - k / (trail + 2)));
        prev = cur;
      }
      st.dot(at(t * speed, i), size, i, 1);
    }
  }

  // N-link planar pendulum: angles and velocities integrated at 240 Hz (RK4)
  function pendulumTrajectory(seed, links, lens, masses, start, damping) {
    const key = `pend|${seed}|${links}|${lens.join(',')}|${masses.join(',')}|${start.join(',')}|${damping}`;
    return cached(key, () => {
      const N = links;
      const G = 9.81;
      const deriv = (th, om) => {
        const M = [];
        const rhs = [];
        for (let i = 0; i < N; i += 1) {
          M.push(new Array(N).fill(0));
          let load = 0;
          for (let k = i; k < N; k += 1) load += masses[k];
          for (let j = 0; j < N; j += 1) {
            let mm = 0;
            for (let k = Math.max(i, j); k < N; k += 1) mm += masses[k];
            M[i][j] = mm * lens[i] * lens[j] * Math.cos(th[i] - th[j]);
          }
          let f = -G * lens[i] * Math.sin(th[i]) * load - damping * om[i] * load * lens[i] * lens[i];
          for (let j = 0; j < N; j += 1) {
            let mm = 0;
            for (let k = Math.max(i, j); k < N; k += 1) mm += masses[k];
            f -= mm * lens[i] * lens[j] * Math.sin(th[i] - th[j]) * om[j] * om[j];
          }
          rhs.push(f);
        }
        // Gaussian elimination with partial pivoting
        const A = M.map((row, i) => [...row, rhs[i]]);
        for (let c = 0; c < N; c += 1) {
          let piv = c;
          for (let r = c + 1; r < N; r += 1) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
          [A[c], A[piv]] = [A[piv], A[c]];
          const d = A[c][c] || 1e-9;
          for (let r = c + 1; r < N; r += 1) {
            const k = A[r][c] / d;
            for (let q = c; q <= N; q += 1) A[r][q] -= k * A[c][q];
          }
        }
        const acc = new Array(N).fill(0);
        for (let i = N - 1; i >= 0; i -= 1) {
          let s = A[i][N];
          for (let q = i + 1; q < N; q += 1) s -= A[i][q] * acc[q];
          acc[i] = s / (A[i][i] || 1e-9);
        }
        return { dth: om.slice(), dom: acc };
      };
      let th = start.slice();
      let om = new Array(N).fill(0);
      const dt = 1 / 120;
      const frames = 60 * 30;
      const samples = new Float32Array(frames * N);
      const add = (a, b, k) => a.map((v, i) => v + b[i] * k);
      for (let f = 0; f < frames; f += 1) {
        for (let i = 0; i < N; i += 1) samples[f * N + i] = th[i];
        for (let s = 0; s < 2; s += 1) {
          const k1 = deriv(th, om);
          const k2 = deriv(add(th, k1.dth, dt / 2), add(om, k1.dom, dt / 2));
          const k3 = deriv(add(th, k2.dth, dt / 2), add(om, k2.dom, dt / 2));
          const k4 = deriv(add(th, k3.dth, dt), add(om, k3.dom, dt));
          th = th.map((v, i) => v + (dt / 6) * (k1.dth[i] + 2 * k2.dth[i] + 2 * k3.dth[i] + k4.dth[i]));
          om = om.map((v, i) => v + (dt / 6) * (k1.dom[i] + 2 * k2.dom[i] + 2 * k3.dom[i] + k4.dom[i]));
        }
      }
      return { samples, frames, N };
    });
  }

  function pendulum(T, args, cam, st, t) {
    const links = T.int(1, 1, 3);
    const copies = T.int(1, 1, 4);
    const yaw = T.range(0.4, 0, TAU);
    const speed = T.range(1, 0.6, 1.5);
    const spread = T.range(0, 0.0015, 0.02);
    const trail = T.int(30, 20, 70);
    const lens = [];
    const masses = [];
    for (let i = 0; i < links; i += 1) {
      lens.push((T.range(0.7, 0.45, 1) * 1.15) / links);
      masses.push(T.range(1, 0.6, 1.8));
    }
    const amp = T.range(0.9, 1.5, 3.1);
    for (let c = 0; c < copies; c += 1) {
      const start = [];
      for (let i = 0; i < links; i += 1) start.push((i % 2 ? -1 : 1) * amp * (1 - 0.15 * i) + c * spread);
      const tr = pendulumTrajectory(args.seed, links, lens, masses, start, 0.0005);
      const pos = (tt) => {
        const th = sampleAt(tr.samples, tr.frames, tt, tr.N);
        const out = [[0, 0.7, 0]];
        let x = 0;
        let y = 0.7;
        for (let i = 0; i < links; i += 1) {
          x += lens[i] * Math.sin(th[i]);
          y -= lens[i] * Math.cos(th[i]);
          out.push([x, y, 0]);
        }
        return out.map((q) => rotY(q, yaw));
      };
      const now = pos(t * speed);
      // trail of the last bob
      let prev = now[links];
      for (let k = 1; k <= trail; k += 1) {
        const cur = pos(t * speed - k / 60)[links];
        st.seg(prev, cur, 0.0045 * (1 - k / (trail + 6)), 1 + (c % 4), 0.8 * (1 - k / (trail + 3)));
        prev = cur;
      }
      for (let i = 0; i < links; i += 1) st.seg(now[i], now[i + 1], 0.0065, 0, 0.9);
      for (let i = 1; i <= links; i += 1) st.dot(now[i], 0.028 + 0.012 * Math.sqrt(masses[i - 1]), 1 + ((c + i) % 4), 1);
    }
    st.dot(rotY([0, 0.7, 0], yaw), 0.02, 0, 1);
    st.seg(rotY([-0.35, 0.7, 0], yaw), rotY([0.35, 0.7, 0], yaw), 0.011, 0, 0.7);
  }

  function pendulumWave(T, args, cam, st, t) {
    const n = T.int(12, 8, 20);
    const period = T.range(18, 12, 32);
    const amp = T.range(0.55, 0.4, 0.95);
    const ring = T.chance(false, 0.35);
    const k0 = T.int(18, 12, 28);
    const lenBase = T.range(1.1, 0.8, 1.4);
    for (let i = 0; i < n; i += 1) {
      const u = i / (n - 1);
      const w = (TAU * (k0 + i)) / (period * 2);
      const th = amp * Math.cos(w * t * 2);
      let top;
      let dir;
      if (ring) {
        const a = u * TAU;
        top = [Math.cos(a) * 0.85, 0.7, Math.sin(a) * 0.85];
        dir = [Math.cos(a), 0, Math.sin(a)];
      } else {
        top = [(u - 0.5) * 2.1, 0.7, 0];
        dir = [0, 0, 1];
      }
      const bob = [top[0] + dir[0] * lenBase * Math.sin(th), top[1] - lenBase * Math.cos(th), top[2] + dir[2] * lenBase * Math.sin(th)];
      st.seg(top, bob, 0.003, 0, 0.55);
      st.dot(bob, 0.045, i, 1);
    }
    if (!ring) st.seg([-1.15, 0.7, 0], [1.15, 0.7, 0], 0.012, 0, 0.8);
  }

  function newtonCradle(T, args, cam, st, t) {
    const n = T.int(5, 4, 8);
    const period = T.range(2.2, 1.4, 3.4);
    const lift = T.int(1, 1, Math.max(1, Math.floor(n / 2)));
    const amp = T.range(0.7, 0.45, 1);
    const r = 0.085;
    const len = T.range(1.05, 0.9, 1.3);
    const s = Math.sin((TAU * t) / period);
    for (let i = 0; i < n; i += 1) {
      const x0 = (i - (n - 1) / 2) * r * 2.02;
      let th = 0;
      if (s > 0 && i >= n - lift) th = amp * s;
      else if (s < 0 && i < lift) th = amp * s;
      const bob = [x0 + len * Math.sin(th), 0.6 - len * Math.cos(th), 0];
      for (const z of [-0.12, 0.12]) st.seg([x0, 0.6, z], [bob[0], bob[1], z], 0.0035, 0, 0.6);
      st.dot(bob, r, i, 1);
    }
    const half = (n * r * 2.02) / 2 + 0.2;
    for (const z of [-0.12, 0.12]) st.seg([-half, 0.6, z], [half, 0.6, z], 0.012, 0, 0.8);
    st.seg([-half, 0.6, -0.12], [-half, 0.6 - len - r, -0.12], 0.012, 0, 0.5);
    st.seg([half, 0.6, 0.12], [half, 0.6 - len - r, 0.12], 0.012, 0, 0.5);
  }

  function chain(T, args, cam, st, t) {
    const n = T.int(18, 12, 30);
    const rows = T.int(3, 1, 8);
    const modes = T.int(2, 1, 3);
    const amp = T.range(0.25, 0.15, 0.4);
    const speed = T.range(1, 0.6, 1.8);
    const modeList = [];
    for (let k = 0; k < modes; k += 1) modeList.push({ k: T.int(k + 1, 1, 6), a: T.range(1 / (k + 1), 0.3, 1), ph: T.range(0, 0, TAU) });
    const rowGap = T.range(0.18, 0.1, 0.3);
    const lagRow = T.range(0.4, 0, 1.5);
    const beads = T.range(0.028, 0.018, 0.045);
    for (let row = 0; row < rows; row += 1) {
      let prev = null;
      for (let i = 1; i <= n; i += 1) {
        let y = 0;
        for (const m of modeList) {
          const w = 2 * Math.sin((m.k * Math.PI) / (2 * (n + 1))) * 3.2 * speed;
          y += m.a * Math.sin((m.k * Math.PI * i) / (n + 1)) * Math.cos(w * (t + row * lagRow) + m.ph);
        }
        const p = [(i / (n + 1) - 0.5) * 2.3, y * amp, (row - (rows - 1) / 2) * rowGap * 2];
        if (prev) st.seg(prev, p, 0.0035, 0, 0.55);
        st.dot(p, beads, row + i, 1);
        prev = p;
      }
    }
  }

  function gravityWell(T, args, cam, st, t) {
    const lines = T.int(8, 6, 11);
    const seg = 12;
    const bodies = T.int(1, 1, 3);
    const depth = T.range(0.5, 0.3, 0.8);
    const speed = T.range(0.8, 0.4, 1.6);
    const orbitR = T.range(0.4, 0.3, 0.6);
    const probes = T.int(6, 3, 12);
    const masses = [];
    for (let i = 0; i < bodies; i += 1) masses.push({ m: T.range(1, 0.5, 1.3), a: (i / bodies) * TAU, w: T.range(0.6, 0.35, 0.9) * speed * (i % 2 ? -1 : 1) });
    const where = (m, tt) => (bodies === 1 ? [0, 0] : [Math.cos(m.a + m.w * tt) * orbitR, Math.sin(m.a + m.w * tt) * orbitR]);
    const height = (x, z, tt) => {
      let h = 0;
      for (const m of masses) {
        const c = where(m, tt);
        h -= m.m / Math.sqrt((x - c[0]) ** 2 + (z - c[1]) ** 2 + 0.05);
      }
      return Math.max(-1.2, h * depth * 0.22);
    };
    const span = 1.15;
    for (let a = 0; a < 2; a += 1) {
      for (let l = 0; l < lines; l += 1) {
        const u = (l / (lines - 1) - 0.5) * 2 * span;
        let prev = null;
        for (let s = 0; s <= seg; s += 1) {
          const v = (s / seg - 0.5) * 2 * span;
          const x = a === 0 ? u : v;
          const z = a === 0 ? v : u;
          const p = [x, height(x, z, t), z];
          if (prev) st.seg(prev, p, 0.003, 1 + a, 0.55);
          prev = p;
        }
      }
    }
    for (const m of masses) {
      const c = where(m, t);
      st.dot([c[0], height(c[0], c[1], t) + 0.03, c[1]], 0.05 * Math.sqrt(m.m), 0, 1);
    }
    // probes on circular-ish orbits around the first well
    for (let i = 0; i < probes; i += 1) {
      const rr = 0.35 + (i / probes) * 0.75;
      const w = (1.4 / Math.pow(rr, 1.5)) * speed * (i % 2 ? 1 : 1);
      const a = i * 2.4 + w * t;
      const x = Math.cos(a) * rr;
      const z = Math.sin(a) * rr;
      st.dot([x, height(x, z, t) + 0.025, z], 0.016, 3 + (i % 3), 1);
    }
  }

  function polyhedronData(kind) {
    return cached(`poly|${kind}`, () => {
      const phi = (1 + Math.sqrt(5)) / 2;
      let v = [];
      if (kind === 'tetra') v = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];
      else if (kind === 'cube') for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) v.push([x, y, z]);
      else if (kind === 'octa') v = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
      else if (kind === 'icosa') for (const a of [-1, 1]) for (const b of [-phi, phi]) v.push([0, a, b], [a, b, 0], [b, 0, a]);
      else if (kind === 'dodeca') {
        for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) v.push([x, y, z]);
        for (const a of [-1 / phi, 1 / phi]) for (const b of [-phi, phi]) v.push([0, a, b], [a, b, 0], [b, 0, a]);
      } else {
        // tesseract: 16 vertices of a 4D cube
        for (let i = 0; i < 16; i += 1) v.push([i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1, i & 8 ? 1 : -1]);
      }
      let min = Infinity;
      for (let i = 0; i < v.length; i += 1) for (let j = i + 1; j < v.length; j += 1) min = Math.min(min, Math.hypot(...v[i].map((c, k) => c - v[j][k])));
      const edges = [];
      for (let i = 0; i < v.length; i += 1) for (let j = i + 1; j < v.length; j += 1) if (Math.abs(Math.hypot(...v[i].map((c, k) => c - v[j][k])) - min) < 1e-6) edges.push([i, j]);
      const norm = Math.max(...v.map((p) => Math.hypot(...p)));
      return { v: v.map((p) => p.map((c) => c / norm)), edges };
    });
  }

  function polyhedra(T, args, cam, st, t) {
    const kinds = ['tetra', 'cube', 'octa', 'icosa', 'dodeca', 'tesseract'];
    const kind = T.pick('cube', kinds);
    const nest = T.int(1, 1, 3);
    const data = polyhedronData(kind);
    const speed = T.range(1, 0.5, 1.7);
    const d4 = T.range(2.4, 1.8, 3.2);
    const dots = T.chance(true, 0.7);
    for (let c = 0; c < nest; c += 1) {
      const sc = 1.05 * Math.pow(0.6, c);
      const dir = c % 2 ? -1 : 1;
      const wa = T.range(0.5, 0.2, 0.9) * speed * dir;
      const wb = T.range(0.37, 0.15, 0.8) * speed * dir;
      const wc = T.range(0.23, 0.1, 0.7) * speed * dir;
      const wd = T.range(0.31, 0.1, 0.8) * speed;
      const pts = data.v.map((p) => {
        let q = p;
        if (q.length === 4) {
          let [x, y, z, w] = q;
          const a = wd * t;
          const b = wa * t;
          [x, w] = [x * Math.cos(a) - w * Math.sin(a), x * Math.sin(a) + w * Math.cos(a)];
          [y, z] = [y * Math.cos(b) - z * Math.sin(b), y * Math.sin(b) + z * Math.cos(b)];
          const k = 1 / (d4 - w);
          q = [x * k * (d4 - 1), y * k * (d4 - 1), z * k * (d4 - 1)];
        }
        q = rotZ(rotY(rotX(q, wa * t), wb * t), wc * t);
        return [q[0] * sc, q[1] * sc, q[2] * sc];
      });
      for (const [i, j] of data.edges) st.seg(pts[i], pts[j], 0.0075, c, 0.85);
      if (dots) pts.forEach((p, i) => st.dot(p, 0.022, 2 + c, 1));
    }
  }

  const ATTRACTORS = {
    lorenz: { dt: 0.0045, steps: 3, start: [1, 1, 1], f: (p) => [10 * (p[1] - p[0]), p[0] * (28 - p[2]) - p[1], p[0] * p[1] - (8 / 3) * p[2]] },
    aizawa: { dt: 0.012, steps: 2, start: [0.1, 0, 0], f: (p) => [(p[2] - 0.7) * p[0] - 3.5 * p[1], 3.5 * p[0] + (p[2] - 0.7) * p[1], 0.6 + 0.95 * p[2] - (p[2] ** 3) / 3 - (p[0] ** 2 + p[1] ** 2) * (1 + 0.25 * p[2]) + 0.1 * p[2] * p[0] ** 3] },
    thomas: { dt: 0.05, steps: 2, start: [0.1, 0, 0.2], f: (p) => [Math.sin(p[1]) - 0.208186 * p[0], Math.sin(p[2]) - 0.208186 * p[1], Math.sin(p[0]) - 0.208186 * p[2]] },
    halvorsen: { dt: 0.006, steps: 3, start: [-1.48, -1.51, 2.04], f: (p) => [-1.89 * p[0] - 4 * p[1] - 4 * p[2] - p[1] ** 2, -1.89 * p[1] - 4 * p[2] - 4 * p[0] - p[2] ** 2, -1.89 * p[2] - 4 * p[0] - 4 * p[1] - p[0] ** 2] },
  };

  function attractorTrajectory(name, jitter) {
    return cached(`attr|${name}|${jitter}`, () => {
      const sys = ATTRACTORS[name];
      let p = sys.start.map((c, i) => c + jitter * (i + 1) * 1e-3);
      const step = (q, h) => {
        const k1 = sys.f(q);
        const k2 = sys.f(q.map((c, i) => c + (h / 2) * k1[i]));
        const k3 = sys.f(q.map((c, i) => c + (h / 2) * k2[i]));
        const k4 = sys.f(q.map((c, i) => c + h * k3[i]));
        return q.map((c, i) => c + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
      };
      for (let i = 0; i < 2500; i += 1) p = step(p, sys.dt);
      const frames = 3600;
      const raw = new Float32Array(frames * 3);
      for (let f = 0; f < frames; f += 1) {
        for (let k = 0; k < 3; k += 1) raw[f * 3 + k] = p[k];
        for (let s = 0; s < sys.steps; s += 1) p = step(p, sys.dt);
      }
      return { raw, frames };
    });
  }

  function attractor(T, args, cam, st, t) {
    const name = T.pick('lorenz', Object.keys(ATTRACTORS));
    const copies = T.int(1, 1, 3);
    const trail = T.int(80, 50, 120);
    const speed = T.range(1, 0.6, 1.6);
    const spin = T.range(0.15, 0, 0.4);
    const base = attractorTrajectory(name, 0);
    // centre and fit once, from the base trajectory
    const mean = [0, 0, 0];
    for (let f = 0; f < base.frames; f += 1) for (let k = 0; k < 3; k += 1) mean[k] += base.raw[f * 3 + k] / base.frames;
    const radii = [];
    for (let f = 0; f < base.frames; f += 8) radii.push(Math.hypot(base.raw[f * 3] - mean[0], base.raw[f * 3 + 1] - mean[1], base.raw[f * 3 + 2] - mean[2]));
    radii.sort((a, b) => a - b);
    const fit = 1.15 / (radii[Math.floor(radii.length * 0.95)] || 1);
    for (let c = 0; c < copies; c += 1) {
      const tr = c === 0 ? base : attractorTrajectory(name, c);
      const at = (tt) => {
        const s = sampleAt(tr.raw, tr.frames, tt, 3);
        return rotY([(s[0] - mean[0]) * fit, (s[1] - mean[1]) * fit, (s[2] - mean[2]) * fit], spin * t);
      };
      let prev = at(t * 30 * speed / 30 * 4);
      const head = prev;
      for (let k = 1; k <= trail; k += 1) {
        const cur = at((t * 4 * speed) - (k * 0.5) / 60 * 6);
        st.seg(prev, cur, 0.006 * (1 - k / (trail + 5)), c + k * 0.03, 0.9 * (1 - k / (trail + 2)));
        prev = cur;
      }
      st.dot(head, 0.022, c, 1);
    }
  }

  function knot(T, args, cam, st, t) {
    const kind = T.pick('torus', ['torus', 'helix', 'lissajous']);
    const beads = T.int(60, 48, 110);
    const speed = T.range(1, 0.5, 1.6);
    const p = T.pick(3, [2, 3, 4, 5]);
    const q = T.pick(5, [3, 5, 7, 2]);
    const turns = T.range(3, 2, 5);
    const lisA = T.int(3, 2, 5);
    const lisB = T.int(2, 2, 5);
    const spin = T.range(0.3, 0.1, 0.6) * speed;
    const size = T.range(0.4, 0.28, 0.55);
    const pos = (u) => {
      if (kind === 'torus') {
        const a = u * TAU;
        const rr = 2 + Math.cos(q * a);
        return [(Math.cos(p * a) * rr) / 3, (Math.sin(p * a) * rr) / 3, Math.sin(q * a) / 3];
      }
      if (kind === 'lissajous') {
        const a = u * TAU;
        return [Math.sin(lisA * a + 0.5), Math.sin(lisB * a), Math.sin((lisA + lisB) * a + 1) * 0.8];
      }
      return null;
    };
    const rot = (v) => rotY(rotX(v, 0.4 + 0.2 * Math.sin(0.3 * t)), spin * t);
    if (kind === 'helix') {
      const n = Math.max(24, Math.floor(beads / 2));
      for (let h = 0; h < 2; h += 1) {
        let prev = null;
        for (let i = 0; i < n; i += 1) {
          const u = i / (n - 1);
          const a = u * turns * TAU + h * Math.PI + t * speed;
          const pt = rot([Math.cos(a) * size * 1.5, (u - 0.5) * 2, Math.sin(a) * size * 1.5]);
          if (prev) st.seg(prev, pt, 0.005, h, 0.7);
          st.dot(pt, 0.018, h * 2 + (i % 3), 1);
          prev = pt;
          if (h === 0 && i % 3 === 0) {
            const mate = rot([Math.cos(a + Math.PI) * size * 1.5, (u - 0.5) * 2, Math.sin(a + Math.PI) * size * 1.5]);
            st.seg(pt, mate, 0.0035, 4, 0.5);
          }
        }
      }
      return;
    }
    let prev = null;
    for (let i = 0; i <= beads; i += 1) {
      const u = i / beads;
      const base = pos(u);
      const pt = rot([base[0] * 1.15, base[1] * 1.15, base[2] * 1.15]);
      if (prev) st.seg(prev, pt, 0.006, 0, 0.5);
      const glow = 0.55 + 0.45 * Math.sin(TAU * (u * 2 - t * 0.35 * speed));
      st.dot(pt, 0.014 + 0.014 * glow, 1 + (i % 4), 1);
      prev = pt;
    }
  }

  function starfield(T, args, cam, st, t, frame) {
    const n = T.int(110, 70, 190);
    const speed = T.range(0.25, 0.12, 0.6);
    const swirl = T.range(0, 0, 0.5);
    const streak = T.range(0.5, 0.15, 1.6);
    const reach = T.range(1.6, 1.0, 2.4);
    const r = rng.rngFor(args.seed, 'stars');
    for (let i = 0; i < n; i += 1) {
      const a = r() * TAU;
      const rad = reach * Math.sqrt(r());
      const phase = r();
      const z = ((phase + t * speed) % 1 + 1) % 1; // 0 near the lens, 1 far
      const depth = 0.06 + z * 2.6;
      const ang = a + swirl * t;
      const x = Math.cos(ang) * rad;
      const y = Math.sin(ang) * rad;
      const near = [x, y, 0];
      const f = 0.9;
      const sx = frame.cx + (x / depth) * frame.short * f * 0.5;
      const sy = frame.cy + (y / depth) * frame.short * f * 0.5;
      const depth2 = depth + streak * 0.12 * (1 + z);
      const sx2 = frame.cx + (x / depth2) * frame.short * f * 0.5;
      const sy2 = frame.cy + (y / depth2) * frame.short * f * 0.5;
      void near;
      const alpha = clamp(1 - z * 0.9, 0.1, 1) * clamp(z * 14, 0, 1);
      st.raw({ x0: sx2, y0: sy2, x1: sx, y1: sy, w: Math.max(1, (1 - z) * frame.short * 0.006), ci: i, a: alpha });
    }
  }

  const RENDER = { solarSystem, nbody, pendulum, pendulumWave, newtonCradle, chain, gravityWell, polyhedra, attractor, knot, starfield };

  // Render one scene.
  //   args: { seed, rand (0..1), t (clip time, s), frame {width,height,cx,cy,short},
  //           grow (0.2..1), opacity, color(i), variant, count? }
  // Returns plain shapes centred on the frame; the caller fits them to the free area.
  function render(name, args) {
    const fn = RENDER[name];
    if (!fn) return [];
    const frame = args.frame;
    const T = tools(args.seed, name, args.rand);
    const camT = tools(args.seed, `${name}-camera`, args.rand);
    const cg = cameraGenome(camT);
    const cam = cameraAt(cg, args.t, frame);
    const st = stage({ ...args, grow: args.grow == null ? 1 : args.grow, opacity: args.opacity == null ? 1 : args.opacity }, cam);
    // starfield bypasses the camera; give its stage a raw segment push
    st.raw = (it) => {
      if (st.count() >= SHAPE_CAP) return;
      st.seg2 = st.seg2 || [];
      st.seg2.push(it);
    };
    fn(T, args, cam, st, args.t, frame);
    const shapes = st.shapes();
    if (st.seg2) {
      for (const it of st.seg2) shapes.push({ kind: 'capsule', x0: it.x0, y0: it.y0, x1: it.x1, y1: it.y1, width: it.w, color: args.color(it.ci), opacity: Math.max(0.05, Math.min(1, it.a * (args.opacity == null ? 1 : args.opacity))) });
    }
    return shapes.slice(0, SHAPE_CAP);
  }

  return { SCENES, CAMERA_KINDS, SHAPE_CAP, render, cameraGenome, cameraAt, tools, nbodyTrajectory, pendulumTrajectory, attractorTrajectory, sampleAt, polyhedronData, clearCache: () => cache.clear() };
});
