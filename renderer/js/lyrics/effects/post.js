(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./registry'), require('../../color'));
  else {
    root.SA = root.SA || {};
    factory(root.SA.fx, root.SA.color);
  }
})(typeof self !== 'undefined' ? self : this, function (fx, color) {
  'use strict';

  const POST_TYPES = [
    { type: 'glitchBlocks', code: 1, tags: ['glitch', 'degrade'], cost: 2, target: 'text', params: [['blockSize', 'number', 24, 4, 128], ['rate', 'number', 6, 1, 30], ['intensity', 'number', 0.5, 0, 1], ['rgbSplit', 'bool', true]] },
    { type: 'rgbShift', code: 2, tags: ['glitch'], cost: 1, target: 'text', params: [['amount', 'number', 3, 0, 30], ['angle', 'number', 0, -180, 180], ['jitter', 'number', 0.3, 0, 1]] },
    { type: 'scanTear', code: 3, tags: ['glitch'], cost: 2, target: 'text', params: [['lines', 'number', 24, 2, 200], ['amount', 'number', 0.4, 0, 1], ['speed', 'number', 1, 0, 4]] },
    { type: 'vhsTracking', code: 4, tags: ['glitch'], cost: 2, target: 'text', params: [['amount', 'number', 0.3, 0, 1], ['noise', 'number', 0.2, 0, 1], ['rollSpeed', 'number', 0.3, 0, 2]] },
    { type: 'dataSmear', code: 5, tags: ['glitch', 'degrade'], cost: 3, target: 'text', params: [['amount', 'number', 0.4, 0, 1], ['direction', 'number', 0, -180, 180], ['threshold', 'number', 0.3, 0, 1]] },
    { type: 'digitalNoise', code: 6, tags: ['glitch', 'degrade'], cost: 1, target: 'text', params: [['density', 'number', 0.3, 0, 1], ['blockSize', 'number', 12, 2, 64]] },
    { type: 'glitchSlice', code: 7, tags: ['glitch', 'degrade'], cost: 2, target: 'text', params: [['slices', 'number', 8, 2, 64], ['offset', 'number', 0.4, 0, 1], ['rate', 'number', 6, 1, 30]] },
    { type: 'noiseDissolve', code: 8, tags: ['dissolve', 'degrade'], cost: 2, target: 'text', params: [['scale', 'number', 10, 1, 64], ['edgeWidth', 'number', 0.1, 0, 0.5], ['edgeColor', 'color', null]] },
    { type: 'directionalDissolve', code: 9, tags: ['dissolve', 'degrade'], cost: 2, target: 'text', params: [['angle', 'number', 0, -180, 180], ['softness', 'number', 0.1, 0, 1], ['noiseMix', 'number', 0.3, 0, 1]] },
    { type: 'pixelDissolve', code: 10, tags: ['dissolve', 'degrade'], cost: 1, target: 'text', params: [['cellSize', 'number', 10, 2, 64]] },
    { type: 'burnDissolve', code: 11, tags: ['dissolve', 'degrade'], cost: 2, target: 'text', params: [['scale', 'number', 10, 1, 64], ['emberColor', 'color', null], ['charColor', 'color', null]] },
    { type: 'halftoneDissolve', code: 12, tags: ['dissolve', 'degrade'], cost: 2, target: 'text', params: [['dotSize', 'number', 8, 2, 40], ['angle', 'number', 0, -180, 180]] },
    { type: 'particleDissolve', code: 13, tags: ['dissolve', 'particles', 'degrade'], cost: 3, target: 'text', params: [['count', 'int', 24, 4, 128], ['drift', 'number', 0.4, 0, 1]] },
    { type: 'shockwave', code: 14, tags: ['featured'], cost: 2, target: 'frame', params: [['center', 'vec2', { x: 0.5, y: 0.5 }], ['radius', 'number', 0.25, 0, 1], ['width', 'number', 0.06, 0.005, 0.5], ['strength', 'number', 0.6, 0, 2]] },
    { type: 'zoomBlur', code: 15, tags: ['featured'], cost: 4, target: 'frame', params: [['center', 'vec2', { x: 0.5, y: 0.5 }], ['strength', 'number', 0.4, 0, 1.5]] },
    { type: 'motionBlur', code: 16, tags: ['featured'], cost: 4, target: 'frame', params: [['samples', 'int', 8, 4, 16], ['shutter', 'number', 0.5, 0, 1], ['angle', 'number', 0, -180, 180]] },
    { type: 'echoTrail', code: 17, tags: ['featured', 'overlap'], cost: 4, target: 'frame', params: [['copies', 'int', 4, 2, 8], ['spacing', 'number', 0.08, 0.01, 0.4], ['decay', 'number', 0.6, 0, 1], ['tint', 'color', null]] },
    { type: 'godRays', code: 18, tags: ['overlap'], cost: 4, target: 'text', params: [['center', 'vec2', { x: 0.5, y: 0.4 }], ['decay', 'number', 0.9, 0.5, 1], ['density', 'number', 0.6, 0.1, 1], ['weight', 'number', 1, 0, 2]] },
    { type: 'lightSweep', code: 19, tags: ['featured'], cost: 2, target: 'text', params: [['angle', 'number', -30, -180, 180], ['width', 'number', 0.12, 0.01, 0.5], ['speed', 'number', 0.6, 0, 3], ['color', 'color', null]] },
    { type: 'kaleidoscope', code: 20, cost: 2, target: 'frame', params: [['segments', 'int', 6, 2, 16], ['rotation', 'number', 0, -180, 180]] },
    { type: 'mirror', code: 21, cost: 1, target: 'frame', params: [['axis', 'select', 'x', null, null, ['x', 'y']], ['offset', 'number', 0, -1, 1]] },
    { type: 'pixelSort', code: 22, tags: ['degrade'], cost: 4, target: 'frame', params: [['threshold', 'number', 0.55, 0, 1], ['length', 'number', 24, 1, 64], ['direction', 'number', 90, -180, 180]] },
    { type: 'lensDistortion', code: 23, cost: 1, target: 'frame', params: [['k1', 'number', 0.15, -1, 1], ['k2', 'number', 0, -1, 1], ['chroma', 'number', 0.2, 0, 1]] },
    { type: 'colorGrade', code: 24, cost: 1, target: 'frame', params: [['lift', 'number', 0, -0.5, 0.5], ['saturation', 'number', 1, 0, 2], ['posterize', 'number', 0, 0, 32], ['duotone', 'color', null]] },
    { type: 'displacementMap', code: 25, cost: 3, target: 'frame', params: [['amount', 'number', 0.3, 0, 1], ['scroll', 'number', 0.2, 0, 2]] },
    { type: 'bloom', code: 26, tags: ['featured'], cost: 4, target: 'frame', params: [['threshold', 'number', 0.6, 0, 1], ['intensity', 'number', 0.7, 0, 2], ['radius', 'number', 0.5, 0, 1]] },
    { type: 'chromaticAberration', code: 27, cost: 1, target: 'frame', params: [['amount', 'number', 0.4, 0, 1], ['radial', 'number', 0, 0, 1], ['angle', 'number', 0, -180, 180]] },
    { type: 'crt', code: 28, cost: 2, target: 'frame', params: [['scanlines', 'number', 0.2, 0, 1], ['curvature', 'number', 0.1, 0, 1], ['vignette', 'number', 0.3, 0, 1]] },
    { type: 'filmGrain', code: 29, cost: 1, target: 'frame', params: [['amount', 'number', 0.2, 0, 1], ['size', 'number', 1, 0.5, 4]] },
    { type: 'halftone', code: 30, tags: ['degrade'], cost: 2, target: 'frame', params: [['dotSize', 'number', 8, 2, 40], ['angle', 'number', 0, -180, 180]] },
    { type: 'pixelate', code: 31, tags: ['degrade'], cost: 1, target: 'frame', params: [['size', 'number', 8, 2, 64]] },
    { type: 'heatHaze', code: 32, cost: 1, target: 'frame', params: [['amount', 'number', 0.3, 0, 1], ['speed', 'number', 0.5, 0, 2]] },
    { type: 'lightLeak', code: 33, tags: ['overlap'], cost: 2, target: 'frame', params: [['color', 'color', null], ['x', 'number', 0.85, 0, 1], ['y', 'number', 0.2, 0, 1], ['intensity', 'number', 0.6, 0, 2]] },
    { type: 'vignette', code: 34, cost: 1, target: 'frame', params: [['amount', 'number', 0.5, 0, 1], ['softness', 'number', 0.5, 0, 1]] },
    { type: 'sparkles', code: 35, cost: 2, target: 'text', params: [['count', 'number', 24, 4, 64], ['size', 'number', 2, 0.5, 8], ['shape', 'select', 'dot', null, null, ['dot', 'star', 'heart']], ['color', 'color', null]] },
    { type: 'lensFlare', code: 36, tags: ['overlap'], cost: 2, target: 'frame', params: [['position', 'vec2', { x: 0.4, y: 0.35 }], ['color', 'color', null]] },
    // Distortion / transition primitives
    { type: 'waveWarp', code: 37, pack: 'pro', tags: ['pro', 'distort'], cost: 3, target: 'frame', params: [['height', 'number', 24, 0, 240], ['width', 'number', 160, 8, 1200], ['angle', 'number', 0, -180, 180], ['speed', 'number', 0.5, 0, 4], ['waveform', 'select', 'sine', null, null, ['sine', 'triangle', 'square', 'saw']], ['pin', 'bool', false]] },
    { type: 'twirl', code: 38, pack: 'pro', tags: ['pro', 'distort'], cost: 3, target: 'frame', params: [['center', 'vec2', { x: 0.5, y: 0.5 }], ['radius', 'number', 0.4, 0.02, 1.2], ['angle', 'number', 120, -360, 360], ['spin', 'number', 0, -180, 180]] },
    { type: 'turbulentDisplace', code: 39, pack: 'pro', tags: ['pro', 'distort'], cost: 4, target: 'frame', params: [['amount', 'number', 20, 0, 100], ['size', 'number', 60, 4, 400], ['octaves', 'int', 3, 1, 6], ['evolution', 'number', 0.2, 0, 2]] },
    { type: 'spinBlur', code: 40, pack: 'pro', tags: ['pro', 'blur'], cost: 4, target: 'frame', params: [['center', 'vec2', { x: 0.5, y: 0.5 }], ['angle', 'number', 6, 0, 45]] },
    { type: 'strobeFlash', code: 41, pack: 'pro', tags: ['pro', 'light'], cost: 2, target: 'frame', params: [['bpm', 'text', 'audio'], ['intensity', 'number', 0.5, 0, 1], ['duty', 'number', 0.15, 0.02, 1], ['color', 'color', null]] },
    { type: 'anamorphicStreak', code: 42, pack: 'pro', tags: ['pro', 'light', 'overlap'], cost: 4, target: 'frame', params: [['threshold', 'number', 0.6, 0, 1], ['length', 'number', 0.3, 0, 1], ['angle', 'number', 0, -180, 180], ['intensity', 'number', 0.6, 0, 1], ['tint', 'color', null]] },
    { type: 'radialWipe', code: 43, pack: 'pro', tags: ['pro', 'transition', 'wipe'], cost: 2, target: 'text', params: [['startAngle', 'number', 0, -180, 180], ['direction', 'select', 'cw', null, null, ['cw', 'ccw']], ['feather', 'number', 0.08, 0, 0.5]] },
    { type: 'venetianBlinds', code: 44, pack: 'pro', tags: ['pro', 'transition', 'wipe'], cost: 2, target: 'text', params: [['angle', 'number', 0, -180, 180], ['bandWidth', 'number', 40, 2, 240], ['feather', 'number', 0.08, 0, 0.5]] },
  ];

  const CODE_BY_TYPE = {};

  function makeParam(entry) {
    const [key, kind, def, min, max, options] = entry;
    const param = { key, kind, default: def };
    if (min != null) param.min = min;
    if (max != null) param.max = max;
    if (options) param.options = options;
    return param;
  }

  for (const entry of POST_TYPES) {
    CODE_BY_TYPE[entry.type] = entry.code;
    const params = entry.params.map(makeParam).concat([
      { key: 'enabled', kind: 'bool', default: true },
      { key: 'in', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 },
      { key: 'out', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 },
    ]);
    fx.register({
      group: 'post',
      type: entry.type,
      tags: entry.tags || [],
      stackable: true,
      cost: entry.cost || 1,
      params,
      pack: entry.pack || null,
      defaults: { target: entry.target },
    });
  }

  function toRgb(value, fallback, ctx) {
    return color.toRgba(value, fallback, ctx);
  }

  function num(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function postUniforms(instance, ctx) {
    const params = (instance && instance.params) || {};
    const type = (instance && instance.type) || 'vignette';
    const code = CODE_BY_TYPE[type] || 34;
    const context = ctx || {};
    const envelope = context.envelope == null ? 1 : Math.max(0, context.envelope);
    const entry = fx.get('post', type);
    const entryTarget = entry && entry.defaults && entry.defaults.target;
    const target =
      (instance && instance.target) ||
      (instance && instance.defaults && instance.defaults.target) ||
      entryTarget ||
      'text';
    // extension packs (the camera) own their uniform layout
    const extension = fx.postExtensions && fx.postExtensions[type];
    if (extension) {
      return {
        u_type: extension.code,
        ...extension.uniforms(params, context),
        target,
        bloom: false,
      };
    }
    let p4 = [0, 0, 0, envelope];
    let p42 = [0, 0, 0, 0];
    let p43 = [0, 0, 0, 0];
    let mode = 0;
    let colorA = [1, 1, 1, 1];
    let colorB = [1, 1, 1, 1];
    if (type === 'glitchBlocks') p4 = [num(params.blockSize, 24), num(params.rate, 6), 0, envelope * num(params.intensity, 0.5)];
    else if (type === 'rgbShift') p4 = [num(params.angle, 0), num(params.jitter, 0.3), 0, envelope * (num(params.amount, 3) / 10)];
    else if (type === 'scanTear') p4 = [num(params.lines, 24), num(params.speed, 1), 0, envelope * num(params.amount, 0.4)];
    else if (type === 'vhsTracking') p4 = [num(params.amount, 0.3), num(params.noise, 0.2), num(params.rollSpeed, 0.3), envelope];
    else if (type === 'dataSmear') p4 = [num(params.direction, 0), num(params.threshold, 0.3), 0, envelope * num(params.amount, 0.4)];
    else if (type === 'digitalNoise') p4 = [num(params.density, 0.3), num(params.blockSize, 12), 0, envelope];
    else if (type === 'glitchSlice') p4 = [num(params.slices, 8), num(params.rate, 6), 0, envelope * num(params.offset, 0.4)];
    else if (type === 'noiseDissolve') p4 = [num(params.scale, 10), num(params.edgeWidth, 0.1), 0, envelope * context.progress];
    else if (type === 'directionalDissolve') p4 = [((num(params.angle, 0) + 180) * Math.PI) / 180, num(params.softness, 0.1), num(params.noiseMix, 0.3), envelope * context.progress];
    else if (type === 'pixelDissolve') p4 = [num(params.cellSize, 10), 0, 0, envelope * context.progress];
    else if (type === 'burnDissolve') p4 = [num(params.scale, 10), 0, 0, envelope * context.progress];
    else if (type === 'halftoneDissolve') p4 = [num(params.dotSize, 8), num(params.angle, 0), 0, envelope * context.progress];
    else if (type === 'particleDissolve') p4 = [num(params.count, 24), num(params.drift, 0.4), 0, envelope * context.progress];
    else if (type === 'shockwave') {
      const center = params.center || { x: 0.5, y: 0.5 };
      p4 = [num(center.x, 0.5), num(center.y, 0.5), num(params.radius, 0.25), envelope * num(params.strength, 0.6)];
    } else if (type === 'zoomBlur') {
      const center = params.center || { x: 0.5, y: 0.5 };
      p4 = [num(center.x, 0.5), num(center.y, 0.5), 0, envelope * num(params.strength, 0.4)];
    } else if (type === 'motionBlur') p4 = [((num(params.angle, 0) + 180) * Math.PI) / 180, 0, 0, envelope * num(params.shutter, 0.5)];
    else if (type === 'echoTrail') {
      p4 = [num(params.copies, 4), num(params.decay, 0.6), 0, envelope * num(params.spacing, 0.08) * 10];
      colorA = toRgb(params.tint, null, context) || [0, 0, 0, 0];
    }
    else if (type === 'godRays') p4 = [0, 0, 0, envelope * num(params.weight, 1)];
    else if (type === 'lightSweep') {
      p4 = [((num(params.angle, -30) + 180) * Math.PI) / 180, num(params.width, 0.12), num(params.speed, 0.6), envelope];
      colorA = toRgb(params.color, [1, 0.95, 0.8, 1], context);
    } else if (type === 'kaleidoscope') p4 = [num(params.segments, 6), ((num(params.rotation, 0) + 180) * Math.PI) / 180, 0, envelope];
    else if (type === 'mirror') p4 = [params.axis === 'y' ? 1 : 0, num(params.offset, 0), 0, envelope];
    else if (type === 'pixelSort') p4 = [num(params.threshold, 0.55), num(params.length, 24), ((num(params.direction, 90) + 180) * Math.PI) / 180, envelope];
    else if (type === 'lensDistortion') p4 = [num(params.k1, 0.15), num(params.k2, 0), num(params.chroma, 0.2), envelope];
    else if (type === 'colorGrade') {
      p4 = [num(params.lift, 0), num(params.saturation, 1), num(params.posterize, 0) > 0 ? Math.max(2, num(params.posterize, 0)) : 0, envelope];
      colorA = toRgb(params.duotone, null, context) || colorA;
    } else if (type === 'displacementMap') p4 = [0, num(params.scroll, 0.2), 0, envelope * num(params.amount, 0.3)];
    else if (type === 'bloom') p4 = [num(params.threshold, 0.6), num(params.intensity, 0.7), num(params.radius, 0.5), envelope];
    else if (type === 'chromaticAberration') {
      p4 = [((num(params.angle, 0) + 180) * Math.PI) / 180, num(params.angle, 0), num(params.radial, 0), envelope * num(params.amount, 0.4)];
    } else if (type === 'crt') p4 = [num(params.scanlines, 0.2), num(params.curvature, 0.1), num(params.vignette, 0.3), envelope];
    else if (type === 'filmGrain') p4 = [num(params.amount, 0.2), num(params.size, 1), 0, envelope];
    else if (type === 'halftone') p4 = [num(params.dotSize, 8), ((num(params.angle, 0) + 180) * Math.PI) / 180, 0, envelope];
    else if (type === 'pixelate') p4 = [num(params.size, 8), 0, 0, envelope];
    else if (type === 'heatHaze') p4 = [num(params.amount, 0.3), num(params.speed, 0.5), 0, envelope * num(params.amount, 0.3)];
    else if (type === 'lightLeak') {
      const fallbackColor = [1, 0.6, 0.3, 1];
      colorA = toRgb(params.color, fallbackColor, context);
      p4 = [num(params.x, 0.85), num(params.y, 0.2), 0, envelope * num(params.intensity, 0.6)];
    } else if (type === 'vignette') p4 = [num(params.amount, 0.5), 1 - num(params.softness, 0.5), 0, envelope];
    else if (type === 'sparkles') {
      const shapeCode = params.shape === 'star' ? 1 : params.shape === 'heart' ? 2 : 0;
      p4 = [num(params.count, 24), num(params.size, 2), shapeCode, envelope];
      colorA = toRgb(params.color, [1, 1, 0.9, 1], context);
    } else if (type === 'lensFlare') {
      const position = params.position || { x: 0.4, y: 0.35 };
      p4 = [num(position.x, 0.4), num(position.y, 0.35), 0, envelope];
      colorA = toRgb(params.color, [1, 0.95, 0.85, 1], context);
    } else if (type === 'waveWarp') {
      const waveform = { sine: 0, triangle: 1, square: 2, saw: 3 }[params.waveform];
      // u_params.z is a direction angle in radians (no 180 offset: the shader
      // uses cos/sin of it as the wave axis)
      p4 = [num(params.height, 24), num(params.width, 160), (num(params.angle, 0) * Math.PI) / 180, envelope];
      p42 = [num(params.speed, 0.5), params.pin ? 1 : 0, 0, 0];
      p43 = [waveform == null ? 0 : waveform, 0, 0, 0];
    } else if (type === 'twirl') {
      const center = params.center || { x: 0.5, y: 0.5 };
      p4 = [num(center.x, 0.5), num(center.y, 0.5), num(params.radius, 0.4), (num(params.angle, 120) * Math.PI) / 180];
      p42 = [((num(params.spin, 0) * Math.PI) / 180) * (context.time || 0), 0, 0, 0];
    } else if (type === 'turbulentDisplace') {
      p4 = [0, num(params.size, 60), num(params.octaves, 3), envelope * num(params.amount, 20)];
      p42 = [num(params.evolution, 0.2), 0, 0, 0];
    } else if (type === 'spinBlur') {
      const center = params.center || { x: 0.5, y: 0.5 };
      p4 = [num(center.x, 0.5), num(center.y, 0.5), (num(params.angle, 6) * Math.PI) / 180, envelope];
    } else if (type === 'strobeFlash') {
      const bpmOption = params.bpm;
      const features = context.audioFeatures || null;
      const bpm =
        bpmOption === 'audio'
          ? features && Number(features.bpm) > 0
            ? Number(features.bpm)
            : 120
          : num(bpmOption, 120);
      p4 = [bpm, envelope * num(params.intensity, 0.5), num(params.duty, 0.15), 0];
      colorA = toRgb(params.color, [1, 1, 1, 1], context);
    } else if (type === 'anamorphicStreak') {
      p4 = [num(params.threshold, 0.6), num(params.length, 0.3), (num(params.angle, 0) * Math.PI) / 180, envelope * num(params.intensity, 0.6)];
      colorA = toRgb(params.tint, [0.8, 0.88, 1, 1], context);
    } else if (type === 'radialWipe') {
      p4 = [
        (num(params.startAngle, 0) * Math.PI) / 180,
        params.direction === 'ccw' ? 1 : 0,
        num(params.feather, 0.08),
        envelope * (context.progress == null ? 1 : context.progress),
      ];
    } else if (type === 'venetianBlinds') {
      p4 = [
        (num(params.angle, 0) * Math.PI) / 180,
        num(params.bandWidth, 40),
        num(params.feather, 0.08),
        envelope * (context.progress == null ? 1 : context.progress),
      ];
    }
    return {
      u_type: code,
      u_params: p4,
      u_params2: p42,
      u_params3: p43,
      u_mode: mode,
      u_colorA: colorA,
      u_colorB: colorB,
      u_time: context.time || 0,
      sdfTexture: context.sdfTexture || null,
      target,
      bloom: type === 'bloom' || type === 'godRays',
    };
  }

  fx.postUniforms = postUniforms;
  fx.postTypes = CODE_BY_TYPE;
  return fx;
});
