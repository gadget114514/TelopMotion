(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../rng'), require('../scene3d'));
  else {
    root.SA = root.SA || {};
    root.SA.glSim = factory(root.SA.rng, root.SA.scene3d);
  }
})(typeof self !== 'undefined' ? self : this, function (rng, scene3d) {
  'use strict';

  // GPU simulations for the figure track.
  //
  // Where the mathematical fields (fields.js) are closed forms of
  // (position, time), these keep a texture of state that is stepped forward at a
  // fixed rate, so a scrub needs a way back. Two rules make that work:
  //
  //   * a step is a pure function of (state, absolute step index). Nothing reads
  //     "how many steps have we taken", so the state at step 900 is the same
  //     whether it was reached by playing, by scrubbing or by exporting.
  //   * a keyframe of the whole state is kept once a second. A time is reached by
  //     restoring the keyframe at or before it and walking forward at most 30
  //     steps, which is why the schedule (plan / rememberKey, below) is a pure
  //     function too and can be checked without a GPU.
  //
  // Everything above the GL runner is pure: the genome, the embedding profile, the
  // step schedule and where the audio splats land. The runner below owns the
  // ping-pong targets, the keyframe textures and their LRU order.

  const tools = scene3d.tools;

  // --- timing -----------------------------------------------------------------

  const DT = 1 / 30;          // the fixed step, in seconds
  const KEY_STEPS = 30;       // a keyframe once a second
  const MAX_KEYS = 60;        // at most a minute of keyframes per clip
  const MAX_SEEK_STEPS = 45;  // walk forward from here rather than copy a keyframe
  const RES = 256;            // the simulation grid
  const MAX_KEY_BYTES = RES * RES * 4 * 2;

  function clamp01(v) {
    const x = Number(v);
    return Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0;
  }

  // The step a clip time lands on. Times before the clip start clamp to step 0.
  function stepOf(t) {
    const v = Number(t);
    if (!Number.isFinite(v) || v <= 0) return 0;
    return Math.floor(v / DT);
  }

  // The step whose state a keyframe of this step is stored under.
  function keyOf(step) {
    return Math.floor(Math.max(0, step) / KEY_STEPS) * KEY_STEPS;
  }

  // How to get from the state we have to `target`.
  //   current - the step the live state is at
  //   keys    - the steps we hold a keyframe of (0 is the seeded start)
  // Walking forward is only taken while the gap is short; past that, or when
  // going backwards at all, we restore the nearest keyframe at or before the
  // target. With a keyframe every KEY_STEPS steps the walk is at most KEY_STEPS.
  function plan(current, keys, target) {
    const from = Math.max(0, Math.floor(Number(current) || 0));
    const to = Math.max(0, Math.floor(Number(target) || 0));
    if (to === from) return { action: 'hold', fromStep: from, steps: 0 };
    const gap = to - from;
    if (gap > 0 && gap <= MAX_SEEK_STEPS) return { action: 'advance', fromStep: from, steps: gap };
    let best = -1;
    const held = Array.isArray(keys) ? keys : [];
    for (let i = 0; i < held.length; i += 1) {
      const k = held[i];
      if (k <= to && k > best) best = k;
    }
    if (best < 0) return { action: 'reset', fromStep: 0, steps: to };
    return { action: 'restore', fromStep: best, steps: to - best };
  }

  // A keyframe store with an LRU order: `store` maps a step to the tick it was
  // last touched on. Step 0 is pinned - it is the seeded start, and losing it
  // would mean re-running the simulation from nothing to reach an early time.
  function touchKey(store, step, tick) {
    const at = Math.max(0, Math.floor(step));
    if (store.has(at)) {
      store.set(at, tick);
      return store;
    }
    if (store.size >= MAX_KEYS) {
      let victim = -1;
      let oldest = Infinity;
      store.forEach((seen, k) => {
        if (k > 0 && seen < oldest) {
          oldest = seen;
          victim = k;
        }
      });
      if (victim < 0) return store; // nothing but the pinned start: keep it
      store.delete(victim);
    }
    store.set(at, tick);
    return store;
  }

  // --- audio splats -----------------------------------------------------------
  // Where a drop hits. A pure function of (seed, genome, the clip's beat times,
  // the step), so a beat lands in the same place whether the clip is played
  // through or scrubbed onto. `beats` are seconds from the start of the clip.

  const MAX_SPLATS = 4;

  function beatSteps(beats) {
    if (!Array.isArray(beats)) return null;
    const out = new Set();
    for (let i = 0; i < beats.length; i += 1) {
      const b = Number(beats[i]);
      if (Number.isFinite(b) && b >= 0) out.add(stepOf(b));
    }
    return out;
  }

  // The splats applied on one step. `p` is the 12 number genome.
  function splatsAt(p, seed, beats, step) {
    const get = (i, fallback) => (Number.isFinite(p[i]) ? p[i] : fallback);
    const rate = Math.max(1, Math.round(get(10, 12)));     // steps between splats
    const strength = get(11, 0.6);
    const onBeat = beatSteps(beats);
    if (step % rate !== 0 && !(onBeat && onBeat.has(step))) return null;
    const count = Math.max(1, Math.min(MAX_SPLATS, Math.round(get(9, 1))));
    const random = rng.rngFor(seed, 'sim-splat', step);
    const isBeat = Boolean(onBeat && onBeat.has(step));
    const out = [];
    for (let i = 0; i < count; i += 1) {
      const u = random();
      const v = random();
      const w = random();
      out.push({
        // a beat hits near the centre, a free splat anywhere
        x: isBeat ? 0.5 + (u - 0.5) * 0.5 : 0.08 + u * 0.84,
        y: isBeat ? 0.5 + (v - 0.5) * 0.5 : 0.08 + v * 0.84,
        radius: 0.02 + 0.09 * w,
        strength: (isBeat ? 1.5 : 0.7) * strength * (0.5 + w),
      });
    }
    return out;
  }

  // --- the simulations --------------------------------------------------------

  const SIMS = ['reactionDiffusion', 'wave2d', 'fluid', 'cellular'];

  // The genome, the hand-placed embedding profile and the GLSL of each sim. The
  // 12 genome numbers are read in the step shader as u_p0..u_p2; u_p3 carries the
  // embedding axes. `display` is the fragment shader of the field that turns the
  // state texture into picture (it lives in fields.js, which owns the palette).

  // Shared step-shader preamble: the state texture, the absolute step and the
  // splats for this step. Sampling is by texelFetch on a clamped coordinate so a
  // neighbourhood never wraps or reads outside.
  const STEP_HEAD = `#version 300 es
precision highp float;
precision highp int;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_state;
uniform vec2 u_res;
uniform float u_step;
uniform float u_seed;
uniform vec4 u_p0;
uniform vec4 u_p1;
uniform vec4 u_p2;
uniform int u_kind;
uniform int u_count;
uniform vec4 u_splat0;
uniform vec4 u_splat1;
uniform vec4 u_splat2;
uniform vec4 u_splat3;
ivec2 cl(ivec2 c) {
  return clamp(c, ivec2(0), ivec2(u_res) - ivec2(1));
}
vec4 at(ivec2 c) { return texelFetch(u_state, cl(c), 0); }
float hash21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
// the 9 point Laplacian, normalised (the weights sum to zero)
vec4 lap9(vec4 c) {
  vec4 s = at(cl(ivec2(0, -1))) + at(cl(ivec2(0, 1))) + at(cl(ivec2(-1, 0))) + at(cl(ivec2(1, 0)));
  s += 0.25 * (at(cl(ivec2(-1, -1))) + at(cl(ivec2(1, -1))) + at(cl(ivec2(-1, 1))) + at(cl(ivec2(1, 1))));
  return s * 0.2 - c;
}
// the same, but bilinear from four neighbours (for the advection)
vec4 lap4(vec4 c) {
  vec4 s = at(cl(ivec2(0, -1))) + at(cl(ivec2(0, 1))) + at(cl(ivec2(-1, 0))) + at(cl(ivec2(1, 0)));
  return s * 0.25 - c;
}
float splatAt(vec2 uv, vec4 sp) {
  if (sp.w <= 0.0) return 0.0;
  float d = distance(uv, sp.xy);
  return sp.w * smoothstep(sp.z, 0.0, d);
}
float sumSplats(vec2 uv) {
  return splatAt(uv, u_splat0) + splatAt(uv, u_splat1) + splatAt(uv, u_splat2) + splatAt(uv, u_splat3);
}
vec4 sane(vec4 v, float lo, float hi) {
  // half floats can carry an inf or a NaN out of an unstable step; a bad texel
  // would then spread over the grid, so it is replaced at the source
  bvec4 bad = bvec4(isnan(v.x), isnan(v.y), isnan(v.z), isnan(v.w));
  bad = bvec4(bad.x || isinf(v.x), bad.y || isinf(v.y), bad.z || isinf(v.z), bad.w || isinf(v.w));
  return mix(v, vec4(0.0), vec4(bad)) * 0.0 + select(v, clamp(v, lo, hi), bad);
}
`;

  // The seeded start of each sim. `u_step` is unused here: the start of a clip is
  // the same texture whatever time it is first asked for.
  const RESET_HEAD = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform vec2 u_res;
uniform float u_seed;
uniform vec4 u_p0;
uniform vec4 u_p1;
uniform vec4 u_p2;
uniform int u_kind;
float hash21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
`;

  // -- reaction diffusion (Gray-Scott / BZ): state = (A, B)
  const RD_STEP = `
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec4 s = at(c);
  vec4 lap = lap9(s);
  float A = s.x;
  float B = s.y;
  float feed = u_p0.x;
  float kill = u_p0.y;
  float du = u_p0.z * lap.x - A * B * B + feed * (1.0 - A);
  float dv = u_p0.w * lap.y + A * B * B - (feed + kill) * B;
  A += du;
  B += dv;
  float drop = sumSplats(v_uv);
  B += drop * 0.35;
  A -= drop * 0.12;
  fragColor = sane(vec4(A, B, 0.0, 1.0), 0.0, 1.0);
}`;

  const RD_RESET = `
void main() {
  vec2 uv = v_uv;
  float n = vnoise(uv * 7.0 + u_seed * 13.0);
  float spots = u_p0.z > 0.0 ? smoothstep(0.62, 0.78, n) : 0.0;
  float A = 1.0 - spots;
  float B = spots * 0.9;
  // a few isolated seeds so the pattern has somewhere to break out from
  vec2 c = vec2(hash21(vec2(1.0, u_seed)), hash21(vec2(2.0, u_seed)));
  float d = distance(uv, c);
  B += smoothstep(0.09, 0.0, d);
  A -= smoothstep(0.09, 0.0, d);
  fragColor = vec4(clamp(A, 0.0, 1.0), clamp(B, 0.0, 1.0), 0.0, 1.0);
}`;

  // -- wave equation: state = (height, height one step ago)
  const WAVE_STEP = `
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec4 s = at(c);
  vec4 lap = lap4(s);
  float c2 = u_p0.x;
  float damp = u_p0.y;
  float next = 2.0 * s.x - s.y + c2 * lap.x;
  next *= damp;
  next += sumSplats(v_uv) * u_p0.z;
  if (u_kind == 1) {
    // a travelling wave from one side, for the variant that reads as a ripple
    next += sin((v_uv.x * 18.0 - u_step * 0.35) * 3.14159265) * 0.02;
  }
  fragColor = sane(vec4(next, s.x, 0.0, 1.0), -8.0, 8.0);
}`;

  const WAVE_RESET = `
