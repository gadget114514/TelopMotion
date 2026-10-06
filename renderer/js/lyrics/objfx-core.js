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
  };
});
