(function (root, factory) {
  const api = factory(typeof require === 'function' && typeof module === 'object' ? require('../rng') : root.SA.rng, typeof require === 'function' && typeof module === 'object' ? require('../scene3d') : root.SA.scene3d);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.SA = root.SA || {};
    root.SA.glFields = api;
  }
})(typeof self !== 'undefined' ? self : this, function (rng, scene3d) {
  'use strict';

  // Full-frame mathematical fields: one fragment shader per field, each a closed
  // form of (position, time, palette, 16 genome numbers). Nothing here keeps a
  // state between frames, so a field is the same whether the playhead gets there
  // by playing, scrubbing or exporting.
  //
  // A field's genome (`p`) is drawn from the clip seed with the same randomness
  // contract as the other generated figures: every number is drawn from its full
  // range, then slid to a plain default as the level (weird) falls to 0.
  // p[12..15] are reserved by every field for the embedding: density, sharpness,
  // motion, organic (all 0..1).

  const tools = scene3d.tools;

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  // --- shared GLSL ------------------------------------------------------------

  const HEAD = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform vec2 u_res;
uniform float u_time;
uniform float u_seed;
uniform float u_opacity;
uniform vec4 u_p0;
uniform vec4 u_p1;
uniform vec4 u_p2;
uniform vec4 u_p3;
uniform vec3 u_c0;
uniform vec3 u_c1;
uniform vec3 u_c2;
uniform vec3 u_c3;
uniform vec3 u_c4;
uniform vec4 u_textBox;
uniform vec4 u_cam;
const float PI = 3.14159265359;
const float TAU = 6.28318530718;

float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p, int oct) {
  float a = 0.5;
  float s = 0.0;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 8; i += 1) {
    if (i >= oct) break;
    s += a * vnoise(p + u_seed);
    p = r * p * 2.02 + 17.0;
    a *= 0.5;
  }
  return s;
}
mat2 rot(float a) { float c = cos(a); float s = sin(a); return mat2(c, -s, s, c); }
vec3 ramp(float x) {
  vec3 pal[5] = vec3[5](u_c0, u_c1, u_c2, u_c3, u_c4);
  x = fract(x) * 5.0;
  int i = int(floor(x));
  float f = x - float(i);
  f = f * f * (3.0 - 2.0 * f);
  return mix(pal[i % 5], pal[(i + 1) % 5], f);
}
vec2 cmul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
vec2 cdiv(vec2 a, vec2 b) { float d = dot(b, b) + 1e-9; return vec2(a.x * b.x + a.y * b.y, a.y * b.x - a.x * b.y) / d; }
vec2 cpow(vec2 z, int n) { vec2 r = vec2(1.0, 0.0); for (int i = 0; i < 12; i += 1) { if (i >= n) break; r = cmul(r, z); } return r; }
vec4 premul(vec3 c, float a) { a = clamp(a, 0.0, 1.0); return vec4(c * a, a); }
`;

  const TAIL = `
void main() {
  vec2 frag = vec2(v_uv.x, 1.0 - v_uv.y) * u_res;
  float shortSide = min(u_res.x, u_res.y);
  vec2 p = (frag - 0.5 * u_res) / shortSide;
  p = rot(-u_cam.w) * (p - u_cam.yz / shortSide) / max(u_cam.x, 0.01);
  vec4 col = fieldColor(p, u_time);
  float fade = 1.0;
  if (u_textBox.z > u_textBox.x) {
    vec2 c = 0.5 * (u_textBox.xy + u_textBox.zw);
    vec2 h = 0.5 * (u_textBox.zw - u_textBox.xy) + 10.0;
    vec2 q = abs(frag - c) - h;
    float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
    fade = smoothstep(0.0, 70.0, d);
  }
  fragColor = col * (u_opacity * fade);
}
`;

  // --- the fields -------------------------------------------------------------
  // Each entry: glsl (defines `vec4 fieldColor(vec2 p, float t)`, p centred with
  // the short side 1, result premultiplied), genome(T) -> 12 numbers p[0..11],
  // profile: hand-placed position for the embedding.

  const FIELDS = {
    domainWarp: {
      profile: { organic: 0.95, sharp: 0.1, dense: 0.5, motion: 0.45 },
      glsl: `
