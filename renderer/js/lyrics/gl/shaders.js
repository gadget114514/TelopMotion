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
  `;

  // --- text pass ---------------------------------------------------------------

  const TEXT_VERT = `#version 300 es
  precision highp float;
  in vec2 a_pos;        // glyph-local px, centered on the letter bbox center, at render size
  in float a_letter;    // global letter index
  in vec2 a_bbox;       // letter half-extents, for deformation and wipes
  uniform sampler2D u_state;    // RGBA32F, width = letters, height = 5
  uniform sampler2D u_color;    // RGBA8, width = letters, height = 1 (straight RGBA)
  uniform vec2 u_resolution;
  uniform float u_perspective;
  out vec2 v_local;
  out vec2 v_bbox;
  out vec4 v_color;
  out float v_wipe;
  out float v_letter;
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
    if (s4.x > 0.5) {
      gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
      v_color = vec4(0.0);
      v_local = vec2(0.0);
      v_bbox = vec2(1.0);
      v_wipe = 0.0;
      return;
    }
    vec4 base = texelFetch(u_color, ivec2(int(a_letter + 0.5), 0), 0);
    v_color = vec4(base.rgb * base.a, base.a) * s1.z;
    v_wipe = s2.z;
    v_local = a_pos;
    v_bbox = a_bbox;
    vec2 p = a_pos * vec2(s0.w, s1.x);
    if (s3.x > 0.5 && s3.y > 0.0001) {
      float amount = s3.y;
      float time = s3.z;
      float param = s3.w;
      float halfW = max(a_bbox.x, 1.0);
      float halfH = max(a_bbox.y, 1.0);
      if (s3.x < 1.5) {
        float wave = sin(time * TAU * max(param, 0.1) + p.y * 0.06);
        p.y *= 1.0 + amount * wave * 0.6;
        p.x *= 1.0 - amount * wave * 0.25;
      } else if (s3.x < 2.5) {
        float scale = max(param, 0.5);
        p.x += sin(p.y * 0.03 * scale + time * 2.4) * amount * halfW * 0.8;
        p.y += cos(p.x * 0.03 * scale + time * 2.0) * amount * halfH * 0.5;
      } else if (s3.x < 3.5) {
        float twist = radians(amount * (p.y / halfH));
        float c = cos(twist);
        float s = sin(twist);
        p = mat2(c, -s, s, c) * p;
      } else if (s3.x < 4.5) {
        p *= 1.0 + amount * sin(time * 2.4 + param);
      } else {
        float drip = 0.6 + 0.4 * sin(p.x * 0.05 + time);
        p.y += amount * drip * halfH * 1.8;
        p.x *= 1.0 - amount * 0.3;
      }
    }
    p.x += p.y * s1.y;
    float angle = radians(s0.z);
    float c = cos(angle);
    float s = sin(angle);
    p = mat2(c, s, -s, c) * p;
    p += s0.xy;
    float z = -p.y * sin(radians(s2.x)) + p.x * sin(radians(s2.y));
    float w = max(0.05, 1.0 + z / u_perspective);
    p /= w;
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
  layout(location = 0) out vec4 fragColor;
  layout(location = 1) out vec4 o_info;
  void main() {
    if (v_color.a <= 0.001) {
      fragColor = vec4(0.0);
      o_info = vec4(0.0);
      return;
    }
    if (v_wipe < 0.999) {
      float threshold = mix(-1.0, 1.0, clamp(v_wipe, 0.0, 1.0));
      float coord = v_local.x / max(v_bbox.x, 1.0);
      if (coord > threshold) {
        fragColor = vec4(0.0);
        o_info = vec4(0.0);
        return;
      }
    }
    fragColor = v_color;
    float id = v_letter;
    o_info = vec4(floor(id / 255.0), fract(id / 255.0), v_local.x / max(v_bbox.x, 1.0) * 0.5 + 0.5, v_local.y / max(v_bbox.y, 1.0) * 0.5 + 0.5);
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
  uniform vec3 u_clearColor;
  out vec4 fragColor;
  void main() {
    vec4 text = texture(u_texture, v_uv);
    vec3 color = text.rgb + u_clearColor * (1.0 - text.a);
    fragColor = vec4(color, 1.0);
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

  // --- fill pass ---------------------------------------------------------------

  const FILL_FRAG = `#version 300 es
  precision highp float;
  in vec2 v_uv;
  uniform sampler2D u_text;
  uniform sampler2D u_info;
  uniform sampler2D u_sdf;
  uniform sampler2D u_image;
  uniform vec2 u_resolution;
  uniform float u_time;
  uniform float u_progress;
  uniform int u_type;
  uniform vec4 u_colorA;
  uniform vec4 u_colorB;
  uniform vec4 u_colorC;
  uniform vec4 u_colorD;
  uniform vec4 u_params;
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
    }
    fragColor = vec4(color.rgb * color.a * mask, color.a * mask);
  }`;

  // --- edge pass ---------------------------------------------------------------

  const EDGE_FRAG = `#version 300 es
  precision highp float;
  in vec2 v_uv;
  uniform sampler2D u_text;
  uniform sampler2D u_sdf;
  uniform vec2 u_resolution;
  uniform float u_time;
  uniform int u_type;
  uniform vec4 u_color;
  uniform vec4 u_params;
  uniform vec2 u_direction;
  uniform vec2 u_offset;
  out vec4 fragColor;
  ${COMMON}

  float sdfAt(vec2 uv) {
    return texture(u_sdf, uv).r;
  }

  void main() {
    float inside = texture(u_text, v_uv).a;
    float distance = sdfAt(v_uv);
    float alpha = 0.0;
    vec4 color = u_color;
    int type = u_type;
    if (type == 1) {
      float width = max(u_params.x, 0.0005);
      float soft = max(u_params.w, 0.0);
      alpha = 1.0 - smoothstep(width * (1.0 - soft), width, abs(distance));
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
    } else if (type == 18) {
      float angle = u_params.x;
      float width = max(u_params.y, 0.01);
      float speed = max(u_params.z, 0.05);
      vec2 dir = normalize(vec2(cos(angle), sin(angle)) + vec2(1e-6));
      float pos = fract(u_time * speed * 0.15);
      float band = 1.0 - smoothstep(0.0, width, abs(dot(v_uv - 0.5, dir) * 2.0 - (pos * 2.0 - 1.0)));
      color = src + vec4(u_colorA.rgb, u_colorA.a) * band * amount * src.a;
    } else if (type == 19) {
      float segments = max(u_params.x, 2.0);
      float rotation = u_params.y + u_time * 0.05;
      vec2 uv = rotateUv(v_uv, rotation);
      float angle = atan(uv.y - 0.5, uv.x - 0.5);
      float wedge = mod(angle, TAU / segments);
      float mirrored = abs(wedge - TAU / segments * 0.5);
      vec2 mirrorUv = rotateUv(vec2(cos(mirrored) * length(uv - 0.5) + 0.5, sin(mirrored) * length(uv - 0.5) + 0.5), -rotation);
      color = sampleText(mirrorUv);
    } else if (type == 20) {
      vec2 uv = u_params.x > 0.5 ? vec2(1.0 - v_uv.x, v_uv.y) : vec2(v_uv.x, 1.0 - v_uv.y);
      color = sampleText(uv);
    } else if (type == 21) {
      float threshold = clamp(u_params.x, 0.0, 1.0);
      float length = clamp(u_params.y, 1.0, 64.0);
      vec2 dir = normalize(vec2(cos(u_params.z), sin(u_params.z)) + vec2(1e-6));
      color = src;
      if (src.r + src.g + src.b > threshold) {
        for (int i = 1; i <= 16; i += 1) {
          color = max(color, sampleText(v_uv + dir * float(i) * length / u_resolution.x));
        }
      }
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
      vec2 dir = normalize(vec2(cos(u_params.x), sin(u_params.y)) + vec2(1e-6));
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
  uniform vec4 u_params;    // zoom, offsetX, offsetY, dim
  out vec4 fragColor;
  ${COMMON}
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
      float lift = 0.22 * smoothstep(0.9, 0.0, distance(v_uv, lightPos));
      color = clamp(color * (1.0 + lift), 0.0, 1.0);
    } else if (u_type == 1) {
      float t = u_time * 0.08;
      vec2 lightPos = vec2(0.5 + 0.22 * sin(t), 0.5 + 0.18 * cos(t * 0.8));
      float lift = 0.25 * smoothstep(0.85, 0.0, distance(v_uv, lightPos));
      color = clamp(color * (0.94 + lift), 0.0, 1.0);
    } else if (u_type == 3 || u_type == 4 || u_type == 5) {
      float breathe = 1.0 + 0.035 * sin(u_time * 0.22);
      vec2 drift = vec2(0.012 * sin(u_time * 0.11), 0.009 * cos(u_time * 0.09));
      vec2 uv = (v_uv - 0.5) / max(u_params.x * breathe, 0.05) + 0.5 + vec2(u_params.y, u_params.z) + drift;
      vec4 card = texture(u_card, clamp(vec2(uv.x, 1.0 - uv.y), vec2(0.0), vec2(1.0)));
      color = card.rgb + u_colorB.rgb * (1.0 - card.a);
      alpha = 1.0;
      color = mix(color, color * 0.35, clamp(u_params.w, 0.0, 1.0));
    }
    fragColor = vec4(color, alpha);
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
  vec2 applyDeform(vec2 p, vec4 s3, vec2 halfSize) {
    if (s3.x > 0.5 && s3.y > 0.0001) {
      float amount = s3.y;
      float time = s3.z;
      float param = s3.w;
      if (s3.x < 1.5) {
        float wave = sin(time * TAU * max(param, 0.1) + p.y * 0.06);
        p.y *= 1.0 + amount * wave * 0.6;
        p.x *= 1.0 - amount * wave * 0.25;
      } else if (s3.x < 2.5) {
        float scale = max(param, 0.5);
        p.x += sin(p.y * 0.03 * scale + time * 2.4) * amount * halfSize.x * 0.8;
        p.y += cos(p.x * 0.03 * scale + time * 2.0) * amount * halfSize.y * 0.5;
      } else if (s3.x < 3.5) {
        float twist = radians(amount * (p.y / max(halfSize.y, 1.0)));
        float c = cos(twist);
        float s = sin(twist);
        p = mat2(c, -s, s, c) * p;
      } else if (s3.x < 4.5) {
        p *= 1.0 + amount * sin(time * 2.4 + param);
      } else {
        float drip = 0.6 + 0.4 * sin(p.x * 0.05 + time);
        p.y += amount * drip * halfSize.y * 1.8;
        p.x *= 1.0 - amount * 0.3;
      }
    }
    return p;
  }
  vec2 applyTransform(vec2 p, vec4 s0, vec4 s1, vec4 s2, vec4 s3, vec2 halfSize) {
    p = applyDeform(p, s3, halfSize);
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
  out vec4 v_extra;
  ${COMMON}
  vec4 stateAt(int row) {
    return texelFetch(u_state, ivec2(int(a_letter + 0.5), row), 0);
  }
  vec4 colorAt(int row) {
    return texelFetch(u_color, ivec2(int(a_letter + 0.5), row), 0);
  }
  vec2 applyDeform(vec2 p, vec4 s3, vec2 halfSize) {
    if (s3.x > 0.5 && s3.y > 0.0001) {
      float amount = s3.y;
      float time = s3.z;
      float param = s3.w;
      if (s3.x < 1.5) {
        float wave = sin(time * TAU * max(param, 0.1) + p.y * 0.06);
        p.y *= 1.0 + amount * wave * 0.6;
        p.x *= 1.0 - amount * wave * 0.25;
      } else if (s3.x < 2.5) {
        float scale = max(param, 0.5);
        p.x += sin(p.y * 0.03 * scale + time * 2.4) * amount * halfSize.x * 0.8;
        p.y += cos(p.x * 0.03 * scale + time * 2.0) * amount * halfSize.y * 0.5;
      } else if (s3.x < 3.5) {
        float twist = radians(amount * (p.y / max(halfSize.y, 1.0)));
        float c = cos(twist);
        float s = sin(twist);
        p = mat2(c, -s, s, c) * p;
      } else if (s3.x < 4.5) {
        p *= 1.0 + amount * sin(time * 2.4 + param);
      } else {
        float drip = 0.6 + 0.4 * sin(p.x * 0.05 + time);
        p.y += amount * drip * halfSize.y * 1.8;
        p.x *= 1.0 - amount * 0.3;
      }
    }
    return p;
  }
  vec2 applyTransform(vec2 p, vec4 s0, vec4 s1, vec4 s2, vec4 s3, vec2 halfSize) {
    p = applyDeform(p, s3, halfSize);
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
    v_color = vec4(colorAt(0).rgb * colorAt(0).a, colorAt(0).a) * s1.z;
    v_wipe = s2.z;
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
    vec2 world = applyTransform(p, s0, s1, s2, s3, a_bbox);
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
  in vec4 v_extra;
  uniform int u_repMode;      // 1 stroke, 2 pieces, 3 particles
  uniform vec4 u_strokeColor; // straight rgba
  out vec4 fragColor;
  void main() {
    if (u_repMode == 3) {
      vec2 point = gl_PointCoord - vec2(0.5);
      if (dot(point, point) > 0.25) discard;
      fragColor = v_color;
      return;
    }
    if (u_repMode == 2) {
      fragColor = v_color;
      return;
    }
    float s = v_extra.x;
    if (v_wipe < 0.999 && s > v_wipe) discard;
    fragColor = vec4(u_strokeColor.rgb * u_strokeColor.a, u_strokeColor.a) * v_color.a;
  }`;

  return {
    COMMON,
    TEXT_VERT,
    TEXT_FRAG,
    QUAD_VERT,
    COMPOSITE_FRAG,
    COPY_FRAG,
    FILL_FRAG,
    EDGE_FRAG,
    POST_FRAG,
    BLOOM_BRIGHT_FRAG,
    BLOOM_DOWN_FRAG,
    BLOOM_UP_FRAG,
    BACKGROUND_FRAG,
    REP_VERT,
    REP_FRAG,
  };
})();