void main() {
  vec2 uv = v_uv;
  float n = vnoise(uv * 4.0 + u_seed * 7.0) - 0.5;
  float h = n * u_p1.x;
  fragColor = vec4(h, h, 0.0, 1.0);
}`;

  // -- stable fluids: state = (vx, vy, dye, pressure)
  const FLUID_STEP = `
uniform sampler2D u_div;
uniform sampler2D u_press;
uniform int u_pass;
uniform int u_iters;
vec4 bilerp(sampler2D tex, vec2 uv) {
  vec2 st = uv * u_res - 0.5;
  vec2 i = floor(st);
  vec2 f = fract(st);
  vec2 base = (i + 0.5) / u_res;
  vec2 tx = 1.0 / u_res;
  vec4 a = texture(tex, base);
  vec4 b = texture(tex, base + vec2(tx.x, 0.0));
  vec4 c = texture(tex, base + vec2(0.0, tx.y));
  vec4 d = texture(tex, base + tx);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  if (u_pass == 0) {
    // divergence of the velocity, into the scratch
    float l = at(cl(ivec2(-1, 0))).x;
    float r = at(cl(ivec2(1, 0))).x;
    float d = at(cl(ivec2(0, -1))).y;
    float u = at(cl(ivec2(0, 1))).y;
    fragColor = vec4(0.5 * (r - l + u - d), 0.0, 0.0, 1.0);
    return;
  }
  if (u_pass == 1) {
    // one Jacobi sweep of the pressure, seeded from the state's own pressure
    float l = texture(u_press, v_uv + vec2(-1.0, 0.0) / u_res).a;
    float r = texture(u_press, v_uv + vec2(1.0, 0.0) / u_res).a;
    float d = texture(u_press, v_uv + vec2(0.0, -1.0) / u_res).a;
    float u = texture(u_press, v_uv + vec2(0.0, 1.0) / u_res).a;
    float div = texture(u_div, v_uv).r;
    fragColor = vec4(0.0, 0.0, 0.0, (l + r + d + u - div) * 0.25);
    return;
  }
  // the real step: advect, push, project, advect the dye
  vec4 s = at(c);
  vec2 vel = s.xy;
  float dye = s.z;
  float pressure = s.w;
  vec2 back = v_uv - vel * u_p0.x;
  vec4 adv = bilerp(u_state, clamp(back, vec2(0.0), vec2(1.0)));
  vec2 v2 = adv.xy;
  float dye2 = adv.z;
  // the splats push the fluid out from under them
  float sp = sumSplats(v_uv);
  v2 += (v_uv - 0.5) * sp * u_p0.z;
  v2 *= 1.0 - u_p0.y;
  float pl = texture(u_press, v_uv + vec2(-1.0, 0.0) / u_res).a;
  float pr = texture(u_press, v_uv + vec2(1.0, 0.0) / u_res).a;
  float pd = texture(u_press, v_uv + vec2(0.0, -1.0) / u_res).a;
  float pu = texture(u_press, v_uv + vec2(0.0, 1.0) / u_res).a;
  v2 -= 0.5 * vec2(pr - pl, pu - pd);
  // vorticity confinement puts the curl back that the grid damps out
  if (u_kind == 1) {
    float wl = abs(at(cl(ivec2(-1, 0))).y - at(cl(ivec2(1, 0))).y);
    float wd = abs(at(cl(ivec2(0, -1))).x - at(cl(ivec2(0, 1))).x);
    float w = at(cl(ivec2(1, 0))).y - at(cl(ivec2(-1, 0))).y - (at(cl(ivec2(0, 1))).x - at(cl(ivec2(0, -1))).x);
    vec2 n = vec2(wd - wl, wl - wd);
    float len = length(n) + 1e-5;
    v2 += (n / len) * w * u_p1.z;
  }
  v2 = clamp(v2, vec2(-1.5), vec2(1.5));
  dye2 *= 1.0 - u_p0.w;
  dye2 += sp * 0.25;
  fragColor = sane(vec4(v2, clamp(dye2, 0.0, 4.0), pressure), -4.0, 4.0);
}`;

  const FLUID_RESET = `
