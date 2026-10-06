(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.SA = root.SA || {};
    root.SA.glShapes = api;
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
/*__PATTERN_LIB__*/
in vec2 v_uv;
uniform vec2 u_half;
uniform int u_shape;
uniform float u_radius;
uniform float u_stroke;
uniform float u_sides;
uniform float u_angle;
uniform vec2 u_p0;
uniform vec2 u_p1;
uniform float u_lineWidth;
uniform vec4 u_color;
uniform vec4 u_strokeColor;
uniform vec3 u_trim;      // trim start, end, offset along the path
uniform vec3 u_dash;      // dash on, off, offset (fractions of the path)
uniform float u_cap;      // 0 butt, 1 round
uniform vec4 u_warp;      // path warp: code, amount, freq, time
uniform int u_pattern;    // pattern vocabulary code (0 = plain stroke)
uniform vec3 u_patternParams; // period (px), ratio, flow phase (turns)
uniform vec2 u_points[8]; // convex polygon (code 5), relative to the centre
uniform float u_count;    // number of live points
out vec4 outColor;

const float PI_HALF = 1.5707963267948966;

// the deformations the text warp uses, applied to the shape's plane
vec2 warpPoint(vec2 p, float code, float amount, float freq, float time, float radius) {
  if (code < 0.5 || abs(amount) < 0.0001) return p;
  float hs = max(radius, 1.0);
  float u = p.x / hs;
  float v = p.y / hs;
  float r = clamp(length(vec2(u, v)), 0.0, 1.0);
  if (code < 1.5) {                        // wiggle
    p += vec2(sin(p.y * 0.06 * max(freq, 0.1) + time * 2.4), cos(p.x * 0.06 * max(freq, 0.1) + time * 2.0)) * amount * hs * 0.25;
  } else if (code < 2.5) {                 // zigzag
    p.x += amount * hs * 0.25 * (abs(fract(v * max(freq, 0.01)) - 0.5) * 4.0 - 1.0);
  } else if (code < 3.5) {                 // pucker / bloat
    p *= 1.0 + amount * (1.0 - r * r) * 0.8;
  } else {                                 // twist
    float angle = amount * PI_HALF * (1.0 - r);
    float c = cos(angle);
    float s = sin(angle);
    p = mat2(c, -s, s, c) * p;
  }
  return p;
}

// normalised position along the outline: the angle around the centre for the
// closed shapes, the projection for a segment
float pathParam(vec2 p) {
  if (u_shape == 2) {
    vec2 ba = u_p1 - u_p0;
    return clamp(dot(p - u_p0, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  }
  return atan(p.y, p.x) / 6.283185307179586 + 0.5;
}

float sdSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}

float sdPolygon(vec2 p, float r, float n, float rot) {
  float a = atan(p.y, p.x) - rot;
  float seg = 6.283185307179586 / max(n, 3.0);
  a = mod(a + seg * 0.5, seg) - seg * 0.5;
  return length(p) * cos(a) - r;
}

// convex polygon: the max of the per-edge half-plane distances
float sdConvex(vec2 p) {
  int n = int(u_count + 0.5);
  float d = -1.0e6;
  for (int i = 0; i < 8; i++) {
    if (i >= n) break;
    int j = i + 1;
    if (j == n) j = 0;
    vec2 a = u_points[i];
    vec2 b = u_points[j];
    vec2 e = b - a;
    vec2 nrm = normalize(vec2(e.y, -e.x));
    d = max(d, dot(p - a, nrm));
  }
  return d;
}

void main() {
  vec2 p = (v_uv - 0.5) * 2.0 * u_half;
  p = warpPoint(p, u_warp.x, u_warp.y, u_warp.z, u_warp.w, max(u_half.x, u_half.y));
  float d;
  float pathPx = 1.0;
  if (u_shape == 0) {
    vec2 q = abs(p) - (u_half - vec2(u_radius));
    d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - u_radius;
    pathPx = 2.0 * (u_half.x + u_half.y);
  } else if (u_shape == 1) {
    d = length(p) - u_radius;
    pathPx = 6.283185307179586 * u_radius;
  } else if (u_shape == 2) {
    d = sdSegment(p, u_p0, u_p1) - u_lineWidth * 0.5;
    pathPx = length(u_p1 - u_p0);
  } else if (u_shape == 3) {
    d = sdPolygon(p, u_radius, u_sides, u_angle);
    pathPx = u_sides * 2.0 * u_radius * sin(3.141592653589793 / max(u_sides, 3.0));
  } else {
    d = sdConvex(p);
    pathPx = 0.0;
    int n = int(u_count + 0.5);
    for (int i = 0; i < 8; i++) {
      if (i >= n) break;
      int j = i + 1;
      if (j == n) j = 0;
      pathPx += length(u_points[j] - u_points[i]);
    }
    pathPx = max(pathPx, 1.0);
  }
  vec4 color = u_color;
  // across: 0 at the stroke centre, 1 at its outer edge; 0.5 without a stroke
  float across = 0.5;
  if (u_stroke > 0.0) {
    d = abs(d) - u_stroke * 0.5;
    color = u_strokeColor;
    across = clamp(d / max(u_stroke, 1e-4) + 0.5, 0.0, 1.0);
  }
  float alpha = color.a * (1.0 - smoothstep(-0.7, 0.7, d));
  // closed shapes jump 1 -> 0 on the negative x axis; skipping the trim math
  // at the identity keeps that seam from dimming filled rects / circles
  bool trimmed = u_trim.x > 0.0 || u_trim.y < 1.0;
  bool needsPath = trimmed || u_pattern > 0 || u_dash.x > 0.0 || (u_cap < 0.5 && u_shape == 2);
  if (needsPath) {
    float t = pathParam(p);
    // the angle seam: take the derivative of a copy shifted by half a turn
    float feather = max(min(fwidth(t), fwidth(fract(t + 0.5))), 0.004);
    float tt = fract(t + u_trim.z);
    if (trimmed) alpha *= smoothstep(u_trim.x - feather, u_trim.x + feather, tt)
                       * (1.0 - smoothstep(u_trim.y - feather, u_trim.y + feather, tt));
    if (u_cap < 0.5 && u_shape == 2 && (t <= 0.0 || t >= 1.0)) alpha = 0.0;
    if (u_pattern > 0) {
      float period = max(u_patternParams.x, 0.5) / max(pathPx, 1.0);
      float ratio = clamp(u_patternParams.y, 0.02, 0.98);
      alpha *= patternMask(u_pattern, t, across, period, ratio, u_patternParams.z);
    } else if (u_dash.x > 0.0) {
      float dashPeriod = max(u_dash.x + u_dash.y, 1e-4);
      alpha *= patternMask(1, tt, across, 1.0, clamp(u_dash.x / dashPeriod, 0.02, 0.98), -u_dash.z / dashPeriod);
    }
  }
  if (alpha <= 0.001) discard;
  outColor = vec4(color.rgb * alpha, alpha);
}`;

  const TEXT_VERT = `#version 300 es
in vec2 a_pos;
uniform vec2 u_resolution;
uniform vec2 u_offset;
void main() {
  vec2 p = a_pos + u_offset;
  gl_Position = vec4(p.x / u_resolution.x * 2.0 - 1.0, 1.0 - p.y / u_resolution.y * 2.0, 0.0, 1.0);
}`;

  const TEXT_FRAG = `#version 300 es
precision highp float;
uniform vec4 u_color;
out vec4 outColor;
void main() {
  float alpha = u_color.a;
  outColor = vec4(u_color.rgb * alpha, alpha);
}`;

  function parseColor(value, fallback) {
    if (Array.isArray(value)) {
      return [Number(value[0]) || 0, Number(value[1]) || 0, Number(value[2]) || 0, value[3] == null ? 1 : Number(value[3])];
    }
    const hex = typeof value === 'string' ? value : (value && (value.value || value.color)) || '';
    const match = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(String(hex).trim());
    if (!match) return fallback || [1, 1, 1, 1];
    let body = match[1];
    if (body.length === 3) body = body.split('').map((char) => char + char).join('');
    return [
      parseInt(body.slice(0, 2), 16) / 255,
      parseInt(body.slice(2, 4), 16) / 255,
      parseInt(body.slice(4, 6), 16) / 255,
      body.length === 8 ? parseInt(body.slice(6, 8), 16) / 255 : 1,
    ];
  }

  // The pattern library lives in gl/shaders.js (one definition of
  // `patternMask`); the fragment is built here so the module also loads
  // standalone in Node, where the shared library is absent and a stub keeps
  // the shader compiling (no GL context exists there anyway).
  const PATTERN_MARK = '/*__PATTERN_LIB__*/';
  const PATTERN_STUB = `
  float patternMask(int kind, float s, float t, float period, float ratio, float flow) { return 1.0; }
  `;

  function patternLibrary() {
    if (typeof SA !== 'undefined' && SA.glShaders && SA.glShaders.PATTERN_GLSL) {
      return `${SA.glShaders.COMMON || ''}\n${SA.glShaders.PATTERN_GLSL}`;
    }
    return PATTERN_STUB;
  }

  function create(gl) {
    const shapeProgram = compile(gl, VERT, FRAG.replace(PATTERN_MARK, () => patternLibrary()), ['a_pos']);
    const textProgram = compile(gl, TEXT_VERT, TEXT_FRAG, ['a_pos']);
    const shapeUniforms = shapeProgram ? locations(gl, shapeProgram) : null;
    const textUniforms = textProgram ? locations(gl, textProgram, ['u_resolution', 'u_offset', 'u_color']) : null;
    const quad = shapeProgram ? createQuad(gl) : null;
    const textCache = new Map();
    let width = gl ? gl.drawingBufferWidth || 1 : 1;
    let height = gl ? gl.drawingBufferHeight || 1 : 1;
    let count = 0;

    function compile(context, vertexSource, fragmentSource, attribs) {
      if (!context) return null;
      const vertex = context.createShader(context.VERTEX_SHADER);
      context.shaderSource(vertex, vertexSource);
      context.compileShader(vertex);
      if (!context.getShaderParameter(vertex, context.COMPILE_STATUS)) {
        if (typeof console !== 'undefined' && console.error) console.error('shapes vertex shader:', context.getShaderInfoLog(vertex));
        return null;
      }
      const fragment = context.createShader(context.FRAGMENT_SHADER);
      context.shaderSource(fragment, fragmentSource);
      context.compileShader(fragment);
      if (!context.getShaderParameter(fragment, context.COMPILE_STATUS)) {
        if (typeof console !== 'undefined' && console.error) console.error('shapes fragment shader:', context.getShaderInfoLog(fragment));
        return null;
      }
      const program = context.createProgram();
      context.attachShader(program, vertex);
      context.attachShader(program, fragment);
      for (let i = 0; i < attribs.length; i += 1) context.bindAttribLocation(program, i, attribs[i]);
      context.linkProgram(program);
      if (!context.getProgramParameter(program, context.LINK_STATUS)) {
        if (typeof console !== 'undefined' && console.error) console.error('shapes program link:', context.getProgramInfoLog(program));
        return null;
      }
      return program;
    }

    function locations(context, program, keys) {
      const names = keys || [
        'u_resolution',
        'u_center',
        'u_half',
        'u_rot',
        'u_shape',
        'u_radius',
        'u_stroke',
        'u_sides',
        'u_angle',
        'u_p0',
        'u_p1',
        'u_lineWidth',
        'u_color',
        'u_strokeColor',
        'u_trim',
        'u_dash',
        'u_cap',
        'u_warp',
        'u_pattern',
        'u_patternParams',
      ];
      const result = {};
      for (const name of names) result[name.replace(/^u_/, '')] = context.getUniformLocation(program, name);
      // uniform arrays: u_points[0] is the canonical location
      result.points = context.getUniformLocation(program, 'u_points[0]') || context.getUniformLocation(program, 'u_points');
      result.count = context.getUniformLocation(program, 'u_count');
      return result;
    }

    function createQuad(context) {
      const vao = context.createVertexArray();
      context.bindVertexArray(vao);
      const buffer = context.createBuffer();
      context.bindBuffer(context.ARRAY_BUFFER, buffer);
      context.bufferData(context.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]), context.STATIC_DRAW);
      context.enableVertexAttribArray(0);
      context.vertexAttribPointer(0, 2, context.FLOAT, false, 0, 0);
      context.bindVertexArray(null);
      return vao;
    }

    function begin(nextWidth, nextHeight) {
      width = Math.max(1, nextWidth || width);
      height = Math.max(1, nextHeight || height);
      count = 0;
    }

    function drawShape(options) {
      if (!shapeProgram) return false;
      const opts = options || {};
      const half = opts.half || { x: 1, y: 1 };
      gl.useProgram(shapeProgram);
      gl.bindVertexArray(quad);
      gl.uniform2f(shapeUniforms.resolution, width, height);
      gl.uniform2f(shapeUniforms.center, opts.center ? opts.center.x : 0, opts.center ? opts.center.y : 0);
      gl.uniform2f(shapeUniforms.half, half.x, half.y);
      const angle = ((opts.angle || 0) * Math.PI) / 180;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      gl.uniformMatrix2fv(shapeUniforms.rot, false, new Float32Array([cos, sin, -sin, cos]));
      gl.uniform1i(shapeUniforms.shape, opts.shape == null ? 0 : opts.shape);
      gl.uniform1f(shapeUniforms.radius, opts.radius == null ? 0 : opts.radius);
      gl.uniform1f(shapeUniforms.stroke, opts.stroke == null ? 0 : opts.stroke);
      gl.uniform1f(shapeUniforms.sides, opts.sides == null ? 6 : opts.sides);
      gl.uniform1f(shapeUniforms.angle, opts.angleLocal == null ? 0 : opts.angleLocal);
      const p0 = opts.p0 || { x: 0, y: 0 };
      const p1 = opts.p1 || { x: 0, y: 0 };
      gl.uniform2f(shapeUniforms.p0, p0.x, p0.y);
      gl.uniform2f(shapeUniforms.p1, p1.x, p1.y);
      gl.uniform1f(shapeUniforms.lineWidth, opts.lineWidth == null ? 2 : opts.lineWidth);
      const color = parseColor(opts.color, [1, 1, 1, 1]);
      const alpha = (opts.opacity == null ? 1 : opts.opacity) * (color[3] == null ? 1 : color[3]);
      gl.uniform4f(shapeUniforms.color, color[0], color[1], color[2], alpha);
      const strokeColor = parseColor(opts.strokeColor || opts.color || [1, 1, 1, 1], color);
      gl.uniform4f(shapeUniforms.strokeColor, strokeColor[0], strokeColor[1], strokeColor[2], (opts.strokeOpacity == null ? 1 : opts.strokeOpacity) * strokeColor[3]);
      // trim / dash / cap / path warp all default to the identity, so a shape
      // without them draws exactly as before
      const trim = opts.trim || [0, 1, 0];
      gl.uniform3f(shapeUniforms.trim, trim[0], trim[1], trim[2] == null ? 0 : trim[2]);
      const dash = Array.isArray(opts.dash) ? opts.dash : [0, 0, 0];
      gl.uniform3f(shapeUniforms.dash, dash[0], dash[1] == null ? 0 : dash[1], dash[2] == null ? 0 : dash[2]);
      gl.uniform1f(shapeUniforms.cap, opts.cap === 'butt' ? 0 : 1);
      const warp = Array.isArray(opts.pathOp) ? opts.pathOp : [0, 0, 0, 0];
      gl.uniform4f(shapeUniforms.warp, warp[0], warp[1] == null ? 0 : warp[1], warp[2] == null ? 0 : warp[2], warp[3] == null ? 0 : warp[3]);
      // decoration pattern: 0 keeps the plain stroke, so a shape without one
      // draws exactly as before
      const pattern = opts.pattern == null ? 0 : Math.max(0, Math.round(Number(opts.pattern) || 0));
      gl.uniform1i(shapeUniforms.pattern, pattern);
      const patternParams = Array.isArray(opts.patternParams) ? opts.patternParams : [0, 0, 0];
      gl.uniform3f(
        shapeUniforms.patternParams,
        patternParams[0] == null ? 0 : patternParams[0],
        patternParams[1] == null ? 0 : patternParams[1],
        patternParams[2] == null ? 0 : patternParams[2]
      );
      // convex points always reset, so a stale polygon never leaks into the
      // next shape drawn with this program
      const points = Array.isArray(opts.points) ? opts.points : [];
      const count = Math.min(8, points.length);
      if (shapeUniforms.points) {
        const flat = new Float32Array(16);
        for (let i = 0; i < count; i += 1) {
          flat[i * 2] = Number(points[i].x) || 0;
          flat[i * 2 + 1] = Number(points[i].y) || 0;
        }
        gl.uniform2fv(shapeUniforms.points, flat);
      }
      if (shapeUniforms.count) gl.uniform1f(shapeUniforms.count, count);
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.disable(gl.BLEND);
      return true;
    }

    function rect(options) {
      const opts = options || {};
      const w = Math.max(0, opts.w == null ? opts.width || 0 : opts.w);
      const h = Math.max(0, opts.h == null ? opts.height || 0 : opts.h);
      // a stroked outline grows outwards: keep the quad wide enough so a heavy
      // stroke is not clipped by the shape's own bounds
      const pad = Math.max(0, Number(opts.stroke) || 0) * 0.5 + (opts.stroke ? 2 : 0);
      return drawShape({
        shape: 0,
        center: { x: opts.x + w / 2, y: opts.y + h / 2 },
        half: { x: w / 2 + pad, y: h / 2 + pad },
        radius: Math.max(0, Math.min(opts.radius || 0, Math.min(w, h) / 2)),
        angle: opts.angle,
        color: opts.color,
        opacity: opts.opacity,
        stroke: opts.stroke,
        strokeColor: opts.strokeColor,
        strokeOpacity: opts.strokeOpacity,
        trim: opts.trim,
        dash: opts.dash,
        cap: opts.cap,
        pathOp: opts.pathOp,
        pattern: opts.pattern,
        patternParams: opts.patternParams,
      });
    }

    function circle(options) {
      const opts = options || {};
      const r = Math.max(0.1, opts.r || opts.radius || 1);
      const pad = Math.max(0, Number(opts.stroke) || 0) * 0.5 + 2;
      return drawShape({
        shape: 1,
        center: { x: opts.x, y: opts.y },
        half: { x: r + pad, y: r + pad },
        radius: r,
        color: opts.color,
        opacity: opts.opacity,
        stroke: opts.stroke,
        strokeColor: opts.strokeColor,
        strokeOpacity: opts.strokeOpacity,
        trim: opts.trim,
        dash: opts.dash,
        cap: opts.cap,
        pathOp: opts.pathOp,
        pattern: opts.pattern,
        patternParams: opts.patternParams,
      });
    }

    function ring(options) {
      const opts = options || {};
      const stroke = Math.max(0.1, opts.thickness || opts.stroke || 2);
      return drawShape({
        shape: 1,
        center: { x: opts.x, y: opts.y },
        half: { x: (opts.r || 1) + stroke + 2, y: (opts.r || 1) + stroke + 2 },
        radius: opts.r || 1,
        color: [0, 0, 0, 0],
        opacity: 0,
        stroke,
        strokeColor: opts.color,
        strokeOpacity: opts.opacity,
        trim: opts.trim,
        dash: opts.dash,
        cap: opts.cap,
        pathOp: opts.pathOp,
        pattern: opts.pattern,
        patternParams: opts.patternParams,
      });
    }

    function capsule(options) {
      const opts = options || {};
      const lineWidth = Math.max(0.1, opts.width || opts.lineWidth || 2);
      const x0 = opts.x0 == null ? 0 : opts.x0;
      const y0 = opts.y0 == null ? 0 : opts.y0;
      const x1 = opts.x1 == null ? 0 : opts.x1;
      const y1 = opts.y1 == null ? 0 : opts.y1;
      const minX = Math.min(x0, x1) - lineWidth;
      const maxX = Math.max(x0, x1) + lineWidth;
      const minY = Math.min(y0, y1) - lineWidth;
      const maxY = Math.max(y0, y1) + lineWidth;
      const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
      return drawShape({
        shape: 2,
        center,
        half: { x: (maxX - minX) / 2, y: (maxY - minY) / 2 },
        p0: { x: x0 - center.x, y: y0 - center.y },
        p1: { x: x1 - center.x, y: y1 - center.y },
        lineWidth,
        color: opts.color,
        opacity: opts.opacity,
        trim: opts.trim,
        dash: opts.dash,
        cap: opts.cap,
        pathOp: opts.pathOp,
        pattern: opts.pattern,
        patternParams: opts.patternParams,
      });
    }

    function polygon(options) {
      const opts = options || {};
      const r = Math.max(0.1, opts.r || opts.radius || 1);
      const pad = Math.max(0, Number(opts.stroke) || 0) * 0.5 + 2;
      return drawShape({
        shape: 3,
        center: { x: opts.x, y: opts.y },
        half: { x: r + pad, y: r + pad },
        radius: r,
        sides: Math.max(3, Math.min(12, Math.round(opts.sides || 6))),
        angleLocal: ((opts.rotation || opts.rot || 0) * Math.PI) / 180,
        color: opts.color,
        opacity: opts.opacity,
        stroke: opts.stroke,
        strokeColor: opts.strokeColor,
        strokeOpacity: opts.strokeOpacity,
        trim: opts.trim,
        dash: opts.dash,
        cap: opts.cap,
        pathOp: opts.pathOp,
        pattern: opts.pattern,
        patternParams: opts.patternParams,
      });
    }

    function convex(options) {
      const opts = options || {};
      const source = (Array.isArray(opts.points) ? opts.points : []).filter((point) => point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y)));
      if (source.length < 3) return false;
      let list = source.slice(0, 8);
      // outward normals assume counter-clockwise; flip a clockwise polygon
      let signed = 0;
      for (let i = 0; i < list.length; i += 1) {
        const a = list[i];
        const b = list[(i + 1) % list.length];
        signed += a.x * b.y - b.x * a.y;
      }
      if (signed < 0) list = list.reverse();
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const point of list) {
        x0 = Math.min(x0, point.x);
        y0 = Math.min(y0, point.y);
        x1 = Math.max(x1, point.x);
        y1 = Math.max(y1, point.y);
      }
      const center = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
      const pad = Math.max(0, Number(opts.stroke) || 0) * 0.5 + 2;
      return drawShape({
        shape: 5,
        center,
        half: { x: Math.max(1, (x1 - x0) / 2 + pad), y: Math.max(1, (y1 - y0) / 2 + pad) },
        points: list.map((point) => ({ x: point.x - center.x, y: point.y - center.y })),
        color: opts.color,
        opacity: opts.opacity,
        stroke: opts.stroke,
        strokeColor: opts.strokeColor,
        strokeOpacity: opts.strokeOpacity,
        trim: opts.trim,
        dash: opts.dash,
        cap: opts.cap,
        pathOp: opts.pathOp,
        pattern: opts.pattern,
        patternParams: opts.patternParams,
      });
    }

    function textMesh(source, size, style) {
      if (typeof SA === 'undefined' || !SA.lyricsFont || !SA.geometry) return null;
      const active = SA.lyricsFont.getActive ? SA.lyricsFont.getActive() : null;
      if (!active || !active.length) return null;
      const fonts = SA.lyricsFont.orderFonts ? SA.lyricsFont.orderFonts(active, style && style.fontId, style && style.weight) : active;
      const geometry = SA.geometry;
      const layout = SA.lyricsFont.layoutText(source, style || {}, fonts, { size });
      const positions = [];
      const indices = [];
      for (const line of layout.lines) {
        for (const word of line.words) {
          for (const letter of word.letters) {
            if (!letter || /^\s+$/.test(letter.char)) continue;
            let contours = null;
            let scale = 1;
            const letterSize = letter.size || size;
            if (letter.src === 'font' && letter.glyph && letter.fontId != null) {
              const bucket = geometry.bucket(letterSize);
              const bucketSize = Math.pow(2, bucket / 4);
              scale = letterSize / bucketSize;
              const cacheKey = geometry.cacheKey(letter.fontId, letter.glyph.index, letterSize);
              contours = geometry.cached(cacheKey, () => {
                const path = letter.glyph.getPath(0, 0, bucketSize);
                return geometry.glyphContours(path, geometry.DEFAULT_TOLERANCE / scale);
              });
            } else if (letter.raster) {
              contours = letter.raster.contours;
            }
            if (!contours || !contours.length) continue;
            let triangles = null;
            try {
              triangles = geometry.triangulate(geometry.groupContours(contours));
            } catch {
              triangles = null;
            }
            if (!triangles || !triangles.indices || !triangles.indices.length) continue;
            const base = positions.length / 2;
            const offsetX = (letter.x || 0) + (letter.offsetX || 0);
            const offsetY = (letter.y || 0) + (letter.offsetY || 0);
            for (let i = 0; i < triangles.positions.length; i += 2) {
              positions.push(triangles.positions[i] * scale + offsetX, triangles.positions[i + 1] * scale + offsetY);
            }
            for (let i = 0; i < triangles.indices.length; i += 1) indices.push(base + triangles.indices[i]);
          }
        }
      }
      if (!indices.length) return null;
      return { positions, indices, bbox: layout.bbox, layout };
    }

    function text(options) {
      if (!textProgram) return false;
      const opts = options || {};
      const source = String(opts.text == null ? '' : opts.text);
      if (!source.trim()) return false;
      const size = Math.max(1, opts.size || 64);
      const fontId = opts.fontId || null;
      const style = { align: opts.align || 'center', direction: opts.direction || 'horizontal', lineHeight: opts.lineHeight || 1.25, fontId };
      const key = `${source}|${size}|${style.align}|${style.direction}|${style.lineHeight}|${fontId || ''}`;
      let entry = textCache.get(key);
      if (!entry) {
        const mesh = textMesh(source, size, style);
        if (!mesh) return false;
        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);
        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, Float32Array.from(mesh.positions), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        const indexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, Uint32Array.from(mesh.indices), gl.STATIC_DRAW);
        gl.bindVertexArray(null);
        entry = { vao, indexCount: mesh.indices.length, bbox: mesh.bbox };
        textCache.set(key, entry);
        if (textCache.size > 48) {
          const oldest = textCache.keys().next().value;
          const stale = textCache.get(oldest);
          if (stale) {
            gl.deleteVertexArray(stale.vao);
            textCache.delete(oldest);
          }
        }
      }
      const bbox = entry.bbox || { x1: 0, y1: 0, x2: 0, y2: 0 };
      const originX = (opts.x || 0) - (bbox.x1 + bbox.x2) / 2;
      const originY = (opts.y || 0) - (bbox.y1 + bbox.y2) / 2;
      const color = parseColor(opts.color, [1, 1, 1, 1]);
      const alpha = (opts.opacity == null ? 1 : opts.opacity) * color[3];
      gl.useProgram(textProgram);
      gl.bindVertexArray(entry.vao);
      gl.uniform2f(textUniforms.resolution, width, height);
      gl.uniform2f(textUniforms.offset, originX, originY);
      gl.uniform4f(textUniforms.color, color[0], color[1], color[2], alpha);
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawElements(gl.TRIANGLES, entry.indexCount, gl.UNSIGNED_INT, 0);
      gl.disable(gl.BLEND);
      count += 1;
      return true;
    }

    function counts() {
      return { count, textures: textCache.size };
    }

    function dispose() {
      for (const entry of textCache.values()) if (entry && entry.vao) gl.deleteVertexArray(entry.vao);
      textCache.clear();
      if (quad) gl.deleteVertexArray(quad);
      if (shapeProgram) gl.deleteProgram(shapeProgram);
      if (textProgram) gl.deleteProgram(textProgram);
    }

    return { begin, rect, circle, ring, capsule, polygon, convex, text, counts, dispose, parseColor };
  }

  return {
    create,
    parseColor,
  };
});