vec4 fieldColor(vec2 p, float t) {
  vec2 q = p * u_p0.x;
  int oc = int(u_p0.w);
  float s = u_p0.z * t;
  vec2 a = vec2(fbm(q + vec2(0.0, s), oc), fbm(q + vec2(5.2, 1.3) - s, oc));
  vec2 b = vec2(fbm(q + u_p0.y * a + vec2(1.7, 9.2) + s * 0.7, oc), fbm(q + u_p0.y * a + vec2(8.3, 2.8) - s * 0.5, oc));
  float f = fbm(q + u_p0.y * b, oc);
  float v = pow(clamp(f, 0.0, 1.0), u_p1.x);
  vec3 c = ramp(v * 1.2 + u_p1.y + length(b) * 0.3);
  float shade = 0.55 + 0.6 * f * f + 0.3 * length(a);
  return premul(c * shade, u_p1.z);
}`,
      genome(T) {
        return [T.range(1.6, 0.8, 4.5), T.range(1.2, 0.5, 3.2), T.range(0.12, 0.05, 0.45), T.int(4, 2, 6), T.range(1.2, 0.7, 2.6), T.range(0, 0, 1), T.range(0.85, 0.6, 1), 0, 0, 0, 0, 0];
      },
    },
    voronoiCells: {
      profile: { organic: 0.55, sharp: 0.6, dense: 0.6, motion: 0.4 },
      glsl: `
vec3 vor(vec2 x, float t, float jitter) {
  vec2 n = floor(x);
  vec2 f = fract(x);
  float d1 = 8.0;
  float d2 = 8.0;
  vec2 id = vec2(0.0);
  for (int j = -1; j <= 1; j += 1) {
    for (int i = -1; i <= 1; i += 1) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = hash22(n + g);
      o = 0.5 + 0.5 * jitter * sin(t * u_p0.y * TAU * 0.25 + TAU * o);
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; id = n + g; }
      else if (d < d2) { d2 = d; }
    }
  }
  return vec3(sqrt(d1), sqrt(d2), hash21(id));
}
vec4 fieldColor(vec2 p, float t) {
  vec3 v = vor(p * u_p0.x, t, u_p1.x);
  int mode = int(u_p0.z);
  float edge = 1.0 - smoothstep(0.0, u_p0.w, v.y - v.x);
  vec3 c = ramp(v.z + u_p1.y);
  if (mode == 0) return premul(c * (0.55 + 0.45 * (1.0 - v.x)), 0.95);
  if (mode == 1) return premul(ramp(v.z * 0.5 + u_p1.y + 0.5), edge);
  if (mode == 2) {
    float ring = 1.0 - smoothstep(0.0, 0.12, abs(fract(v.x * 4.0) - 0.5) * 2.0 - 0.6);
    return premul(c, ring * 0.9);
  }
  return premul(mix(c * (0.4 + 0.6 * (1.0 - v.x)), vec3(0.02), edge), 0.95);
}`,
      genome(T) {
        return [T.range(6, 3, 15), T.range(0.3, 0.1, 0.7), T.int(0, 0, 3), T.range(0.06, 0.02, 0.14), T.range(1, 0.4, 1), T.range(0, 0, 1), 0, 0, 0, 0, 0, 0];
      },
    },
    contour: {
      profile: { organic: 0.9, sharp: 0.55, dense: 0.55, motion: 0.4 },
      glsl: `
vec4 fieldColor(vec2 p, float t) {
  float F = 0.0;
  int nb = int(u_p0.w);
  for (int i = 0; i < 9; i += 1) {
    if (i >= nb) break;
    float fi = float(i);
    vec2 c = 0.36 * vec2(sin(t * u_p0.z * (0.6 + 0.35 * hash11(fi)) + fi * 2.1), cos(t * u_p0.z * (0.5 + 0.4 * hash11(fi + 9.0)) + fi * 1.3));
    vec2 d = p - c;
    F += (0.012 + 0.012 * hash11(fi + 3.0)) / (dot(d, d) + 0.002);
  }
  F += u_p1.z * fbm(p * 3.0 + t * 0.05, 3);
  float v = log(F + 1e-3) * u_p0.x;
  float line = 1.0 - smoothstep(0.0, u_p0.y, abs(fract(v) - 0.5) * 2.0);
  vec3 c = ramp(floor(v) * 0.08 + u_p1.y);
  float fill = u_p1.x * smoothstep(0.0, 2.0, F);
  return premul(c, clamp(line * 0.95 + fill * 0.5, 0.0, 1.0));
}`,
      genome(T) {
        return [T.range(6, 3, 12), T.range(0.5, 0.2, 0.9), T.range(0.3, 0.1, 0.6), T.int(5, 4, 9), T.range(0.3, 0, 0.8), T.range(0, 0, 1), T.range(0.1, 0, 0.5), 0, 0, 0, 0, 0];
      },
    },
    sdfKaleido: {
      profile: { organic: 0.1, sharp: 0.85, dense: 0.65, motion: 0.5 },
      glsl: `
float sdBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
vec4 fieldColor(vec2 p, float t) {
  float n = floor(u_p0.x);
  float seg = TAU / n;
  float a = atan(p.y, p.x);
  a = abs(mod(a, seg) - seg * 0.5);
  vec2 q = length(p) * vec2(cos(a), sin(a));
  float d = 10.0;
  float trap = 0.0;
  int iters = int(u_p0.y);
  float tw = t * u_p0.w;
  for (int i = 0; i < 7; i += 1) {
    if (i >= iters) break;
    q = abs(q) - vec2(u_p0.z, u_p0.z * 0.6);
    q = rot(tw * 0.3 + float(i) * 0.4) * q;
    q *= u_p1.x;
    float s;
    int shape = int(u_p1.y);
    if (shape == 0) s = sdBox(q, vec2(0.12, 0.05)) / pow(u_p1.x, float(i + 1));
    else if (shape == 1) s = (length(q) - 0.1) / pow(u_p1.x, float(i + 1));
    else s = (abs(length(q) - 0.14) - 0.02) / pow(u_p1.x, float(i + 1));
    if (s < d) { d = s; trap = float(i); }
  }
  float glow = exp(-abs(d) * 60.0 / u_p1.z);
  float body = 1.0 - smoothstep(0.0, 0.004, d);
  vec3 c = ramp(trap * 0.17 + length(p) * 0.6 + t * 0.02);
  return premul(c, clamp(body * 0.9 + glow * 0.6, 0.0, 1.0));
}`,
      genome(T) {
        return [T.int(6, 3, 12), T.int(4, 3, 6), T.range(0.3, 0.18, 0.55), T.range(0.3, 0.1, 0.8), T.range(1.45, 1.2, 1.85), T.int(0, 0, 2), T.range(1, 0.5, 2), 0, 0, 0, 0, 0];
      },
    },
    chladni: {
      profile: { organic: 0.3, sharp: 0.7, dense: 0.5, motion: 0.3 },
      glsl: `
vec4 fieldColor(vec2 p, float t) {
  float n = u_p0.x + 0.7 * sin(t * u_p0.z);
  float m = u_p0.y + 0.7 * cos(t * u_p0.z * 0.8);
  vec2 q = p * 2.0 + 0.5;
  float f = cos(n * PI * q.x) * cos(m * PI * q.y) - cos(m * PI * q.x) * cos(n * PI * q.y);
  float v = abs(f);
  float line = 1.0 - smoothstep(0.0, u_p0.w, v);
  float glow = exp(-v * 8.0) * 0.5;
  vec3 c = ramp(0.3 * f + u_p1.y + length(p) * 0.5);
  float fill = u_p1.x * (0.5 + 0.5 * f);
  return premul(c, clamp(line + glow + fill * 0.4, 0.0, 1.0));
}`,
      genome(T) {
        return [T.range(3, 2, 8), T.range(5, 3, 11), T.range(0.35, 0.1, 0.8), T.range(0.07, 0.02, 0.16), T.range(0.25, 0, 0.6), T.range(0, 0, 1), 0, 0, 0, 0, 0, 0];
      },
    },
    quasicrystal: {
      profile: { organic: 0.35, sharp: 0.45, dense: 0.8, motion: 0.45 },
      glsl: `
vec4 fieldColor(vec2 p, float t) {
  int n = int(u_p0.x);
  float v = 0.0;
  for (int i = 0; i < 13; i += 1) {
    if (i >= n) break;
    float a = float(i) * TAU / float(n);
    v += cos(dot(vec2(cos(a), sin(a)), p) * u_p0.y + t * u_p0.z * (0.6 + 0.8 * hash11(float(i) + u_seed)));
  }
  v = clamp(v / sqrt(float(n)) * 0.6 + 0.5, 0.0, 1.0);
  v = smoothstep(0.12, 0.88, v);
  v = pow(v, u_p0.w * 0.5 + 0.5);
  vec3 c = ramp(v * 0.9 + u_p1.x);
  return premul(c * (0.3 + 0.7 * v), 0.9);
}`,
      genome(T) {
        return [T.pick(7, [5, 7, 9, 11]), T.range(14, 6, 30), T.range(0.5, 0.15, 1.2), T.range(2, 1, 6), T.range(0, 0, 1), 0, 0, 0, 0, 0, 0, 0];
      },
    },
    fractal: {
      profile: { organic: 0.45, sharp: 0.55, dense: 0.9, motion: 0.3 },
      glsl: `