void main() {
  vec2 uv = v_uv;
  vec2 c = uv - 0.5;
  float a = atan(c.y, c.x);
  float r = length(c);
  float sw = u_p0.w > 0.0 ? smoothstep(0.45, 0.0, r) * 0.6 : 0.0;
  vec2 vel = vec2(-c.y, c.x) * sw;
  fragColor = vec4(vel, u_p1.w, 0.0, 1.0);
}`;

  // -- cellular automata: state = (alive, age)
  const CELL_STEP = `
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec4 s = at(c);
  float n = 0.0;
  float sum = 0.0;
  int lo = u_kind == 2 ? 0 : -1;
  int hi = u_kind == 2 ? 0 : 1;
  for (int j = -1; j <= 1; j += 1) {
    if (j < lo || j > hi) continue;
    for (int i = -1; i <= 1; i += 1) {
      if (i < lo || i > hi) continue;
      if (i == 0 && j == 0) continue;
      vec4 o = at(cl(c + ivec2(i, j)));
      n += step(0.5, o.x);
      sum += o.x;
    }
  }
  float alive = s.x;
  float born = 0.0;
  if (u_kind == 0) {
    // Conway: B3 / S23, plus the sticky variant that leaves a fading trace
    born = alive > 0.5 ? (n > 1.5 && n < 3.5 ? 1.0 : 0.0) : (n > 2.5 && n < 3.5 ? 1.0 : 0.0);
  } else if (u_kind == 1) {
    // Lenia: a continuous neighbourhood window
    float win = smoothstep(u_p0.y, u_p0.y + 0.12, n) * (1.0 - smoothstep(u_p0.z, u_p0.z + 0.12, n));
    born = clamp(win * (u_p1.x * 2.0), 0.0, 1.0);
  } else {
    // sand: a cell above empties down, piling up
    if (alive < 0.5) {
      float above = at(cl(c + ivec2(0, 1))).x;
      born = step(0.5, above);
    } else if (hash21(v_uv * 97.0 + u_step * 0.017) < u_p1.x * 0.5) {
      float below = at(cl(c + ivec2(0, -1))).x;
      born = below < 0.5 ? 0.5 : 1.0;
    } else {
      born = 1.0;
    }
  }
  float sp = sumSplats(v_uv);
  born = max(born, step(0.02, sp));
  float age = alive > 0.5 ? min(s.y + 1.0, 64.0) : 0.0;
  fragColor = sane(vec4(clamp(born, 0.0, 1.0), age, sum * 0.125, 1.0), 0.0, 64.0);
}`;

  const CELL_RESET = `
