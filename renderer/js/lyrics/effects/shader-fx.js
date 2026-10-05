// The shader pack: dither / fade / scanline / stealth / geometry / dissolve.
//
// Every name here exists twice:
//
//   1. as a `post` type (GPU): a branch of the post fragment shader in
//      gl/shaders.js, wired through `fx.postExtensions` the same way the camera
//      pack is. It draws on the lyric layer or on the finished frame.
//   2. as a per-letter effect in `enter` / `hold` / `exit` (CPU): it writes the
//      letter state, so it can be picked in the motion gallery, run under any
//      ADSR phase (the envelope rides in `p` / `env`) and shaped by any easing
//      curve, including the parametric cubic-bezier / spring / steps forms.
//
// `fade` is the odd one out: `enter.fade` and `exit.fade` already existed as
// plain opacity effects, so they are extended in place (enter.js / exit.js) and
// only `hold.fade` is registered here.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./registry'), require('../../color'));
  else {
    root.SA = root.SA || {};
    factory(root.SA.fx, root.SA.color);
  }
})(typeof self !== 'undefined' ? self : this, function (fx, color) {
  'use strict';

  const TAU = Math.PI * 2;

  function clamp01(value) {
    return value <= 0 ? 0 : value >= 1 ? 1 : value;
  }

  function num(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function rad(degrees) {
    return (num(degrees, 0) * Math.PI) / 180;
  }

  function rgba(value, fallback, ctx) {
    return color.toRgba(value, fallback, ctx);
  }

  // --- vocabulary --------------------------------------------------------------

  // ordered-dither threshold families (see bayerThreshold in the shader)
  const DITHER_PATTERNS = ['bayer2', 'bayer4', 'bayer8', 'noise', 'cross'];
  // what gets quantised
  const DITHER_MODES = ['rgb', 'luma', 'duotone'];
  // shader-level fade shapes
  const FADE_MODES = ['toColor', 'fromColor', 'through', 'toBlack', 'toWhite'];
  // geometric trim forms, shared by the post shader and the per-letter trim
  const SHAPES = ['rect', 'roundedRect', 'circle', 'triangle', 'polygon', 'hexagon', 'diamond', 'band'];
  // the side count the shader needs; only `polygon` follows the `sides` param
  const SHAPE_SIDES = { rect: 4, roundedRect: 4, circle: 0, triangle: 3, polygon: 0, hexagon: 6, diamond: 4, band: 4 };
  // ...and the spin offset that points a vertex up (triangles, diamonds)
  const SHAPE_SPIN_OFFSET = { rect: 0, roundedRect: 0, circle: 0, triangle: -Math.PI / 2, polygon: -Math.PI / 2, hexagon: 0, diamond: -Math.PI / 2, band: 0 };

  // The per-letter trim runs on the state texture's wipe: `wipeMode` picks the
  // axis and `visibleFrac` is the progress (0 hides, 1 shows). Each geometric
  // form therefore reveals along its own axis, which is what makes a circle
  // open from the centre and a band slide across.
  const GEOMETRY_WIPES = {
    rect: 0,        // left to right
    roundedRect: 1, // right to left
    circle: 4,      // iris, centre out
    triangle: 2,    // bottom up
    polygon: 3,     // top down
    hexagon: 4,     // iris
    diamond: 5,     // diagonal
    band: 1,        // right to left
  };

  // every post instance also carries the three envelope controls, the same way
  // post.js appends them to its own table
  function envelopeParams() {
    return [
      { key: 'enabled', kind: 'bool', default: true },
      { key: 'in', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 },
      { key: 'out', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 },
    ];
  }

  // --- post (GPU) registrations ------------------------------------------------

  const POST_PACKS = [
    {
      type: 'dither',
      code: 47,
      tags: ['texture', 'shader'],
      cost: 1,
      target: 'frame',
      params: [
        { key: 'pattern', kind: 'select', options: DITHER_PATTERNS, default: 'bayer4', section: 'dither' },
        { key: 'mode', kind: 'select', options: DITHER_MODES, default: 'luma', section: 'dither' },
        { key: 'levels', kind: 'int', min: 2, max: 32, step: 1, default: 6, random: [3, 12], section: 'dither' },
        { key: 'cellSize', kind: 'number', min: 1, max: 12, step: 1, default: 2, section: 'dither' },
        { key: 'colorA', kind: 'color', default: null, section: 'dither' },
        { key: 'colorB', kind: 'color', default: null, section: 'dither' },
        { key: 'strength', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.8, random: [0.4, 1], section: 'dither' },
      ],
      uniforms(params, ctx) {
        const p = params || {};
        const context = ctx || {};
        const envelope = context.envelope == null ? 1 : Math.max(0, context.envelope);
        const pattern = Math.max(0, DITHER_PATTERNS.indexOf(p.pattern));
        const mode = Math.max(0, DITHER_MODES.indexOf(p.mode));
        return {
          u_params: [
            Math.max(2, Math.round(num(p.levels, 6))),
            Math.max(1, num(p.cellSize, 2)),
            pattern,
            envelope * clamp01(num(p.strength, 0.8)),
          ],
          u_params2: [mode, 0, 0, 0],
          u_time: context.time || 0,
          u_colorA: rgba(p.colorA, [0.05, 0.05, 0.08, 1], context),
          u_colorB: rgba(p.colorB, [0.95, 0.95, 1, 1], context),
        };
      },
    },
    {
      type: 'fade',
      code: 48,
      tags: ['shader', 'transition'],
      cost: 1,
      target: 'frame',
      params: [
        { key: 'mode', kind: 'select', options: FADE_MODES, default: 'through', section: 'fade' },
        { key: 'softness', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.4, section: 'fade' },
        { key: 'color', kind: 'color', default: null, section: 'fade' },
        { key: 'dipColor', kind: 'color', default: null, section: 'fade' },
        { key: 'strength', kind: 'number', min: 0, max: 1, step: 0.01, default: 1, section: 'fade' },
      ],
      uniforms(params, ctx) {
        const p = params || {};
        const context = ctx || {};
        const envelope = context.envelope == null ? 1 : Math.max(0, context.envelope);
        const mode = Math.max(0, FADE_MODES.indexOf(p.mode));
        const progress = context.progress == null ? 1 : clamp01(context.progress);
        const strength = clamp01(num(p.strength, 1));
        // the shader reads k as "how far the layer has faded", and k = 0 must
        // leave it alone. A dip therefore rides the beat progress itself, while
        // the one-way fades complete at the end of the beat.
        const amount = mode === 2 ? progress * strength : (1 - progress) * strength;
        return {
          u_params: [mode, clamp01(num(p.softness, 0.4)), 0, envelope * amount],
          u_time: context.time || 0,
          u_colorA: rgba(p.color, [0, 0, 0, 1], context),
          u_colorB: rgba(p.dipColor, [0, 0, 0, 1], context),
        };
      },
    },
    {
      type: 'scanline',
      code: 49,
      tags: ['texture', 'crt'],
      cost: 1,
      target: 'frame',
      params: [
        { key: 'count', kind: 'number', min: 4, max: 400, step: 2, default: 90, section: 'scanline' },
        { key: 'depth', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.35, random: [0.15, 0.6], section: 'scanline' },
        { key: 'duty', kind: 'number', min: 0.05, max: 1, step: 0.01, default: 0.45, section: 'scanline' },
        { key: 'speed', kind: 'number', min: 0, max: 4, step: 0.05, default: 0.6, random: [0, 2], section: 'scanline' },
        { key: 'angle', kind: 'number', min: -180, max: 180, step: 5, default: 0, section: 'scanline' },
        { key: 'rollHeight', kind: 'number', min: 0, max: 1, step: 0.01, default: 0, random: [0, 0.4], section: 'scanline' },
        { key: 'flicker', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.1, section: 'scanline' },
        { key: 'tint', kind: 'color', default: null, section: 'scanline' },
        { key: 'strength', kind: 'number', min: 0, max: 1, step: 0.01, default: 1, section: 'scanline' },
      ],
      uniforms(params, ctx) {
        const p = params || {};
        const context = ctx || {};
        const envelope = context.envelope == null ? 1 : Math.max(0, context.envelope);
        return {
          u_params: [
            Math.max(4, num(p.count, 90)),
            clamp01(num(p.depth, 0.35)),
            num(p.speed, 0.6),
            envelope * clamp01(num(p.strength, 1)),
          ],
          u_params2: [
            clamp01(num(p.rollHeight, 0)),
            clamp01(num(p.flicker, 0.1)),
            rad(p.angle),
            clamp01(num(p.duty, 0.45)),
          ],
          u_time: context.time || 0,
          u_colorA: rgba(p.tint, [0.55, 0.85, 1, 1], context),
        };
      },
    },
    {
      type: 'stealth',
      code: 50,
      tags: ['shader', 'glow'],
      cost: 2,
      target: 'frame',
      params: [
        { key: 'split', kind: 'number', min: 0, max: 40, step: 0.5, default: 6, random: [2, 16], section: 'stealth' },
        { key: 'angle', kind: 'number', min: -180, max: 180, step: 5, default: 0, section: 'stealth' },
        { key: 'glow', kind: 'number', min: 0, max: 3, step: 0.05, default: 1.2, random: [0.4, 2], section: 'stealth' },
        { key: 'cloak', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.6, random: [0.3, 1], section: 'stealth' },
        { key: 'shimmer', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.25, section: 'stealth' },
        { key: 'tint', kind: 'color', default: null, section: 'stealth' },
        { key: 'strength', kind: 'number', min: 0, max: 1, step: 0.01, default: 1, section: 'stealth' },
      ],
      uniforms(params, ctx) {
        const p = params || {};
        const context = ctx || {};
        const envelope = context.envelope == null ? 1 : Math.max(0, context.envelope);
        return {
          u_params: [
            Math.max(0, num(p.split, 6)),
            Math.max(0, num(p.glow, 1.2)),
            rad(p.angle),
            envelope * clamp01(num(p.strength, 1)),
          ],
          // u_params.w is the envelope the shader reads; the cloak rides in x
          u_params2: [clamp01(num(p.cloak, 0.6)), clamp01(num(p.shimmer, 0.25)), 0, 0],
          u_time: context.time || 0,
          u_colorA: rgba(p.tint, [0.55, 0.9, 1, 1], context),
        };
      },
    },
    {
      type: 'geometry',
      code: 51,
      tags: ['shader', 'mask'],
      cost: 2,
      target: 'text',
      params: [
        { key: 'shape', kind: 'select', options: SHAPES, default: 'circle', section: 'geometry' },
        { key: 'sides', kind: 'int', min: 3, max: 12, step: 1, default: 6, section: 'geometry' },
        { key: 'center', kind: 'vec2', default: { x: 0.5, y: 0.5 }, section: 'geometry' },
        { key: 'size', kind: 'number', min: 0.02, max: 2, step: 0.01, default: 0.6, section: 'geometry' },
        { key: 'angle', kind: 'number', min: -180, max: 180, step: 5, default: 0, section: 'geometry' },
        { key: 'spin', kind: 'number', min: -180, max: 180, step: 5, default: 0, section: 'geometry' },
        { key: 'radius', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.1, section: 'geometry' },
        { key: 'feather', kind: 'number', min: 0, max: 0.5, step: 0.005, default: 0.03, section: 'geometry' },
        { key: 'fillOpacity', kind: 'number', min: 0, max: 1, step: 0.01, default: 0, section: 'geometry' },
        { key: 'strokeOpacity', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.8, section: 'geometry' },
        { key: 'strokeWidth', kind: 'number', min: 0, max: 40, step: 0.5, default: 3, section: 'geometry' },
        { key: 'color', kind: 'color', default: null, section: 'geometry' },
        { key: 'colorB', kind: 'color', default: null, section: 'geometry' },
        { key: 'strength', kind: 'number', min: 0, max: 1, step: 0.01, default: 1, section: 'geometry' },
      ],
      uniforms(params, ctx) {
        const p = params || {};
        const context = ctx || {};
        const envelope = context.envelope == null ? 1 : Math.max(0, context.envelope);
        const shape = SHAPES.indexOf(p.shape);
        const name = shape < 0 ? 'circle' : p.shape;
        const center = p.center || { x: 0.5, y: 0.5 };
        const sides = SHAPE_SIDES[name] || Math.max(3, Math.round(num(p.sides, 6)));
        const progress = context.progress == null ? 1 : clamp01(context.progress);
        return {
          u_params: [
            Math.max(0, shape),
            rad(p.angle),
            clamp01(num(p.feather, 0.03)),
            envelope * progress * clamp01(num(p.strength, 1)),
          ],
          u_params2: [sides, num(center.x, 0.5), num(center.y, 0.5), Math.max(0.02, num(p.size, 0.6))],
          u_params3: [
            clamp01(num(p.radius, 0.1)),
            clamp01(num(p.fillOpacity, 0)),
            clamp01(num(p.strokeOpacity, 0.8)),
            Math.max(0, num(p.strokeWidth, 3)),
          ],
          u_params4: [rad(p.spin), SHAPE_SPIN_OFFSET[name] || 0, 0, 0],
          u_time: context.time || 0,
          u_colorA: rgba(p.color, [1, 1, 1, 1], context),
          u_colorB: rgba(p.colorB, [0.6, 0.9, 1, 1], context),
        };
      },
    },
    {
      type: 'fisheye',
      code: 52,
      tags: ['shader', 'distort'],
      cost: 1,
      target: 'frame',
      params: [
        { key: 'power', kind: 'number', min: -2, max: 4, step: 0.05, default: 1.2, random: [0.6, 2.4], section: 'fisheye' },
        { key: 'center', kind: 'vec2', default: { x: 0.5, y: 0.5 }, section: 'fisheye' },
        { key: 'lensRadius', kind: 'number', min: 0.1, max: 2, step: 0.01, default: 0.7, section: 'fisheye' },
        { key: 'aberration', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.15, section: 'fisheye' },
        { key: 'strength', kind: 'number', min: 0, max: 1, step: 0.01, default: 1, section: 'fisheye' },
      ],
      uniforms(params, ctx) {
        const p = params || {};
        const context = ctx || {};
        const envelope = context.envelope == null ? 1 : Math.max(0, context.envelope);
        const center = p.center || { x: 0.5, y: 0.5 };
        return {
          u_params: [
            num(p.power, 1.2),
            num(center.x, 0.5),
            num(center.y, 0.5),
            envelope * clamp01(num(p.strength, 1)),
          ],
          u_params2: [Math.max(0.1, num(p.lensRadius, 0.7)), clamp01(num(p.aberration, 0.15)), 0, 0],
          u_time: context.time || 0,
        };
      },
    },
  ];

  for (const pack of POST_PACKS) {
    fx.register({
      group: 'post',
      type: pack.type,
      tags: pack.tags,
      stackable: true,
      cost: pack.cost,
      params: pack.params.concat(envelopeParams()),
      defaults: { target: pack.target },
    });
  }

  fx.postExtensions = fx.postExtensions || {};
  for (const pack of POST_PACKS) {
    fx.postExtensions[pack.type] = { code: pack.code, uniforms: pack.uniforms };
  }

  // --- per-letter (CPU) motions ------------------------------------------------
  // Each family is registered in all three phases, so the same shader name is
  // available as an entrance, an emphasis loop and an exit. `p` (enter / exit)
  // is already the eased progress and `env` (hold) the ADSR level, so any easing
  // curve (including cubic-bezier / spring / steps) and any envelope works
  // without extra plumbing.

  function shortSideOf(info) {
    return info && Number(info.shortSide) > 0 ? Number(info.shortSide) : 400;
  }

  // dither: the letter's own alpha is posterised into `levels` steps. The
  // threshold alternates with the step, which reproduces the checker of an
  // ordered dither matrix once the letters are staggered.
  function ditherCore(state, progress, env, params, rng, info) {
    const levels = Math.max(2, Math.round(num(params.levels, 4)));
    const jitter = clamp01(num(params.jitter, 0.3));
    const span = levels - 1;
    const step = Math.round(clamp01(progress) * span);
    const threshold = (step % 2 === 0 ? -0.5 : 0.5) * (jitter / levels);
    state.opacity *= clamp01(step / span + threshold);
    if (jitter > 0) {
      const wobble = jitter * shortSideOf(info) * 0.008;
      state.x += (rng() * 2 - 1) * wobble;
      state.y += (rng() * 2 - 1) * wobble;
    }
    void env;
  }

  // scanline: a bright band sweeps the block and a letter lights up when the
  // band crosses the scan line it sits on (`i % lines`).
  function scanlineCore(state, sweep, env, params, rng, info) {
    const lines = Math.max(1, Math.round(num(params.lines, 12)));
    const width = Math.max(0.04, num(params.bandWidth, 0.3));
    const depth = clamp01(num(params.depth, 0.85)) * clamp01(env);
    const row = ((((info ? info.i : 0) % lines) + lines) % lines) / lines;
    const distance = Math.abs(sweep - row);
    const lit = 1 - clamp01(distance / width);
    const shaped = lit * lit * (3 - 2 * lit);
    state.opacity *= 1 - depth * (1 - shaped);
    state.flash = Math.max(state.flash || 0, shaped * depth * 0.8);
    void rng;
  }

  // stealth: the glyph sinks into its own glow. A per-letter state cannot split
  // a colour channel, so the chroma split becomes a positional jitter and the
  // glow rim becomes a flash.
  function stealthCore(state, cloak, params, rng, info) {
    const k = clamp01(cloak);
    const split = num(params.split, 6) * shortSideOf(info) * 0.01;
    const glow = clamp01(num(params.glow, 0.7));
    state.x += (rng() * 2 - 1) * split * k;
    state.y += (rng() * 2 - 1) * split * 0.4 * k;
    state.opacity *= 1 - k * glow * 0.9;
    state.flash = Math.max(state.flash || 0, k * glow);
    state.scaleX *= 1 + k * glow * 0.06;
    state.scaleY *= 1 + k * glow * 0.06;
  }

  // geometry: the SDF itself is a screen-space pass, so the per-letter version
  // drives the state texture's trim with the same shape list (see
  // GEOMETRY_WIPES for the axis each form reveals along).
  function geometryCore(state, trim, params, info) {
    const shape = SHAPES.indexOf(params.shape) < 0 ? 'circle' : params.shape;
    const feather = clamp01(num(params.feather, 0.05));
    const spin = num(params.spin, 0);
    state.wipeMode = GEOMETRY_WIPES[shape];
    state.wipeSoft = feather * 0.5;
    state.visibleFrac = Math.min(state.visibleFrac == null ? 1 : state.visibleFrac, clamp01(trim));
    if (spin !== 0) {
      // a spinning outline: the turn is per letter, the trim follows the phase
      const turn = (info ? info.i : 0) * spin;
      state.rot += turn * 0.05;
      state.scaleX *= 1 - 0.04 * Math.abs(Math.sin(turn));
    }
  }

  // the shared fade body: enter.fade / exit.fade are extended in place in
  // enter.js / exit.js, hold.fade is new and lives here.
  function fadeCore(state, progress, params) {
    const soft = clamp01(num(params.softness, 0));
    const glow = clamp01(num(params.glow, 0));
    const k = clamp01(progress);
    const level = soft > 0 ? k + (k * k * (3 - 2 * k) - k) * soft : k;
    state.opacity *= level;
    if (glow > 0) state.flash = Math.max(state.flash || 0, glow * (1 - Math.abs(level * 2 - 1)));
  }

  // a one-shot looping oscillator for the hold phases, so a family that has no
  // natural sweep of its own still loops cleanly
  function loop(value, speed, phase) {
    return clamp01(Math.sin(TAU * num(speed, 1) * value + phase) * 0.5 + 0.5);
  }
  const FAMILIES = [
    {
      name: 'dither',
      tags: ['shader', 'texture'],
      params: [
        { key: 'levels', kind: 'int', min: 2, max: 8, step: 1, default: 4, random: [2, 6] },
        { key: 'jitter', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.3, random: [0, 0.6] },
        { key: 'speed', kind: 'number', min: 0.05, max: 8, step: 0.05, default: 2, section: 'loop' },
      ],
      enter: (state, p, params, rng, info) => ditherCore(state, p, 1, params, rng, info),
      hold: (state, h, env, params, rng, info) => ditherCore(state, loop(h, params.speed, 0), env, params, rng, info),
      exit: (state, p, params, rng, info) => ditherCore(state, 1 - clamp01(p), 1, params, rng, info),
    },
    {
      name: 'scanline',
      tags: ['shader', 'crt'],
      params: [
        { key: 'lines', kind: 'int', min: 1, max: 32, step: 1, default: 8, random: [3, 16] },
        { key: 'bandWidth', kind: 'number', min: 0.05, max: 1, step: 0.01, default: 0.3, random: [0.1, 0.6] },
        { key: 'depth', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.85, random: [0.4, 1] },
        { key: 'speed', kind: 'number', min: 0.05, max: 4, step: 0.05, default: 1, section: 'loop' },
      ],
      enter: (state, p, params, rng, info) => scanlineCore(state, 1 - clamp01(p), 1, params, rng, info),
      hold: (state, h, env, params, rng, info) => scanlineCore(state, (num(params.speed, 1) * h) % 1, env, params, rng, info),
      exit: (state, p, params, rng, info) => scanlineCore(state, clamp01(p), 1, params, rng, info),
    },
    {
      name: 'stealth',
      tags: ['shader', 'glow'],
      params: [
        { key: 'split', kind: 'number', min: 0, max: 30, step: 0.5, default: 6, random: [2, 14] },
        { key: 'glow', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.7, random: [0.3, 1] },
        { key: 'speed', kind: 'number', min: 0.05, max: 6, step: 0.05, default: 1, section: 'loop' },
      ],
      enter: (state, p, params, rng, info) => stealthCore(state, 1 - clamp01(p), params, rng, info),
      hold: (state, h, env, params, rng, info) => stealthCore(state, loop(h, params.speed, (info ? info.i : 0) * 0.35) * clamp01(env), params, rng, info),
      exit: (state, p, params, rng, info) => stealthCore(state, clamp01(p), params, rng, info),
    },
    {
      name: 'geometry',
      tags: ['shader', 'mask'],
      params: [
        { key: 'shape', kind: 'select', options: SHAPES, default: 'circle', random: 'any' },
        { key: 'feather', kind: 'number', min: 0, max: 0.5, step: 0.005, default: 0.05, random: [0, 0.2] },
        { key: 'spin', kind: 'number', min: -180, max: 180, step: 5, default: 0, random: [-90, 90] },
        { key: 'speed', kind: 'number', min: 0.05, max: 4, step: 0.05, default: 0.6, section: 'loop' },
      ],
      enter: (state, p, params, rng, info) => geometryCore(state, clamp01(p), params, info),
      hold: (state, h, env, params, rng, info) => geometryCore(state, loop(h, params.speed, 0) * clamp01(env), params, info),
      exit: (state, p, params, rng, info) => geometryCore(state, 1 - clamp01(p), params, info),
    },
    {
      name: 'fade',
      tags: ['shader', 'basic'],
      params: [
        { key: 'softness', kind: 'number', min: 0, max: 1, step: 0.01, default: 0 },
        { key: 'glow', kind: 'number', min: 0, max: 1, step: 0.01, default: 0, random: [0, 0.5] },
      ],
      // only the hold counterpart is new: enter.fade / exit.fade already existed
      hold: (state, h, env, params, rng, info) => {
        void rng;
        void info;
        void h;
        fadeCore(state, env, params);
      },
    },
    {
      name: 'mosaicBreak',
      tags: ['shader', 'dissolve'],
      params: [
        { key: 'cell', kind: 'number', min: 2, max: 32, step: 1, default: 8, random: [4, 16] },
        { key: 'scatter', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.4 },
      ],
      enter: (state, p, params, rng, info) => {
        const k = clamp01(p);
        state.dissolve = { scale: params.cell == null ? 8 : params.cell, progress: k, edge: 0.25 };
        const s = (params.scatter == null ? 0.4 : params.scatter) * shortSideOf(info) * 0.03 * (1 - k);
        state.x += (rng() * 2 - 1) * s; state.y += (rng() * 2 - 1) * s;
      },
      hold: (state, h, env, params, rng, info) => {
        state.dissolve = { scale: params.cell == null ? 8 : params.cell, progress: clamp01(env), edge: 0.25 };
        void h; void rng; void info;
      },
      exit: (state, p, params, rng, info) => {
        const k = clamp01(p);
        state.dissolve = { scale: params.cell == null ? 8 : params.cell, progress: 1 - k, edge: 0.25 };
        const s = (params.scatter == null ? 0.4 : params.scatter) * shortSideOf(info) * 0.03 * k;
        state.x += (rng() * 2 - 1) * s; state.y += (rng() * 2 - 1) * s;
      },
    },
    {
      name: 'fogBreak',
      tags: ['shader', 'dissolve'],
      params: [
        { key: 'soft', kind: 'number', min: 0, max: 40, step: 0.5, default: 12 },
        { key: 'rise', kind: 'number', min: -0.5, max: 0.5, step: 0.01, default: 0.1 },
      ],
      enter: (state, p, params, rng, info) => {
        const k = clamp01(p);
        state.blur = Math.max(state.blur || 0, (params.soft == null ? 12 : params.soft) * (1 - k));
        state.opacity *= k * k;
        state.y -= (params.rise == null ? 0.1 : params.rise) * shortSideOf(info) * (1 - k) * 0.2;
        void rng;
      },
      hold: (state, h, env, params, rng, info) => {
        state.blur = Math.max(state.blur || 0, (params.soft == null ? 12 : params.soft) * 0.25 * clamp01(env));
        state.opacity *= 1 - 0.3 * clamp01(env);
        void h; void rng; void info;
      },
      exit: (state, p, params, rng, info) => {
        const k = clamp01(p);
        state.blur = Math.max(state.blur || 0, (params.soft == null ? 12 : params.soft) * k);
        state.opacity *= 1 - k;
        state.y -= (params.rise == null ? 0.1 : params.rise) * shortSideOf(info) * k * 0.2;
        void rng;
      },
    },
    {
      name: 'windBreak',
      tags: ['shader', 'dissolve', 'wind'],
      params: [
        { key: 'wind', kind: 'number', min: -1, max: 1, step: 0.01, default: 0.5, random: [-0.8, 0.8] },
        { key: 'grain', kind: 'number', min: 1, max: 12, step: 0.1, default: 3 },
      ],
      enter: (state, p, params, rng, info) => {
        const k = 1 - clamp01(p);
        state.x += (params.wind == null ? 0.5 : params.wind) * shortSideOf(info) * 0.3 * k;
        state.dissolve = { scale: params.grain == null ? 3 : params.grain, progress: clamp01(p), edge: 0.2 };
        state.opacity *= clamp01(p * 1.5);
        void rng;
      },
      hold: (state, h, env, params, rng, info) => {
        state.x += (params.wind == null ? 0.5 : params.wind) * shortSideOf(info) * 0.05 * clamp01(env) * Math.sin(h * 2 + info.i);
        void rng;
      },
      exit: (state, p, params, rng, info) => {
        const k = clamp01(p);
        state.x += (params.wind == null ? 0.5 : params.wind) * shortSideOf(info) * 0.3 * k;
        state.dissolve = { scale: params.grain == null ? 3 : params.grain, progress: 1 - k, edge: 0.2 };
        void rng;
      },
    },
    {
      name: 'windNoBreak',
      tags: ['shader', 'wind'],
      params: [
        { key: 'wind', kind: 'number', min: -1, max: 1, step: 0.01, default: 0.5, random: [-0.8, 0.8] },
        { key: 'rise', kind: 'number', min: -0.5, max: 0.5, step: 0.01, default: 0.08 },
      ],
      enter: (state, p, params, rng, info) => {
        const k = 1 - clamp01(p);
        state.x += (params.wind == null ? 0.5 : params.wind) * shortSideOf(info) * 0.35 * k * k;
        state.y -= (params.rise == null ? 0.08 : params.rise) * shortSideOf(info) * k;
        state.opacity *= clamp01(p * 1.4);
        void rng;
      },
      hold: (state, h, env, params, rng, info) => {
        state.x += (params.wind == null ? 0.5 : params.wind) * shortSideOf(info) * 0.03 * clamp01(env);
        void h; void rng; void info;
      },
      exit: (state, p, params, rng, info) => {
        const k = clamp01(p);
        state.x += (params.wind == null ? 0.5 : params.wind) * shortSideOf(info) * 0.35 * k * k;
        state.y -= (params.rise == null ? 0.08 : params.rise) * shortSideOf(info) * k;
        state.opacity *= 1 - k;
        void rng;
      },
    },
    {
      name: 'cloth',
      tags: ['shader', 'deform', 'wind'],
      params: [
        { key: 'amount', kind: 'number', min: 0, max: 0.5, step: 0.01, default: 0.12 },
        { key: 'speed', kind: 'number', min: 0.1, max: 4, step: 0.05, default: 0.9 },
      ],
      enter: (state, p, params) => {
        const k = 1 - clamp01(p);
        state.deform.push({ type: 'wobbleWarp', amount: (params.amount == null ? 0.12 : params.amount) * k, scale: 2, time: k * 2, seed: 0 });
        state.opacity *= clamp01(p * 1.3);
        void params.speed;
      },
      hold: (state, h, env, params, rng, info) => {
        state.deform.push({ type: 'wobbleWarp', amount: (params.amount == null ? 0.12 : params.amount) * clamp01(env), scale: 2, time: h * (params.speed || 0.9), seed: info.i });
        void rng;
      },
      exit: (state, p, params) => {
        const k = clamp01(p);
        state.deform.push({ type: 'wobbleWarp', amount: (params.amount == null ? 0.12 : params.amount) * k, scale: 2, time: k * 2, seed: 0 });
        state.opacity *= 1 - k * 0.7;
        void params.speed;
      },
    },
  ];

  for (const family of FAMILIES) {
    for (const phase of ['enter', 'exit', 'hold']) {
      const cpu = family[phase];
      if (!cpu) continue;
      fx.register({
        group: phase,
        type: family.name,
        tags: family.tags,
        cost: 1,
        params: family.params,
        cpu,
      });
    }
  }

  return {
    DITHER_PATTERNS,
    DITHER_MODES,
    FADE_MODES,
    SHAPES,
    SHAPE_SIDES,
    GEOMETRY_WIPES,
    POST_CODES: POST_PACKS.reduce((map, pack) => {
      map[pack.type] = pack.code;
      return map;
    }, {}),
  };
});