vec4 fieldColor(vec2 p, float t) {
  int type = int(u_p0.x);
  int maxIt = int(u_p0.z);
  float breath = 0.5 + 0.5 * sin(t * u_p0.w);
  float zoom = u_p0.y * (1.0 + 2.5 * breath);
  vec2 z;
  vec2 c;
  float it = 0.0;
  float smoothIt = 0.0;
  float root = 0.0;
  if (type == 0) {
    z = rot(t * u_p0.w * 0.2) * p * 2.4 / zoom;
    c = u_p1.xy + u_p1.z * vec2(cos(t * u_p0.w), sin(t * u_p0.w * 1.3));
    for (int i = 0; i < 80; i += 1) {
      if (i >= maxIt) break;
      z = cmul(z, z) + c;
      if (dot(z, z) > 256.0) break;
      it += 1.0;
    }
  } else if (type == 1) {
    c = p * 2.6 / zoom + vec2(-1.75, -0.03) * 0.0 + u_p1.xy * 0.3;
    z = vec2(0.0);
    for (int i = 0; i < 80; i += 1) {
      if (i >= maxIt) break;
      z = abs(z);
      z = cmul(z, z) + c;
      if (dot(z, z) > 256.0) break;
      it += 1.0;
    }
  } else if (type == 2) {
    vec2 centre = vec2(-0.7436438870371587, 0.1318259042053119);
    float sc = 1.6 * exp(-breath * 7.0 / max(zoom, 0.5));
    c = centre + p * sc;
    z = vec2(0.0);
    for (int i = 0; i < 80; i += 1) {
      if (i >= maxIt) break;
      z = cmul(z, z) + c;
      if (dot(z, z) > 256.0) break;
      it += 1.0;
    }
  } else {
    z = rot(t * u_p0.w * 0.3) * p * 3.0 / zoom;
    for (int i = 0; i < 80; i += 1) {
      if (i >= maxIt) break;
      vec2 z2 = cmul(z, z);
      vec2 z3 = cmul(z2, z);
      z = z - cdiv(z3 - vec2(1.0, 0.0), 3.0 * z2);
      it += 1.0;
      if (length(z3 - vec2(1.0, 0.0)) < 0.001) break;
    }
    root = floor(mod(atan(z.y, z.x) / TAU * 3.0 + 3.0 + 0.5, 3.0));
  }
  float mag = dot(z, z);
  if (type < 3) {
    if (mag <= 256.0) return premul(vec3(0.0), 0.0);
    smoothIt = it - log2(max(log2(mag), 1e-3)) + 4.0;
    vec3 col = ramp(smoothIt * u_p1.w * 0.09 + atan(z.y, z.x) / TAU * 0.5 + u_p2.x);
    return premul(col * (0.4 + 0.6 * smoothstep(0.0, 6.0, smoothIt)), 0.95);
  }
  vec3 col = ramp(root / 3.0 + u_p2.x);
  return premul(col * (1.0 - float(it) / float(maxIt) * 0.8), 0.95);
}`,
      genome(T) {
        // p0 = (type, zoom, iterations, speed), p1 = (cx, cy, orbit, cycles), p2.x = colour shift
        return [T.int(0, 0, 3), T.range(1.2, 0.8, 2.6), T.int(40, 24, 72), T.range(0.25, 0.08, 0.6), T.range(-0.7, -0.85, 0.3), T.range(0.27, 0, 0.7), T.range(0.1, 0, 0.18), T.range(1.4, 0.6, 3), T.range(0, 0, 1), 0, 0, 0];
      },
    },
    moire: {
      profile: { organic: 0.2, sharp: 0.8, dense: 0.85, motion: 0.5 },
      glsl: `
float grating(vec2 p, int kind, float freq) {
  float v;
  if (kind == 0) v = p.x * freq;
  else if (kind == 1) v = length(p) * freq;
  else v = atan(p.y, p.x) / TAU * freq * 0.35;
  return smoothstep(0.35, 0.65, abs(fract(v) - 0.5) * 2.0);
}
vec4 fieldColor(vec2 p, float t) {
  int kind = int(u_p0.x);
  float a = u_p0.w * sin(t * u_p0.z) + 0.0;
  vec2 q = rot(a) * (p + 0.06 * vec2(sin(t * u_p0.z * 0.7), cos(t * u_p0.z * 0.5)));
  float g1 = grating(p, kind, u_p0.y);
  float g2 = grating(q, kind, u_p0.y * (1.0 + 0.04 * u_p1.x));
  float m = abs(g1 - g2);
  if (u_p1.y > 1.5) m = max(m, abs(grating(rot(-a * 1.7) * p, kind, u_p0.y * 0.97) - g1));
  vec3 c = ramp(m * 0.6 + length(p) * 0.4 + u_p1.z);
  return premul(c, 0.15 + 0.85 * m);
}`,
      genome(T) {
        return [T.int(0, 0, 2), T.range(46, 20, 100), T.range(0.3, 0.1, 0.8), T.range(0.05, 0.015, 0.12), T.range(1, 0, 3), T.int(2, 2, 3), T.range(0, 0, 1), 0, 0, 0, 0, 0];
      },
    },
    hyperbolic: {
      profile: { organic: 0.25, sharp: 0.7, dense: 0.8, motion: 0.4 },
      glsl: `
