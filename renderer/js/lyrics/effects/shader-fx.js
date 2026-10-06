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

  // --- break-family helpers ----------------------------------------------------
  // Every break family staggers itself across the string (a built-in cascade),
  // so neighbouring letters never move as one block.

  // the letter's place in the line, 0 (first) .. 1 (last)
  function waveOf(info) {
    const n = Math.max(1, num(info && info.N, 1));
    return n > 1 ? num(info ? info.i : 0, 0) / (n - 1) : 0;
  }
  // a built-in cascade: the letter at `order` starts `order * spread` into the phase
  function cascade(p, order, spreadAmount) {
    return clamp01((clamp01(p) - order * spreadAmount) / (1 - spreadAmount));
  }
  function smooth(k) {
    const t = clamp01(k);
    return t * t * (3 - 2 * t);
  }
  // a time-varying hash (rng() is fixed per letter, so glitches need their own)
  function hash1(n) {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }
  function windSign(params) {
    return num(params.wind, 0.5) < 0 ? -1 : 1;
  }
  // 0 for the upwind-most letter, 1 for the downwind-most
  function upwindOrder(info, sign) {
    const w = waveOf(info);
    return sign > 0 ? w : 1 - w;
  }
  // dust grains ride the dissolve: only while the glyph is coming apart
  function emitDust(state, progress, dust) {
    if (!(dust && dust.amount > 0) || progress <= 0.001 || progress >= 0.999) return;
    state.represent = 'dust';
    state.dust = dust;
  }
  // encodeWarpParam(0, 0) in warp.js: a block warp with no extra distortion
  const NEUTRAL_WARP_PARAM = 5050;

  // The wind's force at time t, felt by a letter `order` (0 upwind .. 1
  // downwind) along the line: |wind| is the base strength, `gust` how far it
  // swings. Three incommensurate sines are the turbulence, a sharp periodic
  // pulse is the gust front; both travel downwind, so a gust crosses the line.
  function windForce(t, order, params) {
    const base = Math.abs(num(params.wind, 0.8));
    const gust = clamp01(num(params.gust, 0.5));
    const speed = Math.max(0.05, num(params.speed, 0.8));
    const tt = t * speed - order * 0.35;
    const turbulence = 0.55 * Math.sin(TAU * 0.23 * tt) + 0.3 * Math.sin(TAU * 0.61 * tt + 1.7) + 0.15 * Math.sin(TAU * 1.37 * tt + 4.1);
    const front = Math.pow(Math.max(0, Math.sin(TAU * 0.17 * tt)), 6);
    return base * Math.max(0, 1 + gust * (0.6 * turbulence + 1.4 * front));
  }
  // the force as a 0..~1 deformation scale (soft-saturating, so a storm of 3
  // bends hard but never folds the glyph inside out)
  function windBend(force) {
    return Math.tanh(force * 0.9);
  }
  // Anisotropic rotated scatter in x/y space: two independent draws in
  // -1..1, scaled per axis by scatterX / scatterY, rotated by scatterAngle
  // (degrees), then scaled by the overall scatter strength. The defaults
  // (1, 1, 0) give the draws back untouched, so existing looks are unchanged.
  function scatterVec(ox, oy, params, W, kx, ky) {
    const t = ((params.scatterAngle == null ? 0 : params.scatterAngle) * Math.PI) / 180;
    const ax = ox * (params.scatterX == null ? 1 : params.scatterX);
    const ay = oy * (params.scatterY == null ? 1 : params.scatterY);
    const c = Math.cos(t);
    const s = Math.sin(t);
    const m = params.scatter == null ? 0.4 : params.scatter;
    return [(ax * c - ay * s) * m * W * kx, (ax * s + ay * c) * m * W * ky];
  }
  // the shared cloth sheet: one block-scale wave plus per-letter pliability,
  // with the fold orientation following the wave slope and a fake shading
  // (dark lee slopes, lit windward slopes). No x/y drift here, so enter at
  // p=1 and exit at p=0 keep the clean landing the break tests require.
  function clothSheet(state, ph, D, h, speed, w, i, sign, shade) {
    const slope = Math.cos(ph);
    const sh = shade == null ? 1 : shade;
    state.deform.push({ type: 'waveBlock', amount: 1.4 * D, time: ph, param: NEUTRAL_WARP_PARAM });
    state.deform.push({ type: 'flag', amount: 1.2 * D, time: h * speed * 2 - w * 4 });
    state.deform.push({ type: 'wobbleWarp', amount: 0.15 * D, scale: 2, time: h * speed, seed: i });
    state.rot += sign * 22 * D * slope;
    state.tiltY = (state.tiltY || 0) + 40 * D * slope;
    state.tiltX = (state.tiltX || 0) + 12 * D * Math.sin(ph);
    state.opacity *= 1 - 0.28 * D * Math.max(0, -slope) * sh;
    const lit = Math.max(0, slope);
    state.flash = Math.max(state.flash || 0, 0.35 * D * lit * lit * lit * sh);
    void h;
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
        { key: 'scatter', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.4, random: [0, 0.8] },
        { key: 'scatterX', kind: 'number', min: 0, max: 2, step: 0.01, default: 1, random: [0, 1.6] },
        { key: 'scatterY', kind: 'number', min: 0, max: 2, step: 0.01, default: 1, random: [0, 1.6] },
        { key: 'scatterAngle', kind: 'number', min: -180, max: 180, step: 5, default: 0, random: [-90, 90] },
        { key: 'speed', kind: 'number', min: 0.05, max: 4, step: 0.05, default: 0.6, section: 'loop' },
        { key: 'dust', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.8 },
      ],
      enter: (state, p, params, rng, info) => {
        const W = shortSideOf(info);
        const w = waveOf(info);
        const k = cascade(p, w, 0.5);
        const step = Math.ceil((1 - k) * 6) / 6;
        const cell = params.cell == null ? 8 : params.cell;
        state.dissolve = { scale: cell, progress: k, edge: 0.18, mode: 1 };
        const sc = scatterVec(rng() * 2 - 1, rng() * 2 - 1, params, W, 0.06 * step, 0.06 * step);
        state.x += sc[0];
        state.y += sc[1];
        state.scaleX *= 1 + 0.25 * step;
        state.scaleY *= 1 + 0.25 * step;
        if (k > 0) state.flash = Math.max(state.flash || 0, 0.6 * step);
        emitDust(state, k, { amount: params.dust == null ? 0.8 : params.dust, windX: 0, windY: 0.15, size: 4.5, turbulence: 0.2, spread: 0.9 });
      },
      hold: (state, h, env, params, rng, info) => {
        const W = shortSideOf(info);
        const w = waveOf(info);
        const speed = params.speed == null ? 0.6 : params.speed;
        const ph = (((h * speed - w * 0.6) % 1) + 1) % 1;
        const b = (ph < 0.18 ? Math.sin((ph / 0.18) * Math.PI) : 0) * clamp01(env);
        if (b > 0.001) {
          state.dissolve = { scale: params.cell == null ? 8 : params.cell, progress: 1 - 0.45 * b, edge: 0.25, mode: 1 };
          const fr = Math.floor(h * 24);
          const i = info ? num(info.i, 0) : 0;
          const sc = scatterVec(hash1(fr * 7 + i) * 2 - 1, hash1(fr * 13 + i * 3) * 2 - 1, params, W, 0.03 * b, 0.03 * b);
          state.x += sc[0];
          state.y += sc[1];
          state.flash = Math.max(state.flash || 0, 0.5 * b);
          emitDust(state, 1 - 0.45 * b, { amount: params.dust == null ? 0.8 : params.dust, windX: 0, windY: 0.15, size: 4.5, turbulence: 0.2, spread: 0.9 });
        }
        void rng;
      },
      exit: (state, p, params, rng, info) => {
        const W = shortSideOf(info);
        const w = waveOf(info);
        const k = cascade(p, w, 0.5);
        const step = Math.ceil(k * 6) / 6;
        state.dissolve = { scale: params.cell == null ? 8 : params.cell, progress: 1 - k, edge: 0.18, mode: 1 };
        const sc = scatterVec(rng() * 2 - 1, rng() * 2 - 1, params, W, 0.06 * step, 0.06 * step);
        state.x += sc[0];
        state.y += sc[1];
        state.y += W * 0.05 * k * k;
        state.flash = Math.max(state.flash || 0, 2 * k * (1 - k));
        emitDust(state, 1 - k, { amount: params.dust == null ? 0.8 : params.dust, windX: 0, windY: 0.15, size: 4.5, turbulence: 0.2, spread: 0.9 });
      },
    },
    {
      name: 'fogBreak',
      tags: ['shader', 'dissolve'],
      params: [
        { key: 'soft', kind: 'number', min: 0, max: 40, step: 0.5, default: 12 },
        { key: 'rise', kind: 'number', min: -0.5, max: 0.5, step: 0.01, default: 0.1 },
        { key: 'scatter', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.4, random: [0, 0.8] },
        { key: 'scatterX', kind: 'number', min: 0, max: 2, step: 0.01, default: 1, random: [0, 1.6] },
        { key: 'scatterY', kind: 'number', min: 0, max: 2, step: 0.01, default: 1, random: [0, 1.6] },
        { key: 'scatterAngle', kind: 'number', min: -180, max: 180, step: 5, default: 0, random: [-90, 90] },
        { key: 'speed', kind: 'number', min: 0.05, max: 4, step: 0.05, default: 0.35, section: 'loop' },
        { key: 'dust', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.6 },
      ],
      enter: (state, p, params, rng, info) => {
        const W = shortSideOf(info);
        const w = waveOf(info);
        const k = cascade(p, w, 0.35);
        const kk = smooth(k);
        const soft = params.soft == null ? 12 : params.soft;
        state.blur = Math.max(state.blur || 0, soft * 1.5 * (1 - kk));
        state.opacity *= kk;
        state.y += (params.rise == null ? 0.1 : params.rise) * W * 0.6 * (1 - kk);
        state.scaleX *= 1 + 0.18 * (1 - kk);
        // scatter: the letters drift off their line while the fog lifts
        const sc = scatterVec(rng() * 2 - 1, rng() * 2 - 1, params, W, 0.06 * (1 - kk), 0.06 * (1 - kk));
        state.x += sc[0];
        state.y += sc[1];
        const progress = Math.min(1, k * 1.2);
        state.dissolve = { scale: 3, progress, edge: 0.5, mode: 2 };
        emitDust(state, progress, { amount: params.dust == null ? 0.6 : params.dust, windX: 0.05, windY: -0.35, size: 1.6, turbulence: 1.0, spread: 0.3 });
      },
      hold: (state, h, env, params, rng, info) => {
        const W = shortSideOf(info);
        const w = waveOf(info);
        const speed = params.speed == null ? 0.35 : params.speed;
        const s = Math.sin(TAU * h * speed - w * TAU * 0.8) * 0.5 + 0.5;
        const e = clamp01(env);
        const soft = params.soft == null ? 12 : params.soft;
        state.blur = Math.max(state.blur || 0, soft * 0.35 * s * e);
        state.opacity *= 1 - 0.35 * s * e;
        state.y -= (params.rise == null ? 0.1 : params.rise) * W * 0.08 * s * e;
        state.x += Math.sin(TAU * h * speed * 0.5 + num(info ? info.i : 0, 0)) * W * 0.006 * e;
        // scatter: a per-letter jitter riding the same swell, so 0 stays calm
        const fr = Math.floor(h * 24);
        const i = info ? num(info.i, 0) : 0;
        const sc = scatterVec(hash1(fr * 7 + i) * 2 - 1, hash1(fr * 13 + i * 3) * 2 - 1, params, W, 0.03 * s * e, 0.03 * s * e);
        state.x += sc[0];
        state.y += sc[1];
        const progress = 1 - 0.25 * s * e;
        state.dissolve = { scale: 2.5, progress, edge: 0.4, mode: 2 };
        emitDust(state, progress, { amount: params.dust == null ? 0.6 : params.dust, windX: 0.05, windY: -0.35, size: 1.6, turbulence: 1.0, spread: 0.3 });
        void rng;
      },
      exit: (state, p, params, rng, info) => {
        const W = shortSideOf(info);
        const w = waveOf(info);
        const k = cascade(p, w, 0.35);
        const soft = params.soft == null ? 12 : params.soft;
        state.blur = Math.max(state.blur || 0, soft * 1.5 * k);
        state.opacity *= 1 - smooth(k);
        state.y -= (params.rise == null ? 0.1 : params.rise) * W * 0.8 * k;
        state.scaleX *= 1 + 0.25 * k;
        state.scaleY *= 1 + 0.1 * k;
        // scatter: the letters come apart as the fog takes them
        const sc = scatterVec(rng() * 2 - 1, rng() * 2 - 1, params, W, 0.08 * k, 0.05 * k);
        state.x += sc[0];
        state.y += sc[1];
        state.dissolve = { scale: 3, progress: 1 - k, edge: 0.5, mode: 2 };
        emitDust(state, 1 - k, { amount: params.dust == null ? 0.6 : params.dust, windX: 0.05, windY: -0.35, size: 1.6, turbulence: 1.0, spread: 0.3 });
      },
    },
    {
      name: 'windBreak',
      tags: ['shader', 'dissolve', 'wind'],
      params: [
        { key: 'wind', kind: 'number', min: -1, max: 1, step: 0.01, default: 0.5, random: [-0.8, 0.8] },
        { key: 'grain', kind: 'number', min: 1, max: 12, step: 0.1, default: 3 },
        { key: 'lift', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.3 },
        { key: 'scatter', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.4, random: [0, 0.8] },
        { key: 'scatterX', kind: 'number', min: 0, max: 2, step: 0.01, default: 1, random: [0, 1.6] },
        { key: 'scatterY', kind: 'number', min: 0, max: 2, step: 0.01, default: 1, random: [0, 1.6] },
        { key: 'scatterAngle', kind: 'number', min: -180, max: 180, step: 5, default: 0, random: [-90, 90] },
        { key: 'speed', kind: 'number', min: 0.05, max: 4, step: 0.05, default: 0.8, section: 'loop' },
        { key: 'dust', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 },
      ],
      enter: (state, p, params, rng, info) => {
        const W = shortSideOf(info);
        const sign = windSign(params);
        const mag = Math.abs(num(params.wind, 0.5));
        const o = upwindOrder(info, sign);
        const k = cascade(p, 1 - o, 0.45);
        const r = 1 - k;
        const lift = params.lift == null ? 0.3 : params.lift;
        state.x -= sign * mag * W * 0.9 * r * r;
        state.y -= lift * W * 0.25 * Math.sin(r * Math.PI) * (0.75 + 0.5 * rng());
        state.rot -= sign * 40 * r * (0.5 + rng());
        // scatter: loose letters torn off the line while flying in
        const sc = scatterVec(rng() * 2 - 1, rng() * 2 - 1, params, W, 0.15 * r * r, 0.1 * r);
        state.x += sc[0];
        state.y += sc[1];
        state.dissolve = { scale: params.grain == null ? 3 : params.grain, progress: k, edge: 0.2, dir: { x: sign, y: 0 }, bias: 0.7 };
        state.opacity *= clamp01(k * 2);
        emitDust(state, k, { amount: params.dust == null ? 1 : params.dust, windX: sign * mag * 1.2, windY: -lift * 0.4, size: 2.4, turbulence: 0.5, spread: 0.15 });
      },
      hold: (state, h, env, params, rng, info) => {
        const W = shortSideOf(info);
        const sign = windSign(params);
        const mag = Math.abs(num(params.wind, 0.5));
        const o = upwindOrder(info, sign);
        const speed = params.speed == null ? 0.8 : params.speed;
        const lift = params.lift == null ? 0.3 : params.lift;
        const g = Math.pow(Math.max(0, Math.sin(TAU * h * speed * 0.5 - o * 2.5)), 3) * clamp01(env);
        state.x += sign * mag * W * 0.03 * g;
        state.rot += sign * 6 * g;
        state.y -= lift * W * 0.01 * g;
        // scatter: the hold shivers off the line while a gust passes
        const sc = scatterVec(rng() * 2 - 1, rng() * 2 - 1, params, W, 0.02 * g, 0.02 * g);
        state.x += sc[0];
        state.y += sc[1];
        if (g > 0.6) {
          const progress = 1 - 0.18 * ((g - 0.6) / 0.4);
          state.dissolve = { scale: params.grain == null ? 3 : params.grain, progress, edge: 0.2, dir: { x: sign, y: 0 }, bias: 0.8 };
          emitDust(state, progress, { amount: params.dust == null ? 1 : params.dust, windX: sign * mag * 1.2, windY: -lift * 0.4, size: 2.4, turbulence: 0.5, spread: 0.15 });
        }
      },
      exit: (state, p, params, rng, info) => {
        const W = shortSideOf(info);
        const sign = windSign(params);
        const mag = Math.abs(num(params.wind, 0.5));
        const o = upwindOrder(info, sign);
        const k = cascade(p, o, 0.45);
        const lift = params.lift == null ? 0.3 : params.lift;
        state.x += sign * mag * W * 1.1 * k * k;
        state.y -= lift * W * 0.35 * k * (0.6 + 0.8 * rng());
        state.rot += sign * 90 * k * k * (0.4 + 0.8 * rng());
        state.scaleX *= 1 + 0.2 * k;
        // scatter: the letters come apart as the wind takes them
        const sc = scatterVec(rng() * 2 - 1, rng() * 2 - 1, params, W, 0.15 * k * k, 0.1 * k);
        state.x += sc[0];
        state.y += sc[1];
        state.dissolve = { scale: params.grain == null ? 3 : params.grain, progress: 1 - k, edge: 0.22, dir: { x: sign, y: 0 }, bias: 0.75 };
        emitDust(state, 1 - k, { amount: params.dust == null ? 1 : params.dust, windX: sign * mag * 1.2, windY: -lift * 0.4, size: 2.4, turbulence: 0.5, spread: 0.15 });
      },
    },
    {
      name: 'windNoBreak',
      tags: ['shader', 'wind'],
      params: [
        { key: 'wind', kind: 'number', min: -3, max: 3, step: 0.05, default: 0.8, random: [-1.5, 1.5] },
        { key: 'gust', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
        { key: 'rise', kind: 'number', min: -0.5, max: 0.5, step: 0.01, default: 0.08 },
        { key: 'speed', kind: 'number', min: 0.05, max: 4, step: 0.05, default: 0.8, section: 'loop' },
      ],
      enter: (state, p, params, rng, info) => {
        const W = shortSideOf(info);
        const sign = windSign(params);
        const o = upwindOrder(info, sign);
        const k = cascade(p, 1 - o, 0.4);
        const r = 1 - k;
        const speed = params.speed == null ? 0.8 : params.speed;
        const F = windForce(p * 2, o, params);
        const B = windBend(F);
        state.x -= sign * W * (0.25 + 0.35 * B) * r * r;
        // damped oscillation into place: the lean overshoots, then settles
        state.skewX -= sign * (0.75 * B * r + 0.25 * B * Math.sin(k * TAU) * (1 - k));
        state.deform.push({ type: 'waveBlock', amount: (0.35 + 0.9 * B) * (0.3 + 0.7 * r), time: -sign * TAU * (p * 2) * speed * 0.6, param: NEUTRAL_WARP_PARAM });
        state.y -= (params.rise == null ? 0.08 : params.rise) * W * r;
        state.opacity *= clamp01(k * 1.6);
        void rng;
      },
      hold: (state, h, env, params, rng, info) => {
        const W = shortSideOf(info);
        const sign = windSign(params);
        const o = upwindOrder(info, sign);
        const speed = params.speed == null ? 0.8 : params.speed;
        const e = clamp01(env);
        const F = windForce(h, o, params) * e;
        const B = windBend(F);
        state.deform.push({ type: 'waveBlock', amount: (0.35 + 0.9 * B) * e, time: -sign * TAU * h * speed * 0.6, param: NEUTRAL_WARP_PARAM });
        state.skewX -= sign * 0.75 * B;
        state.deform.push({ type: 'bend', amount: sign * 0.35 * B, time: 0 });
        state.deform.push({ type: 'shearWave', amount: 0.6 * B, time: h * speed * 3 - o * 2, param: 1.5 });
        state.x += sign * W * 0.04 * B;
        state.y -= (params.rise == null ? 0.08 : params.rise) * W * 0.3 * B;
        state.rot += sign * 10 * B * Math.sin(TAU * h * speed * 1.3 - o * 3);
        state.tiltY = (state.tiltY || 0) + sign * 18 * B * Math.sin(TAU * h * speed * 0.9 - o * 2.4);
        void rng;
      },
      exit: (state, p, params, rng, info) => {
        const W = shortSideOf(info);
        const sign = windSign(params);
        const o = upwindOrder(info, sign);
        const speed = params.speed == null ? 0.8 : params.speed;
        const k = cascade(p, o, 0.4);
        const F = windForce(p * 2, o, params) * (1 + 2 * k);
        const B = windBend(F);
        state.x += sign * W * (0.5 + 0.8 * B) * k * k;
        state.y -= (params.rise == null ? 0.08 : params.rise) * W * 1.2 * k;
        state.skewX -= sign * 0.85 * B;
        state.rot += sign * 25 * k * k;
        state.deform.push({ type: 'waveBlock', amount: 0.35 + 1.1 * B, time: -sign * TAU * (p * 2) * speed * 0.6, param: NEUTRAL_WARP_PARAM });
        state.opacity *= 1 - smooth(k);
        state.blur = Math.max(state.blur || 0, 6 * k);
        void rng;
      },
    },
    {
      name: 'cloth',
      tags: ['shader', 'deform', 'wind'],
      params: [
        { key: 'amount', kind: 'number', min: 0, max: 1.5, step: 0.01, default: 0.6 },
        { key: 'wind', kind: 'number', min: -3, max: 3, step: 0.05, default: 1.0, random: [-1.5, 1.5] },
        { key: 'gust', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
        { key: 'speed', kind: 'number', min: 0.1, max: 4, step: 0.05, default: 0.9 },
      ],
      enter: (state, p, params, rng, info) => {
        const W = shortSideOf(info);
        const w = waveOf(info);
        const sign = windSign(params);
        const o = upwindOrder(info, sign);
        const i = info ? num(info.i, 0) : 0;
        const A = params.amount == null ? 0.6 : params.amount;
        const speed = params.speed == null ? 0.9 : params.speed;
        const k = cascade(p, w, 0.5);
        const r = 1 - k;
        state.wipeMode = 0;
        state.wipeSoft = 0.15;
        state.visibleFrac = Math.min(state.visibleFrac == null ? 1 : state.visibleFrac, smooth(k));
        const D = A * (0.5 + 1.0 * r);
        const hh = p * 3;
        const ph = TAU * (hh * speed * 0.8) - sign * (w * 2 - 1) * Math.PI * 1.5;
        // shading peaks mid-wipe and clears at both ends, so the landed letter is clean
        clothSheet(state, ph, D, hh, speed, w, i, sign, k * r * 4);
        state.y += A * W * 0.3 * Math.sin(p * TAU * 1.5 - w * TAU) * r;
        state.opacity *= clamp01(k * 3);
        void rng;
        void o;
      },
      hold: (state, h, env, params, rng, info) => {
        const W = shortSideOf(info);
        const w = waveOf(info);
        const sign = windSign(params);
        const o = upwindOrder(info, sign);
        const i = info ? num(info.i, 0) : 0;
        const A = params.amount == null ? 0.6 : params.amount;
        const speed = params.speed == null ? 0.9 : params.speed;
        const e = clamp01(env);
        const F = windForce(h, o, params) * e;
        const B = windBend(F);
        const D = A * (0.4 + 0.8 * B);
        const ph = TAU * (h * speed * 0.8) - sign * (w * 2 - 1) * Math.PI * 1.5;
        clothSheet(state, ph, D, h, speed, w, i, sign);
        state.x += sign * W * 0.03 * B;
        void rng;
      },
      exit: (state, p, params, rng, info) => {
        const W = shortSideOf(info);
        const w = waveOf(info);
        const sign = windSign(params);
        const o = upwindOrder(info, sign);
        const i = info ? num(info.i, 0) : 0;
        const A = params.amount == null ? 0.6 : params.amount;
        const speed = params.speed == null ? 0.9 : params.speed;
        const k = cascade(p, w, 0.5);
        const F = windForce(p * 3, o, params) * (1 + 2.5 * k);
        const D = A * (0.4 + 0.8 * windBend(F)) * (1 + 1.5 * k);
        const hh = p * 3;
        const ph = TAU * (hh * speed * 0.8) - sign * (w * 2 - 1) * Math.PI * 1.5;
        // no shading on the resting letter; it joins the blowaway
        clothSheet(state, ph, D, hh, speed, w, i, sign, smooth(k));
        state.y -= W * 0.5 * k * k;
        state.x += sign * W * 0.25 * k * k;
        state.rot += sign * 40 * k * k * (rng() - 0.3);
        state.opacity *= 1 - smooth(k);
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
