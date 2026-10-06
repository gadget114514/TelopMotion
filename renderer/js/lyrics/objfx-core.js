(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.SA = root.SA || {};
    root.SA.objfxCore = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Motion-reactive deformation core (doc/objeffects.md §3). Pure functions:
  // no DOM, no registry, no WebGL. `src` is always (index, beatLocal) => point.
  const VELOCITY_H = 1 / 120;
  const RELEASE_STEP = 0.025;

  function clamp01(value) {
    return value <= 0 ? 0 : value >= 1 ? 1 : value;
  }

  function smoothstep(a, b, x) {
    if (a === b) return x >= b ? 1 : 0;
    const t = clamp01((x - a) / (b - a));
    return t * t * (3 - 2 * t);
  }

  function clampTime(t, minT, maxT) {
    if (t < minT) return minT;
    if (t > maxT) return maxT;
    return t;
  }

  // Central difference of the rigid motion (§3.2). Returns per-second
  // velocities of x, y (px/s), rot (deg/s) and uniform scale (/s).
  function velocityAt(src, i, t, h, minT, maxT) {
    const step = h == null || !(h > 0) ? VELOCITY_H : h;
    const lo = minT == null ? 0 : minT;
    const hi = maxT == null ? t : maxT;
    const b = src(i, clampTime(t - step, lo, hi));
    const f = src(i, clampTime(t + step, lo, hi));
    const dt = Math.max(1e-6, clampTime(t + step, lo, hi) - clampTime(t - step, lo, hi));
    return {
      vx: ((f.x || 0) - (b.x || 0)) / dt,
      vy: ((f.y || 0) - (b.y || 0)) / dt,
      vrot: ((f.rot || 0) - (b.rot || 0)) / dt,
      vscale: ((((f.scaleX || 1) + (f.scaleY || 1)) / 2) - (((b.scaleX || 1) + (b.scaleY || 1)) / 2)) / dt,
    };
  }

  // Normalized speed: px/s over the short side plus rotation and scale terms.
  function speedNorm(v, shortSide) {
    const distance = Math.hypot(v.vx || 0, v.vy || 0) / Math.max(1, shortSide || 1);
    return distance + Math.abs(v.vrot || 0) / 360 + Math.abs(v.vscale || 0);
  }

  function baseAmount(src, i, t, cfg, shortSide) {
    const v0 = cfg.v0 == null ? 0.02 : cfg.v0;
    const sensitivity = cfg.sensitivity == null ? 1 : cfg.sensitivity;
    const v1 = (cfg.v1 == null ? 0.6 : cfg.v1) / Math.max(0.05, sensitivity);
    const v = velocityAt(src, i, t, cfg.h, 0, cfg.maxT);
    return smoothstep(v0, Math.max(v0 + 1e-6, v1), speedNorm(v, shortSide));
  }

  // motionAmount with release tail (§3.2): the windowed maximum of past
  // amounts with a linear falloff, so a stop leaves a short afterglow that
  // scrubs deterministically (a pure function of t).
  function motionAmount(src, i, t, cfg, shortSide) {
    const now = baseAmount(src, i, t, cfg, shortSide);
    const release = Math.max(0, cfg.release == null ? 0 : cfg.release);
    if (!(release > 0)) return now;
    let best = now;
    const steps = Math.min(40, Math.floor(release / RELEASE_STEP));
    for (let k = 1; k <= steps; k += 1) {
      const past = t - k * RELEASE_STEP;
      if (past < 0) break;
      const candidate = baseAmount(src, i, past, cfg, shortSide) * (1 - (k * RELEASE_STEP) / (release + RELEASE_STEP));
      if (candidate > best) best = candidate;
    }
    return best;
  }

  // Substring selection weight 0..1 (§3.4). `helpers` supplies the runtime:
  // { unitRank(i, unit) -> { rank, count }, hash01(i, salt), inScope(i) }.
  function selectWeight(sel, params, i, N, helpers) {
    const mode = sel || 'all';
    const help = helpers || {};
    if (mode === 'all') return 1;
    if (mode === 'scope') return help.inScope ? (help.inScope(i) ? 1 : 0) : 1;
    if (mode === 'oddEven') {
      const parity = params.oddEven === 'even' ? 0 : 1;
      return (i % 2 === (parity === 0 ? 0 : 1)) ? 1 : 0;
    }
    if (mode === 'every') {
      const n = Math.max(1, Math.round(params.n == null ? 2 : params.n));
      const offset = Math.round(params.offset == null ? 0 : params.offset);
      return (((i - offset) % n) + n) % n === 0 ? 1 : 0;
    }
    if (mode === 'random') {
      const fraction = Math.max(0, Math.min(1, params.fraction == null ? 0.5 : params.fraction));
      const hash = help.hash01 ? help.hash01(i, params.seed == null ? 7 : params.seed) : 0.5;
      return hash < fraction ? 1 : 0;
    }
    if (mode === 'rank') {
      const unit = params.units || 'letter';
      const from = params.from == null ? 0 : params.from;
      const to = params.to == null ? 1 : params.to;
      let rank = i;
      let count = N;
      if (help.unitRank) {
        const resolved = help.unitRank(i, unit) || {};
        rank = resolved.rank == null ? i : resolved.rank;
        count = Math.max(1, resolved.count == null ? N : resolved.count);
      }
      const r = count <= 1 ? 0 : rank / (count - 1);
      const inside = r >= Math.min(from, to) - 1e-9 && r <= Math.max(from, to) + 1e-9;
      if (!inside) return 0;
      if (params.grade) {
        const span = Math.max(1e-9, Math.abs(to - from));
        return Math.abs(r - from) / span;
      }
      return 1;
    }
    return 1;
  }

  // Time delay (§4.1, letter/word/line): the motion-only difference between
  // now and lag seconds ago, added onto the state so holds/physics survive.
  function applyTimeDelay(state, i, t, cfg, ctx) {    const lag = Math.max(0, cfg.lag || 0);
    if (!(lag > 1e-6)) return;
    const src = ctx.transformAt;
    const P0 = src(i, t);
    const PL = src(i, t - lag);
    state.x += (PL.x || 0) - (P0.x || 0);
    state.y += (PL.y || 0) - (P0.y || 0);
    if (cfg.props === 'pos+rot' || cfg.props === 'all') {
      state.rot += (PL.rot || 0) - (P0.rot || 0);
    }
    if (cfg.props === 'all') {
      const baseX = P0.scaleX == null ? 1 : P0.scaleX;
      const baseY = P0.scaleY == null ? 1 : P0.scaleY;
      if (Math.abs(baseX) > 1e-9) state.scaleX *= (PL.scaleX == null ? 1 : PL.scaleX) / baseX;
      if (Math.abs(baseY) > 1e-9) state.scaleY *= (PL.scaleY == null ? 1 : PL.scaleY) / baseY;
    }
  }

  // Motion flicker (§4.3): opacity shimmer gated by motionAmount.
  function applyFlicker(state, i, t, cfg, ctx) {
    const depth = Math.max(0, Math.min(1, cfg.depth == null ? 0.7 : cfg.depth));
    if (!(depth > 0)) return;
    const amount = motionAmount(ctx.velocitySrc || ctx.transformAt, i, t, cfg, ctx.shortSide);
    const sel = selectWeight(cfg.select, cfg, i, ctx.N, ctx.helpers);
    if (!(amount > 0 && sel > 0)) return;
    const rate = cfg.rate == null ? 12 : cfg.rate;
    const spread = cfg.spread == null ? 0.5 : cfg.spread;
    const rank = ctx.helpers && ctx.helpers.rank01 ? ctx.helpers.rank01(i) : (ctx.N > 1 ? i / (ctx.N - 1) : 0);
    let w;
    if (cfg.wave === 'sine') {
      w = 0.5 + 0.5 * Math.sin(2 * Math.PI * (t * rate + spread * rank));
    } else if (cfg.wave === 'strobe') {
      const duty = cfg.duty == null ? 0.5 : cfg.duty;
      w = (((t * rate + spread * rank) % 1) + 1) % 1 < duty ? 1 : 0;
    } else {
      const hash = ctx.helpers && ctx.helpers.hash01
        ? ctx.helpers.hash01(i * 131 + Math.floor(t * rate), cfg.seed == null ? 21 : cfg.seed)
        : 0.5;
      w = hash;
    }
    const k = depth * amount * sel * w;
    const base = state.opacity == null ? 1 : state.opacity;
    const minOpacity = Math.max(0, Math.min(0.8, cfg.minOpacity == null ? 0.2 : cfg.minOpacity));
    state.opacity = Math.max(minOpacity * base, base * (1 - k));
  }

  // --- colorShift (§4.2) ------------------------------------------------------

  function hexToRgb(hex) {
    if (typeof hex !== 'string') return null;
    let s = hex.trim().replace(/^#/, '');
    if (/^[0-9a-fA-F]{3}$/.test(s)) s = s.split('').map((c) => c + c).join('');
    if (/^[0-9a-fA-F]{8}$/.test(s)) s = s.slice(0, 6);
    if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
    return [parseInt(s.slice(0, 2), 16) / 255, parseInt(s.slice(2, 4), 16) / 255, parseInt(s.slice(4, 6), 16) / 255];
  }

  function rgbToHsl(r, g, b) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h = 0;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
    return [h, s, l];
  }

  function hslToRgb(h, s, l) {
    const hue = ((h % 1) + 1) % 1;
    if (s === 0) return [l, l, l];
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const channel = (t) => {
      const tt = ((t % 1) + 1) % 1;
      if (tt < 1 / 6) return p + (q - p) * 6 * tt;
      if (tt < 1 / 2) return q;
      if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
      return p;
    };
    return [channel(hue + 1 / 3), channel(hue), channel(hue - 1 / 3)];
  }

  function mixRgb(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }

  function triWave(x) {
    const f = ((x % 1) + 1) % 1;
    return f < 0.5 ? f * 2 : 2 - f * 2;
  }

  // Distance travelled in shortSide units, integrated at 1/60 s with 0.25 s
  // checkpoints kept in `checkpoints` (a Map owned by the caller, e.g. on the
  // scene). Scrubbing backwards rewinds to the nearest earlier checkpoint, so
  // the value stays a pure function of t.
  const DIST_DT = 1 / 60;
  const DIST_SNAP = 0.25;

  function distanceAt(src, i, t, checkpoints, maxT, shortSide) {
    const target = Math.max(0, Math.min(maxT == null ? t : maxT, t));
    let entry = checkpoints.get(i);
    if (!entry) {
      entry = { checks: [{ t: 0, d: 0 }] };
      checkpoints.set(i, entry);
    }
    while (entry.checks.length > 1 && entry.checks[entry.checks.length - 1].t > target + 1e-9) entry.checks.pop();
    let base = entry.checks[entry.checks.length - 1];
    if (!base || base.t > target + 1e-9) {
      base = { t: 0, d: 0 };
      entry.checks = [base];
    }
    let prev = src(i, base.t);
    let d = base.d;
    let next = base.t + DIST_DT;
    let nextSnap = (Math.floor((base.t + 1e-9) / DIST_SNAP) + 1) * DIST_SNAP;
    while (next <= target + 1e-9) {
      const at = Math.min(next, target);
      const p = src(i, at);
      const dx = ((p.x || 0) - (prev.x || 0)) / Math.max(1, shortSide || 1);
      const dy = ((p.y || 0) - (prev.y || 0)) / Math.max(1, shortSide || 1);
      d += Math.hypot(dx, dy);
      prev = p;
      if (next >= nextSnap - 1e-9) {
        entry.checks.push({ t: next, d });
        nextSnap += DIST_SNAP;
      }
      next += DIST_DT;
      if (entry.checks.length > 4000) {
        entry.checks = entry.checks.filter((_, index) => index % 2 === 0);
      }
    }
    return d;
  }

  // Map the input phase to an output colour. `base` is the fill's base RGB,
  // `stops` the beat palette (arrays of [r,g,b]).
  function tintFor(palette, phase, base, stops, colorA, colorB) {
    const phi = ((phase % 1) + 1) % 1;
    if (palette === 'gradient') {
      const a = colorA || [1, 0.23, 0.42];
      const b = colorB || [0.23, 0.82, 1];
      return mixRgb(a, b, triWave(phi));
    }
    if (palette === 'beatPalette' && Array.isArray(stops) && stops.length) {
      const n = stops.length;
      if (n === 1) return stops[0].slice();
      const pos = phi * n;
      const k = Math.floor(pos) % n;
      return mixRgb(stops[k], stops[(k + 1) % n], pos - Math.floor(pos));
    }
    const hsl = rgbToHsl(base[0], base[1], base[2]);
    return hslToRgb(hsl[0] + phi, hsl[1], hsl[2]);
  }

  // ColorShift (§4.2): the travelled / speed / progress phase picks a colour
  // that the fill shader mixes over the glyph. Writes state.tint = {r,g,b,m}.
  function applyColorShift(state, i, t, cfg, ctx) {
    const mix = Math.max(0, Math.min(1, cfg.mix == null ? 0.85 : cfg.mix));
    if (!(mix > 0)) return;
    const sel = selectWeight(cfg.select, cfg, i, ctx.N, ctx.helpers);
    if (!(sel > 0)) return;
    const cycles = cfg.cycles == null ? 1 : cfg.cycles;
    let phi;
    let travelled = 0;
    if (cfg.driver === 'speed') {
      const v = velocityAt(ctx.velocitySrc || ctx.transformAt, i, t, cfg.h, 0, cfg.maxT);
      phi = speedNorm(v, ctx.shortSide) * cycles;
    } else if (cfg.driver === 'progress') {
      phi = (ctx.progress == null ? 0 : ctx.progress) * cycles;
    } else {
      travelled = distanceAt(ctx.velocitySrc || ctx.transformAt, i, t, ctx.checkpoints, cfg.maxT, ctx.shortSide);
      phi = travelled * cycles;
    }
    const rank = ctx.helpers && ctx.helpers.rank01 ? ctx.helpers.rank01(i) : (ctx.N > 1 ? i / (ctx.N - 1) : 0);
    const phiI = phi + (cfg.phase || 0) + (cfg.spread == null ? 0.3 : cfg.spread) * rank;
    const amount = motionAmount(ctx.velocitySrc || ctx.transformAt, i, t, cfg, ctx.shortSide);
    let m = mix * Math.max(amount, cfg.driver === 'distance' ? 1 : 0) * sel;
    // a letter that never travelled stays untinted, even on the distance
    // driver (the still-beat invariant); a touch of travel opens the gate
    if (cfg.driver === 'distance') m *= smoothstep(0, 0.01, travelled);
    if (ctx.colorMix > 0) m *= 0.5; // keep keyword accents readable
    if (!(m > 0.001)) return;
    const rgb = tintFor(cfg.palette || 'hueCycle', phiI, ctx.base, ctx.stops, ctx.colorA, ctx.colorB);
    state.tint = { r: rgb[0], g: rgb[1], b: rgb[2], m: Math.min(1, m) };
  }

  // --- timeDisplacement (§4.6) --------------------------------------------------

  function hash2(x, y, seed) {
    const value = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
    return value - Math.floor(value);
  }

  function valueNoise2(u, v, scale, seed) {
    const x = (u * 0.5 + 0.5) * scale;
    const y = (v * 0.5 + 0.5) * scale;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = hash2(x0, y0, seed);
    const b = hash2(x0 + 1, y0, seed);
    const c = hash2(x0, y0 + 1, seed);
    const d = hash2(x0 + 1, y0 + 1, seed);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }

  // Lag map s(u, v) in 0..1 (§4.6). velLocal is the screen velocity rotated
  // into the letter frame (unit vector or null when still).
  function lagMapValue(map, u, v, velLocal, noiseScale, seed) {
    if (map === 'linearY') return (v + 1) / 2;
    if (map === 'radial') return Math.hypot(u, v) / Math.SQRT2;
    if (map === 'noise') return valueNoise2(u, v, noiseScale == null ? 1.5 : noiseScale, seed == null ? 3 : seed);
    if (map === 'alongVelocity') {
      if (!velLocal) return 0.5;
      return (1 - (u * velLocal.x + v * velLocal.y)) / 2;
    }
    return (u + 1) / 2; // linearX
  }

  function rotPoint(x, y, deg) {
    const r = (deg * Math.PI) / 180;
    const cos = Math.cos(r);
    const sin = Math.sin(r);
    return { x: x * cos - y * sin, y: x * sin + y * cos };
  }

  // Letter-unit grid displacement (§4.6): 25 nodes, lag quantized to 5 steps
  // (5 transformAt calls, linear blend between neighbours). Writes normalized
  // offsets into `grid` (Float32Array(50), += amount * delta). The centre node
  // is subtracted at the end, so a pure translation reads as a shear about a
  // stationary centre (§7: 平行移動だけなら、せん断（中心は不動）).
  function displaceGrid(grid, i, t, cfg, ctx) {
    const src = ctx.transformAt;
    const maxLag = Math.max(0, cfg.maxLag || 0);
    if (!(maxLag > 1e-6)) return false;
    const hx = Math.max(1, ctx.hx || 24);
    const hy = Math.max(1, ctx.hy || 24);
    const now = src(i, t);
    const rotN = -(now.rot || 0);
    const sxN = now.scaleX == null ? 1 : now.scaleX;
    const syN = now.scaleY == null ? 1 : now.scaleY;
    // local velocity direction for the alongVelocity map
    let velLocal = null;
    if (cfg.map === 'alongVelocity') {
      const v = velocityAt(src, i, t, cfg.h, 0, cfg.maxT);
      const rl = rotPoint(v.vx || 0, v.vy || 0, rotN);
      const len = Math.hypot(rl.x, rl.y);
      if (len > 1e-9) velLocal = { x: rl.x / len, y: rl.y / len };
    }
    // quantized trajectory samples: Q(j/4 * maxLag back)
    const samples = [];
    for (let j = 0; j <= 4; j += 1) {
      samples.push(src(i, t - (maxLag * j) / 4));
    }
    const at = (lag) => {
      const f = Math.min(4, Math.max(0, (lag / maxLag) * 4));
      const j = Math.min(3, Math.floor(f));
      const u = f - j;
      const a = samples[j];
      const b = samples[j + 1];
      return {
        x: a.x + (b.x - a.x) * u,
        y: a.y + (b.y - a.y) * u,
        rot: (a.rot || 0) + ((b.rot || 0) - (a.rot || 0)) * u,
        scaleX: (a.scaleX == null ? 1 : a.scaleX) + ((b.scaleX == null ? 1 : b.scaleX) - (a.scaleX == null ? 1 : a.scaleX)) * u,
        scaleY: (a.scaleY == null ? 1 : a.scaleY) + ((b.scaleY == null ? 1 : b.scaleY) - (a.scaleY == null ? 1 : a.scaleY)) * u,
      };
    };
    const place = (tr, u, v) => {
      const rot = rotPoint(u * hx * (tr.scaleX == null ? 1 : tr.scaleX), v * hy * (tr.scaleY == null ? 1 : tr.scaleY), tr.rot || 0);
      return { x: (tr.x || 0) + rot.x, y: (tr.y || 0) + rot.y };
    };
    let touched = false;
    let peak = 0;
    for (let k = 0; k < 25; k += 1) {
      const u = (k % 5) / 2 - 1;
      const v = Math.floor(k / 5) / 2 - 1;
      let s = lagMapValue(cfg.map, u, v, velLocal, cfg.noiseScale, cfg.seed);
      if (cfg.invert) s = 1 - s;
      const lag = maxLag * s * (ctx.weight == null ? 1 : ctx.weight);
      if (!(lag > 1e-6)) continue;
      const past = at(lag);
      const q0 = place(now, u, v);
      const q1 = place(past, u, v);
      const d = rotPoint(q1.x - q0.x, q1.y - q0.y, rotN);
      const amount = cfg.amount == null ? 1 : cfg.amount;
      const dx = (d.x / Math.max(1e-6, sxN * hx)) * amount;
      const dy = (d.y / Math.max(1e-6, syN * hy)) * amount;
      if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) continue;
      grid[k * 2] += dx;
      grid[k * 2 + 1] += dy;
      peak = Math.max(peak, Math.abs(dx), Math.abs(dy));
      touched = true;
    }
    if (touched) {
      // recenter on the middle node: translation becomes shear, the centre
      // stays put (pure translation reads as shear, not drift)
      const cx = grid[12 * 2];
      const cy = grid[12 * 2 + 1];
      if (Math.abs(cx) > 1e-12 || Math.abs(cy) > 1e-12) {
        for (let k = 0; k < 25; k += 1) {
          grid[k * 2] -= cx;
          grid[k * 2 + 1] -= cy;
        }
      }
      peak = 0;
      for (let k = 0; k < 25; k += 1) {
        peak = Math.max(peak, Math.abs(grid[k * 2]), Math.abs(grid[k * 2 + 1]));
      }
      if (!(peak > 1e-9)) {
        for (let k = 0; k < 25; k += 1) {
          grid[k * 2] = 0;
          grid[k * 2 + 1] = 0;
        }
        return false;
      }
    }
    return touched;
  }

  // Region band weight (§4.1 region): band side of size bandSize with feather.
  function regionWeight(band, bandSize, feather, u, v) {
    const size = Math.max(0.1, Math.min(0.9, bandSize == null ? 0.5 : bandSize));
    const f = Math.max(0, Math.min(1, feather == null ? 0.4 : feather));
    const edge = 1 - size * 2; // band occupies u/v in [edge..1] mapped below
    let d;
    if (band === 'bottom') d = v;
    else if (band === 'left') d = -u;
    else if (band === 'right') d = u;
    else d = -v; // top
    const width = Math.max(1e-6, f * 2);
    const x = (d - edge) / width + 0.5;
    const t = Math.max(0, Math.min(1, x));
    return t * t * (3 - 2 * t);
  }

  // Region delay (§4.1 region + §5-1): the band's rigid lag spread over the
  // grid with a feathered weight. The band stays rigid (parallel shift), only
  // the feather seam stretches.
  function displaceRegion(grid, i, t, cfg, ctx) {
    const src = ctx.transformAt;
    const lag = Math.max(0, cfg.lag || 0);
    if (!(lag > 1e-6)) return false;
    const hx = Math.max(1, ctx.hx || 24);
    const hy = Math.max(1, ctx.hy || 24);
    const P0 = src(i, t);
    const PL = src(i, t - lag);
    const rotN = -(P0.rot || 0);
    const delta = rotPoint((PL.x || 0) - (P0.x || 0), (PL.y || 0) - (P0.y || 0), rotN);
    const sx = P0.scaleX == null ? 1 : P0.scaleX;
    const sy = P0.scaleY == null ? 1 : P0.scaleY;
    const nx = delta.x / Math.max(1e-6, sx * hx);
    const ny = delta.y / Math.max(1e-6, sy * hy);
    if (Math.abs(nx) < 1e-9 && Math.abs(ny) < 1e-9) return false;
    let touched = false;
    for (let k = 0; k < 25; k += 1) {
      const u = (k % 5) / 2 - 1;
      const v = Math.floor(k / 5) / 2 - 1;
      const w = regionWeight(cfg.band, cfg.bandSize, cfg.feather, u, v) * (ctx.weight == null ? 1 : ctx.weight);
      if (!(w > 0)) continue;
      grid[k * 2] += nx * w;
      grid[k * 2 + 1] += ny * w;
      touched = true;
    }
    return touched;
  }

  // --- motion trails (§4.4/4.5) ----------------------------------------------------
  // Per-letter shadow fade: the copy vanishes where it still sits on the body
  // (still beat → no shadow doubling under translucent glyphs).
  function trailLetterFade(dx, dy, em, minGap) {
    const d = Math.hypot(dx || 0, dy || 0) / Math.max(1e-6, em || 1);
    const lo = Math.max(0, minGap == null ? 0.08 : minGap);
    if (lo <= 0) return d > 0 ? 1 : 0;
    return smoothstep(lo, 2 * lo, d);
  }

  // Copy factors for the k-th shadow (k = 1 is the newest): opacity decay,
  // scale shrink and the colorA → colorB position.
  function trailCopy(cfg, k, count) {
    const decay = Math.max(0, Math.min(1, cfg.decay == null ? 0.35 : cfg.decay));
    return {
      opacityMul: Math.pow(1 - decay, Math.max(0, k - 1)),
      scaleMul: 1 - (cfg.scaleDecay == null ? 0 : cfg.scaleDecay) * k,
      widthMul: Math.pow(1 - (cfg.widthDecay == null ? 0 : cfg.widthDecay), Math.max(0, k - 1)),
      colorT: count <= 1 ? 0 : (k - 1) / (count - 1),
    };
  }

  return {
    VELOCITY_H,
    clamp01,
    smoothstep,
    velocityAt,
    speedNorm,
    motionAmount,
    selectWeight,
    applyTimeDelay,
    applyFlicker,
    hexToRgb,
    rgbToHsl,
    hslToRgb,
    distanceAt,
    tintFor,
    applyColorShift,
    lagMapValue,
    valueNoise2,
    displaceGrid,
    regionWeight,
    displaceRegion,
    trailLetterFade,
    trailCopy,
  };
});