vec4 fieldColor(vec2 p, float t) {
  int pick = int(u_p0.x);
  float pp = 3.0;
  float qq = 7.0;
  if (pick == 1) { pp = 4.0; qq = 5.0; }
  else if (pick == 2) { pp = 3.0; qq = 8.0; }
  else if (pick == 3) { pp = 5.0; qq = 4.0; }
  else if (pick == 4) { pp = 7.0; qq = 3.0; }
  else if (pick == 5) { pp = 4.0; qq = 6.0; }
  else if (pick == 6) { pp = 5.0; qq = 5.0; }
  else if (pick == 7) { pp = 3.0; qq = 9.0; }
  float a = PI / pp;
  float b = PI / qq;
  float den = sqrt(max(cos(b) * cos(b) - sin(a) * sin(a), 1e-4));
  float D = cos(b) / den;
  float R = sin(a) / den;
  vec2 z0 = p * 2.0;
  float r0 = length(z0);
  vec2 ofs = 0.5 * vec2(cos(t * u_p0.z), sin(t * u_p0.z * 0.8)) * u_p1.w;
  vec2 z = cdiv(z0 - ofs, vec2(1.0, 0.0) - cmul(vec2(ofs.x, -ofs.y), z0));
  z = rot(t * u_p0.z * 0.3) * z;
  float cnt = 0.0;
  vec2 cc = vec2(D, 0.0);
  int its = int(u_p0.y);
  for (int i = 0; i < 40; i += 1) {
    if (i >= its) break;
    float ang = atan(z.y, z.x);
    float len = length(z);
    float seg = PI / pp;
    ang = mod(ang, 2.0 * seg);
    if (ang > seg) ang = 2.0 * seg - ang;
    z = len * vec2(cos(ang), sin(ang));
    vec2 dd = z - cc;
    float d2 = dot(dd, dd);
    if (d2 < R * R) { z = cc + dd * (R * R / d2); cnt += 1.0; }
    else break;
  }
  float ang2 = atan(z.y, z.x);
  float eLine = abs(z.y);
  float eLine2 = abs(sin(PI / pp - ang2)) * length(z);
  float eCirc = abs(length(z - cc) - R);
  float edge = min(min(eLine, eLine2), eCirc);
  float w = u_p1.x * (1.0 - min(0.97, dot(z0, z0)));
  float line = 1.0 - smoothstep(0.0, max(w, 1e-4), edge);
  vec3 col = ramp(cnt * 0.11 + u_p0.w);
  float alt = mod(cnt, 2.0);
  vec3 body = col * (0.35 + 0.5 * alt);
  float inside = 1.0 - smoothstep(0.985, 1.0, r0);
  vec3 c = mix(body, vec3(0.95), line * 0.9);
  return premul(c, inside * mix(u_p1.y, 1.0, line));
}`,
      genome(T) {
        return [T.int(0, 0, 7), T.int(24, 12, 40), T.range(0.25, 0.08, 0.6), T.range(0, 0, 1), T.range(0.012, 0.005, 0.03), T.range(0.75, 0.4, 1), 0, T.range(0.8, 0.2, 1.2), 0, 0, 0, 0];
      },
    },
    truchet: {
      profile: { organic: 0.55, sharp: 0.65, dense: 0.7, motion: 0.35 },
      glsl: `
