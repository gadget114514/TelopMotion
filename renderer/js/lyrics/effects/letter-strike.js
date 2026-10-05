(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../rng'), require('./registry'), require('./letter-vary'), require('../../color'), require('../patterns'));
  } else {
    root.SA = root.SA || {};
    root.SA.letterStrike = factory(root.SA.rng, root.SA.fx, root.SA.letterVary, root.SA.color, root.SA.patterns);
  }
})(typeof self !== 'undefined' ? self : this, function (rng, fx, letterVary, color, patterns) {
  'use strict';

  const TYPES = ['line', 'double', 'wave', 'slash'];

  const COMMON_PARAMS = [
    { key: 'color', kind: 'color', default: null },
    { key: 'colors', kind: 'colors', default: [] },
    { key: 'thickness', kind: 'number', min: 1, max: 40, step: 0.5, default: 6 },
    { key: 'position', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'overshoot', kind: 'number', min: -0.4, max: 0.8, step: 0.01, default: 0.12 },
    { key: 'angle', kind: 'number', min: -60, max: 60, step: 1, default: 0 },
    { key: 'opacity', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 },
    { key: 'vary', kind: 'select', options: ['none', 'alternate', 'random', 'wave', 'ramp'], default: 'none' },
    { key: 'angleJitter', kind: 'number', min: 0, max: 45, step: 1, default: 0 },
    { key: 'posJitter', kind: 'number', min: 0, max: 0.4, step: 0.01, default: 0 },
    { key: 'lengthJitter', kind: 'number', min: 0, max: 0.5, step: 0.01, default: 0 },
    { key: 'layer', kind: 'select', options: ['over', 'under'], default: 'over' },
    { key: 'drawIn', kind: 'select', options: ['none', 'stagger', 'sweep'], default: 'none' },
    { key: 'drawTime', kind: 'number', min: 0.05, max: 2, step: 0.05, default: 0.3 },
    { key: 'stagger', kind: 'number', min: 0, max: 0.5, step: 0.01, default: 0.05 },
    { key: 'pattern', kind: 'select', options: ['solid', 'dashed', 'dotted', 'double', 'zigzag', 'wave'], default: 'solid' },
    { key: 'gap', kind: 'number', min: 0, max: 1, step: 0.05, default: 0.35 },
    { key: 'seed', kind: 'int', min: 0, max: 9999, step: 1, default: 0 },
  ];

  if (fx && typeof fx.register === 'function') {
    for (const type of TYPES) {
      if (!fx.get('strike', type)) {
        fx.register({ group: 'strike', type, params: COMMON_PARAMS.map((param) => ({ ...param })), tags: ['pro'], pack: 'pro', cost: 0 });
      }
    }
  }

  function num(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp01(value) {
    return Math.max(0, Math.min(1, value));
  }

  // letter-local (lx, ly) to screen: scaleX/scaleY -> rot -> + (x, y), the same
  // order as engine quadForLetter
  function toScreen(letter, state, lx, ly) {
    const scaleX = state.scaleX == null ? 1 : state.scaleX;
    const scaleY = state.scaleY == null ? 1 : state.scaleY;
    const px = lx * scaleX;
    const py = ly * scaleY;
    const angle = ((state.rot || 0) * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return [(state.x || 0) + px * cos - py * sin, (state.y || 0) + px * sin + py * cos];
  }

  function patternCodeOf(name) {
    if (patterns && patterns.CODES && patterns.CODES[name] != null) return patterns.CODES[name];
    // mirrors SA.patterns.CODES for standalone (Node test) use
    const fallback = { solid: 0, dashed: 1, dotted: 2, double: 4, zigzag: 9, wave: 10 };
    return fallback[name] == null ? 0 : fallback[name];
  }

  function toRgba(value, fallback, ctx) {
    if (color && typeof color.toRgba === 'function') return color.toRgba(value, fallback, ctx);
    if (typeof value === 'string') return fallback;
    return fallback;
  }

  // scene.letters[i] + states[i] -> capsule specs for drawPrimitives.
  // ctx: { t, beatStart, beatId, seed, width, height, colors, resolveColor }
  function strikeSegments(scene, states, instance, ctx) {
    const context = ctx || {};
    const params = (instance && instance.params) || {};
    const type = (instance && instance.type) || 'line';
    const letters = (scene && scene.letters) || [];
    const n = letters.length;
    const t = num(context.t, 0);
    const beatStart = num(context.beatStart, 0);
    const vary = params.vary || 'none';
    const list = Array.isArray(params.colors) ? params.colors : [];
    const random = rng && typeof rng.rngFor === 'function'
      ? rng.rngFor(num(context.seed, 0), context.beatId || '', 'strike', num(params.seed, 0))
      : Math.random;
    const shortSide = Math.max(1, Math.min(num(context.width, 1920), num(context.height, 1080)));
    const thickness = num(params.thickness, 6) * shortSide / 1080;
    const opacity = num(params.opacity, 1);
    const position = num(params.position, 0.5);
    const overshoot = num(params.overshoot, 0.12);
    const angle = num(params.angle, 0);
    const angleJitter = num(params.angleJitter, 0);
    const posJitter = num(params.posJitter, 0);
    const lengthJitter = num(params.lengthJitter, 0);
    const drawIn = params.drawIn || 'none';
    const drawTime = Math.max(0.01, num(params.drawTime, 0.3));
    const stagger = Math.max(0, num(params.stagger, 0.05));
    const pattern = patternCodeOf(params.pattern || 'solid');
    const gap = num(params.gap, 0.35);
    const out = [];

    for (let i = 0; i < n; i += 1) {
      const letter = letters[i];
      const state = (states && states[i]) || {};
      if (!letter || !letter.local) continue;
      if ((state.opacity == null ? 1 : state.opacity) <= 0.01) continue;
      const k = letterVary ? letterVary.value(vary, i, n, random) : 0;
      const w = Math.max(1, letter.local.w || 0);
      const h = Math.max(1, letter.local.h || 0);
      const angDeg = angle + angleJitter * k;
      const ang = (angDeg * Math.PI) / 180;
      const cos = Math.cos(ang);
      const sin = Math.sin(ang);
      // draw-in progress for this letter
      let p = 1;
      if (drawIn === 'stagger') p = clamp01((t - beatStart - i * stagger) / drawTime);
      else if (drawIn === 'sweep') {
        const lo = i / Math.max(1, n);
        const hi = (i + 1) / Math.max(1, n);
        p = clamp01(((t - beatStart) / Math.max(0.01, drawTime) - lo) / Math.max(1e-6, hi - lo));
      }
      if (p <= 0.001) continue;
      // colour: the list cycles per letter, else the single colour
      let picked = null;
      if (list.length) {
        if (vary === 'random') picked = list[Math.min(list.length - 1, Math.floor(random() * list.length))];
        else if (vary === 'wave' || vary === 'ramp') picked = list[Math.min(list.length - 1, Math.floor((k + 1) / 2 * list.length))];
        else picked = list[i % list.length];
      } else if (params.color) {
        picked = params.color;
      }
      const fallback = context.colors && context.colors.stroke ? context.colors.stroke : [1, 1, 1, 1];
      const resolved = typeof context.resolveColor === 'function'
        ? context.resolveColor(picked, fallback)
        : toRgba(picked, Array.isArray(fallback) ? fallback : [1, 1, 1, 1], context);
      const letterOpacity = opacity * (state.opacity == null ? 1 : state.opacity);

      const push = (x0, y0, x1, y1) => {
        const [sx0, sy0] = toScreen(letter, state, x0, y0);
        const [sx1, sy1] = toScreen(letter, state, x1, y1);
        const spec = {
          kind: 'capsule',
          x0: sx0, y0: sy0, x1: sx1, y1: sy1,
          width: thickness,
          color: resolved,
          opacity: letterOpacity,
          trim: [0, p, 0],
          pattern,
          cap: 'round',
        };
        if (type === 'wave') spec.pathOp = [1, 0.25, 3, t];
        out.push(spec);
      };

      if (type === 'slash') {
        push(-w / 2, h / 2, w / 2, -h / 2);
        continue;
      }
      const hw = (w / 2) * (1 + overshoot) * (1 - lengthJitter * Math.abs(k));
      const yl = (position - 0.5 + posJitter * k) * h;
      // endpoints (-hw, yl) and (hw, yl) rotated about (0, yl)
      const rotate = (lx) => [lx * cos, yl + lx * sin];
      const [ax, ay] = rotate(-hw);
      const [bx, by] = rotate(hw);
      if (type === 'double') {
        const off = thickness * (0.5 + gap);
        // normal to the strike direction, in letter-local space
        const nx = -sin;
        const ny = cos;
        push(ax + nx * off, ay + ny * off, bx + nx * off, by + ny * off);
        push(ax - nx * off, ay - ny * off, bx - nx * off, by - ny * off);
      } else {
        push(ax, ay, bx, by);
      }
    }
    return out;
  }

  return { TYPES, COMMON_PARAMS, strikeSegments, toScreen, patternCodeOf };
});
