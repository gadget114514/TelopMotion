(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.SA = root.SA || {};
    root.SA.frameGuard = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Guarantees that at least `1 - maxOut` of the text block's area stays inside
  // the (camera-projected) frame. The corrections run in order of least visual
  // damage: reduce a zoomBlock deform, translate the block, then shrink it
  // uniformly about the anchor.
  //
  // `states` are the letter states motion.js produced (they are mutated in
  // place when a correction applies). `camera` = { zoom, ox, oy } where the
  // effective frame is centred at (W/2 - ox*W, H/2 - oy*H) with size W/zoom.

  const EPS = 1e-6;
  const ITERATIONS = 24;

  function num(value, fallback) {
    if (value == null || value === '') return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function zoomBlockFactorOf(state) {
    let factor = 1;
    for (const entry of (state && state.deform) || []) {
      if (entry && entry.type === 'zoomBlock') factor *= Math.max(0.02, 1 + num(entry.amount, 0));
    }
    return factor;
  }

  // The soft body lattice deforms a letter beyond its static bbox: the half
  // extents grow by the largest normalized displacement the physics wrote.
  function softHalfOf(state) {
    const half = state && state.physHalf;
    const lattice = state && state.softLattice;
    if (!half || !lattice || !lattice.length) return null;
    let maxX = 0;
    let maxY = 0;
    for (let i = 0; i < lattice.length; i += 2) {
      const x = Math.abs(num(lattice[i], 0));
      const y = Math.abs(num(lattice[i + 1], 0));
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    return { x: num(half.x, 0) * (1 + maxX), y: num(half.y, 0) * (1 + maxY) };
  }

  function setZoomBlockFactor(state, factor) {
    for (const entry of (state && state.deform) || []) {
      if (entry && entry.type === 'zoomBlock') entry.amount = factor - 1;
    }
  }

  function bboxOf(states, anchor) {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const state of states) {
      const factor = zoomBlockFactorOf(state);
      let halfW = (Math.abs(num(state.local && state.local.w, 0)) * Math.abs(num(state.scaleX, 1))) / 2;
      let halfH = (Math.abs(num(state.local && state.local.h, 0)) * Math.abs(num(state.scaleY, 1))) / 2;
      const soft = softHalfOf(state);
      if (soft) {
        halfW = Math.max(halfW, soft.x * Math.abs(num(state.scaleX, 1)));
        halfH = Math.max(halfH, soft.y * Math.abs(num(state.scaleY, 1)));
      }
      const left = anchor.x + (state.x - halfW - anchor.x) * factor;
      const right = anchor.x + (state.x + halfW - anchor.x) * factor;
      const top = anchor.y + (state.y - halfH - anchor.y) * factor;
      const bottom = anchor.y + (state.y + halfH - anchor.y) * factor;
      x0 = Math.min(x0, left);
      x1 = Math.max(x1, right);
      y0 = Math.min(y0, top);
      y1 = Math.max(y1, bottom);
    }
    return { x0, y0, x1, y1, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) };
  }

  function visibleRatio(states, anchor, frame) {
    const box = bboxOf(states, anchor);
    if (box.width <= EPS || box.height <= EPS) return 1;
    const overlapX = Math.max(0, Math.min(box.x1, frame.x1) - Math.max(box.x0, frame.x0));
    const overlapY = Math.max(0, Math.min(box.y1, frame.y1) - Math.max(box.y0, frame.y0));
    return (overlapX * overlapY) / (box.width * box.height);
  }

  function effectiveFrame(frame, camera) {
    const zoom = Math.max(0.05, num(camera && camera.zoom, 1));
    const ox = num(camera && camera.ox, 0);
    const oy = num(camera && camera.oy, 0);
    const width = frame.width / zoom;
    const height = frame.height / zoom;
    const cx = frame.width / 2 - ox * frame.width;
    const cy = frame.height / 2 - oy * frame.height;
    return { x0: cx - width / 2, y0: cy - height / 2, x1: cx + width / 2, y1: cy + height / 2 };
  }

  function guard(states, options) {
    const opts = options || {};
    const frame = opts.frame || { width: 1920, height: 1080 };
    const maxOut = opts.maxOut == null ? 0.5 : Math.max(0, Math.min(1, num(opts.maxOut, 0.5)));
    const threshold = 1 - maxOut;
    const anchor = opts.anchor || { x: frame.width / 2, y: frame.height / 2 };
    const letterStates = (states || []).filter((state) => state && num(state.opacity, 1) > 0.02);
    if (!letterStates.length) return { corrected: 0, visible: 1 };
    const eff = effectiveFrame(frame, opts.camera);
    let corrected = 0;
    let visible = visibleRatio(letterStates, anchor, eff);
    if (visible >= threshold - EPS) return { corrected, visible };

    // (a) a zoomBlock enlarged the block: lower its amount until the block fits
    const factors = letterStates.map(zoomBlockFactorOf);
    const maxFactor = Math.max(...factors);
    if (maxFactor > 1 + EPS) {
      const apply = (factor) => {
        for (const state of letterStates) setZoomBlockFactor(state, factor);
      };
      apply(1);
      if (visibleRatio(letterStates, anchor, eff) >= threshold - EPS) {
        let lo = 1;
        let hi = maxFactor;
        for (let i = 0; i < ITERATIONS; i += 1) {
          const mid = (lo + hi) / 2;
          apply(mid);
          if (visibleRatio(letterStates, anchor, eff) >= threshold - EPS) lo = mid;
          else hi = mid;
        }
        apply(lo);
        corrected += 1;
        visible = visibleRatio(letterStates, anchor, eff);
        if (visible >= threshold - EPS) return { corrected, visible };
      }
    }

    // (b) translate the whole block towards the effective frame centre. A block
    // that fits is simply centred; a larger one finds the smallest move.
    if (opts.allowTranslate) {
      const box = bboxOf(letterStates, anchor);
      const dx = (eff.x0 + eff.x1) / 2 - (box.x0 + box.x1) / 2;
      const dy = (eff.y0 + eff.y1) / 2 - (box.y0 + box.y1) / 2;
      const base = letterStates.map((state) => ({ x: state.x, y: state.y, warp: state.warpOrigin || null }));
      const apply = (t) => {
        for (let i = 0; i < letterStates.length; i += 1) {
          const state = letterStates[i];
          state.x = base[i].x + dx * t;
          state.y = base[i].y + dy * t;
          if (base[i].warp) {
            state.warpOrigin = { x: base[i].warp.x + dx * t, y: base[i].warp.y + dy * t };
          }
        }
      };
      apply(1);
      if (visibleRatio(letterStates, anchor, eff) >= threshold - EPS) {
        let lo = 0;
        let hi = 1;
        for (let i = 0; i < ITERATIONS; i += 1) {
          const mid = (lo + hi) / 2;
          apply(mid);
          if (visibleRatio(letterStates, anchor, eff) >= threshold - EPS) hi = mid;
          else lo = mid;
        }
        apply(hi);
        corrected += 1;
        visible = visibleRatio(letterStates, anchor, eff);
        if (visible >= threshold - EPS) return { corrected, visible };
      } else {
        apply(1);
        visible = visibleRatio(letterStates, anchor, eff);
      }
    }

    // (c) still too far out: shrink uniformly about the anchor. Like the
    // translation this only runs for a fully entered, not-yet-exiting beat so
    // entrance / exit slides keep their intended off-screen travel.
    if (opts.allowTranslate) {
      const base = letterStates.map((state) => ({
        x: state.x,
        y: state.y,
        scaleX: num(state.scaleX, 1),
        scaleY: num(state.scaleY, 1),
        warp: state.warpOrigin || null,
      }));
      const applyScale = (scale) => {
        for (let i = 0; i < letterStates.length; i += 1) {
          const state = letterStates[i];
          state.x = anchor.x + (base[i].x - anchor.x) * scale;
          state.y = anchor.y + (base[i].y - anchor.y) * scale;
          state.scaleX = base[i].scaleX * scale;
          state.scaleY = base[i].scaleY * scale;
          if (base[i].warp) {
            state.warpOrigin = { x: base[i].warp.x * scale, y: base[i].warp.y * scale };
          }
        }
      };
      let lo = 0.05;
      let hi = 1;
      applyScale(lo);
      if (visibleRatio(letterStates, anchor, eff) >= threshold - EPS) {
        for (let i = 0; i < ITERATIONS; i += 1) {
          const mid = (lo + hi) / 2;
          applyScale(mid);
          if (visibleRatio(letterStates, anchor, eff) >= threshold - EPS) lo = mid;
          else hi = mid;
        }
        applyScale(lo);
        corrected += 1;
      }
    }
    visible = visibleRatio(letterStates, anchor, eff);
    return { corrected, visible };
  }

  return { guard, visibleRatio, bboxOf, effectiveFrame };
});