vec4 fieldColor(vec2 p, float t) {
  vec2 q = p * u_p0.x + vec2(t * u_p0.z, t * u_p0.z * 0.4);
  vec2 id = floor(q);
  vec2 f = fract(q);
  float h = hash21(id + u_seed);
  if (h > 0.5) f.x = 1.0 - f.x;
  int mode = int(u_p0.w);
  float d;
  if (mode == 1) {
    d = abs(f.x - f.y) * 0.7071;
  } else {
    float d1 = abs(length(f) - 0.5);
    float d2 = abs(length(f - vec2(1.0)) - 0.5);
    d = min(d1, d2);
  }
  float w = u_p0.y * 0.5;
  float line = 1.0 - smoothstep(w - 0.02, w + 0.02, d);
  vec3 c = ramp(hash21(id + 7.0) * u_p1.x + u_p1.y);
  float fill = 0.0;
  if (mode == 2) {
    float d1 = length(f) - 0.5;
    float d2 = length(f - vec2(1.0)) - 0.5;
    fill = (d1 < 0.0 || d2 < 0.0) ? 0.5 : 0.0;
  }
  return premul(c, clamp(line + fill, 0.0, 1.0));
}`,
      genome(T) {
        return [T.range(9, 4, 20), T.range(0.16, 0.07, 0.3), T.range(0.2, 0, 0.7), T.int(0, 0, 2), T.range(1, 0.2, 1), T.range(0, 0, 1), 0, 0, 0, 0, 0, 0];
      },
    },
    gyroid: {
      profile: { organic: 0.7, sharp: 0.35, dense: 0.75, motion: 0.4 },
      glsl: `
vec4 fieldColor(vec2 p, float t) {
  vec2 q = rot(u_p0.w) * p * u_p0.x;
  float z = t * u_p0.z;
  float acc = 0.0;
  float body = 0.0;
  for (int i = 0; i < 3; i += 1) {
    if (float(i) >= u_p1.x) break;
    float zz = z + float(i) * 1.3;
    float v = sin(q.x) * cos(q.y) + sin(q.y) * cos(zz) + sin(zz) * cos(q.x);
    float band = 1.0 - smoothstep(u_p0.y, u_p0.y + 0.06, abs(v));
    body = max(body, band);
    acc += v * (1.0 / (1.0 + float(i)));
  }
  vec3 c = ramp(acc * 0.25 + length(p) * 0.3 + u_p1.y);
  return premul(c * (0.55 + 0.45 * body), body * 0.95);
}`,
      genome(T) {
        return [T.range(5, 2, 9), T.range(0.22, 0.08, 0.5), T.range(0.35, 0.1, 0.8), T.range(0.3, 0, 1.2), T.int(1, 1, 3), T.range(0, 0, 1), 0, 0, 0, 0, 0, 0];
      },
    },
    complexColor: {
      profile: { organic: 0.6, sharp: 0.3, dense: 0.7, motion: 0.4 },
      glsl: `
vec4 fieldColor(vec2 p, float t) {
  vec2 z = p * u_p0.z * 2.0;
  int n = int(u_p0.x);
  int m = int(u_p0.y);
  vec2 c = 0.6 * vec2(cos(t * u_p0.w), sin(t * u_p0.w * 1.2));
  vec2 num = cpow(z, n) - vec2(1.0, 0.0);
  vec2 den = cpow(z, m) + c;
  vec2 w = cdiv(num, den);
  float arg = atan(w.y, w.x) / TAU;
  float lg = log(length(w) + 1e-4);
  float lines = 0.5 + 0.5 * sin(lg * u_p1.x);
  float contour = 1.0 - smoothstep(0.0, 0.12, abs(fract(arg * 8.0) - 0.5) * 2.0 - 0.8);
  vec3 col = ramp(arg + u_p1.y);
  return premul(col * (0.45 + 0.55 * lines), 0.92 + 0.0 * contour);
}`,
      genome(T) {
        return [T.int(3, 1, 6), T.int(1, 0, 4), T.range(1.6, 1.0, 3), T.range(0.3, 0.1, 0.7), T.range(10, 4, 24), T.range(0, 0, 1), 0, 0, 0, 0, 0, 0];
      },
    },
    curl: {
      profile: { organic: 0.95, sharp: 0.3, dense: 0.7, motion: 0.4 },
      glsl: `