void main() {
  vec2 uv = v_uv;
  float n = 0.0;
  if (u_kind == 2) {
    // sand starts as a pile along the top edge
    n = step(uv.y, 0.25 + vnoise(vec2(uv.x * 3.0, 0.0)) * 0.25);
  } else {
    n = step(1.0 - u_p1.y, hash21(floor(uv * u_res * 0.5) + u_seed));
  }
  fragColor = vec4(n, n * 8.0, 0.0, 1.0);
}`;

  const SIM_DEFS = {
    reactionDiffusion: {
      profile: { organic: 0.75, sharp: 0.45, dense: 0.7, motion: 0.5 },
      step: RD_STEP,
      reset: RD_RESET,
      genome(T) {
        // p0 = (feed, kill, diffusion A, diffusion B)
        return [T.range(0.0367, 0.01, 0.062), T.range(0.0649, 0.045, 0.075), T.range(1, 0.7, 1.4), T.range(0.5, 0.3, 0.8), T.range(1, 0, 1), T.range(1, 0, 1), 0, 0, T.range(1, 0.2, 1), T.int(2, 1, 4), T.range(14, 6, 30), T.range(0.7, 0.3, 1.3)];
      },
    },
    wave2d: {
      profile: { organic: 0.6, sharp: 0.5, dense: 0.5, motion: 0.7 },
      step: WAVE_STEP,
      reset: WAVE_RESET,
      genome(T) {
        // p0 = (courant^2, damping, splat strength, travelling wave), p1 = (relief, splash rate, count, strength)
        return [T.range(0.24, 0.1, 0.42), T.range(0.996, 0.985, 0.9995), T.range(0.6, 0.2, 1.4), T.int(0, 0, 1), T.range(0.5, 0.1, 1.2), T.range(0, 0, 1), T.range(1.1, 0.6, 2), 0, T.range(1.15, 0.9, 1.6), T.range(2, 1, 4), T.range(16, 6, 30), T.range(0.8, 0.3, 1.4)];
      },
    },
    fluid: {
      profile: { organic: 0.85, sharp: 0.35, dense: 0.65, motion: 0.75 },
      step: FLUID_STEP,
      reset: FLUID_RESET,
      genome(T) {
        // p0 = (advect, viscosity, push, dye loss), p1 = (iterations, vorticity, colour, dye at the start)
        return [T.range(1, 0.85, 1.15), T.range(0.02, 0.002, 0.08), T.range(0.9, 0.3, 2), T.range(0.012, 0.002, 0.04), T.int(10, 4, 16), T.range(6, 1, 14), T.range(0, 0, 1), T.range(0.7, 0.2, 1), T.range(1, 0, 1), T.range(2, 1, 4), T.range(18, 8, 34), T.range(0.9, 0.4, 1.5)];
      },
      // how many scratch textures the step needs, and the passes over them
      scratch: 2,
      passes(u, kind) {
        const iters = Math.max(1, Math.min(24, Math.round(u.u_p1[0])));
        const list = [{ pass: 0, target: 'scratch0', inputs: ['state'] }];
        for (let i = 0; i < iters; i += 1) {
          list.push({ pass: 1, target: i % 2 === 0 ? 'scratch1' : 'scratch0', inputs: ['state', 'div', 'press'], press: i % 2 === 0 ? 'scratch0' : 'scratch1' });
        }
        list.push({ pass: 2, target: 'alt', inputs: ['state'], press: iters % 2 === 0 ? 'scratch0' : 'scratch1' });
        void kind;
        return list;
      },
    },
    cellular: {
      profile: { organic: 0.5, sharp: 0.75, dense: 0.85, motion: 0.6 },
      step: CELL_STEP,
      reset: CELL_RESET,
      genome(T) {
        // p0 = (rule, window lo, window hi, unused), p1 = (growth, fill, colour, unused)
        return [T.int(0, 0, 2), T.range(2, 1, 3), T.range(4, 3, 5), 0, T.range(0.35, 0.1, 0.7), T.range(0.32, 0.08, 0.55), T.range(1, 0, 1), 0, T.range(1, 0, 1), T.range(2, 1, 4), T.range(14, 6, 30), T.range(0.8, 0.3, 1.4)];
      },
    },
  };

  // The kind a sim runs in: an integer out of the first genome slot, used to pick
  // a variant inside the step shader.
  function kindOf(id, p) {
    const v = Number(p && p[0]);
    return Number.isFinite(v) ? Math.round(v) : 0;
  }

  function genome(id, seed, rand) {
    const def = SIM_DEFS[id];
    if (!def) return null;
    const T = tools(seed, `sim-${id}`, rand);
    const g = def.genome(T);
    const p = new Array(16).fill(0);
    for (let i = 0; i < 12; i += 1) p[i] = g[i] == null ? 0 : g[i];
    p[12] = def.profile.dense;
    p[13] = def.profile.sharp;
    p[14] = def.profile.motion;
    p[15] = def.profile.organic;
    return p;
  }

  function profile(id, p) {
    const def = SIM_DEFS[id];
    if (!def) return { organic: 0.5, sharp: 0.5, dense: 0.5, motion: 0.5 };
    const base = def.profile;
    const g = Array.isArray(p) ? p : [];
    const wobble = (i) => (Number.isFinite(g[i]) ? (((Math.abs(g[i]) * 7.31) % 1) - 0.5) : 0);
    return {
      organic: Math.max(0, Math.min(1, base.organic + 0.12 * wobble(0))),
      sharp: Math.max(0, Math.min(1, base.sharp + 0.12 * wobble(1))),
      dense: Math.max(0, Math.min(1, base.dense + 0.15 * wobble(2))),
      motion: Math.max(0, Math.min(1, base.motion + 0.12 * wobble(3))),
    };
  }

  // --- the GL runner ----------------------------------------------------------

  function makeStateTarget(gl) {
    const target = SA.gl.createTarget(gl, RES, RES, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT);
    // half float is filterable in core WebGL2, and the dye is read bilinearly
    gl.bindTexture(gl.TEXTURE_2D, target.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return target;
  }

  // Per clip: the live ping-pong pair, the keyframes and how far the clip has been
  // carried. Dropped when its textures are, so the memory bound holds.
  function createRunner(gl, options) {
    const opts = options || {};
    const floatTargets = opts.floatTargets !== false;
    const programs = new Map();
    const clips = new Map();
    let tick = 0;
    const stats = { steps: 0, keys: 0, restores: 0, resets: 0 };

    function available() {
      return typeof SA !== 'undefined' && SA.gl && SA.gl.createTarget && SA.glShaders && SA.glFields;
    }

    // one program per (sim, reset?) pair, compiled the first time it is needed
    function programFor(id, reset) {
      const key = `${id}:${reset ? 'reset' : 'step'}`;
      let entry = programs.get(key);
      if (entry !== undefined) return entry;
      if (!available()) return (entry = null);
      const def = SIM_DEFS[id];
      const source = `${reset ? RESET_HEAD : STEP_HEAD}${def[reset ? 'reset' : 'step']}`;
      entry = SA.glPasses.createProgramSafe(gl, SA.glShaders.QUAD_VERT, source);
      if (!entry) entry = null;
      programs.set(key, entry);
      return entry;
    }

    function newClip(field) {
      const def = SIM_DEFS[field.id];
      const clip = {
        id: field.id,
        key: field.sim.key,
        p: field.p.slice(),
        seed: field.seed,
        beats: field.sim.beats || null,
        kind: kindOf(field.id, field.p),
        cur: makeStateTarget(gl),
        alt: makeStateTarget(gl),
        scratch: def.scratch ? [makeStateTarget(gl), makeStateTarget(gl)] : null,
        keys: new Map(),
        step: -1,
        seeded: false,
      };
      return clip;
    }

    function dropClip(key) {
      const clip = clips.get(key);
      if (!clip) return;
      SA.gl.deleteTarget(gl, clip.cur);
      SA.gl.deleteTarget(gl, clip.alt);
      if (clip.scratch) for (const target of clip.scratch) SA.gl.deleteTarget(gl, target);
      for (const entry of clip.keys.values()) SA.gl.deleteTarget(gl, entry.target);
      clips.delete(key);
    }

    function saveKey(clip) {
      const at = keyOf(clip.step);
      if (clip.keys.has(at)) return;
      const target = makeStateTarget(gl);
      // copy the live state into the keyframe
      const copy = SA.glFields.programForCopy ? SA.glFields.programForCopy(gl) : null;
      if (copy) {
        gl.useProgram(copy.program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, clip.cur.texture);
        if (copy.uniforms.u_texture) gl.uniform1i(copy.uniforms.u_texture, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
        gl.viewport(0, 0, RES, RES);
        gl.disable(gl.BLEND);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      touchKey(clip.keys, at, tick);
      tick += 1;
      clip.keys.set(at, { target, used: tick });
      stats.keys += 1;
      // the LRU eviction may have dropped one; free its texture
      for (const [step, entry] of clip.keys) {
        if (entry.stale) {
          SA.gl.deleteTarget(gl, entry.target);
          clip.keys.delete(step);
        }
      }
    }

    function restoreKey(clip, at) {
      const entry = clip.keys.get(at);
      if (!entry) return false;
      const program = SA.glFields.programForCopy(gl);
      if (!program) return false;
      gl.useProgram(program.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, entry.target.texture);
      if (program.uniforms.u_texture) gl.uniform1i(program.uniforms.u_texture, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, clip.cur.framebuffer);
      gl.viewport(0, 0, RES, RES);
      gl.disable(gl.BLEND);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      entry.used = tick;
      tick += 1;
      clip.step = at;
      clip.seeded = true;
      stats.restores += 1;
      return true;
    }

    // draw one program over the whole grid
    function run(program, uniforms, target) {
      gl.useProgram(program.program);
      if (uniforms) {
        for (const [name, value] of Object.entries(uniforms)) {
          const at = program.uniforms[name];
          if (at == null || value == null) continue;
          if (typeof value === 'number') {
            if (name === 'u_kind' || name === 'u_count' || name === 'u_pass' || name === 'u_iters') gl.uniform1i(at, Math.round(value));
            else gl.uniform1f(at, value);
          } else if (Array.isArray(value) && value.length === 2) gl.uniform2f(at, value[0], value[1]);
          else if (Array.isArray(value) && value.length === 4) gl.uniform4f(at, value[0], value[1], value[2], value[3]);
        }
      }
      if (target) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
        gl.viewport(0, 0, RES, RES);
      }
      gl.disable(gl.BLEND);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    function bindTex(unit, texture, name, program) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      const at = program.uniforms[name];
      if (at) gl.uniform1i(at, unit);
    }

    function splatUniforms(clip, step) {
      const list = splatsAt(clip.p, clip.seed, clip.beats, step) || [];
      const pick = (i) => {
        const s = list[i];
        return s ? [s.x, s.y, s.radius, s.strength] : [0, 0, 0, 0];
      };
      return { u_splat0: pick(0), u_splat1: pick(1), u_splat2: pick(2), u_splat3: pick(3), u_count: list.length };
    }

    function stepOnce(clip) {
      const def = SIM_DEFS[clip.id];
      const next = clip.step + 1;
      const stepProgram = programFor(clip.id, false);
      if (!stepProgram) return false;
      const base = {
        u_res: [RES, RES],
        u_step: next,
        u_seed: (clip.seed % 1000) * 0.137,
        u_p0: [clip.p[0], clip.p[1], clip.p[2], clip.p[3]],
        u_p1: [clip.p[4], clip.p[5], clip.p[6], clip.p[7]],
        u_p2: [clip.p[8], clip.p[9], clip.p[10], clip.p[11]],
        u_kind: clip.kind,
        ...splatUniforms(clip, next),
      };
      gl.useProgram(stepProgram.program);
      bindTex(0, clip.cur.texture, 'u_state', stepProgram);
      if (def.scratch) {
        const passes = def.passes(base, clip.kind);
        for (const item of passes) {
          const target = item.target === 'alt' ? clip.alt : clip.scratch[item.target === 'scratch0' ? 0 : 1];
          const uniforms = { ...base, u_pass: item.pass };
          if (item.pass === 0) bindTex(1, clip.cur.texture, 'u_div', stepProgram);
          else if (item.pass === 1) {
            bindTex(1, clip.scratch[0].texture, 'u_div', stepProgram);
            bindTex(2, item.press === 'scratch0' ? clip.scratch[0].texture : clip.scratch[1].texture, 'u_press', stepProgram);
          } else {
            bindTex(2, item.press === 'scratch0' ? clip.scratch[0].texture : clip.scratch[1].texture, 'u_press', stepProgram);
          }
          run(stepProgram, uniforms, target);
        }
      } else {
        run(stepProgram, base, clip.alt);
      }
      const swap = clip.cur;
      clip.cur = clip.alt;
      clip.alt = swap;
      clip.step = next;
      clip.seeded = true;
      stats.steps += 1;
      if (clip.step % KEY_STEPS === 0) saveKey(clip);
      return true;
    }

    function seedClip(clip) {
      const program = programFor(clip.id, true);
      if (!program) return false;
      run(program, {
        u_res: [RES, RES],
        u_step: 0,
        u_seed: (clip.seed % 1000) * 0.137,
        u_p0: [clip.p[0], clip.p[1], clip.p[2], clip.p[3]],
        u_p1: [clip.p[4], clip.p[5], clip.p[6], clip.p[7]],
        u_p2: [clip.p[8], clip.p[9], clip.p[10], clip.p[11]],
        u_kind: clip.kind,
      }, clip.alt);
      const swap = clip.cur;
      clip.cur = clip.alt;
      clip.alt = swap;
      clip.step = 0;
      clip.seeded = true;
      stats.resets += 1;
      saveKey(clip);
      return true;
    }

    // Bring the state of `field` to the step its time asks for, and return the
    // texture to sample. null when there is no usable float target or the shader
    // does not build, which leaves the figure empty instead of wrong.
    function textureFor(field) {
      if (!floatTargets || !available() || !field || !field.sim) return null;
      const id = field.id;
      if (!SIM_DEFS[id]) return null;
      let clip = clips.get(field.sim.key);
      if (!clip) {
        clip = newClip(field);
        clips.set(field.sim.key, clip);
      }
      const target = stepOf(field.time);
      const schedule = plan(clip.step, Array.from(clip.keys.keys()), target);
      if (schedule.action === 'reset' || !clip.seeded) {
        if (!seedClip(clip)) return null;
      }
      if (schedule.action === 'restore') {
        if (!restoreKey(clip, schedule.fromStep)) {
          if (!seedClip(clip)) return null;
          for (let i = 0; i < schedule.steps; i += 1) if (!stepOnce(clip)) return null;
          return clip.cur;
        }
      }
      for (let i = 0; i < schedule.steps; i += 1) {
        if (!stepOnce(clip)) return null;
      }
      return clip.cur;
    }

    function dispose() {
      for (const key of Array.from(clips.keys())) dropClip(key);
      clips.clear();
      programs.clear();
    }

    return {
      textureFor,
      dispose,
      stats,
      keys: () => clips.size,
      bytes: () => {
        let total = 0;
        for (const clip of clips.values()) {
          total += (2 + (clip.scratch ? clip.scratch.length : 0) + clip.keys.size) * MAX_KEY_BYTES;
        }
        return total;
      },
    };
  }

  return {
    SIMS,
    DT,
    KEY_STEPS,
    MAX_KEYS,
    MAX_SEEK_STEPS,
    RES,
    SIM_DEFS,
    MAX_SPLATS,
    stepOf,
    keyOf,
    plan,
    touchKey,
    beatSteps,
    splatsAt,
    kindOf,
    genome,
    profile,
    createRunner,
  };
});
