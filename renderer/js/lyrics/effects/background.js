(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./registry'), require('../../color'));
  else {
    root.SA = root.SA || {};
    factory(root.SA.fx, root.SA.color);
  }
})(typeof self !== 'undefined' ? self : this, function (fx, color) {
  'use strict';

  // 2 is the fbm-blended soft gradient (`noiseGradient`), 14 the directional
  // linear ramp (`gradient`): eight directions, two to four stops.
  const TYPES = { none: 1, solid: 1, plain: 13, gradient: 14, noiseGradient: 2, card: 3, cover: 4, image: 5, fractalNoise: 6, rays: 7, gradient4: 8, cellPattern: 9, particleField: 10, perspectiveGrid: 11, tunnel: 12 };

  // The eight directions of the linear gradient, clockwise from straight down.
  // The index is what travels to the shader (u_mode), so the order is part of
  // the shader contract.
  const GRADIENT_DIRECTIONS = ['toBottom', 'toBottomLeft', 'toLeft', 'toTopLeft', 'toTop', 'toTopRight', 'toRight', 'toBottomRight'];

  // the gradient param accepts a stop array or a `{ stops: [...] }` value
  function gradientStops(value) {
    if (Array.isArray(value)) return value;
    if (value && Array.isArray(value.stops)) return value.stops;
    return null;
  }

  // two to four stops: the extras keep the palette default until the user adds
  // a stop, and the count selects the ramp shape in the shader (u_mode2)
  function packStops(stops, colors) {
    const count = stops && stops.length >= 2 ? Math.min(4, stops.length) : 2;
    const at = (index) => (stops && stops[index] != null ? stops[index].color || stops[index] : null);
    const out = colors.slice();
    for (let i = 0; i < count; i += 1) {
      const value = at(i);
      if (value != null) out[i] = value;
    }
    return { colors: out, ramp: count - 2, stops: Boolean(stops && stops.length >= 2) };
  }

  fx.register({
    group: 'background',
    type: 'none',
    tags: ['basic'],
    params: [],
    cost: 0,
  });

  fx.register({
    group: 'background',
    type: 'solid',
    params: [{ key: 'color', kind: 'color', default: null }],
    cost: 0,
  });

  // The plain colour: one flat field, no glow, drift or vignette. `solid`
  // keeps its soft centre lift, this one is the bare base plate.
  fx.register({
    group: 'background',
    type: 'plain',
    tags: ['basic'],
    params: [{ key: 'color', kind: 'color', default: null }],
    cost: 0,
  });

  fx.register({
    group: 'background',
    type: 'gradient',
    tags: ['basic'],
    params: [
      { key: 'colors', kind: 'gradient', default: null },
      // the eight directions, clockwise from straight down (see GRADIENT_DIRECTIONS)
      { key: 'direction', kind: 'select', options: GRADIENT_DIRECTIONS, default: 'toBottom' },
      // the ramp length: 1 runs across the frame, above 1 flattens it out
      { key: 'scale', kind: 'number', min: 0.25, max: 4, step: 0.05, default: 1.15 },
      { key: 'speed', kind: 'number', min: 0, max: 2, step: 0.05, default: 0.1 },
      // the centre-bright lift; null keeps the built-in default (see shaders).
      // `catalog:false` keeps the pre-existing effect catalogues byte-identical
      { key: 'glow', kind: 'number', min: 0, max: 0.5, step: 0.01, default: null, catalog: false },
    ],
    cost: 1,
  });

  fx.register({
    group: 'background',
    type: 'noiseGradient',
    params: [
      { key: 'colors', kind: 'gradient', default: null },
      { key: 'scale', kind: 'number', min: 0.5, max: 12, step: 0.1, default: 3 },
      { key: 'speed', kind: 'number', min: 0, max: 2, step: 0.05, default: 0.2 },
      // see `gradient` above: `catalog:false` keeps the catalogues stable
      { key: 'glow', kind: 'number', min: 0, max: 0.5, step: 0.01, default: null, catalog: false },
    ],
    cost: 2,
  });

  fx.register({
    group: 'background',
    type: 'card',
    tags: ['basic'],
    params: [
      { key: 'dim', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.35 },
      { key: 'blur', kind: 'number', min: 0, max: 40, step: 0.5, default: 0 },
      { key: 'focusBadge', kind: 'bool', default: true },
      { key: 'zoom', kind: 'number', min: 1, max: 3, step: 0.05, default: 1.6 },
      { key: 'parallax', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.1 },
    ],
    cost: 1,
  });

  fx.register({
    group: 'background',
    type: 'cover',
    params: [
      { key: 'songId', kind: 'text', default: '' },
      { key: 'blur', kind: 'number', min: 0, max: 40, step: 0.5, default: 0 },
      { key: 'dim', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.4 },
      { key: 'zoomSpeed', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.1 },
    ],
    cost: 2,
  });

  fx.register({
    group: 'background',
    type: 'image',
    params: [
      { key: 'imageId', kind: 'text', default: '' },
      { key: 'fit', kind: 'select', options: ['cover', 'contain'], default: 'cover' },
      { key: 'blur', kind: 'number', min: 0, max: 40, step: 0.5, default: 0 },
      { key: 'dim', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.3 },
    ],
    cost: 2,
  });

  // Animated background patterns (grid / dots / stripes / rings).
  fx.register({
    group: 'background',
    type: 'pattern',
    tags: ['featured'],
    params: [
      { key: 'mode', kind: 'select', options: ['grid', 'dots', 'stripes', 'rings', 'triangles', 'diamonds', 'hexes', 'rain', 'checks', 'polka', 'sineCurve', 'waves', 'randomFill'], default: 'grid' },
      { key: 'count', kind: 'int', min: 4, max: 120, step: 1, default: 24 },
      { key: 'size', kind: 'number', min: 0.2, max: 3, step: 0.05, default: 1 },
      { key: 'speed', kind: 'number', min: 0, max: 3, step: 0.05, default: 0.4 },
      { key: 'opacity', kind: 'number', min: 0.05, max: 1, step: 0.05, default: 0.55 },
      { key: 'color', kind: 'color', default: null },
    ],
    cost: 2,
  });

  // Animated shapes drawn behind the lyrics (reuses the filler shape renderer).
  fx.register({
    group: 'background',
    type: 'shapes',
    tags: ['featured'],
    params: [
      { key: 'kind', kind: 'select', options: ['shapes', 'particles', 'waveform', 'spectrum', 'sineWave', 'progress'], default: 'shapes' },
      { key: 'set', kind: 'select', options: ['circles', 'polygons', 'lines', 'burst', 'grid', 'orbit'], default: 'circles' },
      { key: 'count', kind: 'int', min: 1, max: 48, step: 1, default: 10 },
      { key: 'speed', kind: 'number', min: 0, max: 4, step: 0.1, default: 0.8 },
      { key: 'opacity', kind: 'number', min: 0.05, max: 1, step: 0.05, default: 0.45 },
      { key: 'color', kind: 'color', default: null },
    ],
    cost: 2,
  });

  // Background primitives (fractal noise, rays, 4-colour gradient, cell
  // pattern, particle field, perspective grid, tunnel). They all follow the
  // camera (u_camera) and share the u_params/u_params2/u_params3 layout.
  fx.register({
    group: 'background',
    type: 'fractalNoise',
    pack: 'pro',
    tags: ['pro', 'noise'],
    params: [
      { key: 'scale', kind: 'number', min: 0.5, max: 8, step: 0.1, default: 2 },
      { key: 'stretch', kind: 'number', min: 0.2, max: 4, step: 0.05, default: 1 },
      { key: 'contrast', kind: 'number', min: 0.05, max: 4, step: 0.05, default: 1.2 },
      { key: 'brightness', kind: 'number', min: -0.5, max: 0.5, step: 0.01, default: 0 },
      { key: 'kind', kind: 'select', options: ['basic', 'abs', 'ridged', 'sharp'], default: 'basic' },
      { key: 'octaves', kind: 'int', min: 1, max: 6, step: 1, default: 4 },
      { key: 'ramp', kind: 'select', options: ['two', 'three', 'four', 'mono'], default: 'three' },
      { key: 'evolution', kind: 'number', min: 0, max: 2, step: 0.02, default: 0.15 },
      { key: 'rate', kind: 'number', min: -2, max: 2, step: 0.05, default: 0.1 },
      { key: 'subInfluence', kind: 'number', min: 0, max: 1, step: 0.01, default: 0 },
      { key: 'subScale', kind: 'number', min: 0.2, max: 4, step: 0.05, default: 1 },
      { key: 'subRotation', kind: 'number', min: -180, max: 180, step: 5, default: 45 },
      { key: 'warp', kind: 'number', min: 0, max: 1, step: 0.01, default: 0 },
    ],
    cost: 2,
  });

  fx.register({
    group: 'background',
    type: 'rays',
    pack: 'pro',
    tags: ['pro', 'light'],
    params: [
      { key: 'kind', kind: 'select', options: ['rays', 'lightRays', 'spotlight'], default: 'rays' },
      { key: 'rays', kind: 'int', min: 3, max: 64, step: 1, default: 12 },
      { key: 'spin', kind: 'number', min: -180, max: 180, step: 1, default: 8 },
      { key: 'width', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.35 },
      { key: 'softness', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
      { key: 'center', kind: 'vec2', default: { x: 0.5, y: 0.35 } },
      { key: 'falloff', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.3 },
      { key: 'noise', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.25 },
    ],
    cost: 3,
  });

  fx.register({
    group: 'background',
    type: 'gradient4',
    pack: 'pro',
    tags: ['pro'],
    params: [
      { key: 'speed', kind: 'number', min: 0, max: 2, step: 0.02, default: 0.3 },
      { key: 'swirl', kind: 'number', min: -1, max: 1, step: 0.01, default: 0.2 },
      { key: 'blend', kind: 'number', min: 0.5, max: 4, step: 0.05, default: 1.4 },
      { key: 'jitter', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.1 },
      // optional (hand-edited / set by the generator): 'none' keeps the four
      // palette slots as they are; the others derive the four colours from one
      // base so they read as a family instead of a rainbow smear
      { key: 'harmony', kind: 'select', options: ['none', 'tonal', 'analogous', 'accent'], default: 'none', optional: true },
      { key: 'grain', kind: 'number', min: 0, max: 1, step: 0.01, default: 0, optional: true },
    ],
    cost: 2,
  });

  fx.register({
    group: 'background',
    type: 'cellPattern',
    pack: 'pro',
    tags: ['pro', 'noise'],
    params: [
      { key: 'kind', kind: 'select', options: ['cells', 'cracks', 'plates', 'sparkle', 'bubbles'], default: 'cells' },
      { key: 'scale', kind: 'number', min: 2, max: 40, step: 0.5, default: 12 },
      { key: 'contrast', kind: 'number', min: 0.1, max: 3, step: 0.05, default: 1.2 },
      { key: 'dispersion', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
      { key: 'evolution', kind: 'number', min: 0, max: 2, step: 0.02, default: 0.1 },
      { key: 'edge', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.3 },
    ],
    cost: 3,
  });

  fx.register({
    group: 'background',
    type: 'particleField',
    pack: 'pro',
    tags: ['pro', 'particles'],
    params: [
      { key: 'kind', kind: 'select', options: ['bokeh', 'stars', 'snow', 'dust', 'embers', 'rain', 'hyperspace'], default: 'bokeh' },
      { key: 'density', kind: 'number', min: 4, max: 80, step: 1, default: 18 },
      { key: 'size', kind: 'number', min: 0.1, max: 3, step: 0.05, default: 0.8 },
      { key: 'sizeVar', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
      { key: 'layers', kind: 'int', min: 1, max: 5, step: 1, default: 3 },
      { key: 'speed', kind: 'number', min: -3, max: 3, step: 0.05, default: 0.2 },
      { key: 'direction', kind: 'number', min: -180, max: 180, step: 1, default: 90 },
      { key: 'twinkle', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.4 },
      { key: 'softness', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.6 },
      { key: 'base', kind: 'number', min: 0, max: 1, step: 0.01, default: 0 },
    ],
    cost: 3,
  });

  fx.register({
    group: 'background',
    type: 'perspectiveGrid',
    pack: 'pro',
    tags: ['pro', 'retro'],
    params: [
      { key: 'sun', kind: 'select', options: ['none', 'sun'], default: 'sun' },
      { key: 'horizon', kind: 'number', min: 0.05, max: 0.95, step: 0.01, default: 0.5 },
      { key: 'spacing', kind: 'number', min: 0.02, max: 1, step: 0.01, default: 0.25 },
      { key: 'speed', kind: 'number', min: -3, max: 3, step: 0.05, default: 0.5 },
      { key: 'lineWidth', kind: 'number', min: 0.1, max: 4, step: 0.1, default: 1 },
      { key: 'glow', kind: 'number', min: 0, max: 3, step: 0.05, default: 0.8 },
      { key: 'fog', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.6 },
      { key: 'sunSize', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.35 },
    ],
    cost: 3,
  });

  fx.register({
    group: 'background',
    type: 'tunnel',
    pack: 'pro',
    tags: ['pro', 'retro'],
    params: [
      { key: 'shape', kind: 'select', options: ['circle', 'square', 'hex'], default: 'circle' },
      { key: 'rings', kind: 'number', min: 2, max: 40, step: 0.5, default: 10 },
      { key: 'speed', kind: 'number', min: -3, max: 3, step: 0.05, default: 1 },
      { key: 'twist', kind: 'number', min: -2, max: 2, step: 0.02, default: 0.2 },
      { key: 'stripes', kind: 'number', min: 0, max: 24, step: 1, default: 8 },
      { key: 'fog', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.6 },
    ],
    cost: 3,
  });

  function toRgb(value, fallback, ctx) {
    return color.toRgba(value, fallback, ctx);
  }

  function num(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  // Four colours from one base (rgba 0..1 array). The steps move away from the
  // base's own lightness so a dark background gains lighter companions.
  function harmonize4(base, scheme) {
    const hsv = color.rgbToHsv({ r: base[0], g: base[1], b: base[2], a: 1 });
    const up = hsv.v < 0.55 ? 1 : -1;
    const make = (dh, ds, dv) => {
      const rgb = color.hsvToRgb({ h: hsv.h + dh, s: Math.max(0, Math.min(1, hsv.s * ds)), v: Math.max(0.06, Math.min(0.95, hsv.v + up * dv)), a: 1 });
      return [rgb.r, rgb.g, rgb.b, 1];
    };
    if (scheme === 'analogous') return [make(0, 1, 0), make(24, 1, 0.1), make(-24, 1.05, 0.06), make(44, 0.9, 0.2)];
    if (scheme === 'accent') return [make(0, 1, 0), make(8, 1, 0.1), make(-8, 0.95, 0.18), make(150, 0.8, 0.28)];
    return [make(0, 1, 0), make(0, 0.95, 0.1), make(0, 0.9, 0.2), make(0, 0.8, 0.3)];
  }

  function backgroundUniforms(instance, ctx) {
    const params = (instance && instance.params) || {};
    const type = TYPES[(instance && instance.type) || 'none'] || 1;
    const context = ctx || {};
    let colorA = toRgb(context.theme && context.theme.bg, [0.043, 0.051, 0.07, 1]);
    let colorB = toRgb(context.theme && context.theme.bgSoft, [0.063, 0.075, 0.106, 1]);
    let colorC = [0.56, 0.72, 1, 1];
    let colorD = [1, 0.91, 0.69, 1];
    // the scoped (theme / cue / beat) palette drives the background unless the instance overrides it
    const palette = context.palette && Array.isArray(context.palette.colors) ? context.palette.colors : null;
    if (palette && palette.length) {
      colorA = toRgb(palette[0], colorA);
      colorB = toRgb(palette[palette.length > 1 ? 1 : 0], colorB);
      colorC = toRgb(palette.length > 3 ? palette[3] : palette[palette.length - 1], colorC);
      colorD = toRgb(palette[2], colorD);
    }
    let p4 = [num(params.scale, 3), 0, 0, 0];
    let p42 = [0, 0, 0, 0];
    let p43 = [0, 0, 0, 0];
    let mode = 0;
    let mode2 = 0;
    // the centre-bright lift amount rides in u_params.z; null / unset packs -1
    // and the shader then uses its built-in default (0.22 / 0.25)
    const glow = params.glow == null ? -1 : num(params.glow, -1);
    if (type === 1) {
      colorA = toRgb(params.color, colorA, context);
      p4[2] = glow;
    } else if (type === 13) {
      // plain: the shader's flat branch only reads u_colorA
      colorA = toRgb(params.color, colorA, context);
    } else if (type === 2) {
      // noiseGradient: the fbm blend, two to four stops
      const base = [colorA, colorB, colorC, colorD];
      const packed = packStops(gradientStops(params.colors), base);
      [colorA, colorB, colorC, colorD] = packed.colors.map((value, index) => toRgb(value, base[index], context));
      if (packed.stops) mode2 = packed.ramp;
      p4 = [num(params.scale, 3), num(params.speed, 0.3), glow, 0];
    } else if (type === 14) {
      // gradient: a straight ramp along one of eight directions, two to four
      // stops. u_mode is the direction index, u_mode2 the stop count - 2,
      // u_params = [ramp length, drift speed, centre lift, unused]
      const base = [colorA, colorB, colorC, colorD];
      const packed = packStops(gradientStops(params.colors), base);
      [colorA, colorB, colorC, colorD] = packed.colors.map((value, index) => toRgb(value, base[index], context));
      if (packed.stops) mode2 = packed.ramp;
      const direction = GRADIENT_DIRECTIONS.indexOf(params.direction);
      mode = direction < 0 ? 0 : direction;
      p4 = [num(params.scale, 1.15), num(params.speed, 0.1), glow, 0];
    } else if (type === 3 || type === 4 || type === 5) {
      const zoom = num(params.zoom, 1.6);
      p4 = [zoom, num(context.focusX, 0), num(context.focusY, 0), num(params.dim, 0.35)];
      if (context.cardTheme) colorB = toRgb(context.cardTheme.bg, colorB);
    } else if (type === 6) {
      // fractalNoise
      const kindMap = { basic: 0, abs: 1, ridged: 2, sharp: 3 };
      const rampMap = { two: 0, three: 1, four: 2, mono: 3 };
      mode = kindMap[params.kind] == null ? 0 : kindMap[params.kind];
      mode2 = rampMap[params.ramp] == null ? 1 : rampMap[params.ramp];
      p4 = [num(params.scale, 2), num(params.stretch, 1), num(params.contrast, 1.2), num(params.brightness, 0)];
      p42 = [num(params.octaves, 4), num(params.subInfluence, 0), num(params.subScale, 1), num(params.subRotation, 45)];
      p43 = [num(params.evolution, 0.15), num(params.rate, 0.1), 0, num(params.warp, 0)];
    } else if (type === 7) {
      // rays / lightRays / spotlight
      mode = { rays: 0, lightRays: 1, spotlight: 2 }[params.kind] || 0;
      const center = params.center || { x: 0.5, y: 0.35 };
      p4 = [num(params.rays, 12), num(params.spin, 8), num(params.width, 0.35), num(params.softness, 0.5)];
      p42 = [num(center.x, 0.5), num(center.y, 0.35), num(params.falloff, 0.3), num(params.noise, 0.25)];
    } else if (type === 8) {
      // gradient4
      p4 = [num(params.speed, 0.3), num(params.swirl, 0.2), num(params.blend, 1.4), num(params.jitter, 0.1)];
      const harmony = params.harmony;
      if (harmony === 'tonal' || harmony === 'analogous' || harmony === 'accent') {
        [colorA, colorB, colorC, colorD] = harmonize4(colorA, harmony);
        p43[1] = 1; // the slow warp flow and the soft vignette
      }
      p43[0] = Math.max(0, Math.min(1, num(params.grain, 0)));
    } else if (type === 9) {
      // cellPattern
      mode = { cells: 0, cracks: 1, plates: 2, sparkle: 3, bubbles: 4 }[params.kind] || 0;
      p4 = [num(params.scale, 12), num(params.contrast, 1.2), num(params.dispersion, 0.5), num(params.evolution, 0.1)];
      p43[0] = num(params.edge, 0.3);
    } else if (type === 10) {
      // particleField
      mode = { bokeh: 0, stars: 1, snow: 2, dust: 3, embers: 4, rain: 5, hyperspace: 6 }[params.kind] || 0;
      p4 = [num(params.density, 18), num(params.size, 0.8), num(params.sizeVar, 0.5), num(params.base, 0)];
      p42 = [num(params.layers, 3), num(params.speed, 0.2), num(params.direction, 90), num(params.twinkle, 0.4)];
      p43[0] = num(params.softness, 0.6);
    } else if (type === 11) {
      // perspectiveGrid
      mode = params.sun === 'sun' ? 1 : 0;
      p4 = [num(params.horizon, 0.5), num(params.spacing, 0.25), num(params.speed, 0.5), num(params.lineWidth, 1)];
      p42 = [num(params.glow, 0.8), num(params.fog, 0.6), 0, num(params.sunSize, 0.35)];
    } else if (type === 12) {
      // tunnel
      mode = { circle: 0, square: 1, hex: 2 }[params.shape] || 0;
      p4 = [num(params.rings, 10), num(params.speed, 1), num(params.twist, 0.2), num(params.stripes, 8)];
      p42[0] = num(params.fog, 0.6);
    }
    const camera = Array.isArray(context.camera) ? context.camera : [0, 0, 1, 0];
    return {
      u_type: type,
      u_colorA: colorA,
      u_colorB: colorB,
      u_colorC: colorC,
      u_colorD: colorD,
      u_params: p4,
      u_params2: p42,
      u_params3: p43,
      u_mode: mode,
      u_mode2: mode2,
      u_camera: camera,
      u_time: context.time || 0,
      cardTexture: context.cardTexture || null,
    };
  }

  fx.backgroundUniforms = backgroundUniforms;
  fx.backgroundTypes = TYPES;
  return fx;
});