vec2 flowAt(vec2 x, float t) {
  float e = 0.02;
  float s = t * u_p0.z;
  float a = fbm(x + vec2(0.0, e) + s, 3);
  float b = fbm(x - vec2(0.0, e) + s, 3);
  float c = fbm(x + vec2(e, 0.0) + s, 3);
  float d = fbm(x - vec2(e, 0.0) + s, 3);
  return vec2(a - b, -(c - d));
}
vec4 fieldColor(vec2 p, float t) {
  vec2 x = p * u_p0.x;
  float sum = 0.0;
  float weight = 0.0;
  int steps = int(u_p0.y);
  vec2 pos = x;
  for (int i = 0; i < 20; i += 1) {
    if (i >= steps) break;
    vec2 v = flowAt(pos, t);
    pos += normalize(v + 1e-5) * 0.035;
    float w = 1.0 - float(i) / float(steps);
    sum += vnoise(pos * 22.0) * w;
    weight += w;
  }
  pos = x;
  for (int i = 0; i < 20; i += 1) {
    if (i >= steps) break;
    vec2 v = flowAt(pos, t);
    pos -= normalize(v + 1e-5) * 0.035;
    float w = 1.0 - float(i) / float(steps);
    sum += vnoise(pos * 22.0) * w;
    weight += w;
  }
  float streak = pow(clamp(sum / max(weight, 1e-3), 0.0, 1.0), u_p0.w);
  vec2 v0 = flowAt(x, t);
  vec3 c = ramp(atan(v0.y, v0.x) / TAU + u_p1.x);
  return premul(c * (0.25 + 0.9 * streak), clamp(streak * 1.3, 0.0, 0.95));
}`,
      genome(T) {
        return [T.range(3.2, 1.6, 6.5), T.int(12, 8, 20), T.range(0.08, 0.02, 0.3), T.range(2.2, 1.2, 4), T.range(0, 0, 1), 0, 0, 0, 0, 0, 0, 0];
      },
    },
    lissajousGlow: {
      profile: { organic: 0.7, sharp: 0.6, dense: 0.25, motion: 0.55 },
      glsl: `
vec4 fieldColor(vec2 p, float t) {
  float best = 10.0;
  float which = 0.0;
  int copies = int(u_p1.x);
  for (int k = 0; k < 3; k += 1) {
    if (k >= copies) break;
    float ph = t * u_p0.z + float(k) * 0.6;
    float sc = 0.42 - float(k) * 0.07;
    for (int i = 0; i < 56; i += 1) {
      float u = float(i) / 56.0 * TAU;
      vec2 pt = sc * vec2(sin(u_p0.x * u + ph), sin(u_p0.y * u + ph * 0.5));
      float d = length(p - pt);
      if (d < best) { best = d; which = float(k) + float(i) / 56.0; }
    }
  }
  float core = 1.0 - smoothstep(0.0, u_p0.w, best);
  float glow = exp(-best / u_p1.y) * 0.7;
  vec3 c = ramp(which * 0.25 + u_p1.z);
  return premul(c, clamp(core + glow, 0.0, 1.0));
}`,
      genome(T) {
        return [T.int(3, 1, 6), T.int(2, 1, 6), T.range(0.5, 0.15, 1.1), T.range(0.007, 0.003, 0.02), T.int(2, 1, 3), T.range(0.03, 0.012, 0.07), T.range(0, 0, 1), 0, 0, 0, 0, 0];
      },
    },
    ripple: {
      profile: { organic: 0.8, sharp: 0.35, dense: 0.6, motion: 0.6 },
      glsl: `
vec4 fieldColor(vec2 p, float t) {
  float v = 0.0;
  int n = int(u_p0.x);
  for (int i = 0; i < 6; i += 1) {
    if (i >= n) break;
    float fi = float(i);
    vec2 c = 0.32 * vec2(sin(t * 0.21 + fi * 2.4), cos(t * 0.17 + fi * 1.7));
    float r = length(p - c);
    v += sin(r * u_p0.y - t * u_p0.z * TAU) * exp(-r * u_p0.w);
  }
  v /= float(n);
  float band = smoothstep(0.1, 0.0, abs(v) - u_p1.x);
  vec3 c = ramp(v * 1.5 + 0.5 + u_p1.y);
  return premul(c * (0.5 + 0.5 * v + 0.2), clamp(0.3 + 0.7 * abs(v) * 3.0 + band * 0.3, 0.0, 0.95));
}`,
      genome(T) {
        return [T.int(3, 2, 6), T.range(40, 18, 80), T.range(0.5, 0.2, 1.1), T.range(2.2, 1.2, 4), T.range(0.05, 0, 0.2), T.range(0, 0, 1), 0, 0, 0, 0, 0, 0];
      },
    },
    cellTiling: {
      profile: { organic: 0.4, sharp: 0.55, dense: 0.75, motion: 0.45 },
      glsl: `
