window.SA = window.SA || {};

SA.glShaders = (() => {
  'use strict';

  // Shared GLSL library: all noise and helpers are written in-house.
  const COMMON = `
  const float PI = 3.141592653589793;
  const float TAU = 6.283185307179586;

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  vec2 hash22(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
  }

  float hash13(vec3 p3) {
    p3 = fract(p3 * 0.1031);
    p3 += dot(p3, p3.zyx + 31.32);
    return fract((p3.x + p3.y) * p3.z);
  }

  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash12(i);
    float b = hash12(i + vec2(1.0, 0.0));
    float c = hash12(i + vec2(0.0, 1.0));
    float d = hash12(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float noise(vec2 p) {
    return valueNoise(p);
  }

  float fbm(vec2 p, int octaves) {
    float value = 0.0;
    float amplitude = 0.5;
    float total = 0.0;
    for (int i = 0; i < 8; i += 1) {
      if (i >= octaves) break;
      value += amplitude * valueNoise(p);
      total += amplitude;
      p *= 2.0;
      amplitude *= 0.5;
    }
    return total > 0.0 ? value / total : value;
  }

  vec2 curl(vec2 p, float epsilon) {
    float n1 = fbm(p + vec2(0.0, epsilon), 4);
    float n2 = fbm(p - vec2(0.0, epsilon), 4);
    float n3 = fbm(p + vec2(epsilon, 0.0), 4);
    float n4 = fbm(p - vec2(epsilon, 0.0), 4);
    return vec2((n1 - n2), -(n3 - n4)) / (2.0 * epsilon);
  }

  vec2 sdfGradient(sampler2D sdf, vec2 uv, vec2 texel) {
    float dx = texture(sdf, uv + vec2(texel.x, 0.0)).r - texture(sdf, uv - vec2(texel.x, 0.0)).r;
    float dy = texture(sdf, uv + vec2(0.0, texel.y)).r - texture(sdf, uv - vec2(0.0, texel.y)).r;
    return normalize(vec2(dx, dy) + vec2(1e-6));
  }

  vec3 blendNormal(vec3 base, vec3 top) {
    return top;
  }

  vec3 blendAdd(vec3 base, vec3 top) {
    return min(base + top, vec3(1.0));
  }

  vec3 blendScreen(vec3 base, vec3 top) {
    return 1.0 - (1.0 - base) * (1.0 - top);
  }

  vec3 blendMultiply(vec3 base, vec3 top) {
    return base * top;
  }

  vec3 blendOverlay(vec3 base, vec3 top) {
    return mix(2.0 * base * top, 1.0 - 2.0 * (1.0 - base) * (1.0 - top), step(0.5, base));
  }

  vec3 blendSoftLight(vec3 base, vec3 top) {
    vec3 d = mix(sqrt(base), ((16.0 * base - 12.0) * base + 4.0) * base, step(0.25, base));
    return mix(base - (1.0 - 2.0 * top) * base * (1.0 - base), base + (2.0 * top - 1.0) * (d - base), step(0.5, top));
  }

  vec3 blendMode(int mode, vec3 base, vec3 top) {
    if (mode == 1) return blendAdd(base, top);
    if (mode == 2) return blendScreen(base, top);
    if (mode == 3) return blendMultiply(base, top);
    if (mode == 4) return blendOverlay(base, top);
    if (mode == 5) return blendSoftLight(base, top);
    return blendNormal(base, top);
  }

  float noise1(float x) { return noise(vec2(x, 0.37)); }
  float fbm1(float x) { return fbm(vec2(x, 1.73), 3); }
  float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
  }

  // Shared letter transform: optional scale, skew, rotation, translation and
  // perspective tilt. Deformation stays with the text vertex shader.
  vec2 letterTransform(vec2 p, vec4 s0, vec4 s1, vec4 s2, bool rotate, bool scale, float perspective) {
    if (scale) p *= vec2(s0.w, s1.x);
    p.x += p.y * s1.y;
    if (rotate) {
      float angle = radians(s0.z);
      float c = cos(angle);
      float s = sin(angle);
      p = mat2(c, s, -s, c) * p;
    }
    p += s0.xy;
    float z = -p.y * sin(radians(s2.x)) + p.x * sin(radians(s2.y));
    float w = max(0.05, 1.0 + z / perspective);
    return p / w;
  }

  // One deformation slot. Codes < 20 work in letter space (p is glyph-local px
  // around the bbox centre, halfSize = a_bbox); codes >= 20 warp the whole
  // block, evaluated around the block centre stored in blk.xy and measured
  // against blk.zw (half the block bbox).
  vec2 deformOne(vec2 p, vec4 d, vec2 halfSize, vec4 blk) {
    if (d.x < 0.5 || abs(d.y) < 0.0001) return p;
    float code = d.x;
    float amount = d.y;
    float time = d.z;
    float param = d.w;
    if (code < 19.5) {
      float halfW = max(halfSize.x, 1.0);
      float halfH = max(halfSize.y, 1.0);
      float u = p.x / halfW;
      float v = p.y / halfH;
      float r = clamp(length(vec2(u, v)), 0.0, 1.0);
      if (code < 1.5) {                       // jelly
        float wave = sin(time * TAU * max(param, 0.1) + p.y * 0.06);
        p.y *= 1.0 + amount * wave * 0.6;
        p.x *= 1.0 - amount * wave * 0.25;
      } else if (code < 2.5) {                // wobbleWarp
        float sc = max(param, 0.5);
        p.x += sin(p.y * 0.03 * sc + time * 2.4) * amount * halfW * 0.8;
        p.y += cos(p.x * 0.03 * sc + time * 2.0) * amount * halfH * 0.5;
      } else if (code < 3.5) {                // twist
        float twist = radians(amount * (p.y / halfH));
        float c = cos(twist);
        float s = sin(twist);
        p = mat2(c, -s, s, c) * p;
      } else if (code < 4.5) {                // breathing
        p *= 1.0 + amount * sin(time * 2.4 + param);
      } else if (code < 5.5) {                // melt
        float drip = 0.6 + 0.4 * sin(p.x * 0.05 + time);
        p.y += amount * drip * halfH * 1.8;
        p.x *= 1.0 - amount * 0.3;
      } else if (code < 6.5) {                // bend
        // the signed radius keeps the bend on the same side of the letter for
        // a negative amount (a positive radius would flip the sweep instead)
        float k = amount * PI * 0.5;
        float radius = halfW / (sign(k) * max(abs(k), 0.0001));
        float theta = k * u;
        p = vec2(sin(theta) * radius, radius - cos(theta) * radius + p.y);
      } else if (code < 7.5) {                // bulge
        p *= 1.0 + amount * (1.0 - r * r);
      } else if (code < 8.5) {                // pinch
        p *= 1.0 - amount * (1.0 - r * r) * 0.8;
      } else if (code < 9.5) {                // taper
        p.x *= 1.0 + amount * v;
      } else if (code < 10.5) {               // shearWave
        p.x += amount * halfW * 0.4 * sin(v * PI * max(param, 0.01) + time * 2.4);
      } else if (code < 11.5) {               // ripple
        p += normalize(p + vec2(0.00001)) * amount * halfH * 0.15 * sin(r * max(param, 0.01) * 6.0 - time * 4.0);
      } else if (code < 12.5) {               // squash
        float s = amount * sin(time * TAU * max(param, 0.01));
        p.x *= 1.0 + s;
        p.y *= 1.0 - s;
      } else if (code < 13.5) {               // flag
        p.y += amount * halfH * 0.35 * sin(u * PI * 1.5 + time * 3.0) * (u + 1.0) * 0.5;
      } else if (code < 14.5) {               // zigzag
        p.x += amount * halfW * 0.25 * (abs(fract(v * max(param, 0.01)) - 0.5) * 4.0 - 1.0);
      } else if (code < 15.5) {               // stretch (squash & stretch)
        float s = amount * sin(time * TAU);
        p.x *= 1.0 - s * 0.45;
        p.y *= 1.0 + s;
      } else if (code < 16.5) {               // skew
        p.x += p.y * amount * sin(time * TAU);
      } else {                                // swirl (radial twist wave)
        float angle = radians(amount) * sin(time * TAU - r * PI * max(param, 0.1));
        float c = cos(angle);
        float s = sin(angle);
        p = mat2(c, -s, s, c) * p;
      }
      return p;
    }
    vec2 origin = blk.xy;
    vec2 halfBlock = max(blk.zw, vec2(1.0));
    vec2 q = p + origin;
    float U = q.x / halfBlock.x;
    float V = q.y / halfBlock.y;
    float R = length(vec2(U, V));
    float hs = floor(param / 100.0);
    float hd = hs / 99.0 * 2.0 - 1.0;
    float vd = (param - hs * 100.0) / 99.0 * 2.0 - 1.0;
    if (code < 20.5) {                        // arc
      float k = amount * PI * 0.5;
      float radius = halfBlock.x / (sign(k) * max(abs(k), 0.0001));
      float theta = k * U;
      q = vec2(sin(theta) * radius, radius - cos(theta) * radius + q.y);
    } else if (code < 21.5) {                 // arch
      q.y -= amount * halfBlock.y * (1.0 - U * U) * (1.0 - V) * 0.5;
    } else if (code < 22.5) {                 // bulgeBlock
      q.y *= 1.0 + amount * (1.0 - U * U);
    } else if (code < 23.5) {                 // flagBlock
      q.y += amount * halfBlock.y * 0.5 * sin(U * PI + time);
    } else if (code < 24.5) {                 // waveBlock
      q.y += amount * halfBlock.y * 0.5 * sin(U * PI * 2.0 + V * PI * 0.5 + time);
    } else if (code < 25.5) {                 // fish
      q.y *= 1.0 + amount * (1.0 - U * U) * (V < 0.0 ? 1.0 : 0.3);
    } else if (code < 26.5) {                 // rise
      q.y -= amount * halfBlock.y * U;
      q.y *= 1.0 + amount * 0.3 * U;
    } else if (code < 27.5) {                 // fisheye
      q *= 1.0 + amount * max(0.0, 1.0 - R * R);
    } else if (code < 28.5) {                 // inflate
      q.x *= 1.0 + amount * max(0.0, 1.0 - U * U) * 1.2;
      q.y *= 1.0 + amount * max(0.0, 1.0 - V * V) * 1.2;
    } else if (code < 29.5) {                 // squeeze
      q.x *= 1.0 - amount * (1.0 - V * V) * 0.5;
    } else if (code < 30.5) {                 // twistBlock
      float angle = amount * PI * (1.0 - clamp(R, 0.0, 1.0));
      float c = cos(angle);
      float s = sin(angle);
      q = mat2(c, -s, s, c) * q;
    } else {                                  // zoomBlock (true font size)
      // scales the whole block around its centre: letters and the gaps between
      // them grow together. The distortion pair does not apply to a pure zoom.
      q *= max(0.02, 1.0 + amount);
      return q - origin;
    }
    q.y *= 1.0 + hd * U * 0.5;
    q.x *= 1.0 + vd * V * 0.5;
    return q - origin;
  }

  // Up to three deformation slots per letter: row 3 of the state texture first,
  // then the extra slots in rows 5 and 6.
  vec2 applyDeformStack(vec2 p, vec4 s3, vec4 s5, vec4 s6, vec4 s7, vec2 halfSize) {
    p = deformOne(p, s3, halfSize, s7);
    p = deformOne(p, s5, halfSize, s7);
    p = deformOne(p, s6, halfSize, s7);
    return p;
  }

  // --- soft body lattice (free-form deformation) ------------------------------
  // The physics writes a 5x5 grid of normalized displacements into state rows
  // 9-21 (two points per texel). latticeDisp interpolates it with a Catmull-Rom
  // tensor product (4x4, C1, interpolating at the nodes) and returns the
  // displacement at q in -1..1. Row 22.x is the lattice-on flag.
  vec4 latticeWeights(float t) {
    float t2 = t * t;
    float t3 = t2 * t;
    return vec4(
      -0.5 * t3 + t2 - 0.5 * t,
       1.5 * t3 - 2.5 * t2 + 1.0,
      -1.5 * t3 + 2.0 * t2 + 0.5 * t,
       0.5 * t3 - 0.5 * t2
    );
  }
  vec2 latticeNode(sampler2D s, int letter, int index) {
    vec4 texel = texelFetch(s, ivec2(letter, 9 + (index >> 1)), 0);
    return ((index & 1) == 0) ? texel.xy : texel.zw;
  }
  vec2 latticeDisp(sampler2D s, int letter, vec2 q) {
    if (texelFetch(s, ivec2(letter, 22), 0).x < 0.5) return vec2(0.0);
    vec2 g = clamp((q + 1.0) * 2.0, vec2(0.0), vec2(4.0));
    vec2 base = floor(g);
    int i0 = int(clamp(base.x - 1.0, 0.0, 1.0));
    int j0 = int(clamp(base.y - 1.0, 0.0, 1.0));
    vec2 f = g - base;
    vec4 wx = latticeWeights(f.x);
    vec4 wy = latticeWeights(f.y);
    vec2 value = vec2(0.0);
    for (int i = 0; i < 4; i += 1) {
      vec2 column = latticeNode(s, letter, j0 * 5 + i0 + i) * wy.x
        + latticeNode(s, letter, (j0 + 1) * 5 + i0 + i) * wy.y
        + latticeNode(s, letter, (j0 + 2) * 5 + i0 + i) * wy.z
        + latticeNode(s, letter, (j0 + 3) * 5 + i0 + i) * wy.w;
      value += column * wx[i];
    }
    return value;
  }
  `;

  // --- text pass ---------------------------------------------------------------

  const TEXT_VERT = `#version 300 es
  precision highp float;
  in vec2 a_pos;        // glyph-local px, centered on the letter bbox center, at render size
  in float a_letter;    // global letter index
  in vec2 a_bbox;       // letter half-extents, for deformation and wipes
  uniform sampler2D u_state;    // RGBA32F, width = letters, height = 9
  uniform sampler2D u_color;    // RGBA8, width = letters, height = 1 (straight RGBA)
  uniform vec2 u_resolution;
  uniform float u_perspective;
  out vec2 v_local;
  out vec2 v_bbox;
  out vec4 v_color;
  out float v_wipe;
  out float v_letter;
  out float v_wipeMode;
  out float v_wipeSoft;
  out float v_flash;
  out float v_mask;
  ${COMMON}
  vec4 stateAt(int row) {
    return texelFetch(u_state, ivec2(int(a_letter + 0.5), row), 0);
  }
  void main() {
    v_letter = a_letter;
    vec4 s0 = stateAt(0);   // x, y, rot(deg), scale
    vec4 s1 = stateAt(1);   // scaleY, skew, opacity, blur
    vec4 s2 = stateAt(2);   // tiltX, tiltY, visibleFrac, reprProgress
    vec4 s3 = stateAt(3);   // deformType, amount, time, param
    vec4 s4 = stateAt(4);   // representMode, reprProgress, colorMix, seed
    vec4 s5 = stateAt(5);   // deform slot 2
    vec4 s6 = stateAt(6);   // deform slot 3
    vec4 s7 = stateAt(7);   // warpOrigin.xy, blockHalf.xy
    vec4 s8 = stateAt(8);   // wipeMode, wipeSoft, flash, maskFrac
    if (s4.x > 0.5) {
      gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
      v_color = vec4(0.0);
      v_local = vec2(0.0);
      v_bbox = vec2(1.0);
      v_wipe = 0.0;
      v_wipeMode = 0.0;
      v_wipeSoft = 0.0;
      v_flash = 0.0;
      v_mask = 1.0;
      return;
    }
    vec4 base = texelFetch(u_color, ivec2(int(a_letter + 0.5), 0), 0);
    v_color = vec4(base.rgb * base.a, base.a) * s1.z;
    v_wipe = s2.z;
    v_wipeMode = s8.x;
    v_wipeSoft = s8.y;
    v_flash = s8.z;
    v_mask = s8.w;
    v_local = a_pos;
    v_bbox = a_bbox;
    vec2 soft = latticeDisp(u_state, int(a_letter + 0.5), a_pos / max(a_bbox, vec2(1.0))) * a_bbox;
    vec2 p = (a_pos + soft) * vec2(s0.w, s1.x);
    p = applyDeformStack(p, s3, s5, s6, s7, a_bbox);
    p = letterTransform(p, s0, s1, s2, true, false, u_perspective);
    vec2 clip = (p / u_resolution) * 2.0 - 1.0;
    gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  }`;

  const TEXT_FRAG = `#version 300 es
  precision highp float;
  in vec2 v_local;
  in vec2 v_bbox;
  in vec4 v_color;
  in float v_wipe;
  in float v_letter;
  in float v_wipeMode;
  in float v_wipeSoft;
  in float v_flash;
  in float v_mask;
  layout(location = 0) out vec4 fragColor;
  layout(location = 1) out vec4 o_info;
  void main() {
    if (v_color.a <= 0.001) {
      fragColor = vec4(0.0);
      o_info = vec4(0.0);
      return;
    }
    float vis = 1.0;
    float wipe = clamp(v_wipe, 0.0, 1.0);
    float soft = max(v_wipeSoft, 0.0);
    float u = v_local.x / max(v_bbox.x, 1.0);
    float v = v_local.y / max(v_bbox.y, 1.0);
    if (wipe < 0.999 || soft > 0.0005) {
      float threshold = mix(-1.0, 1.0, wipe);
      float coord;
      if (v_wipeMode < 0.5) coord = u;
      else if (v_wipeMode < 1.5) coord = -u;
      else if (v_wipeMode < 2.5) coord = -v;
      else if (v_wipeMode < 3.5) coord = v;
      else if (v_wipeMode < 4.5) coord = length(vec2(u, v)) - 1.0;
      else coord = (u + v) * 0.70710678;
      vis = 1.0 - smoothstep(threshold - soft, threshold + soft, coord);
      if (vis <= 0.002) {
        fragColor = vec4(0.0);
        o_info = vec4(0.0);
        return;
      }
    }
    if (v_mask < 0.999) {
      float m = v * 0.5 + 0.5;
      float aa = max(fwidth(m), 0.002);
      vis *= 1.0 - smoothstep(v_mask - aa, v_mask + aa, m);
      if (vis <= 0.002) {
        fragColor = vec4(0.0);
        o_info = vec4(0.0);
        return;
      }
    }
    vec3 rgb = v_color.rgb;
    if (v_flash > 0.001) rgb = mix(rgb, vec3(v_color.a), clamp(v_flash, 0.0, 1.0));
    fragColor = vec4(rgb * vis, v_color.a * vis);
    float id = v_letter;
    float idHi = floor(id / 255.0);
    float idLo = id - idHi * 255.0;
    o_info = vec4(idHi / 255.0, idLo / 255.0, u * 0.5 + 0.5, v * 0.5 + 0.5);
  }`;

  // --- per-letter blur field ---------------------------------------------------
  // A blurred letter needs the blur radius of its own neighbours, so the radius
  // is first rendered into a field (one expanded quad per letter, max blended)
  // and the two blur passes read the local radius from it.

  const BLUR_FIELD_VERT = `#version 300 es
  precision highp float;
  in vec2 a_corner;
  in float a_letter;
  in vec2 a_inkToCell;
  in vec2 a_cell;
  in vec2 a_em;
  uniform sampler2D u_state;
  uniform vec2 u_resolution;
  out float v_blur;
  ${COMMON}
  vec4 stateAt(int row) {
    return texelFetch(u_state, ivec2(int(a_letter + 0.5), row), 0);
  }
  void main() {
    vec4 s0 = stateAt(0);
    vec4 s1 = stateAt(1);
    float blur = max(s1.w, 0.0);
    float stretch = max(abs(s0.w), abs(s1.x));
    vec2 ext = max(a_em, vec2(1.0)) * 0.5 * stretch + vec2(blur * 1.5);
    float latticeOn = texelFetch(u_state, ivec2(int(a_letter + 0.5), 22), 0).x;
    vec2 p = s0.xy + a_corner * ext * (latticeOn > 0.5 ? 1.8 : 1.0);
    v_blur = blur / 64.0;
    vec2 clip = (p / u_resolution) * 2.0 - 1.0;
    gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  }`;

  const BLUR_FIELD_FRAG = `#version 300 es
  precision highp float;
  in float v_blur;
  out vec4 fragColor;
  void main() {
    fragColor = vec4(v_blur, 0.0, 0.0, 1.0);
  }`;

  const TEXT_VBLUR_FRAG = `#version 300 es
  precision highp float;
  in vec2 v_uv;
  uniform sampler2D u_text;
  uniform sampler2D u_field;
  uniform vec2 u_texel;
  uniform vec2 u_direction;
  out vec4 fragColor;
  void main() {
    float blur = texture(u_field, v_uv).r * 64.0;
    vec4 src = texture(u_text, v_uv);
    if (blur <= 0.25) {
      fragColor = src;
      return;
    }
    float stepPx = max(blur * 1.5, 0.5) / 6.0;
    vec4 sum = src * 0.44444444;
    float total = 0.44444444;
    for (int i = 1; i <= 6; i += 1) {
      float w = exp(-0.5 * float(i) * float(i) / 9.0);
      vec2 offset = u_direction * u_texel * (float(i) * stepPx);
      sum += texture(u_text, clamp(v_uv + offset, vec2(0.0), vec2(1.0))) * w;
      sum += texture(u_text, clamp(v_uv - offset, vec2(0.0), vec2(1.0))) * w;
      total += 2.0 * w;
    }
    fragColor = sum / total;
  }`;

  // --- fullscreen composite ----------------------------------------------------

  const QUAD_VERT = `#version 300 es
  precision highp float;
  out vec2 v_uv;
  void main() {
    vec2 pos = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
    v_uv = pos;
    gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
  }`;

  const COMPOSITE_FRAG = `#version 300 es
  precision highp float;
  in vec2 v_uv;
  uniform sampler2D u_texture;
  uniform vec4 u_clearColor;
  out vec4 fragColor;
  void main() {
    vec4 text = texture(u_texture, v_uv);
    float alpha = text.a + u_clearColor.a * (1.0 - text.a);
    vec3 color = text.rgb + u_clearColor.rgb * (1.0 - text.a);
    fragColor = vec4(color, alpha);
  }`;

  const COPY_FRAG = `#version 300 es
  precision highp float;
  in vec2 v_uv;
  uniform sampler2D u_texture;
  uniform float u_opacity;
  uniform vec2 u_offset;
  uniform float u_scale;
  uniform float u_angle;
  out vec4 fragColor;
  void main() {
    vec2 p = v_uv - 0.5;
    float c = cos(u_angle);
    float s = sin(u_angle);
    p = mat2(c, -s, s, c) * p;
    vec2 uv = p / max(0.0001, u_scale) + 0.5 + u_offset;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
      fragColor = vec4(0.0);
      return;
    }
    fragColor = texture(u_texture, uv) * u_opacity;
  }`;

  // --- text mask pass ----------------------------------------------------------
  // Bakes the visible glyphs (plus a padding ring grown from the signed
  // distance field) into an alpha mask the clip layers are knocked out with.
  // The distance field is normalised by maxDistance exactly like EDGE_FRAG's
  // outline: u_radius / u_feather arrive pre-divided, `distance` is signed with
  // the inside negative. The empty-field sentinel (glSdf's RESOLVE_FRAG) has no
  // glyph to spread from, so only the text alpha survives there.

  const MASK_FRAG = `#version 300 es
  precision highp float;
  in vec2 v_uv;
  uniform sampler2D u_text;
  uniform sampler2D u_sdf;
  uniform float u_strength;
  uniform float u_radius;
  uniform float u_feather;
  uniform float u_sdfAmount;
  out vec4 fragColor;
  void main() {
    float textAlpha = texture(u_text, v_uv).a;
    float spread = 0.0;
    if (u_sdfAmount > 0.5) {
      float distance = texture(u_sdf, v_uv).r;
      if (distance >= -900.0) {
        spread = 1.0 - smoothstep(u_radius - u_feather, u_radius, max(distance, 0.0));
      }
    }
    float alpha = clamp(u_strength, 0.0, 1.0) * max(textAlpha, spread);
    fragColor = vec4(alpha, alpha, alpha, alpha);
  }`;

  // --- fill pass ---------------------------------------------------------------

  const FILL_FRAG = `#version 300 es
  precision highp float;
  in vec2 v_uv;
  uniform sampler2D u_text;
  uniform sampler2D u_info;
  uniform sampler2D u_sdf;
  uniform sampler2D u_image;
  uniform sampler2D u_state;    // per-letter state (row 4 holds colorMix)
  uniform vec2 u_resolution;
  uniform float u_time;
  uniform float u_progress;
  uniform int u_type;
  uniform vec4 u_colorA;
  uniform vec4 u_colorB;
  uniform vec4 u_colorC;
  uniform vec4 u_colorD;
  uniform vec4 u_params;
  uniform float u_maskTint;
  out vec4 fragColor;
  ${COMMON}

  vec4 premul(vec4 c) { return vec4(c.rgb * c.a, c.a); }

  vec3 hsv2rgb(vec3 c) {
    vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    return c.z * mix(vec3(1.0), rgb, c.y);
  }

  vec2 sdfGradient() {
    vec2 e = 2.0 / u_resolution;
    float dx = texture(u_sdf, v_uv + vec2(e.x, 0.0)).r - texture(u_sdf, v_uv - vec2(e.x, 0.0)).r;
    float dy = texture(u_sdf, v_uv + vec2(0.0, e.y)).r - texture(u_sdf, v_uv - vec2(0.0, e.y)).r;
    return normalize(vec2(dx, dy) + vec2(1e-6));
  }

  void main() {
    vec4 text = texture(u_text, v_uv);
    float mask = text.a;
    if (mask <= 0.002) discard;
    vec4 info = texture(u_info, v_uv);
    float distance = texture(u_sdf, v_uv).r;
    vec2 local = info.zw;
    vec4 color = u_colorA;
    int type = u_type;
    if (type == 2) {
      color = mix(u_colorA, u_colorB, clamp(v_uv.y, 0.0, 1.0));
    } else if (type == 3) {
      vec2 dir = vec2(cos(u_params.x), sin(u_params.x));
      float t = clamp(dot(v_uv, dir) * 1.4 - 0.2 + 0.12 * sin(u_time * max(u_params.y, 0.01)), 0.0, 1.0);
      color = mix(u_colorA, u_colorB, t);
    } else if (type == 4) {
      float t = v_uv.x * 0.5 + v_uv.y * 0.2 + u_time * max(u_params.z, 0.01) * 0.1;
      color = vec4(hsv2rgb(vec3(fract(t), clamp(u_params.x, 0.0, 1.0), clamp(u_params.y, 0.05, 1.0))), 1.0);
    } else if (type == 5) {
      vec2 n = sdfGradient();
      float angle = atan(n.y, n.x) / TAU + 0.5;
      float t = fract(angle * 1.6 + v_uv.x * 0.3 + u_time * max(u_params.z, 0.01) * 0.05);
      color = vec4(hsv2rgb(vec3(t, 0.55, 0.95)), 1.0);
    } else if (type == 6) {
      vec2 n = sdfGradient();
      float h = clamp(n.y * 0.5 + 0.5, 0.0, 1.0);
      vec3 sky = u_colorA.rgb;
      vec3 horizon = u_colorB.rgb;
      vec3 ground = u_colorC.rgb;
      vec3 env = h > 0.5 ? mix(horizon, sky, (h - 0.5) * 2.0) : mix(ground, horizon, h * 2.0);
      float sharp = mix(1.0, 4.0, clamp(u_params.y, 0.0, 1.0));
      env = mix(env, env * sharp, abs(n.x));
      color = vec4(env, u_colorA.a);
    } else if (type == 7) {
      float grain = noise(v_uv * u_resolution * 0.35);
      float sparkle = step(0.992, noise(v_uv * u_resolution * 0.9 + u_time * 0.5));
      color = vec4(u_colorA.rgb * (0.72 + 0.6 * grain) + vec3(sparkle) * 0.6, u_colorA.a);
    } else if (type == 8) {
      vec2 p = vec2(v_uv.x * 3.0, v_uv.y * 6.0 - u_time * max(u_params.z, 0.05) * 1.5);
      float n = fbm(p * max(u_params.x, 0.4), 4);
      vec3 c = mix(u_colorA.rgb, u_colorB.rgb, smoothstep(0.1, 0.5, n));
      c = mix(c, u_colorC.rgb, smoothstep(0.4, 0.75, n));
      c = mix(c, u_colorD.rgb, smoothstep(0.7, 0.95, n));
      color = vec4(c, u_colorA.a);
    } else if (type == 9) {
      float n = fbm(v_uv * max(u_params.x, 1.0) * 6.0 + u_time * 0.15, 3);
      float rings = abs(sin(n * TAU * 2.0));
      color = mix(u_colorA, u_colorB, rings);
    } else if (type == 10) {
      float n = fbm(v_uv * max(u_params.x, 1.0) * 4.0, 5);
      float vein = abs(sin(n * 9.0 + u_params.y));
      color = mix(u_colorA, u_colorB, smoothstep(0.0, 0.45, vein));
    } else if (type == 11) {
      vec2 offset = sdfGradient() * max(u_params.x, 0.0) * 0.03;
      vec4 refracted = texture(u_text, v_uv + offset);
      color = vec4(mix(refracted.rgb, u_colorA.rgb * max(refracted.a, 0.2), 0.4), max(refracted.a, mask * 0.8));
    } else if (type == 12) {
      vec4 tex = texture(u_image, v_uv * max(u_params.x, 0.1) + u_params.yz);
      color = vec4(tex.rgb, max(tex.a, 0.0));
    } else if (type == 13) {
      float soft = max(u_params.y, 0.001);
      float t = smoothstep(u_progress - soft, u_progress + soft, local.x);
      color = mix(u_colorA, u_colorB, t);
    } else if (type == 14) {
      float threshold = clamp(u_params.y, 0.0, 1.0);
      float soft = max(u_params.z, 0.001);
      float n = fbm(v_uv * max(u_params.x, 1.0) * 8.0, 4) + 0.35 * clamp(-distance * 8.0, 0.0, 1.0);
      color = vec4(u_colorA.rgb, u_colorA.a * smoothstep(threshold - soft, threshold + soft, n));
    }
    if (u_maskTint > 0.5) {
      vec3 tint = text.rgb / max(text.a, 1e-4);
      color.rgb *= mix(vec3(1.0), tint, 1.0);
    }
    // the per-letter highlight (range selector / karaoke sweep): row 4 of the
    // state texture carries how far the letter has moved to the accent colour
    float id = round(info.x * 255.0) * 255.0 + round(info.y * 255.0);
    vec4 letterState = texelFetch(u_state, ivec2(int(id + 0.5), 4), 0);
    float mixAmount = clamp(letterState.z, 0.0, 1.0);
    if (mixAmount > 0.001) color = mix(color, u_colorB, mixAmount);
    fragColor = vec4(color.rgb * color.a * mask, color.a * mask);
  }`;

  // --- edge pass ---------------------------------------------------------------

  const EDGE_FRAG = `#version 300 es
  precision highp float;
  in vec2 v_uv;
  uniform sampler2D u_text;
  uniform sampler2D u_sdf;
  uniform sampler2D u_info;
  uniform vec2 u_resolution;
  uniform float u_time;
  uniform int u_type;
  uniform vec4 u_color;
  uniform vec4 u_params;
  uniform vec4 u_params2;
  uniform vec2 u_direction;
  uniform vec2 u_offset;
  out vec4 fragColor;
  ${COMMON}

  float sdfAt(vec2 uv) {
    return texture(u_sdf, uv).r;
  }

  void main() {
    // The empty distance field reports -1000 (see glSdf's RESOLVE_FRAG): a
    // beat between two states has no mask edges to seed from, and without
    // this guard every outline / glow type reads the field as "just outside"
    // everywhere and covers the whole frame.
    if (sdfAt(v_uv) < -900.0) {
      fragColor = vec4(0.0);
      return;
    }
    float inside = texture(u_text, v_uv).a;
    float distance = sdfAt(v_uv - u_offset);
    float alpha = 0.0;
    vec4 color = u_color;
    int type = u_type;
    if (type == 1) {
      float width = max(u_params.x, 0.0005);
      float soft = max(u_params.w, 0.0);
      float aa = max(fwidth(distance), 0.0008);
      float e = distance - u_params.z;
      alpha = 1.0 - smoothstep(width * (1.0 - soft), width, abs(e));
      int pattern = int(u_params2.x + 0.5);
      if (pattern == 1) {
        vec2 texel = 2.0 / u_resolution;
        vec2 grad = normalize(vec2(
          sdfAt(v_uv + vec2(texel.x, 0.0)) - sdfAt(v_uv - vec2(texel.x, 0.0)),
          sdfAt(v_uv + vec2(0.0, texel.y)) - sdfAt(v_uv - vec2(0.0, texel.y))
        ) + vec2(1e-6));
        vec2 tangent = vec2(-grad.y, grad.x);
        float s = dot(v_uv * u_resolution, tangent);
        float dashLength = max(u_params.y, 1.0);
        float gap = clamp(u_params2.y, 0.05, 0.95);
        float phase = fract(s / dashLength - u_params2.z * u_time);
        alpha *= 1.0 - smoothstep(gap - 0.02, gap, phase);
      } else if (pattern == 2) {
        vec2 texel = 2.0 / u_resolution;
        vec2 grad = normalize(vec2(
          sdfAt(v_uv + vec2(texel.x, 0.0)) - sdfAt(v_uv - vec2(texel.x, 0.0)),
          sdfAt(v_uv + vec2(0.0, texel.y)) - sdfAt(v_uv - vec2(0.0, texel.y))
        ) + vec2(1e-6));
        vec2 tangent = vec2(-grad.y, grad.x);
        float s = dot(v_uv * u_resolution, tangent);
        float gap = clamp(u_params2.y, 0.05, 0.95);
        float period = max(2.0 * width / max(1.0 - gap, 0.05), 1.0);
        float u = (fract(s / period - u_params2.z * u_time) - 0.5) * period;
        alpha = 1.0 - smoothstep(width - aa, width, length(vec2(u, abs(e))));
      } else if (pattern == 3) {
        float line = 1.0 - smoothstep(width / 3.0 - aa, width / 3.0, abs(e));
        float second = 1.0 - smoothstep(width / 3.0 - aa, width / 3.0, abs(abs(e) - width * 1.33));
        alpha = max(line, second);
      } else if (pattern == 4) {
        float sketch = (fbm(v_uv * u_resolution / 24.0 + floor(u_time * 8.0), 3) - 0.5) * width * 0.8;
        alpha = 1.0 - smoothstep(width * (1.0 - soft), width, abs(e + sketch));
      }
      // the multi-line bands are rings: everything inside the inner radius is cut out
      float inner = max(u_params2.w, 0.0);
      if (inner > 0.0001) alpha *= smoothstep(inner - aa, inner + aa, distance);
    } else if (type == 2) {
      alpha = exp(-max(distance, 0.0) / max(u_params.y, 0.001)) * clamp(u_params.z, 0.0, 3.0);
    } else if (type == 3) {
      alpha = exp(-max(-distance, 0.0) / max(u_params.y, 0.001)) * clamp(u_params.z, 0.0, 3.0) * step(0.01, inside);
    } else if (type == 4) {
      vec2 texel = 2.0 / u_resolution;
      vec2 n = normalize(vec2(sdfAt(v_uv + vec2(texel.x, 0.0)) - sdfAt(v_uv - vec2(texel.x, 0.0)), sdfAt(v_uv + vec2(0.0, texel.y)) - sdfAt(v_uv - vec2(0.0, texel.y))) + vec2(1e-6));
      vec2 lightDir = normalize(vec2(cos(u_params.x), sin(u_params.x)) + vec2(1e-6));
      float light = dot(n, lightDir) * 0.5 + 0.5;
      alpha = clamp(inside * (0.15 + 0.85 * pow(max(light, 0.0), max(u_params.y, 0.4))), 0.0, 1.0);
      color = mix(u_color, vec4(1.0, 1.0, 1.0, u_color.a), smoothstep(0.6, 0.95, light));
    } else if (type == 5 || type == 6) {
      float depth = max(u_params.x, 0.0);
      vec2 dir = normalize(u_direction + vec2(1e-6));
      float coverage = 0.0;
      for (int i = 0; i < 32; i += 1) {
        float t = float(i) / 31.0;
        if (t > depth) break;
        float sampleDistance = sdfAt(v_uv - dir * t * 0.08);
        coverage = max(coverage, (1.0 - smoothstep(-0.01, 0.01, sampleDistance)) * (1.0 - t * 0.7));
      }
      alpha = coverage;
      color = mix(color, u_color * 0.35, 0.4);
    } else if (type == 7) {
      vec2 uv = v_uv - u_offset;
      float d = sdfAt(uv);
      float blur = max(u_params.y, 0.001);
      alpha = (1.0 - smoothstep(-blur, blur, d)) * clamp(u_params.z, 0.0, 1.0) * (1.0 - inside);
    } else if (type == 8) {
      // drips running down from the glyph outline
      vec2 px = v_uv * u_resolution;
      float col = floor(px.x / 6.0);
      float rnd = hash12(vec2(col, 3.7));
      float len = max(u_params.x, 0.0) * rnd * rnd * min(1.0, u_time * max(u_params.z, 0.05));
      float thickness = max(u_params.y, 0.05) * 6.0;
      float d = 1e9;
      float found = 0.0;
      for (int k = 1; k <= 16; k += 1) {
        float t = float(k) / 16.0;
        vec2 uv = v_uv + vec2(0.0, t * len / u_resolution.y);
        if (sdfAt(uv) < 0.0) {
          float w = thickness * (1.0 - t) * (1.0 - t);
          d = abs(px.x - (col + 0.5) * 6.0) - w;
          found = 1.0;
          break;
        }
      }
      float bead = length(vec2(px.x - (col + 0.5) * 6.0, 0.0)) - thickness * 1.4;
      d = min(d, bead + max(0.0, 1.0 - found) * 1e9);
      alpha = (1.0 - smoothstep(-1.0, 1.0, d)) * found;
      alpha *= step(0.0, sdfAt(v_uv));
    }
    if (alpha <= 0.002) discard;
    fragColor = vec4(color.rgb * color.a, color.a) * alpha;
  }`;

  // --- post pass ---------------------------------------------------------------

  const POST_FRAG = `#version 300 es
  precision highp float;
  in vec2 v_uv;
  uniform sampler2D u_text;
  uniform sampler2D u_sdf;
  uniform vec2 u_resolution;
  uniform float u_time;
  uniform int u_type;
  uniform vec4 u_params;
  uniform vec4 u_params2;
  uniform vec4 u_params3;
  uniform vec4 u_colorA;
  uniform vec4 u_colorB;
  out vec4 fragColor;
  ${COMMON}

  vec2 rotateUv(vec2 uv, float angle) {
    vec2 centered = uv - 0.5;
    float c = cos(angle);
    float s = sin(angle);
    return mat2(c, -s, s, c) * centered + 0.5;
  }

  vec4 sampleText(vec2 uv) {
    return texture(u_text, clamp(uv, vec2(0.0), vec2(1.0)));
  }

  void main() {
    vec4 src = texture(u_text, v_uv);
    vec4 color = src;
    int type = u_type;
    float amount = clamp(u_params.w, 0.0, 2.0);
    float envel = clamp(u_params.z, 0.0, 4.0);
    if (type == 1) {
      float blockSize = max(u_params.x, 4.0);
      vec2 block = floor(v_uv * u_resolution / blockSize);
      float shift = (hash12(block + floor(u_time * max(u_params.y, 0.1) * 12.0)) - 0.5) * blockSize * 2.0 * amount;
      float keep = step(0.55, hash12(block * 1.7 + 3.0));
      vec2 uv = v_uv + vec2(shift / u_resolution.x * keep, 0.0);
      float split = (hash12(block + 11.0) - 0.5) * amount * 6.0 / u_resolution.x;
      color = vec4(sampleText(uv + vec2(split, 0.0)).r, sampleText(uv).g, sampleText(uv - vec2(split, 0.0)).b, sampleText(uv).a);
    } else if (type == 2) {
      float offset = amount * 4.0 / u_resolution.x * (1.0 + 0.4 * sin(u_time * 8.0));
      vec2 dir = vec2(cos(u_params.x), sin(u_params.x));
      color = vec4(sampleText(v_uv + dir * offset).r, sampleText(v_uv).g, sampleText(v_uv - dir * offset).b, src.a);
    } else if (type == 3) {
      float lines = max(u_params.x, 2.0);
      float band = floor(v_uv.y * lines);
      float tear = (hash12(vec2(band, floor(u_time * 9.0))) - 0.5) * amount * 40.0 / u_resolution.x;
      color = sampleText(v_uv + vec2(tear, 0.0));
    } else if (type == 4) {
      float roll = fract(u_time * max(u_params.z, 0.05) * 0.2);
      float band = smoothstep(0.0, 0.15, abs(v_uv.y - roll));
      vec2 uv = v_uv + vec2(sin(v_uv.y * 60.0 + u_time * 4.0) * amount * 8.0 / u_resolution.x, 0.0);
      color = sampleText(uv);
      color.rgb *= mix(1.0, 0.7, 1.0 - band);
      color.rgb += (hash12(v_uv * u_resolution + u_time) - 0.5) * 0.15 * amount;
    } else if (type == 5) {
      vec2 dir = normalize(vec2(cos(u_params.x), sin(u_params.x)) + vec2(1e-6));
      float streak = 0.0;
      for (int i = 0; i < 12; i += 1) {
        streak += sampleText(v_uv - dir * float(i) * amount * 12.0 / u_resolution.x).a;
      }
      color = vec4(src.rgb * streak / 12.0 + src.rgb, max(src.a, streak / 12.0 * src.a));
    } else if (type == 6) {
      float size = max(u_params.y, 2.0);
      vec2 cell = floor(v_uv * u_resolution / size);
      float on = step(1.0 - amount * 0.4, hash12(cell + floor(u_time * 12.0)));
      color = vec4(src.rgb * on, src.a * on) + vec4(vec3(hash12(cell)) * 0.1 * on, 0.0);
    } else if (type == 7) {
      float slices = max(u_params.x, 2.0);
      float index = floor(v_uv.y * slices);
      float shift = (hash12(vec2(index, 1.0)) - 0.5) * amount * 30.0 / u_resolution.x;
      color = sampleText(v_uv + vec2(shift, 0.0));
    } else if (type == 8) {
      float edge = clamp(u_params.y, 0.0, 1.0) + 0.001;
      float threshold = amount;
      float n = fbm(v_uv * max(u_params.x, 1.0) * 4.0, 4);
      float alpha = smoothstep(threshold - edge, threshold + edge, n);
      color = vec4(src.rgb, src.a * alpha);
      color += vec4(u_colorA.rgb * u_colorA.a, u_colorA.a) * (1.0 - alpha) * step(0.02, amount);
    } else if (type == 9) {
      float angle = u_params.x;
      vec2 dir = vec2(cos(angle), sin(angle));
      float t = dot(v_uv - 0.5, dir) + 0.5;
      float n = fbm(v_uv * max(u_params.x, 1.0) * 3.0, 3);
      float threshold = t + (n - 0.5) * clamp(u_params.y, 0.0, 1.0);
      float alpha = smoothstep(amount - 0.05, amount + 0.05, threshold);
      color = vec4(src.rgb, src.a * alpha);
    } else if (type == 10) {
      float cellSize = max(u_params.x, 2.0);
      vec2 cell = floor(v_uv * u_resolution / cellSize);
      float order = hash12(cell);
      float alpha = step(order, amount);
      color = vec4(src.rgb, src.a * alpha);
    } else if (type == 11) {
      float n = fbm(v_uv * max(u_params.x, 1.0) * 4.0, 4);
      float alpha = smoothstep(amount - 0.05, amount + 0.05, n);
      color = vec4(src.rgb, src.a * alpha);
      color += vec4(u_colorA.rgb, u_colorA.a) * (1.0 - alpha) * smoothstep(0.6, 1.0, amount);
    } else if (type == 12) {
      float cell = max(u_params.x, 2.0);
      vec2 coord = v_uv * u_resolution / cell;
      vec2 center = (floor(coord) + 0.5) * cell / u_resolution;
      float radius = 0.5 * (1.0 - amount);
      float inside = 1.0 - smoothstep(radius - 0.08, radius, length((coord - floor(coord) - 0.5)) * 2.0);
      color = vec4(sampleText(center).rgb, sampleText(center).a * inside);
    } else if (type == 13) {
      float drift = amount * 4.0;
      color = vec4(src.rgb, src.a);
      vec4 ghost = sampleText(v_uv + vec2(0.0, drift / u_resolution.y));
      color += vec4(ghost.rgb * 0.4, ghost.a * 0.4);
    } else if (type == 14) {
      vec2 center = u_params.xy;
      float radius = max(u_params.z, 0.05);
      float d = distance(v_uv, center);
      float ring = exp(-pow((d - radius) * 12.0, 2.0));
      vec2 offset = normalize(v_uv - center + vec2(1e-6)) * ring * amount * 12.0 / u_resolution.x;
      color = sampleText(v_uv + offset);
      color.rgb += ring * amount * 0.3;
    } else if (type == 15) {
      float strength = amount * 12.0 / u_resolution.x;
      vec2 center = vec2(0.5) + (u_params.xy - 0.5) * 0.3;
      vec2 dir = v_uv - center;
      vec4 blur = vec4(0.0);
      for (int i = 0; i < 8; i += 1) {
        blur += sampleText(v_uv - dir * strength * float(i) / 8.0);
      }
      color = blur / 8.0;
    } else if (type == 16) {
      vec2 dir = vec2(cos(u_params.x), sin(u_params.x)) * amount * 8.0 / u_resolution.x;
      color = sampleText(v_uv);
      for (int i = 1; i <= 4; i += 1) {
        color += sampleText(v_uv - dir * float(i)) * (0.5 / float(i));
      }
    } else if (type == 17) {
      float copies = clamp(u_params.x, 2.0, 8.0);
      float decay = clamp(u_params.y, 0.0, 1.0);
      vec2 stepUv = vec2(-0.7, 0.7) * amount * 0.01;
      float weight = 1.0;
      color = src;
      for (int i = 1; i <= 8; i += 1) {
        if (float(i) > copies) break;
        weight *= decay;
        vec4 ghost = sampleText(v_uv + stepUv * float(i));
        ghost.rgb = mix(ghost.rgb, u_colorA.rgb * ghost.a, u_colorA.a);
        color += ghost * weight * (1.0 - color.a);
      }
    } else if (type == 18) {
      float decay = 1.0;
      vec2 center = vec2(0.5);
      float density = 0.6;
      float weight = 1.0;
      vec2 dir = normalize(v_uv - center + vec2(1e-6));
      vec4 ray = vec4(0.0);
      for (int i = 0; i < 24; i += 1) {
        vec2 uv = v_uv - dir * float(i) * 0.02 * density;
        ray += sampleText(uv) * weight;
        weight *= decay;
      }
      color = src + ray / 24.0 * amount;
    } else if (type == 19) {
      float angle = u_params.x;
      float width = max(u_params.y, 0.01);
      float speed = max(u_params.z, 0.05);
      vec2 dir = normalize(vec2(cos(angle), sin(angle)) + vec2(1e-6));
      float pos = fract(u_time * speed * 0.15);
      float band = 1.0 - smoothstep(0.0, width, abs(dot(v_uv - 0.5, dir) * 2.0 - (pos * 2.0 - 1.0)));
      color = src + vec4(u_colorA.rgb, u_colorA.a) * band * amount * src.a;
    } else if (type == 20) {
      float segments = max(u_params.x, 2.0);
      float rotation = u_params.y + u_time * 0.05;
      vec2 uv = rotateUv(v_uv, rotation);
      float angle = atan(uv.y - 0.5, uv.x - 0.5);
      float wedge = mod(angle, TAU / segments);
      float mirrored = abs(wedge - TAU / segments * 0.5);
      vec2 mirrorUv = rotateUv(vec2(cos(mirrored) * length(uv - 0.5) + 0.5, sin(mirrored) * length(uv - 0.5) + 0.5), -rotation);
      color = sampleText(mirrorUv);
    } else if (type == 21) {
      vec2 uv = u_params.x > 0.5 ? vec2(1.0 - v_uv.x, v_uv.y) : vec2(v_uv.x, 1.0 - v_uv.y);
      color = sampleText(uv);
    } else if (type == 22) {
      float threshold = clamp(u_params.x, 0.0, 1.0);
      float length = clamp(u_params.y, 1.0, 64.0);
      vec2 dir = normalize(vec2(cos(u_params.z), sin(u_params.z)) + vec2(1e-6));
      color = src;
      if (src.r + src.g + src.b > threshold) {
        for (int i = 1; i <= 16; i += 1) {
          color = max(color, sampleText(v_uv + dir * float(i) * length / u_resolution.x));
        }
      }
    } else if (type == 23) {
      vec2 centered = v_uv - 0.5;
      float r2 = dot(centered, centered);
      vec2 uv = 0.5 + centered * (1.0 + max(u_params.x, 0.0) * r2 + max(u_params.y, 0.0) * r2 * r2);
      vec2 offset = centered * r2 * amount * 4.0 / u_resolution.x * (1.0 + u_params.z);
      color = vec4(sampleText(uv + offset).r, sampleText(uv).g, sampleText(uv - offset).b, sampleText(uv).a);
    } else if (type == 24) {
      vec3 rgb = src.rgb;
      rgb = mix(vec3(dot(rgb, vec3(0.299, 0.587, 0.114))), rgb, max(u_params.y, 0.0));
      rgb = max(vec3(0.0), rgb * (1.0 + amount * 0.2) + vec3(max(u_params.x, 0.0)));
      if (u_params.z > 1.0) {
        rgb = floor(rgb * u_params.z) / u_params.z;
      }
      color = vec4(rgb, src.a);
    } else if (type == 25) {
      vec2 uv = v_uv + vec2(sin(v_uv.y * 20.0 + u_time * 2.0), cos(v_uv.x * 20.0 + u_time * 1.7)) * amount * 6.0 / u_resolution.x;
      color = sampleText(uv);
    } else if (type == 26) {
      color = src + src * amount * 1.5;
    } else if (type == 27) {
      float offset = amount * 5.0 / u_resolution.x * (1.0 + max(u_params.z, 0.0));
      vec2 dir = normalize(vec2(cos(u_params.x), sin(u_params.x)) + vec2(1e-6));
      color = vec4(sampleText(v_uv + dir * offset).r, sampleText(v_uv).g, sampleText(v_uv - dir * offset).b, src.a);
    } else if (type == 28) {
      float scan = 0.9 + 0.1 * sin(v_uv.y * u_resolution.y * 0.5);
      vec2 centered = v_uv - 0.5;
      vec2 uv = 0.5 + centered * (1.0 + amount * 0.05 * dot(centered, centered));
      color = sampleText(uv);
      color.rgb *= scan;
      float vignette = smoothstep(0.9, 0.3, length(centered) * (1.0 + amount));
      color.rgb *= mix(1.0, vignette, 0.6);
    } else if (type == 29) {
      float grain = (hash12(v_uv * u_resolution + fract(u_time) * 100.0) - 0.5) * amount;
      color = vec4(src.rgb + grain, src.a);
    } else if (type == 30) {
      float size = max(u_params.x, 2.0);
      float angle = u_params.y;
      vec2 rotated = rotateUv(v_uv, angle);
      vec2 cell = floor(rotated * u_resolution / size);
      vec2 center = (cell + 0.5) * size / u_resolution;
      vec2 back = rotateUv(center, -angle);
      float radius = 0.5 * (1.0 - amount * 0.4);
      float inside = 1.0 - smoothstep(radius - 0.1, radius, length((rotated - cell - 0.5)) * 2.0);
      color = vec4(sampleText(back).rgb, sampleText(back).a * inside);
    } else if (type == 31) {
      float size = max(u_params.x, 2.0);
      vec2 uv = (floor(v_uv * u_resolution / size) + 0.5) * size / u_resolution;
      color = sampleText(uv);
    } else if (type == 32) {
      vec2 uv = v_uv + vec2(sin(v_uv.y * 20.0 + u_time * max(u_params.y, 0.1)), cos(v_uv.x * 20.0 + u_time * 0.8)) * amount * 3.0 / u_resolution.x;
      color = sampleText(uv);
    } else if (type == 33) {
      float spot = exp(-pow(length(v_uv - vec2(u_params.x, u_params.y)) * 2.0, 2.0));
      color = src + vec4(u_colorA.rgb * u_colorA.a, u_colorA.a) * spot * amount;
    } else if (type == 34) {
      vec2 centered = v_uv - 0.5;
      float vignette = smoothstep(0.75, max(0.2, u_params.y), length(centered) * (1.0 + amount));
      color = vec4(src.rgb * mix(1.0, vignette, clamp(u_params.x + amount, 0.0, 1.0)), src.a);
    } else if (type == 35) {
      float count = max(u_params.x, 1.0);
      vec2 cell = floor(v_uv * count);
      float sparkle = step(0.985, hash12(cell + floor(u_time * 6.0)));
      float nearEdge = smoothstep(0.5, 0.1, abs(texture(u_sdf, v_uv).g - 0.5));
      color = src + vec4(u_colorA.rgb, u_colorA.a) * sparkle * nearEdge * amount * 2.0;
    } else if (type == 36) {
      vec2 center = vec2(u_params.x, u_params.y);
      float d = length(v_uv - center);
      float flare = exp(-d * 6.0) * amount;
      float streak = exp(-abs(v_uv.y - center.y) * 60.0) * exp(-abs(v_uv.x - center.x) * 2.0) * amount * 0.4;
      color = src + vec4(u_colorA.rgb, u_colorA.a) * (flare + streak);
    } else if (type == 37) {
      // waveWarp: a travelling wave displaces the uv along one axis
      float height = u_params.x;
      float width = max(u_params.y, 1.0);
      vec2 dir = normalize(vec2(cos(u_params.z), sin(u_params.z)) + vec2(1e-6));
      float speed = u_params2.x;
      float pin = u_params2.y;
      float coord = dot(v_uv, dir);
      float wave;
      float phase = fract(coord * u_resolution.x / width - u_time * speed);
      if (u_params3.x < 0.5) wave = sin(phase * TAU);
      else if (u_params3.x < 1.5) wave = abs(phase * 2.0 - 1.0) * 2.0 - 1.0;
      else if (u_params3.x < 2.5) wave = phase < 0.5 ? 1.0 : -1.0;
      else wave = phase * 2.0 - 1.0;
      vec2 offset = dir * wave * height / u_resolution;
      if (pin > 0.5) {
        float fade = smoothstep(0.0, 0.12, v_uv.x) * smoothstep(1.0, 0.88, v_uv.x);
        fade *= smoothstep(0.0, 0.12, v_uv.y) * smoothstep(1.0, 0.88, v_uv.y);
        offset *= fade;
      }
      color = sampleText(v_uv + offset);
    } else if (type == 38) {
      // twirl
      vec2 center = vec2(u_params.x, u_params.y);
      float radius = max(u_params.z, 0.01);
      float angle = u_params.w;
      vec2 p = v_uv - center;
      float d = length(p);
      float spin = u_params2.x;
      float amount2 = angle * (1.0 - smoothstep(0.0, radius, d)) + spin;
      float c = cos(amount2);
      float s = sin(amount2);
      p = mat2(c, -s, s, c) * p;
      color = sampleText(p + center);
    } else if (type == 39) {
      // turbulentDisplace
      float amountPx = amount * 60.0;
      float size = max(u_params.y, 1.0);
      float octaves = max(u_params.z, 1.0);
      float evolution = u_params2.x;
      vec2 p = v_uv * size / 100.0 + vec2(u_time * evolution);
      vec2 offset = vec2(
        fbm(p, int(octaves)) - 0.5,
        fbm(p + vec2(4.7, 2.3), int(octaves)) - 0.5
      ) * amountPx / u_resolution;
      color = sampleText(v_uv + offset * 2.0);
    } else if (type == 40) {
      // spinBlur (CC Radial Blur, spin)
      vec2 center = vec2(u_params.x, u_params.y);
      float angle = u_params.z;
      vec4 sum = vec4(0.0);
      for (int i = 0; i < 16; i += 1) {
        float t = (float(i) / 15.0 - 0.5) * angle;
        float c = cos(t);
        float s = sin(t);
        vec2 p = mat2(c, -s, s, c) * (v_uv - center) + center;
        sum += sampleText(p);
      }
      color = sum / 16.0;
    } else if (type == 41) {
      // strobeFlash
      float bpm = max(u_params.x, 1.0);
      float intensity = clamp(u_params.y, 0.0, 1.0);
      float duty = clamp(u_params.z, 0.01, 1.0);
      float phase = fract(u_time * bpm / 60.0);
      float on = phase < duty ? 1.0 : 0.0;
      color = src + vec4(u_colorA.rgb, u_colorA.a) * on * intensity * max(src.a, 0.15);
    } else if (type == 42) {
      // anamorphicStreak
      float threshold = clamp(u_params.x, 0.0, 1.0);
      float lengthPx = max(u_params.y, 0.0);
      float luma = dot(src.rgb, vec3(0.2126, 0.7152, 0.0722));
      color = src;
      if (luma > threshold) {
        vec2 dir = normalize(vec2(cos(u_params.z), sin(u_params.z)) + vec2(1e-6));
        vec4 streak = vec4(0.0);
        for (int i = 1; i <= 16; i += 1) {
          vec2 uv = v_uv + dir * float(i) * lengthPx * 0.5 * 12.0 / u_resolution.x;
          streak = max(streak, sampleText(uv));
        }
        color += vec4(u_colorA.rgb, u_colorA.a) * streak * amount;
      }
    } else if (type == 43) {
      // radialWipe: an angular sweep from startAngle
      float progress = clamp(amount, 0.0, 1.0);
      float feather = max(u_params.z, 0.001);
      float start = u_params.x;
      float dirSign = u_params.y > 0.5 ? -1.0 : 1.0;
      vec2 p = v_uv - 0.5;
      float a = atan(p.y, p.x) - start;
      float t = fract((a + PI) / TAU);
      if (dirSign < 0.0) t = 1.0 - t;
      float alpha = smoothstep(progress - feather, progress + feather, t);
      color = vec4(src.rgb * alpha, src.a * alpha);
    } else if (type == 44) {
      // venetianBlinds: parallel bands close over the frame
      float progress = clamp(amount, 0.0, 1.0);
      float feather = max(u_params.z, 0.001);
      vec2 dir = normalize(vec2(cos(u_params.x), sin(u_params.x)) + vec2(1e-6));
      float widthPx = max(u_params.y, 2.0);
      float coord = dot(v_uv, dir) * u_resolution.y / widthPx;
      float band = abs(fract(coord) - 0.5) * 2.0;
      float alpha = smoothstep(progress - feather, progress + feather, band);
      color = vec4(src.rgb * alpha, src.a * alpha);
    } else if (type == 45) {
      // camera: pushes / pans / shakes the finished frame
      int move = int(u_params.x + 0.5);
      float cameraEnv = clamp(u_params.w, 0.0, 4.0);
      float cameraAmount = max(u_params.y, 0.0) * cameraEnv;
      float progress = clamp(u_params2.x, 0.0, 1.0);
      float cameraSpeed = max(u_params.z, 0.01);
      float shake = clamp(u_params2.z, 0.0, 1.0);
      float tm = u_time * cameraSpeed + u_params2.w * TAU;
      vec2 offset = vec2(0.0);
      float zoom = 1.0;
      float angle = 0.0;
      if (move == 0) zoom = 1.0 + cameraAmount * progress;
      else if (move == 1) zoom = 1.0 + cameraAmount * (1.0 - progress);
      else if (move == 2) offset.x = cameraAmount * (0.5 - progress);
      else if (move == 3) offset.x = -cameraAmount * (0.5 - progress);
      else if (move == 4) offset.y = cameraAmount * (0.5 - progress);
      else if (move == 5) offset.y = -cameraAmount * (0.5 - progress);
      else if (move == 6) angle = cameraAmount * (0.5 - progress) * 0.6;
      else if (move == 7) zoom = 1.0 + cameraAmount * pow(progress, 3.0) * 1.4;
      else if (move == 8) {
        offset = vec2(noise1(tm) - 0.5, noise1(tm + 13.7) - 0.5) * cameraAmount * 0.12;
        angle = (noise1(tm + 7.1) - 0.5) * cameraAmount * 0.08;
        zoom = 1.0 + cameraAmount * (0.05 + (noise1(tm + 3.3) - 0.5) * 0.03);
      } else {
        offset = vec2(cos(tm * 0.35), sin(tm * 0.28)) * cameraAmount * 0.18;
        zoom = 1.0 + cameraAmount * 0.25;
        angle = sin(tm * 0.21) * cameraAmount * 0.08;
      }
      if (shake > 0.0) {
        offset += vec2(noise1(tm * 2.3) - 0.5, noise1(tm * 2.7 + 5.0) - 0.5) * shake * 0.02;
        angle += (noise1(tm * 3.1 + 9.0) - 0.5) * shake * 0.01;
      }
      vec2 cameraUv = rotateUv(v_uv, -angle);
      cameraUv = (cameraUv - 0.5 - offset) / max(zoom, 0.05) + 0.5;
      if (cameraUv.x < 0.0 || cameraUv.x > 1.0 || cameraUv.y < 0.0 || cameraUv.y > 1.0) color = vec4(0.0);
      else color = texture(u_text, cameraUv);
    } else if (type == 46) {
      // shapeLayer: a stroked path over the frame, trimmed by the beat
      int shape = int(u_params.x + 0.5);
      float trimStart = u_params.y;
      float trimEnd = u_params.z;
      float trimOffset = u_params.w;
      float strokePx = max(u_params2.x, 0.5) / u_resolution.y;
      float repeat = max(u_params2.y, 1.0);
      float repeatScale = max(u_params2.z, 0.05);
      float repeatRotate = radians(u_params2.w);
      float glow = clamp(u_colorA.w, 0.0, 1.0);
      float padding = u_colorB.x;
      float repeatOpacity = clamp(u_colorB.y, 0.0, 1.0);
      float capRound = u_colorB.z;
      float feather = max(u_colorB.w, 0.002);
      float aspect = u_resolution.x / max(u_resolution.y, 1.0);
      vec2 boxMin = vec2(u_params3.x, u_params3.y) - padding;
      vec2 boxMax = vec2(u_params3.z, u_params3.w) + padding;
      vec2 center = (boxMin + boxMax) * 0.5;
      vec2 halfSize = max((boxMax - boxMin) * 0.5, vec2(0.001));
      // work in y-units so a stroke stays round whatever the aspect is
      vec2 q = (v_uv - center) * vec2(aspect, 1.0);
      vec2 hb = halfSize * vec2(aspect, 1.0);
      float radius = min(hb.x, hb.y) * 0.72;
      float d = 1e9;
      float t = 0.0;
      float spokes = 1.0;
      if (shape == 0 || shape == 1 || shape == 8) {
        // underline (bottom), strike (middle), diagonal (corner to corner)
        vec2 a;
        vec2 b;
        if (shape == 0) {
          a = vec2(-hb.x, -hb.y);
          b = vec2(hb.x, -hb.y);
        } else if (shape == 1) {
          a = vec2(-hb.x, 0.0);
          b = vec2(hb.x, 0.0);
        } else {
          a = vec2(-hb.x, -hb.y);
          b = vec2(hb.x, hb.y);
        }
        vec2 ab = b - a;
        t = clamp(dot(q - a, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0);
        d = length(q - (a + ab * t));
      } else if (shape == 4 || shape == 5) {
        // circle / ring: the trim runs around the centre
        float r = length(q);
        t = atan(q.y, q.x) / TAU + 0.5;
        d = abs(r - radius);
        if (shape == 5) d = min(d, abs(r - radius * 0.55));
      } else if (shape == 6 || shape == 7) {
        // burst / cross: repeat spokes from the centre, longest first
        spokes = shape == 7 ? 2.0 : repeat;
        float best = 1e9;
        float bestT = 0.0;
        for (int i = 0; i < 12; i += 1) {
          float fi = float(i);
          if (fi >= spokes) break;
          float angle = (shape == 7 ? fi * PI * 0.5 : fi / spokes * TAU) + repeatRotate;
          vec2 dir = vec2(cos(angle), sin(angle));
          float len = radius * mix(1.0, repeatScale, fi / max(spokes - 1.0, 1.0));
          vec2 a = vec2(0.0);
          vec2 b = dir * len;
          vec2 ab = b - a;
          float h = clamp(dot(q - a, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0);
          float di = length(q - a - ab * h);
          if (di < best) {
            best = di;
            bestT = (fi + h) / spokes;
          }
        }
        d = best;
        t = bestT;
      } else {
        // box / brackets: the trim walks around the perimeter
        vec2 rq = abs(q) - hb;
        d = length(max(rq, 0.0)) + min(max(rq.x, rq.y), 0.0);
        t = atan(q.y, q.x) / TAU + 0.5;
      }
      float halfStroke = strokePx * 0.5;
      float aa = max(fwidth(d), 0.0015);
      float alpha = 1.0 - smoothstep(halfStroke - aa, halfStroke + aa, d);
      float tt = fract(t + trimOffset);
      float trim = smoothstep(trimStart - feather, trimStart + feather, tt) * (1.0 - smoothstep(trimEnd - feather, trimEnd + feather, tt));
      alpha *= trim;
      if (shape == 3) {
        // brackets keep the four corners only
        float corner = smoothstep(0.5, 0.8, min(abs(q.x) / max(hb.x, 1e-4), abs(q.y) / max(hb.y, 1e-4)));
        alpha *= corner;
      }
      if (d > halfStroke && glow > 0.0) {
        float halo = exp(-max(d - halfStroke, 0.0) / max(strokePx * 3.0, 0.001)) * glow;
        color = vec4(color.rgb + u_colorA.rgb * halo * 0.6, max(color.a, halo * 0.5));
      }
      float repeatFade = 1.0;
      if (shape == 6 || shape == 7) {
        repeatFade = mix(1.0, repeatOpacity, clamp(t, 0.0, 1.0));
      }
      float shapeAlpha = clamp(alpha * repeatFade, 0.0, 1.0);
      color = vec4(mix(color.rgb, u_colorA.rgb, shapeAlpha), max(color.a, shapeAlpha));
    }
    fragColor = color;
  }`;

  // --- bloom chain -------------------------------------------------------------

  const BLOOM_BRIGHT_FRAG = `#version 300 es
  precision highp float;
  in vec2 v_uv;
  uniform sampler2D u_text;
  uniform float u_threshold;
  out vec4 fragColor;
  void main() {
    vec4 color = texture(u_text, v_uv);
    float luminance = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
    float factor = max(0.0, luminance - u_threshold) / max(luminance, 0.0001);
    fragColor = vec4(color.rgb * factor, color.a);
  }`;

  const BLOOM_DOWN_FRAG = `#version 300 es
  precision highp float;
  in vec2 v_uv;
  uniform sampler2D u_text;
  uniform vec2 u_texel;
  out vec4 fragColor;
  void main() {
    vec4 color = texture(u_text, v_uv) * 4.0;
    color += texture(u_text, v_uv + vec2(u_texel.x, 0.0));
    color += texture(u_text, v_uv - vec2(u_texel.x, 0.0));
    color += texture(u_text, v_uv + vec2(0.0, u_texel.y));
    color += texture(u_text, v_uv - vec2(0.0, u_texel.y));
    color += texture(u_text, v_uv + u_texel) * 0.5;
    color += texture(u_text, v_uv - u_texel) * 0.5;
    fragColor = color / 9.0;
  }`;

  const BLOOM_UP_FRAG = `#version 300 es
  precision highp float;
  in vec2 v_uv;
  uniform sampler2D u_text;
  uniform sampler2D u_original;
  uniform float u_intensity;
  out vec4 fragColor;
  void main() {
    fragColor = texture(u_text, v_uv) * u_intensity;
  }`;

  // --- text background pass ----------------------------------------------------

  const BG_VERT = `#version 300 es
  precision highp float;
  in vec2 a_corner;       // +-1 quad corner
  in float a_letter;
  in vec2 a_inkToCell;    // px from ink centre to cell centre
  in vec2 a_cell;         // cell size in px
  in vec2 a_em;           // em box in px
  uniform sampler2D u_state;
  uniform sampler2D u_bgState;
  uniform vec2 u_resolution;
  uniform float u_perspective;
  uniform float u_unitMode;  // 0 = cell, 1 = em
  out vec2 v_local;
  out vec2 v_half;
  out float v_shape;
  out float v_seed;
  out float v_clip;
  out vec2 v_clipDir;
  out float v_amount;
  out float v_letter;
  out vec4 v_color;
  out vec4 v_trim;
  out vec4 v_dash;
  ${COMMON}
  vec4 stateAt(int row) { return texelFetch(u_state, ivec2(int(a_letter + 0.5), row), 0); }
  vec4 bgAt(int row) { return texelFetch(u_bgState, ivec2(int(a_letter + 0.5), row), 0); }
  void main() {
    v_letter = a_letter;
    vec4 s0 = stateAt(0);
    vec4 s1 = stateAt(1);
    vec4 s2 = stateAt(2);
    vec4 b0 = bgAt(0);
    vec4 b1 = bgAt(1);
    vec4 b2 = bgAt(2);
    vec4 b3 = bgAt(3);
    vec4 b4 = bgAt(4);
    vec4 b5 = bgAt(5);
    vec4 b6 = bgAt(6);
    v_shape = b1.y;
    v_seed = b3.y;
    v_clip = b3.x;
    v_clipDir = b4.xy;
    v_amount = b4.z;
    v_color = b2;
    v_trim = b5;
    v_dash = b6;
    vec2 unit = u_unitMode > 0.5 ? a_em : a_cell;
    vec2 halfSize = max(vec2(b0.x, b0.y) * unit * 0.5, vec2(0.001));
    v_half = halfSize / max(min(halfSize.x, halfSize.y), 0.001);
    vec2 q = a_corner * vec2(max(b1.z, 0.0), max(b1.w, 0.0));
    v_local = q;
    float angle = radians(b1.x);
    float c = cos(angle);
    float s = sin(angle);
    vec2 local = mat2(c, s, -s, c) * (q * halfSize);
    local += b0.zw * unit + a_inkToCell;
    vec2 p = letterTransform(local, s0, s1, s2, b3.z > 0.5, b3.w > 0.5, u_perspective);
    vec2 clip = (p / u_resolution) * 2.0 - 1.0;
    gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  }`;

  const BG_FRAG = `#version 300 es
  precision highp float;
  in vec2 v_local;
  in vec2 v_half;
  in float v_shape;
  in float v_seed;
  in float v_clip;
  in vec2 v_clipDir;
  in float v_amount;
  in float v_letter;
  in vec4 v_color;
  in vec4 v_trim;
  in vec4 v_dash;
  layout(location = 0) out vec4 fragColor;
  layout(location = 1) out vec4 o_info;
  ${COMMON}

  float sdBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
  float sdRoundBox(vec2 p, vec2 b, float r) { return sdBox(p, b - r) - r; }
  float sdCircle(vec2 p, float r) { return length(p) - r; }
  float sdEllipseApprox(vec2 p, vec2 r) { float k = length(p / r); return (k - 1.0) * min(r.x, r.y); }
  float sdDiamond(vec2 p, vec2 b) { p = abs(p); return (p.x / b.x + p.y / b.y - 1.0) * min(b.x, b.y) * 0.7071; }
  float sdRing(vec2 p, float r, float t) { return abs(length(p) - r + t * 0.5) - t * 0.5; }
  float sdStar(vec2 p, float r, float n, float m) {
    float an = PI / n;
    float en = PI / m;
    vec2 acs = vec2(cos(an), sin(an));
    vec2 ecs = vec2(cos(en), sin(en));
    float bn = mod(atan(p.x, p.y), 2.0 * an) - an;
    p = length(p) * vec2(cos(bn), abs(sin(bn)));
    p -= r * acs;
    p += ecs * clamp(-dot(p, ecs), 0.0, r * acs.y / ecs.y);
    return length(p) * sign(p.x);
  }
  float sdHeart(vec2 q) {
    vec2 p = vec2(abs(q.x), -q.y + 0.55) / 1.25;
    if (p.y + p.x > 1.0) return (sqrt(dot(p - vec2(0.25, 0.75), p - vec2(0.25, 0.75))) - sqrt(2.0) / 4.0) * 1.25;
    vec2 a = p - vec2(0.0, 1.0);
    vec2 b = p - 0.5 * max(p.x + p.y, 0.0);
    return sqrt(min(dot(a, a), dot(b, b))) * sign(p.x - p.y) * 1.25;
  }
  float sdTriangleIsosceles(vec2 p, vec2 q) {
    p.x = abs(p.x);
    vec2 a = p - q * clamp(dot(p, q) / dot(q, q), 0.0, 1.0);
    vec2 b = p - q * vec2(clamp(p.x / q.x, 0.0, 1.0), 1.0);
    float s = -sign(q.y);
    vec2 d = min(vec2(dot(a, a), s * (p.x * q.y - p.y * q.x)), vec2(dot(b, b), s * (p.y - q.y)));
    return -sqrt(d.x) * sign(d.y);
  }
  float sdBlob(vec2 p, float wobble, float seed) {
    float a = atan(p.y, p.x);
    return length(p) - (0.85 + wobble * 0.25 * (fbm1(a * 1.5 + seed) - 0.5));
  }
  float sdSplatter(vec2 p, float spikes, float seed) {
    float a = atan(p.y, p.x);
    float r = 0.55 + spikes * 0.4 * pow(noise1(a * 3.0 + seed), 3.0);
    float d = length(p) - r;
    for (int i = 0; i < 5; i += 1) {
      vec2 c = hash22(vec2(seed, float(i))) * 1.6 - 0.8;
      d = min(d, length(p - c) - 0.05 - 0.07 * hash12(c));
    }
    return d;
  }
  float sdScratch(vec2 p, float count, float seed) {
    float d = 1e9;
    for (int i = 0; i < 6; i += 1) {
      if (float(i) >= count) break;
      float x = (float(i) - (count - 1.0) * 0.5) * 0.28;
      vec2 a = vec2(x - 0.15, -0.9);
      vec2 b = vec2(x + 0.15, 0.9);
      vec2 pa = p - a;
      vec2 ba = b - a;
      float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
      float w = 0.06 * sin(h * PI);
      d = min(d, length(pa - ba * h) - w - 0.015 * (fbm1(h * 20.0 + seed + float(i)) - 0.5));
    }
    return d;
  }
  float sdDrop(vec2 p) {
    p.y += 0.2;
    float c = length(p) - 0.55;
    float tip = sdTriangleIsosceles(p - vec2(0.0, -0.35), vec2(0.4, 0.6));
    return smin(c, tip, 0.1);
  }
  float sdBracket(vec2 p, vec2 b, float t, float len) {
    float frame = abs(sdBox(p, b)) - t;
    vec2 q = abs(p);
    float keep = max(q.x - (b.x - len), q.y - (b.y - len));
    return max(frame, -keep);
  }
  float sdPaper(vec2 p, vec2 b, float jag, float seed) {
    vec2 j = (hash22(vec2(seed, floor(atan(p.y, p.x) * 2.0))) - 0.5) * jag * 0.12;
    return sdBox(p + j, b);
  }
  float sdCloud(vec2 p) {
    float d = 1e9;
    for (int i = 0; i < 6; i += 1) {
      float a = float(i) / 6.0 * TAU;
      d = smin(d, length(p - vec2(cos(a) * 0.45, sin(a) * 0.3)) - 0.38, 0.15);
    }
    return d;
  }

  float shapeDistance(vec2 p, int shape, float seed, float amount) {
    if (shape == 1) return sdBox(p, vec2(0.85));
    if (shape == 2) return sdRoundBox(p, vec2(0.85), 0.28);
    if (shape == 3) return sdEllipseApprox(p, vec2(0.9));
    if (shape == 4) return sdDiamond(p, vec2(0.9));
    if (shape == 5) return sdRing(p, 0.82, 0.24);
    if (shape == 6) return sdRoundBox(p, vec2(0.95, 0.5), 0.45);
    if (shape == 7) return sdStar(p, 0.95, clamp(amount, 3.0, 12.0), 2.0 + 3.0 * (clamp(amount, 3.0, 12.0) - 3.0) / 9.0);
    if (shape == 8) return sdBlob(p, 0.3, seed);
    if (shape == 9) return sdHeart(p);
    if (shape == 10) return sdSplatter(p, clamp(amount, 0.0, 1.0), seed);
    if (shape == 11) return sdScratch(p, clamp(amount, 1.0, 6.0), seed);
    if (shape == 12) return sdDrop(p);
    if (shape == 13) return sdBracket(p, vec2(0.95), 0.09, 0.42);
    if (shape == 14) return sdPaper(p, vec2(0.85), clamp(amount, 0.0, 1.0), seed);
    if (shape == 15) return sdCloud(p);
    return 1e9;
  }

  // normalised position along the outline: the angle around the centre for the
  // closed shapes, the long axis for the bar. Trim / dash cut by it.
  float shapeParam(vec2 q, int shape) {
    if (shape == 6) return clamp(q.x / max(abs(v_half.x), 1e-4) * 0.5 + 0.5, 0.0, 1.0);
    return atan(q.y, q.x) / TAU + 0.5;
  }

  void main() {
    float opacity = v_color.a;
    if (opacity <= 0.002 || v_shape < 0.5) {
      fragColor = vec4(0.0);
      o_info = vec4(0.0);
      return;
    }
    vec2 q = v_local * v_half;
    float d = shapeDistance(q, int(v_shape + 0.5), v_seed, v_amount);
    d /= max(min(v_half.x, v_half.y), 0.001);
    float aa = max(fwidth(d), 0.004);
    float inside = 1.0 - smoothstep(-aa, aa, d);
    // trim / dash cut the outline by its arc length; stroke draws an outline
    // band and v_dash.w is the interior fill amount (bgMotion.draw walks the
    // trim end first and only fills once the line is complete)
    float trimStart = v_trim.x;
    float trimEnd = v_trim.y;
    float stroke = max(v_trim.w, 0.0);
    float dashOn = max(v_dash.x, 0.0);
    bool trimmed = trimStart > 0.001 || trimEnd < 0.999 || dashOn > 0.0001;
    float arc = 1.0;
    if (trimmed) {
      float t = shapeParam(q, int(v_shape + 0.5));
      float feather = max(fwidth(t), 0.004);
      float tt = fract(t + v_trim.z);
      arc = smoothstep(trimStart - feather, trimStart + feather, tt) * (1.0 - smoothstep(trimEnd - feather, trimEnd + feather, tt));
      if (dashOn > 0.0001) {
        float period = max(dashOn + max(v_dash.y, 0.0), 1e-4);
        if (mod(tt * period + v_dash.z, period) > dashOn) arc = 0.0;
      }
    }
    float fill = inside * clamp(v_dash.w, 0.0, 1.0) * (trimmed ? arc : 1.0);
    float outline = 0.0;
    if (stroke > 0.0001) outline = (1.0 - smoothstep(-aa, aa, abs(d) - stroke)) * arc;
    float alpha = max(fill, outline);
    if (v_clip > -0.999) {
      float side = dot(v_local, normalize(v_clipDir + vec2(1e-6)));
      alpha *= smoothstep(v_clip - 0.05, v_clip + 0.05, side);
    }
    float a = alpha * opacity;
    vec3 rgb = v_color.rgb;
    fragColor = vec4(rgb * a, a);
    float id = v_letter;
    float idHi = floor(id / 255.0);
    float idLo = id - idHi * 255.0;
    o_info = vec4(idHi / 255.0, idLo / 255.0, v_local.x * 0.5 + 0.5, v_local.y * 0.5 + 0.5);
  }`;

  // --- background pass ---------------------------------------------------------

  const BACKGROUND_FRAG = `#version 300 es
  precision highp float;
  in vec2 v_uv;
  uniform sampler2D u_card;
  uniform vec2 u_resolution;
  uniform float u_time;
  uniform int u_type;
  uniform vec4 u_colorA;
  uniform vec4 u_colorB;
  uniform vec4 u_colorC;
  uniform vec4 u_colorD;
  uniform vec4 u_params;    // zoom, offsetX, offsetY, dim / per-type
  uniform vec4 u_params2;   // per-type
  uniform vec4 u_params3;   // per-type
  uniform int u_mode;       // per-type mode selector
  uniform int u_mode2;      // per-type secondary selector (colour ramp)
  uniform vec4 u_camera;    // offsetX (uv), offsetY (uv), scale, angle (rad)
  uniform float u_opacity;
  out vec4 fragColor;
  ${COMMON}

  // The background follows the camera: the uv is rotated / scaled / shifted by
  // the projected camera, scaled by the layer's parallax. At the unit camera
  // the transform is skipped entirely (existing backgrounds stay untouched).
  vec2 cameraUv(vec2 uv, float parallax) {
    if (u_camera.x == 0.0 && u_camera.y == 0.0 && u_camera.z == 1.0 && u_camera.w == 0.0) return uv;
    vec2 p = uv - 0.5;
    float c = cos(u_camera.w);
    float s = sin(u_camera.w);
    p = mat2(c, -s, s, c) * p / max(u_camera.z, 0.05);
    return p + 0.5 + u_camera.xy * max(parallax, 0.0);
  }

  float fbmAbs(vec2 p, int octaves, float gain) {
    float value = 0.0;
    float amplitude = 0.5;
    float total = 0.0;
    for (int i = 0; i < 8; i += 1) {
      if (i >= octaves) break;
      float n = valueNoise(p);
      value += amplitude * mix(n, abs(n * 2.0 - 1.0), gain);
      total += amplitude;
      p *= 2.0;
      amplitude *= 0.5;
    }
    return total > 0.0 ? value / total : value;
  }

  vec2 rot2(vec2 p, float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return mat2(c, -s, s, c) * p;
  }

  float hexDist(vec2 p) {
    vec2 h = vec2(abs(p.x) * 0.8660254, p.y + abs(p.x) * 0.5);
    return max(h.x, h.y);
  }

  // voronoi feature distance; returns (nearest, second nearest)
  vec2 voronoi(vec2 p, float dispersion, float seed) {
    vec2 cell = floor(p);
    vec2 local = fract(p);
    float nearest = 8.0;
    float second = 8.0;
    for (int y = -1; y <= 1; y += 1) {
      for (int x = -1; x <= 1; x += 1) {
        vec2 offset = vec2(float(x), float(y));
        vec2 point = offset + 0.5 + (hash22(cell + offset + seed) - 0.5) * dispersion;
        float d = length(point - local);
        if (d < nearest) {
          second = nearest;
          nearest = d;
        } else if (d < second) {
          second = d;
        }
      }
    }
    return vec2(nearest, second);
  }

  vec3 rampColor(float t, int ramp) {
    t = clamp(t, 0.0, 1.0);
    if (ramp == 0) return mix(u_colorA.rgb, u_colorB.rgb, t);
    if (ramp == 1) {
      vec3 c = mix(u_colorA.rgb, u_colorB.rgb, clamp(t * 2.0, 0.0, 1.0));
      return mix(c, u_colorC.rgb, clamp(t * 2.0 - 1.0, 0.0, 1.0));
    }
    if (ramp == 2) {
      vec3 c = mix(u_colorA.rgb, u_colorB.rgb, clamp(t * 3.0, 0.0, 1.0));
      c = mix(c, u_colorC.rgb, clamp(t * 3.0 - 1.0, 0.0, 1.0));
      return mix(c, u_colorD.rgb, clamp(t * 3.0 - 2.0, 0.0, 1.0));
    }
    return vec3(t);
  }

  void main() {
    vec3 color = u_colorA.rgb;
    float alpha = u_colorA.a;
    if (u_type == 2) {
      float drift = u_time * max(u_params.y, 0.1) * 0.5;
      float n = fbm(v_uv * max(u_params.x, 1.0) * 3.0 + vec2(drift, drift * 0.6), 4);
      float n2 = fbm(v_uv * max(u_params.x, 1.0) * 1.1 - vec2(drift * 0.4, drift * 0.25), 3);
      color = mix(u_colorA.rgb, u_colorB.rgb, clamp(n * 0.7 + n2 * 0.4, 0.0, 1.0));
      float t = u_time * 0.08;
      vec2 lightPos = vec2(0.5 + 0.24 * sin(t), 0.5 + 0.2 * cos(t * 0.8));
      // u_params.z is the centre-bright lift; -1 (unset) keeps the built-in one
      float glowAmt = u_params.z < 0.0 ? 0.22 : u_params.z;
      float lift = glowAmt * smoothstep(0.9, 0.0, distance(v_uv, lightPos));
      color = clamp(color * (1.0 + lift), 0.0, 1.0);
    } else if (u_type == 1) {
      float t = u_time * 0.08;
      vec2 lightPos = vec2(0.5 + 0.22 * sin(t), 0.5 + 0.18 * cos(t * 0.8));
      float glowAmt = u_params.z < 0.0 ? 0.25 : u_params.z;
      float lift = glowAmt * smoothstep(0.85, 0.0, distance(v_uv, lightPos));
      color = clamp(color * (0.94 + lift), 0.0, 1.0);
    } else if (u_type == 3 || u_type == 4 || u_type == 5) {
      float breathe = 1.0 + 0.035 * sin(u_time * 0.22);
      vec2 drift = vec2(0.012 * sin(u_time * 0.11), 0.009 * cos(u_time * 0.09));
      vec2 uv = (v_uv - 0.5) / max(u_params.x * breathe, 0.05) + 0.5 + vec2(u_params.y, u_params.z) + drift;
      vec4 card = texture(u_card, clamp(vec2(uv.x, 1.0 - uv.y), vec2(0.0), vec2(1.0)));
      color = card.rgb + u_colorB.rgb * (1.0 - card.a);
      alpha = 1.0;
      color = mix(color, color * 0.35, clamp(u_params.w, 0.0, 1.0));
    } else if (u_type == 6) {
      // fractalNoise: fbm with type, sub settings, evolution and drift
      vec2 uv = cameraUv(v_uv, 1.0);
      float scale = max(u_params.x, 0.1);
      float stretch = max(u_params.y, 0.2);
      float contrast = max(u_params.z, 0.01);
      float brightness = u_params.w;
      int octaves = int(clamp(u_params2.x, 1.0, 8.0));
      vec2 p = uv * vec2(scale / stretch, scale) * 3.0;
      float evolution = u_params3.x;
      p += vec2(u_params3.y, u_params3.z) * u_time * 2.0;
      float drift = u_time * evolution * 2.0;
      float warp = u_params3.w;
      if (warp > 0.0) {
        vec2 w = vec2(valueNoise(p + vec2(drift, 0.0)), valueNoise(p + vec2(5.2, 1.3) + vec2(drift, 0.0)));
        p += (w - 0.5) * warp * 2.0;
      }
      float n;
      int kind = u_mode;
      if (kind == 1) n = fbmAbs(p + drift, octaves, 1.0);
      else if (kind == 2) {
        float raw = fbmAbs(p + drift, octaves, 1.0);
        n = 1.0 - abs(raw * 2.0 - 1.0);
      } else if (kind == 3) n = fbm(p + vec2(drift, drift * 0.7), octaves);
      else n = fbm(p, octaves);
      float subInfluence = clamp(u_params2.y, 0.0, 1.0);
      if (subInfluence > 0.001) {
        vec2 sp = rot2(p, radians(u_params2.w)) * max(u_params2.z, 0.05);
        n = mix(n, fbm(sp + drift * 0.7, max(2, octaves - 1)), subInfluence);
      }
      n = clamp((n - 0.5) * contrast + 0.5 + brightness, 0.0, 1.0);
      color = rampColor(u_mode2 == 3 ? n : n, u_mode2);
      if (u_mode2 == 3) color = vec3(n);
      if (u_params.z < 0.0) color = vec3(1.0) - color;
    } else if (u_type == 7) {
      // rays: sunburst / lightRays / spotlight
      vec2 uv = cameraUv(v_uv, 1.0);
      vec2 d = uv - u_params2.xy;
      float ang = atan(d.y, d.x);
      float rays = max(u_params.x, 3.0);
      float spin = radians(u_params.y) * u_time;
      float width = clamp(u_params.z, 0.0, 1.0);
      float softness = clamp(u_params.w, 0.0, 1.0);
      float falloff = max(u_params2.z, 0.0);
      float noiseAmt = clamp(u_params2.w, 0.0, 1.0);
      float stripe = 0.5 + 0.5 * sin(ang * rays + spin);
      float beam = pow(max(stripe, 0.0), mix(0.4, 12.0, width));
      float mask = u_mode == 2 ? 1.0 : beam;
      if (u_mode == 1) {
        float flicker = mix(1.0, 0.6 + 0.4 * fbm1(ang * 3.0 + u_time * 0.4), noiseAmt);
        mask *= flicker;
      }
      float radius = length(d);
      float body = 1.0 - clamp(radius / (0.45 + falloff * 0.6), 0.0, 1.0);
      float glow = pow(clamp(body, 0.0, 1.0), mix(1.2, 0.4, softness));
      float amount = clamp(mask * glow, 0.0, 1.0);
      color = mix(u_colorA.rgb, u_colorB.rgb, amount);
      color += u_colorC.rgb * pow(clamp(body, 0.0, 1.0), 4.0) * 0.6;
    } else if (u_type == 8) {
      // gradient4: four moving colour corners blended by inverse distance
      vec2 uv = cameraUv(v_uv, 1.0);
      float t = u_time * u_params.x;
      float blend = max(u_params.z, 0.5);
      float jitter = clamp(u_params.w, 0.0, 1.0);
      float swirl = u_params.y;
      vec2 corners[4];
      corners[0] = vec2(0.25 + 0.1 * sin(t * 1.1), 0.3 + 0.1 * cos(t * 0.9));
      corners[1] = vec2(0.75 + 0.1 * cos(t * 0.8), 0.28 + 0.1 * sin(t * 1.2));
      corners[2] = vec2(0.3 + 0.1 * cos(t * 1.3), 0.75 + 0.1 * sin(t));
      corners[3] = vec2(0.72 + 0.1 * sin(t * 0.7), 0.74 + 0.1 * cos(t * 1.4));
      vec4 palette[4];
      palette[0] = u_colorA;
      palette[1] = u_colorB;
      palette[2] = u_colorC;
      palette[3] = u_colorD;
      vec3 sum = vec3(0.0);
      float weight = 0.0;
      for (int i = 0; i < 4; i += 1) {
        vec2 point = corners[i];
        if (jitter > 0.0) point += (hash22(vec2(float(i) * 3.1, 7.3)) - 0.5) * jitter * 0.2;
        point = rot2(point - 0.5, swirl * sin(t * 0.5 + float(i))) + 0.5;
        float dist = max(length(uv - point), 0.001);
        float w = 1.0 / pow(dist, blend);
        sum += palette[i].rgb * w;
        weight += w;
      }
      color = sum / max(weight, 0.0001);
    } else if (u_type == 9) {
      // cellPattern: voronoi cells with a rim
      vec2 uv = cameraUv(v_uv, 1.0);
      float scale = max(u_params.x, 1.0);
      float contrast = max(u_params.y, 0.01);
      float dispersion = clamp(u_params.z, 0.0, 1.0);
      float evolution = u_params.w;
      float edge = u_params3.x;
      vec2 p = uv * scale + vec2(u_time * evolution);
      vec2 d = voronoi(p, dispersion, 0.0);
      float nearest = d.x;
      float second = d.y;
      int kind = u_mode;
      float n;
      if (kind == 0) n = nearest * 1.4;
      else if (kind == 1) n = 1.0 - abs(second - nearest) * 2.2;
      else if (kind == 2) n = smoothstep(0.0, 0.35, nearest);
      else if (kind == 3) n = abs(sin(nearest * 9.0 - u_time * 0.6));
      else n = smoothstep(0.15, 0.55, nearest);
      float rim = smoothstep(0.02, 0.0, abs(second - nearest) - edge * 0.4);
      n = clamp((n - 0.5) * contrast + 0.5, 0.0, 1.0);
      color = mix(u_colorA.rgb, u_colorB.rgb, n);
      color += u_colorC.rgb * rim * clamp(edge * 3.0, 0.0, 1.0);
    } else if (u_type == 10) {
      // particleField: bokeh / stars / snow / dust / embers / rain / hyperspace
      vec2 uv = cameraUv(v_uv, 1.0);
      float density = max(u_params.x, 4.0);
      float size = max(u_params.y, 0.05);
      float sizeVar = clamp(u_params.z, 0.0, 1.0);
      int layers = int(clamp(u_params2.x, 1.0, 5.0));
      float speed = u_params2.y;
      float dirA = radians(u_params2.z);
      float twinkle = clamp(u_params2.w, 0.0, 1.0);
      float softness = clamp(u_params3.x, 0.0, 1.0);
      vec2 drift = vec2(cos(dirA), -sin(dirA)) * speed * u_time;
      vec3 accumulate = vec3(0.0);
      float alphaAcc = 0.0;
      for (int layer = 0; layer < 5; layer += 1) {
        if (layer >= layers) break;
        float depth = float(layer + 1) / float(layers);
        float scale = density * mix(0.6, 1.8, depth) * 0.5;
        vec2 sp = uv * scale;
        if (u_mode == 6) {
          // hyperspace: particles stream outward from the centre
          sp = rot2(uv - 0.5, 0.0) * scale * (1.0 + depth * 2.0) + drift * depth;
        } else {
          sp += drift * (0.4 + depth);
        }
        vec2 cell = floor(sp);
        for (int y = -1; y <= 1; y += 1) {
          for (int x = -1; x <= 1; x += 1) {
            vec2 offset = vec2(float(x), float(y));
            vec2 key = cell + offset + float(layer) * 37.0;
            vec2 rnd = hash22(key);
            if (rnd.x > 0.35) continue;
            vec2 centre = cell + offset + 0.5 + (rnd - 0.5) * 0.6;
            float dist = length(sp - centre);
            float radius = size * (1.0 - sizeVar * 0.7 * rnd.y) * 0.06 * mix(0.5, 1.6, depth);
            if (u_mode == 6) radius *= 1.0 + depth;
            float glow = 1.0 - smoothstep(radius * mix(0.1, 1.2, softness), radius, dist);
            if (glow <= 0.0) continue;
            float sparkle = 1.0;
            if (twinkle > 0.0) {
              sparkle = mix(1.0, 0.5 + 0.5 * sin(u_time * (2.0 + rnd.y * 6.0) + rnd.x * 20.0), twinkle);
            }
            vec3 tint = vec3(1.0);
            if (u_mode == 1) tint = mix(vec3(0.8, 0.9, 1.0), vec3(1.0), rnd.y);
            else if (u_mode == 2) tint = vec3(1.0);
            else if (u_mode == 3) tint = vec3(0.75, 0.8, 0.95);
            else if (u_mode == 4) tint = mix(vec3(1.0, 0.6, 0.2), vec3(1.0, 0.9, 0.5), rnd.y);
            else if (u_mode == 5) tint = vec3(0.7, 0.85, 1.0);
            else if (u_mode == 6) tint = mix(vec3(0.6, 0.8, 1.0), vec3(1.0), depth);
            else if (u_mode == 0) tint = mix(u_colorB.rgb, u_colorC.rgb, rnd.y);
            accumulate += tint * glow * sparkle;
            alphaAcc = max(alphaAcc, glow * sparkle);
          }
        }
      }
      float base = u_params.w;
      color = u_colorA.rgb * base;
      color += mix(u_colorB.rgb, accumulate, clamp(alphaAcc * 1.4, 0.0, 1.0));
      alpha = max(alpha, clamp(alphaAcc, 0.0, 1.0)) * u_colorA.a;
      if (base > 0.0) alpha = u_colorA.a;
    } else if (u_type == 11) {
      // perspectiveGrid
      vec2 uv = cameraUv(v_uv, 1.0);
      float horizon = clamp(u_params.x, 0.05, 0.95);
      float spacing = max(u_params.y, 0.01);
      float speed = u_params.z;
      float lineWidth = max(u_params.w, 0.1);
      float glow = max(u_params2.x, 0.0);
      float fog = clamp(u_params2.y, 0.0, 1.0);
      float sunSize = max(u_params2.w, 0.0);
      vec3 sky = mix(u_colorD.rgb, u_colorA.rgb, 0.5);
      if (uv.y <= horizon) {
        color = sky;
        if (u_mode != 0 && sunSize > 0.0) {
          float sd = length((uv - vec2(0.5, horizon)) * vec2(u_resolution.x / max(u_resolution.y, 1.0), 1.0));
          float sun = 1.0 - smoothstep(sunSize * 0.8, sunSize, sd);
          color = mix(color, u_colorC.rgb, sun);
          float halo = exp(-sd * 6.0) * 0.4;
          color += u_colorC.rgb * halo;
        }
      } else {
        float d = uv.y - horizon;
        float z = 1.0 / max(d, 0.0001);
        float x = (uv.x - 0.5) * z * 2.0;
        float zz = z - u_time * speed * 2.0;
        float gx = abs(fract(x / spacing) - 0.5) * 2.0;
        float gz = abs(fract(zz / spacing) - 0.5) * 2.0;
        float w = clamp(spacing * z * 0.02 + lineWidth * z / max(u_resolution.y, 1.0) * 20.0, 0.004, 0.6);
        float lines = max(1.0 - smoothstep(0.0, w, gx), 1.0 - smoothstep(0.0, w, gz));
        float depth = clamp(d * 3.0, 0.0, 1.0);
        color = mix(u_colorB.rgb * 0.4, u_colorB.rgb, depth);
        color += u_colorC.rgb * lines * (1.0 + glow * 1.5) * (1.0 - depth * 0.4);
        float fade = 1.0 - clamp(d * 4.0, 0.0, 1.0) * fog;
        color *= fade;
      }
    } else if (u_type == 12) {
      // tunnel
      vec2 uv = cameraUv(v_uv, 1.0);
      float rings = max(u_params.x, 2.0);
      float speed = u_params.y;
      float twist = u_params.z;
      float stripes = u_params.w;
      float fog = clamp(u_params2.x, 0.0, 1.0);
      vec2 d = uv - 0.5;
      float ang = atan(d.y, d.x);
      float rad = length(d);
      if (u_mode == 1) rad = max(abs(d.x), abs(d.y)) * 1.4142;
      else if (u_mode == 2) rad = hexDist(d) * 1.6;
      float depth = rad * rings - u_time * speed * 3.0;
      float band = abs(fract(depth) - 0.5) * 2.0;
      float pattern = 1.0 - band;
      if (stripes >= 1.0) {
        float seg = abs(fract((ang / TAU + 0.5) * stripes + rad * twist * 2.0 + u_time * 0.1) - 0.5) * 2.0;
        pattern = min(pattern, 1.0 - seg);
      }
      float fade = exp(-rad * mix(0.5, 3.0, fog));
      color = mix(u_colorA.rgb, u_colorB.rgb, clamp(pattern, 0.0, 1.0));
      color += u_colorC.rgb * pow(clamp(pattern, 0.0, 1.0), 6.0) * 0.8;
      color *= fade;
    }
    float opacity = clamp(u_opacity, 0.0, 1.0);
    fragColor = vec4(color * opacity, alpha * opacity);
  }`;

  const TRANSFORM_COMMON = `
  uniform sampler2D u_state;
  uniform sampler2D u_color;
  uniform vec2 u_resolution;
  uniform float u_perspective;
  out vec2 v_local;
  out vec2 v_bbox;
  out vec4 v_color;
  out float v_wipe;
  ${COMMON}
  vec4 stateAt(int row) {
    return texelFetch(u_state, ivec2(int(a_letter + 0.5), row), 0);
  }
  vec4 colorAt(int row) {
    return texelFetch(u_color, ivec2(int(a_letter + 0.5), row), 0);
  }
  float deformType(vec4 s3) { return s3.x; }
  vec2 applyTransform(vec2 p, vec4 s0, vec4 s1, vec4 s2, vec4 s3, vec4 s5, vec4 s6, vec4 s7, vec2 halfSize) {
    p += latticeDisp(u_state, int(a_letter + 0.5), p / max(halfSize, vec2(1.0))) * halfSize;
    p = applyDeformStack(p, s3, s5, s6, s7, halfSize);
    p.x += p.y * s1.y;
    float angle = radians(s0.z);
    float c = cos(angle);
    float s = sin(angle);
    p = mat2(c, s, -s, c) * p;
    p += s0.xy;
    float z = -p.y * sin(radians(s2.x)) + p.x * sin(radians(s2.y));
    float w = max(0.05, 1.0 + z / u_perspective);
    p /= w;
    return p;
  }
  vec4 clipOf(vec2 p) {
    vec2 clip = (p / u_resolution) * 2.0 - 1.0;
    return vec4(clip.x, -clip.y, 0.0, 1.0);
  }`;

  // --- representation passes -------------------------------------------------

  const REP_VERT = `#version 300 es
  precision highp float;
  precision highp int;
  in vec2 a_pos;
  in float a_letter;
  in vec2 a_bbox;
  in vec2 a_extra;     // stroke: (s, side) | pieces: (triId, area) | particles: (random, turbulence)
  in vec2 a_centroid;  // pieces: triangle centroid | particles: morph source | stroke: unused
  uniform sampler2D u_state;
  uniform sampler2D u_color;
  uniform vec2 u_resolution;
  uniform float u_perspective;
  uniform int u_repMode;
  out vec2 v_local;
  out vec2 v_bbox;
  out vec4 v_color;
  out float v_wipe;
  out float v_flash;
  out vec4 v_extra;
  ${COMMON}
  vec4 stateAt(int row) {
    return texelFetch(u_state, ivec2(int(a_letter + 0.5), row), 0);
  }
  vec4 colorAt(int row) {
    return texelFetch(u_color, ivec2(int(a_letter + 0.5), row), 0);
  }
  vec2 applyTransform(vec2 p, vec4 s0, vec4 s1, vec4 s2, vec4 s3, vec4 s5, vec4 s6, vec4 s7, vec2 halfSize) {
    p += latticeDisp(u_state, int(a_letter + 0.5), p / max(halfSize, vec2(1.0))) * halfSize;
    p = applyDeformStack(p, s3, s5, s6, s7, halfSize);
    p.x += p.y * s1.y;
    float angle = radians(s0.z);
    float c = cos(angle);
    float s = sin(angle);
    p = mat2(c, s, -s, c) * p;
    p += s0.xy;
    float z = -p.y * sin(radians(s2.x)) + p.x * sin(radians(s2.y));
    float w = max(0.05, 1.0 + z / u_perspective);
    p /= w;
    return p;
  }
  void main() {
    vec4 s0 = stateAt(0);
    vec4 s1 = stateAt(1);
    vec4 s2 = stateAt(2);
    vec4 s3 = stateAt(3);
    vec4 s4 = stateAt(4);   // representMode, reprProgress, colorMix, seed
    vec4 s5 = stateAt(5);
    vec4 s6 = stateAt(6);
    vec4 s7 = stateAt(7);
    vec4 s8 = stateAt(8);   // wipeMode, wipeSoft, flash, maskFrac
    v_color = vec4(colorAt(0).rgb * colorAt(0).a, colorAt(0).a) * s1.z;
    v_wipe = s2.z;
    v_flash = s8.z;
    v_bbox = a_bbox;
    v_local = a_pos;
    v_extra = vec4(a_extra, 0.0, 0.0);
    gl_PointSize = 2.0;
    if (abs(s4.x - float(u_repMode)) > 0.5) {
      gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
      return;
    }
    vec2 p = a_pos;
    if (u_repMode == 2) {
      float progress = clamp(s4.y, 0.0, 1.0);
      vec2 direction = normalize(a_pos - a_centroid + vec2(0.0001));
      float spread = (1.0 - progress) * max(a_bbox.x, a_bbox.y) * 2.0;
      p += direction * spread;
      float angle = (1.0 - progress) * a_extra.x * 0.6;
      float c = cos(angle);
      float s = sin(angle);
      p = mat2(c, -s, s, c) * (p - a_centroid) + a_centroid;
    } else if (u_repMode == 3) {
      float progress = clamp(s4.y, 0.0, 1.0);
      vec2 base = mix(a_centroid, a_pos, progress);
      vec2 curl = vec2(sin(base.y * 0.02 + s4.w), cos(base.x * 0.02 + s4.w)) * a_extra.y * (1.0 - progress);
      p = base + curl;
      gl_PointSize = 2.0 + a_extra.y * 2.0;
    }
    vec2 world = applyTransform(p, s0, s1, s2, s3, s5, s6, s7, a_bbox);
    vec2 clip = (world / u_resolution) * 2.0 - 1.0;
    gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  }`;

  const REP_FRAG = `#version 300 es
  precision highp float;
  precision highp int;
  in vec2 v_local;
  in vec2 v_bbox;
  in vec4 v_color;
  in float v_wipe;
  in float v_flash;
  in vec4 v_extra;
  uniform int u_repMode;      // 1 stroke, 2 pieces, 3 particles
  uniform vec4 u_strokeColor; // straight rgba
  out vec4 fragColor;
  void main() {
    vec4 color = v_color;
    if (v_flash > 0.001) color = vec4(mix(color.rgb, vec3(color.a), clamp(v_flash, 0.0, 1.0)), color.a);
    if (u_repMode == 3) {
      vec2 point = gl_PointCoord - vec2(0.5);
      if (dot(point, point) > 0.25) discard;
      fragColor = color;
      return;
    }
    if (u_repMode == 2) {
      fragColor = color;
      return;
    }
    float s = v_extra.x;
    if (v_wipe < 0.999 && s > v_wipe) discard;
    fragColor = vec4(u_strokeColor.rgb * u_strokeColor.a, u_strokeColor.a) * color.a;
  }`;

  return {
    COMMON,
    TEXT_VERT,
    TEXT_FRAG,
    QUAD_VERT,
    COMPOSITE_FRAG,
    COPY_FRAG,
    MASK_FRAG,
    FILL_FRAG,
    EDGE_FRAG,
    POST_FRAG,
    BLOOM_BRIGHT_FRAG,
    BLOOM_DOWN_FRAG,
    BLOOM_UP_FRAG,
    BACKGROUND_FRAG,
    REP_VERT,
    REP_FRAG,
    BG_VERT,
    BG_FRAG,
    BLUR_FIELD_VERT,
    BLUR_FIELD_FRAG,
    TEXT_VBLUR_FRAG,
  };
})();
