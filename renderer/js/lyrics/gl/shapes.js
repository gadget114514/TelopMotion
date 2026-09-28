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
out vec4 outColor;

const float PI_HALF = 1.5707963267948966;

// the deformations the text warp uses, applied to the shape's plane
vec2 warpPoint(vec2 p, float code, float amount, float freq, float time, float radius) {
  if (code < 0.5 || abs(amount) < 0.0001) return p;
  float half = max(radius, 1.0);
  float u = p.x / half;
  float v = p.y / half;
  float r = clamp(length(vec2(u, v)), 0.0, 1.0);
  if (code < 1.5) {                        // wiggle
    p += vec2(sin(p.y * 0.06 * max(freq, 0.1) + time * 2.4), cos(p.x * 0.06 * max(freq, 0.1) + time * 2.0)) * amount * half * 0.25;
  } else if (code < 2.5) {                 // zigzag
    p.x += amount * half * 0.25 * (abs(fract(v * max(freq, 0.01)) - 0.5) * 4.0 - 1.0);
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

void main() {
  vec2 p = (v_uv - 0.5) * 2.0 * u_half;
  p = warpPoint(p, u_warp.x, u_warp.y, u_warp.z, u_warp.w, max(u_half.x, u_half.y));
  float d;
  if (u_shape == 0) {
    vec2 q = abs(p) - (u_half - vec2(u_radius));
    d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - u_radius;
  } else if (u_shape == 1) {
    d = length(p) - u_radius;
  } else if (u_shape == 2) {
    d = sdSegment(p, u_p0, u_p1) - u_lineWidth * 0.5;
  } else {
    d = sdPolygon(p, u_radius, u_sides, u_angle);
  }
  vec4 color = u_color;
  if (u_stroke > 0.0) {
    d = abs(d) - u_stroke * 0.5;
    color = u_strokeColor;
  }
  float alpha = color.a * (1.0 - smoothstep(-0.7, 0.7, d));
  // trim path / dashes cut the outline by its own arc length
  float t = pathParam(p);
  float feather = max(fwidth(t), 0.004);
  float tt = fract(t + u_trim.z);
  float trim = smoothstep(u_trim.x - feather, u_trim.x + feather, tt) * (1.0 - smoothstep(u_trim.y - feather, u_trim.y + feather, tt));
  alpha *= trim;
  if (u_cap < 0.5 && u_shape == 2 && (t <= 0.0 || t >= 1.0)) alpha = 0.0;
  if (u_dash.x > 0.0) {
    float period = max(u_dash.x + u_dash.y, 1e-4);
    if (mod(tt * period + u_dash.z, period) > u_dash.x) alpha = 0.0;
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

  function create(gl) {
    const shapeProgram = compile(gl, VERT, FRAG, ['a_pos']);
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
      ];
      const result = {};
      for (const name of names) result[name.replace(/^u_/, '')] = context.getUniformLocation(program, name);
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
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.disable(gl.BLEND);
      count += 1;
      return true;
    }

    function rect(options) {
      const opts = options || {};
      const w = Math.max(0, opts.w == null ? opts.width || 0 : opts.w);
      const h = Math.max(0, opts.h == null ? opts.height || 0 : opts.h);
      return drawShape({
        shape: 0,
        center: { x: opts.x + w / 2, y: opts.y + h / 2 },
        half: { x: w / 2, y: h / 2 },
        radius: Math.max(0, Math.min(opts.radius || 0, Math.min(w, h) / 2)),
        angle: opts.angle,
        color: opts.color,
        opacity: opts.opacity,
        stroke: opts.stroke,
        strokeColor: opts.strokeColor,
      });
    }

    function circle(options) {
      const opts = options || {};
      const r = Math.max(0.1, opts.r || opts.radius || 1);
      return drawShape({
        shape: 1,
        center: { x: opts.x, y: opts.y },
        half: { x: r + 2, y: r + 2 },
        radius: r,
        color: opts.color,
        opacity: opts.opacity,
        stroke: opts.stroke,
        strokeColor: opts.strokeColor,
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
      });
    }

    function polygon(options) {
      const opts = options || {};
      const r = Math.max(0.1, opts.r || opts.radius || 1);
      return drawShape({
        shape: 3,
        center: { x: opts.x, y: opts.y },
        half: { x: r + 2, y: r + 2 },
        radius: r,
        sides: Math.max(3, Math.min(12, Math.round(opts.sides || 6))),
        angleLocal: ((opts.rotation || opts.rot || 0) * Math.PI) / 180,
        color: opts.color,
        opacity: opts.opacity,
        stroke: opts.stroke,
        strokeColor: opts.strokeColor,
      });
    }

    function textMesh(source, size, style) {
      if (typeof SA === 'undefined' || !SA.lyricsFont || !SA.geometry) return null;
      const fonts = SA.lyricsFont.getActive ? SA.lyricsFont.getActive() : null;
      if (!fonts || !fonts.length) return null;
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
      const style = { align: opts.align || 'center', direction: opts.direction || 'horizontal', lineHeight: opts.lineHeight || 1.25 };
      const key = `${source}|${size}|${style.align}|${style.direction}|${style.lineHeight}`;
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

    return { begin, rect, circle, ring, capsule, polygon, text, counts, dispose, parseColor };
  }

  return {
    create,
    parseColor,
  };
});