float sdRoundBox(vec2 p, vec2 b, float r) { vec2 d = abs(p) - b + r; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r; }
vec4 fieldColor(vec2 p, float t) {
  vec2 q = p * u_p0.x;
  float row = floor(q.y);
  if (u_p0.z > 0.5) q.x += 0.5 * mod(row, 2.0);
  vec2 id = floor(q);
  vec2 f = fract(q) - 0.5;
  float h = hash21(id + u_seed);
  float pulse = 0.5 + 0.5 * sin(t * u_p0.w + h * TAU);
  float size = 0.16 + (0.3 * h * u_p1.x) + 0.12 * pulse * u_p1.x;
  int shape = int(floor(h * 4.0 + u_p0.y)) % 4;
  float d;
  if (shape == 0) d = length(f) - size;
  else if (shape == 1) d = sdRoundBox(f, vec2(size), size * 0.35);
  else if (shape == 2) d = abs(length(f) - size) - 0.025;
  else d = max(abs(f.x) * 0.866 + f.y * 0.5, -f.y) - size * 0.9;
  float edge = 0.02;
  float fillAlpha = 1.0 - smoothstep(-edge, edge, d);
  float lineAlpha = 1.0 - smoothstep(0.0, 0.03, abs(d));
  float a = mix(fillAlpha, lineAlpha, u_p1.y * step(0.5, hash11(dot(id, vec2(3.1, 7.7)))));
  vec3 c = ramp(h * u_p1.z + u_p1.w);
  return premul(c, a * 0.95);
}`,
      genome(T) {
        return [T.range(6, 3, 12), T.int(0, 0, 3), T.int(0, 0, 1), T.range(1.2, 0.4, 3), T.range(0.6, 0, 1), T.range(0.3, 0, 1), T.range(1, 0.2, 1), T.range(0, 0, 1), 0, 0, 0, 0];
      },
    },
  };

  const IDS = Object.keys(FIELDS);

  // The 16 numbers the shader reads: the field's own 12 genome numbers, then the
  // four embedding numbers (density, sharpness, motion, organic) from its profile.
  function genome(id, seed, rand) {
    const field = FIELDS[id];
    if (!field) return null;
    const T = tools(seed, `field-${id}`, rand);
    const g = field.genome(T);
    const prof = field.profile;
    const p = new Array(16).fill(0);
    for (let i = 0; i < 12; i += 1) p[i] = g[i] == null ? 0 : g[i];
    p[12] = prof.dense;
    p[13] = prof.sharp;
    p[14] = prof.motion;
    p[15] = prof.organic;
    return p;
  }

  // Fragment source of one field (cached by the caller).
  function fragment(id) {
    const field = FIELDS[id];
    if (!field) return null;
    return `${HEAD}${field.glsl}${TAIL}`;
  }

  // The hand-placed profile of a field, nudged by its genome so two seeds of
  // one field do not sit at the very same point of the direction space.
  function profile(id, p) {
    const field = FIELDS[id];
    if (!field) return { organic: 0.5, sharp: 0.5, dense: 0.5, motion: 0.5 };
    const base = field.profile;
    const g = Array.isArray(p) ? p : [];
    const wobble = (i) => (Number.isFinite(g[i]) ? ((Math.abs(g[i]) * 7.31) % 1) - 0.5 : 0);
    return {
      organic: clamp(base.organic + 0.12 * wobble(0), 0, 1),
      sharp: clamp(base.sharp + 0.12 * wobble(1), 0, 1),
      dense: clamp(base.dense + 0.15 * wobble(2), 0, 1),
      motion: clamp(base.motion + 0.12 * wobble(3), 0, 1),
    };
  }

  // The uniform values for a field spec ({id, p[16], seed, opacity, colors[5], camera}).
  function uniformsOf(field, frame, hexToRgb) {
    const p = field.p || [];
    const get = (i) => (Number.isFinite(p[i]) ? p[i] : 0);
    const colors = (field.colors || []).map((hex) => hexToRgb(hex));
    const color = (i) => colors[i % Math.max(1, colors.length)] || [0.8, 0.8, 0.9];
    const cam = field.camera || { scale: 1, dx: 0, dy: 0, rotate: 0 };
    const box = field.textBox;
    return {
      u_res: [frame.width, frame.height],
      u_time: field.time || 0,
      u_seed: (field.seed % 1000) * 0.137,
      u_opacity: clamp(field.opacity == null ? 1 : field.opacity, 0, 1),
      u_p0: [get(0), get(1), get(2), get(3)],
      u_p1: [get(4), get(5), get(6), get(7)],
      u_p2: [get(8), get(9), get(10), get(11)],
      u_p3: [get(12), get(13), get(14), get(15)],
      u_c0: color(0),
      u_c1: color(1),
      u_c2: color(2),
      u_c3: color(3),
      u_c4: color(4),
      u_textBox: box ? [box.x0, box.y0, box.x1, box.y1] : [0, 0, 0, 0],
      u_cam: [cam.scale == null ? 1 : cam.scale, cam.dx || 0, cam.dy || 0, cam.rotate || 0],
    };
  }

  return { IDS, FIELDS, HEAD, TAIL, genome, fragment, profile, uniformsOf };
});
