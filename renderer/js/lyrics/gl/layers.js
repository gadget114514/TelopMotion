(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.SA = root.SA || {};
    root.SA.glLayers = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const VERT = `#version 300 es
in vec2 a_pos;
uniform vec2 u_resolution;
uniform vec2 u_center;
uniform vec2 u_half;
uniform mat2 u_rot;
out vec2 v_uv;
void main() {
  vec2 local = (a_pos * 2.0 - 1.0) * u_half;
  vec2 px = u_center + u_rot * local;
  v_uv = a_pos;
  gl_Position = vec4(px.x / u_resolution.x * 2.0 - 1.0, 1.0 - px.y / u_resolution.y * 2.0, 0.0, 1.0);
}`;

  const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform sampler2D u_backdrop;
uniform vec4 u_color;
uniform vec2 u_size;
uniform vec2 u_resolution;
uniform float u_useTexture;
uniform float u_opacity;
uniform float u_radius;
uniform float u_backdropReady;
uniform float u_time;
uniform int u_blendMode;
uniform int u_filter;
uniform vec4 u_filterParams;
uniform vec4 u_uvRect;
uniform int u_chroma;
uniform vec3 u_chromaKey;
uniform vec4 u_chromaParams;
out vec4 outColor;

// chroma key: distance in the CbCr plane (brightness does not matter), the
// edge softened by the smoothness band and the key colour's spill desaturated
vec2 chromaCbCr(vec3 c) {
  return vec2(-0.168736 * c.r - 0.331264 * c.g + 0.5 * c.b, 0.5 * c.r - 0.418688 * c.g - 0.081312 * c.b);
}

vec4 chromaKey(vec4 texel) {
  float base = distance(chromaCbCr(texel.rgb), chromaCbCr(u_chromaKey)) - u_chromaParams.x;
  float mask = smoothstep(0.0, max(u_chromaParams.y, 1e-4), base);
  float spillVal = pow(clamp(base / max(u_chromaParams.z, 1e-4), 0.0, 1.0), 1.5);
  float luma = dot(texel.rgb, vec3(0.2126, 0.7152, 0.0722));
  return vec4(mix(vec3(luma), texel.rgb, spillVal), texel.a * mask);
}

float layerHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec3 blendCustom(int mode, vec3 base, vec3 top) {
  if (mode == 1) return min(base + top, vec3(1.0));
  if (mode == 2) return base * top;
  if (mode == 3) return 1.0 - (1.0 - base) * (1.0 - top);
  if (mode == 4) return mix(2.0 * base * top, 1.0 - 2.0 * (1.0 - base) * (1.0 - top), step(0.5, base));
  if (mode == 5) {
    vec3 d = mix(sqrt(base), ((16.0 * base - 12.0) * base + 4.0) * base, step(0.25, base));
    return mix(base - (1.0 - 2.0 * top) * base * (1.0 - base), base + (2.0 * top - 1.0) * (d - base), step(0.5, top));
  }
  if (mode == 6) return mix(2.0 * base * top, 1.0 - 2.0 * (1.0 - base) * (1.0 - top), step(0.5, top));
  if (mode == 7) return max(base, top);
  if (mode == 8) return min(base, top);
  if (mode == 9) return abs(base - top);
  if (mode == 10) return base + top - 2.0 * base * top;
  if (mode == 11) return min(base / max(1.0 - top, vec3(1e-4)), vec3(1.0));
  if (mode == 12) return 1.0 - min((1.0 - base) / max(top, vec3(1e-4)), vec3(1.0));
  return top;
}

vec4 filterSample(vec2 uv) {
  if (u_filter == 1) {
    vec2 px = max(u_size, vec2(1.0));
    float angle = radians(u_filterParams.y);
    vec2 dir = u_filterParams.z > 0.5 ? normalize(uv - 0.5 + vec2(1e-4)) : vec2(cos(angle), sin(angle));
    vec2 offset = dir * u_filterParams.x / px;
    vec4 color = texture(u_tex, uv);
    color.r = texture(u_tex, uv + offset).r;
    color.b = texture(u_tex, uv - offset).b;
    return color;
  }
  if (u_filter == 2) {
    vec2 px = max(u_size, vec2(1.0));
    float jitter = u_filterParams.z * sin(u_time * 7.0);
    float angle = radians(u_filterParams.y + jitter * 60.0);
    vec2 offset = vec2(cos(angle), sin(angle)) * u_filterParams.x / px;
    vec4 color = texture(u_tex, uv);
    color.r = texture(u_tex, uv + offset).r;
    color.b = texture(u_tex, uv - offset).b;
    return color;
  }
  if (u_filter == 3) {
    vec2 px = max(u_size, vec2(1.0));
    vec2 cells = max(px / max(u_filterParams.x, 1.0), vec2(1.0));
    vec2 cell = floor(uv * cells);
    float tick = floor(u_time * 8.0);
    float trigger = layerHash(cell + tick);
    vec2 shifted = uv;
    if (trigger > 1.0 - u_filterParams.y * 0.5) {
      shifted.x += (layerHash(cell * 1.7 + 7.13 + tick) * 2.0 - 1.0) * 0.08 * u_filterParams.y;
    }
    vec4 color = texture(u_tex, shifted);
    if (u_filterParams.z > 0.001) {
      float split = u_filterParams.z * 4.0 / px.x;
      color.r = texture(u_tex, shifted + vec2(split, 0.0)).r;
      color.b = texture(u_tex, shifted - vec2(split, 0.0)).b;
    }
    return color;
  }
  return texture(u_tex, uv);
}

void main() {
  vec2 uv = mix(u_uvRect.xy, u_uvRect.zw, v_uv);
  vec4 texel = u_useTexture > 0.5 ? filterSample(uv) : vec4(1.0);
  if (u_chroma == 1 && u_useTexture > 0.5) texel = chromaKey(texel);
  float alpha = texel.a * u_color.a * u_opacity;
  vec2 q = abs((v_uv - 0.5) * u_size) - (u_size * 0.5 - vec2(u_radius));
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - u_radius;
  alpha *= 1.0 - smoothstep(-1.0, 1.0, d);
  alpha = clamp(alpha, 0.0, 1.0);
  vec3 src = texel.rgb * u_color.rgb;
  if (u_blendMode > 0 && u_backdropReady > 0.5) {
    vec4 dst = texture(u_backdrop, gl_FragCoord.xy / u_resolution);
    vec3 blended = blendCustom(u_blendMode, dst.rgb, src);
    vec3 rgb = mix(dst.rgb, blended, alpha);
    float outA = dst.a + alpha * (1.0 - dst.a);
    outColor = vec4(rgb, outA);
  } else {
    outColor = vec4(src, alpha);
  }
}`;

  const CUSTOM_BLENDS = {
    overlay: 4,
    softLight: 5,
    hardLight: 6,
    lighten: 7,
    darken: 8,
    difference: 9,
    exclusion: 10,
    colorDodge: 11,
    colorBurn: 12,
  };

  const FILTERS = {
    chromaticAberration: { code: 1, defaults: { amount: 6, angle: 0, radial: false } },
    rgbShift: { code: 2, defaults: { amount: 4, angle: 0, jitter: 0.2 } },
    glitchBlocks: { code: 3, defaults: { blockSize: 24, rate: 0.3, rgbSplit: 2 } },
  };

  function clamp01(value) {
    return value <= 0 ? 0 : value >= 1 ? 1 : value;
  }

  function num(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function hashString(text) {
    let hash = 2166136261;
    const source = String(text == null ? '' : text);
    for (let i = 0; i < source.length; i += 1) {
      hash ^= source.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function seededRandom(seed) {
    let value = seed >>> 0;
    return () => {
      value = (value + 0x6d2b79f5) | 0;
      let t = Math.imul(value ^ (value >>> 15), 1 | value);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function easingFor(name, fallback) {
    if (typeof SA !== 'undefined' && SA.easing && typeof SA.easing.get === 'function') {
      const curve = SA.easing.get(name || fallback);
      if (typeof curve === 'function') return curve;
    }
    const linear = (value) => value;
    if (!name && !fallback) return linear;
    return (value) => value * value * (3 - 2 * value);
  }

  function fxGet(group, type) {
    if (typeof SA !== 'undefined' && SA.fx && typeof SA.fx.get === 'function') return SA.fx.get(group, type);
    return null;
  }

  function fxParamDefaults(group, type) {
    const entry = fxGet(group, type);
    const params = {};
    for (const param of (entry && entry.params) || []) params[param.key] = param.default;
    return params;
  }

  function resolveMotionDef(instance, fallbackDuration) {
    const source = instance || {};
    return {
      duration: Math.max(0.001, num(source.duration, fallbackDuration)),
      delay: num(source.delay, 0),
      ease: source.ease || null,
    };
  }

  // Evaluate a layer's in/out MotionDef. Pure: preview and export get the same state.
  function evaluateLayerMotion(layer, t, frame) {
    const width = (frame && frame.width) || 1920;
    const height = (frame && frame.height) || 1080;
    const shortSide = Math.min(width, height);
    const start = layer && layer.start != null ? num(layer.start, 0) : 0;
    const end = layer && layer.end != null ? num(layer.end, Infinity) : Infinity;
    const state = {
      x: 0,
      y: 0,
      z: 0,
      rot: 0,
      tiltX: 0,
      tiltY: 0,
      skewX: 0,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
      blur: 0,
      visibleFrac: 1,
      deform: [],
      represent: 'mesh',
      reprProgress: 1,
      colorMix: 0,
      fx: {},
      visible: t >= start - 1e-6 && t <= end + 1e-6,
    };
    const motion = (layer && layer.motion) || {};
    const info = {
      i: 0,
      N: 1,
      frame: { width, height },
      shortSide,
      blockCenter: { x: width / 2, y: height / 2 },
      letterX: width / 2,
      letterY: height / 2,
      beatDuration: Math.max(0.001, (end === Infinity ? start + 1 : end) - start),
    };
    const seed = hashString(layer && layer.id ? layer.id : 'layer');
    if (motion.in) {
      const def = resolveMotionDef(motion.in, 0.5);
      const progress = clamp01((t - start - def.delay) / def.duration);
      const entry = fxGet('enter', motion.in.type || 'fade');
      const params = { ...fxParamDefaults('enter', motion.in.type || 'fade'), ...(motion.in.params || {}) };
      if (entry && entry.cpu) entry.cpu(state, easingFor(def.ease, 'easeOutCubic')(progress), params, seededRandom(seed ^ 0x9e37), info);
      else state.opacity *= progress;
    }
    if (motion.out && end !== Infinity) {
      const def = resolveMotionDef(motion.out, 0.4);
      const exitStart = end - def.duration - def.delay;
      const progress = clamp01((t - exitStart) / def.duration);
      const entry = fxGet('exit', motion.out.type || 'fade');
      const params = { ...fxParamDefaults('exit', motion.out.type || 'fade'), ...(motion.out.params || {}) };
      if (entry && entry.cpu) entry.cpu(state, easingFor(def.ease, 'easeInCubic')(progress), params, seededRandom(seed ^ 0x85eb), info);
      else state.opacity *= 1 - progress;
    }
    state.opacity = clamp01(state.opacity);
    return state;
  }

  // Keyframable layer props. Each propPath matches the layer's field path so
  // the inspector can read / write them uniformly.
  const LAYER_KEY_PROPS = [
    'transform.x', 'transform.y', 'transform.rotate', 'transform.scale',
    'transform.scaleX', 'transform.scaleY', 'transform.anchorX', 'transform.anchorY',
    'opacity', 'crop.l', 'crop.t', 'crop.r', 'crop.b',
  ];

  function easeApplyLocal(name, p) {
    if (name == null || name === 'linear') return p;
    if (name === 'hold') return p < 1 ? 0 : 1;
    if (typeof SA !== 'undefined' && SA.easing && typeof SA.easing.get === 'function') {
      try {
        const fn = SA.easing.get(name);
        if (typeof fn === 'function') return fn(p);
      } catch {
        /* fall through */
      }
    }
    return p * p * (3 - 2 * p);
  }

  // Interpolate one numeric track at a layer-local time. Delegates to
  // SA.tween.segment when available (preview / export) so the ease semantics
  // (start.ease per segment) match the text keyframes; the local fallback is
  // for node tests where SA.tween is absent.
  function sampleTrack(keys, local) {
    if (!Array.isArray(keys) || !keys.length) return undefined;
    if (typeof SA !== 'undefined' && SA.tween && typeof SA.tween.segment === 'function') {
      return SA.tween.segment({ kind: 'number', keys }, local);
    }
    if (local <= keys[0].t) return keys[0].value;
    const last = keys[keys.length - 1];
    if (local >= last.t) return last.value;
    for (let i = 0; i < keys.length - 1; i += 1) {
      const start = keys[i];
      const end = keys[i + 1];
      if (local >= start.t && local <= end.t) {
        if (start.ease === 'hold') return start.value;
        const span = end.t - start.t;
        const p = span <= 0 ? 1 : (local - start.t) / span;
        const a = Number(start.value);
        const b = Number(end.value);
        if (!Number.isFinite(a) || !Number.isFinite(b)) return start.value;
        return a + (b - a) * easeApplyLocal(start.ease, Math.max(0, Math.min(1, p)));
      }
    }
    return last.value;
  }

  // Absolute-value override: a keyed prop replaces the layer's static field
  // (unlike the text keyframes, which are deltas). Pure; returns `layer`
  // itself when there is nothing to apply so callers can skip copies.
  function resolveLayerAt(layer, keyframes, t) {
    const tracks = keyframes && layer && layer.id != null ? keyframes[`layer:${layer.id}`] : null;
    if (!tracks) return layer;
    let touched = false;
    const local = (t == null ? 0 : Number(t) || 0) - num(layer.start, 0);
    const next = { ...layer, transform: { ...(layer.transform || {}) }, crop: { ...(layer.crop || {}) } };
    for (const prop of LAYER_KEY_PROPS) {
      const keys = tracks[prop];
      if (!Array.isArray(keys) || !keys.length) continue;
      const value = num(sampleTrack(keys, local), null);
      if (value == null) continue;
      const dot = prop.indexOf('.');
      if (dot < 0) next[prop] = value;
      else next[prop.slice(0, dot)][prop.slice(dot + 1)] = value;
      touched = true;
    }
    return touched ? next : layer;
  }

  function clampCropEdge(value) {
    const parsed = num(value, 0);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.min(0.95, parsed));
  }

  // Pure geometry for one layer: crop shrinks the fitted rect, the anchor
  // (0..1 of the cropped rect) is the fixed point of scale + rotation, and
  // uvRect maps the cropped sub-image. With anchor=0.5, crop=0, scaleX/Y=1
  // this matches the pre-keyframe calculation exactly.
  function layerGeometry(layer, motion, rect, width, height) {
    const transform = (layer && layer.transform) || {};
    const state = motion || {};
    let l = clampCropEdge(layer && layer.crop && layer.crop.l);
    let tt = clampCropEdge(layer && layer.crop && layer.crop.t);
    let r = clampCropEdge(layer && layer.crop && layer.crop.r);
    let b = clampCropEdge(layer && layer.crop && layer.crop.b);
    if (l + r > 0.95 && l + r > 0) {
      const factor = 0.95 / (l + r);
      l *= factor;
      r *= factor;
    }
    if (tt + b > 0.95 && tt + b > 0) {
      const factor = 0.95 / (tt + b);
      tt *= factor;
      b *= factor;
    }
    const base = rect || { x: 0, y: 0, w: width, h: height };
    const w0 = Math.max(0, base.w * (1 - l - r));
    const h0 = Math.max(0, base.h * (1 - tt - b));
    const tx = num(transform.x, 0);
    const ty = num(transform.y, 0);
    const c0x = base.x + base.w * l + w0 / 2 + tx * width + num(state.x, 0);
    const c0y = base.y + base.h * tt + h0 / 2 + ty * height + num(state.y, 0);
    const scaleBase = transform.scale == null ? 1 : num(transform.scale, 1);
    const sx = scaleBase * num(transform.scaleX, 1) * num(state.scaleX, 1);
    const sy = scaleBase * num(transform.scaleY, 1) * num(state.scaleY, 1);
    const ax = Math.max(0, Math.min(1, num(transform.anchorX, 0.5)));
    const ay = Math.max(0, Math.min(1, num(transform.anchorY, 0.5)));
    const px = c0x + (ax - 0.5) * w0;
    const py = c0y + (ay - 0.5) * h0;
    const dx = c0x - px;
    const dy = c0y - py;
    const angle = (((transform.rotate == null ? 0 : num(transform.rotate, 0)) + num(state.rot, 0)) * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const centerX = px + cos * dx * sx - sin * dy * sy;
    const centerY = py + sin * dx * sx + cos * dy * sy;
    return {
      centerX,
      centerY,
      halfX: (w0 * sx) / 2,
      halfY: (h0 * sy) / 2,
      angle,
      cos,
      sin,
      uvRect: [l, tt, 1 - r, 1 - b],
    };
  }

  function blendCode(blend) {
    if (!blend || blend === 'normal') return 0;
    if (blend === 'add' || blend === 'multiply' || blend === 'screen') return 0;
    return CUSTOM_BLENDS[blend] || 0;
  }

  function filterState(filter) {
    const source = filter || {};
    const spec = FILTERS[source.type];
    if (!spec) return { code: 0, params: [0, 0, 0, 0] };
    const merged = { ...spec.defaults, ...(source.params || {}) };
    if (source.type === 'chromaticAberration') {
      return { code: spec.code, params: [num(merged.amount, 6), num(merged.angle, 0), merged.radial ? 1 : 0, 0] };
    }
    if (source.type === 'rgbShift') {
      return { code: spec.code, params: [num(merged.amount, 4), num(merged.angle, 0), clamp01(num(merged.jitter, 0.2)), 0] };
    }
    return { code: spec.code, params: [Math.max(2, num(merged.blockSize, 24)), clamp01(num(merged.rate, 0.3)), num(merged.rgbSplit, 2), 0] };
  }

  // A video track's chroma key. Off unless `enabled` is set; the defaults key
  // the broadcast green (#00b140) the background track also offers.
  const CHROMA_DEFAULTS = { enabled: false, color: '#00b140', similarity: 0.2, smoothness: 0.08, spill: 0.1 };

  function chromaState(chroma) {
    const source = chroma || {};
    if (!source.enabled) return { on: false, color: [0, 0, 0], params: [0, 0, 0, 0] };
    const color = parseColor(source.color || CHROMA_DEFAULTS.color);
    return {
      on: true,
      color: [color[0], color[1], color[2]],
      params: [
        Math.max(0, num(source.similarity, CHROMA_DEFAULTS.similarity)),
        Math.max(0, num(source.smoothness, CHROMA_DEFAULTS.smoothness)),
        Math.max(0, num(source.spill, CHROMA_DEFAULTS.spill)),
        0,
      ],
    };
  }

  // CPU mirror of the shader's chromaKey(): the alpha factor a pixel keeps.
  function chromaAlpha(rgb, chroma) {
    const state = chromaState(chroma);
    if (!state.on) return 1;
    const cbcr = (c) => [-0.168736 * c[0] - 0.331264 * c[1] + 0.5 * c[2], 0.5 * c[0] - 0.418688 * c[1] - 0.081312 * c[2]];
    const a = cbcr(rgb);
    const b = cbcr(state.color);
    const x = clamp01((Math.hypot(a[0] - b[0], a[1] - b[1]) - state.params[0]) / Math.max(state.params[1], 1e-4));
    return x * x * (3 - 2 * x);
  }

  // A scene3d layer has no source: its image comes from SA.three3d, rendered
  // from the current time. Pure, so the tests can pin it.
  function isSceneLayer(layer) {
    return !!layer && layer.type === 'scene3d';
  }

  function fitRect(fit, imageWidth, imageHeight, width, height) {
    if (!imageWidth || !imageHeight) return { x: 0, y: 0, w: width, h: height };
    if (fit === 'stretch') return { x: 0, y: 0, w: width, h: height };
    const scale =
      fit === 'cover' ? Math.max(width / imageWidth, height / imageHeight) : fit === 'actual' ? 1 : Math.min(width / imageWidth, height / imageHeight);
    const w = imageWidth * scale;
    const h = imageHeight * scale;
    return { x: (width - w) / 2, y: (height - h) / 2, w, h };
  }

  function parseColor(value) {
    const hex = typeof value === 'string' ? value : (value && (value.value || value.color)) || '#000000';
    const match = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(String(hex).trim());
    if (!match) return [0, 0, 0, 1];
    let body = match[1];
    if (body.length === 3) body = body.split('').map((char) => char + char).join('');
    return [
      parseInt(body.slice(0, 2), 16) / 255,
      parseInt(body.slice(2, 4), 16) / 255,
      parseInt(body.slice(4, 6), 16) / 255,
      body.length === 8 ? parseInt(body.slice(6, 8), 16) / 255 : 1,
    ];
  }

  function videoTargetFor(layer, t, video) {
    const config = (layer && layer.video) || {};
    const start = layer && layer.start != null ? num(layer.start, 0) : 0;
    const speed = config.speed == null ? 1 : num(config.speed, 1) || 1;
    const trimIn = num(config.offset, 0);
    let target = Math.max(0, (t - start) * speed + trimIn);
    const duration = video && Number.isFinite(video.duration) ? video.duration : 0;
    if (duration > 0) {
      const loop = config.loop !== false;
      const trimOut = config.trimOut == null ? duration : num(config.trimOut, duration);
      if (loop) {
        const span = Math.max(0.04, trimOut - trimIn);
        target = trimIn + ((target - trimIn) % span + span) % span;
      } else {
        target = Math.min(target, Math.max(0, duration - 1 / 30));
      }
    }
    return target;
  }

  function create(gl) {
    const textures = new Map();
    const pending = new Map();
    const videos = new Map();
    const scenes = new Map();
    const program = compile(gl);
    const uniforms = program ? locations(gl, program) : null;
    const vao = program ? createQuad(gl, program) : null;
    let backdrop = null;

    function compile(context) {
      if (!context) return null;
      const vertex = context.createShader(context.VERTEX_SHADER);
      context.shaderSource(vertex, VERT);
      context.compileShader(vertex);
      if (!context.getShaderParameter(vertex, context.COMPILE_STATUS)) {
        if (typeof console !== 'undefined' && console.error) console.error('layer vertex shader:', context.getShaderInfoLog(vertex));
        return null;
      }
      const fragment = context.createShader(context.FRAGMENT_SHADER);
      context.shaderSource(fragment, FRAG);
      context.compileShader(fragment);
      if (!context.getShaderParameter(fragment, context.COMPILE_STATUS)) {
        if (typeof console !== 'undefined' && console.error) console.error('layer fragment shader:', context.getShaderInfoLog(fragment));
        return null;
      }
      const next = context.createProgram();
      context.attachShader(next, vertex);
      context.attachShader(next, fragment);
      context.bindAttribLocation(next, 0, 'a_pos');
      context.linkProgram(next);
      if (!context.getProgramParameter(next, context.LINK_STATUS)) {
        if (typeof console !== 'undefined' && console.error) console.error('layer program link:', context.getProgramInfoLog(next));
        return null;
      }
      return next;
    }

    function locations(context, next) {
      return {
        resolution: context.getUniformLocation(next, 'u_resolution'),
        center: context.getUniformLocation(next, 'u_center'),
        half: context.getUniformLocation(next, 'u_half'),
        rot: context.getUniformLocation(next, 'u_rot'),
        tex: context.getUniformLocation(next, 'u_tex'),
        backdrop: context.getUniformLocation(next, 'u_backdrop'),
        color: context.getUniformLocation(next, 'u_color'),
        useTexture: context.getUniformLocation(next, 'u_useTexture'),
        opacity: context.getUniformLocation(next, 'u_opacity'),
        radius: context.getUniformLocation(next, 'u_radius'),
        size: context.getUniformLocation(next, 'u_size'),
        backdropReady: context.getUniformLocation(next, 'u_backdropReady'),
        time: context.getUniformLocation(next, 'u_time'),
        blendMode: context.getUniformLocation(next, 'u_blendMode'),
        filter: context.getUniformLocation(next, 'u_filter'),
        filterParams: context.getUniformLocation(next, 'u_filterParams'),
        uvRect: context.getUniformLocation(next, 'u_uvRect'),
        chroma: context.getUniformLocation(next, 'u_chroma'),
        chromaKey: context.getUniformLocation(next, 'u_chromaKey'),
        chromaParams: context.getUniformLocation(next, 'u_chromaParams'),
      };
    }

    function createQuad(context, next) {
      const nextVao = context.createVertexArray();
      context.bindVertexArray(nextVao);
      const buffer = context.createBuffer();
      context.bindBuffer(context.ARRAY_BUFFER, buffer);
      context.bufferData(context.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]), context.STATIC_DRAW);
      const attrib = context.getAttribLocation(next, 'a_pos');
      context.enableVertexAttribArray(attrib);
      context.vertexAttribPointer(attrib, 2, context.FLOAT, false, 0, 0);
      context.bindVertexArray(null);
      return nextVao;
    }

    function loadTexture(src) {
      if (pending.has(src)) return pending.get(src);
      const request = (async () => {
        try {
          const image = await SA.platform.loadImage(src);
          const bitmap = await createImageBitmap(image);
          const texture = gl.createTexture();
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          const record = { ready: true, texture, width: bitmap.width, height: bitmap.height };
          bitmap.close();
          textures.set(src, record);
          return record;
        } catch (error) {
          textures.set(src, { ready: false, error: String((error && error.code) || (error && error.message) || 'load-failed') });
          return null;
        } finally {
          pending.delete(src);
        }
      })();
      pending.set(src, request);
      return request;
    }

    function textureFor(src) {
      const record = textures.get(src);
      if (record) return record;
      loadTexture(src);
      return null;
    }

    function videoRecordFor(src) {
      const existing = videos.get(src);
      if (existing) return existing;
      if (typeof document === 'undefined' || !document.createElement) return null;
      const element = document.createElement('video');
      element.muted = true;
      element.loop = true;
      element.playsInline = true;
      element.preload = 'auto';
      element.crossOrigin = 'anonymous';
      const record = { element, ready: false, texture: null, width: 16, height: 16, uploadedStamp: null };
      element.addEventListener('loadeddata', () => {
        record.ready = true;
        record.width = element.videoWidth || 16;
        record.height = element.videoHeight || 16;
        if (!record.texture) record.texture = gl.createTexture();
      });
      element.addEventListener('error', () => {
        record.error = 'video-error';
      });
      try {
        element.src = src;
        element.load();
      } catch {
        record.error = 'video-src-failed';
      }
      videos.set(src, record);
      return record;
    }

    // Renders a scene3d layer through SA.three3d and uploads the canvas into a
    // per-layer texture. Re-uploaded every frame because the scene is animated;
    // null (missing three, failed render) skips the layer.
    function sceneRecordFor(layer, width, height, time) {
      if (typeof SA === 'undefined' || !SA.three3d || typeof SA.three3d.render !== 'function') return null;
      const key = layer.id || layer;
      let record = scenes.get(key);
      if (!record) {
        record = { texture: gl.createTexture(), width, height, ready: false };
        scenes.set(key, record);
      }
      let image = null;
      try {
        image = SA.three3d.render(layer, { time, width, height });
      } catch {
        image = null;
      }
      if (!image) return null;
      record.width = image.width || width;
      record.height = image.height || height;
      gl.bindTexture(gl.TEXTURE_2D, record.texture);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      } catch {
        return null;
      }
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      record.ready = true;
      return record;
    }

    function waitVideo(src) {
      const record = videoRecordFor(src);
      if (!record || !record.element) return Promise.resolve(null);
      if (record.ready || record.error) return Promise.resolve(record);
      return new Promise((resolve) => {
        const finish = () => {
          clearTimeout(timer);
          resolve(record);
        };
        const timer = setTimeout(finish, 5000);
        record.element.addEventListener('loadeddata', finish, { once: true });
        record.element.addEventListener('error', finish, { once: true });
      });
    }

    function uploadVideo(record) {
      const element = record.element;
      if (!element || element.readyState < 2 || !element.videoWidth) return;
      const stamp = element.currentTime;
      if (record.texture && record.uploadedStamp === stamp) return;
      if (!record.texture) record.texture = gl.createTexture();
      record.width = element.videoWidth;
      record.height = element.videoHeight;
      gl.bindTexture(gl.TEXTURE_2D, record.texture);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, element);
      } catch {
        return;
      }
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      record.uploadedStamp = stamp;
    }

    async function prepare(layers, t, options) {
      const opts = options || {};
      const list = (layers || []).filter((layer) => layer && layer.enabled !== false && layer.type === 'video' && layer.src);
      for (const layer of list) {
        const record = videoRecordFor(layer.src);
        const video = record && record.element;
        if (!video) continue;
        const config = layer.video || {};
        const loop = config.loop !== false;
        video.loop = loop;
        const target = videoTargetFor(layer, t, video);
        if (opts.playback === 'preview') {
          if (config.play === false || opts.playing === false) {
            if (!video.paused) {
              try {
                video.pause();
              } catch {
                /* ignore */
              }
            }
            if (Math.abs(video.currentTime - target) > 0.05) {
              try {
                video.currentTime = target;
              } catch {
                /* ignore */
              }
            }
            continue;
          }
          const hasAudio = opts.hasAudio !== false && opts.hasAudio != null ? opts.hasAudio : false;
          const shouldMute = config.muted === true || (config.muted == null && hasAudio);
          if (video.muted !== shouldMute) {
            video.muted = shouldMute;
          }
          const rate = (config.speed == null ? 1 : Number(config.speed) || 1) * (opts.speed || 1);
          if (Math.abs(video.playbackRate - rate) > 1e-4) {
            try {
              video.playbackRate = rate;
            } catch {
              /* ignore */
            }
          }
          if (video.paused) {
            const played = video.play();
            if (played && played.catch) played.catch(() => {});
          }
          if (Math.abs(video.currentTime - target) > 0.25) {
            try {
              video.currentTime = target;
            } catch {
              /* ignore */
            }
          }
        } else {
          if (!video.paused) video.pause();
          if (Math.abs(video.currentTime - target) > 0.02) {
            await new Promise((resolve) => {
              let settled = false;
              const finish = () => {
                if (settled) return;
                settled = true;
                video.removeEventListener('seeked', finish);
                resolve();
              };
              const timer = setTimeout(finish, 3000);
              video.addEventListener('seeked', function onSeeked() {
                clearTimeout(timer);
                finish();
              }, { once: true });
              try {
                video.currentTime = target;
              } catch {
                clearTimeout(timer);
                finish();
              }
            });
          }
        }
      }
      return list.length;
    }

    async function preload(layers) {
      const list = (layers || []).filter((layer) => layer && layer.enabled !== false && layer.type !== 'solid' && layer.type !== 'scene3d' && layer.src);
      await Promise.all(list.map((layer) => (layer.type === 'video' ? waitVideo(layer.src) : loadTexture(layer.src))));
      return list.length;
    }

    function applyBlend(blend) {
      gl.enable(gl.BLEND);
      if (blend === 'add') gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ONE, gl.ONE);
      else if (blend === 'multiply') gl.blendFuncSeparate(gl.DST_COLOR, gl.ZERO, gl.ZERO, gl.ONE);
      else if (blend === 'screen') gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_COLOR, gl.ZERO, gl.ONE);
      else gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    }

    function captureBackdrop(width, height) {
      if (!gl.copyTexImage2D || !gl.createTexture) return false;
      if (!backdrop) backdrop = gl.createTexture();
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, backdrop);
      try {
        gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 0, 0, width, height, 0);
      } catch {
        return false;
      }
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return true;
    }

    function draw(layers, viewport, time, options) {
      if (!program || !layers || !layers.length) return 0;
      const width = (viewport && viewport.width) || gl.drawingBufferWidth;
      const height = (viewport && viewport.height) || gl.drawingBufferHeight;
      const t = time == null ? 0 : Number(time) || 0;
      const keyframes = options && options.keyframes;
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.uniform2f(uniforms.resolution, width, height);
      gl.uniform2f(uniforms.size, width, height);
      gl.uniform1f(uniforms.time, t);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform1i(uniforms.tex, 0);
      gl.uniform1i(uniforms.backdrop, 1);
      let drawn = 0;
      for (const raw of layers) {
        const layer = keyframes ? resolveLayerAt(raw, keyframes, t) : raw;
        if (!layer || layer.enabled === false) continue;
        const motion = evaluateLayerMotion(layer, t, { width, height });
        if (!motion.visible) continue;
        const opacity = (layer.opacity == null ? 1 : Math.max(0, Math.min(1, layer.opacity))) * motion.opacity;
        if (opacity <= 0) continue;
        const isScene = isSceneLayer(layer);
        const isVideo = !isScene && layer.type === 'video' && !!layer.src;
        const isImage = !isScene && !isVideo && layer.type !== 'solid' && !!layer.src;
        let record = null;
        if (isScene) {
          record = sceneRecordFor(layer, width, height, t);
          if (!record || !record.ready) continue;
        } else if (isVideo) {
          record = videoRecordFor(layer.src);
          if (!record || record.error || !record.ready || !record.element || record.element.readyState < 2) continue;
          uploadVideo(record);
          if (!record.texture) continue;
        } else if (isImage) {
          record = textureFor(layer.src);
          if (!record || !record.ready) continue;
        }
        const fit = layer.fit || (isScene ? 'stretch' : isImage || isVideo ? 'cover' : 'stretch');
        const rect = isImage || isVideo || isScene ? fitRect(fit, record.width, record.height, width, height) : { x: 0, y: 0, w: width, h: height };
        const geo = layerGeometry(layer, motion, rect, width, height);
        const centerX = geo.centerX;
        const centerY = geo.centerY;
        const halfX = geo.halfX;
        const halfY = geo.halfY;
        const cos = geo.cos;
        const sin = geo.sin;
        gl.uniform2f(uniforms.center, centerX, centerY);
        gl.uniform2f(uniforms.half, halfX, halfY);
        gl.uniformMatrix2fv(uniforms.rot, false, new Float32Array([cos, sin, -sin, cos]));
        gl.uniform2f(uniforms.size, halfX * 2, halfY * 2);
        if (uniforms.uvRect) gl.uniform4f(uniforms.uvRect, geo.uvRect[0], geo.uvRect[1], geo.uvRect[2], geo.uvRect[3]);
        gl.uniform1f(uniforms.radius, Math.max(0, Math.min(0.5, layer.radius || 0)) * Math.min(halfX, halfY) * 2);
        const color = parseColor(layer.color || (isImage || isVideo || isScene ? '#ffffff' : '#000000'));
        gl.uniform4f(uniforms.color, color[0], color[1], color[2], color[3]);
        gl.uniform1f(uniforms.useTexture, isImage || isVideo || isScene ? 1 : 0);
        gl.uniform1f(uniforms.opacity, opacity);
        const filter = filterState(layer.filter);
        gl.uniform1i(uniforms.filter, filter.code);
        gl.uniform4f(uniforms.filterParams, filter.params[0], filter.params[1], filter.params[2], filter.params[3]);
        const chroma = chromaState(layer.chroma);
        gl.uniform1i(uniforms.chroma, chroma.on ? 1 : 0);
        gl.uniform3f(uniforms.chromaKey, chroma.color[0], chroma.color[1], chroma.color[2]);
        gl.uniform4f(uniforms.chromaParams, chroma.params[0], chroma.params[1], chroma.params[2], chroma.params[3]);
        if (isImage || isVideo || isScene) gl.bindTexture(gl.TEXTURE_2D, record.texture);
        else gl.bindTexture(gl.TEXTURE_2D, null);
        const code = blendCode(layer.blend);
        if (code > 0 && captureBackdrop(width, height)) {
          gl.uniform1i(uniforms.blendMode, code);
          gl.uniform1f(uniforms.backdropReady, 1);
          gl.disable(gl.BLEND);
        } else {
          gl.uniform1i(uniforms.blendMode, 0);
          gl.uniform1f(uniforms.backdropReady, 0);
          applyBlend(layer.blend || 'normal');
        }
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        drawn += 1;
      }
      gl.bindVertexArray(null);
      gl.disable(gl.BLEND);
      return drawn;
    }

    function textureCount() {
      return [...textures.values()].filter((record) => record.ready).length;
    }

    function pauseVideos() {
      for (const record of videos.values()) {
        if (record && record.element && !record.element.paused) {
          try {
            record.element.pause();
          } catch {
            /* ignore */
          }
        }
      }
    }

    function dispose() {
      for (const record of textures.values()) {
        if (record.texture) gl.deleteTexture(record.texture);
      }
      textures.clear();
      pending.clear();
      for (const record of scenes.values()) {
        if (record.texture) gl.deleteTexture(record.texture);
      }
      scenes.clear();
      for (const record of videos.values()) {
        if (record.texture) gl.deleteTexture(record.texture);
        if (record.element) {
          try {
            record.element.pause();
            record.element.removeAttribute('src');
            record.element.load();
          } catch {
            /* ignore */
          }
        }
      }
      videos.clear();
      if (backdrop) gl.deleteTexture(backdrop);
      backdrop = null;
      if (vao) gl.deleteVertexArray(vao);
      if (program) gl.deleteProgram(program);
    }

    return { draw, preload, prepare, pauseVideos, textureFor, videoRecordFor, textureCount, dispose, fitRect };
  }

  return { create, fitRect, parseColor, evaluateLayerMotion, blendCode, filterState, chromaState, chromaAlpha, videoTargetFor, isSceneLayer, resolveLayerAt, layerGeometry, sampleTrack, LAYER_KEY_PROPS, CUSTOM_BLENDS, FILTERS, CHROMA_DEFAULTS };
});
