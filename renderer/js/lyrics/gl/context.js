window.SA = window.SA || {};

SA.gl = (() => {
  'use strict';

  function supportsWebGL2(canvas) {
    try {
      const probeCanvas = canvas || (typeof document !== 'undefined' ? document.createElement('canvas') : null);
      if (!probeCanvas) return false;
      const gl = probeCanvas.getContext('webgl2', { failIfMajorPerformanceCaveat: false });
      return !!gl;
    } catch {
      return false;
    }
  }

  function createContext(canvas, options) {
    const opts = options || {};
    const gl = canvas.getContext('webgl2', {
      alpha: opts.alpha !== false,
      antialias: !!opts.antialias,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: !!opts.preserveDrawingBuffer,
      powerPreference: 'high-performance',
      failIfMajorPerformanceCaveat: false,
    });
    if (!gl) {
      throw Object.assign(new Error('webgl2-unavailable'), { code: 'webgl2-unavailable' });
    }
    const floatTargets = !!gl.getExtension('EXT_color_buffer_float');
    const floatLinear = !!gl.getExtension('OES_texture_float_linear');
    return { gl, floatTargets, floatLinear };
  }

  function compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw Object.assign(new Error(`shader-compile: ${log}`), { code: 'shader-compile' });
    }
    return shader;
  }

  function createProgram(gl, vertexSource, fragmentSource, attributes) {
    const program = gl.createProgram();
    const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    if (attributes) {
      for (let i = 0; i < attributes.length; i += 1) gl.bindAttribLocation(program, i, attributes[i]);
    }
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw Object.assign(new Error(`program-link: ${log}`), { code: 'program-link' });
    }
    const uniforms = {};
    const uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < uniformCount; i += 1) {
      const info = gl.getActiveUniform(program, i);
      uniforms[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(program, info.name);
    }
    return { program, uniforms };
  }

  // A program that does not build is worth skipping, not worth throwing over: the
  // caller keeps going without it. gl/sim.js compiles its own programs this way.
  function createProgramSafe(gl, vertexSource, fragmentSource, attributes) {
    try {
      return createProgram(gl, vertexSource, fragmentSource, attributes);
    } catch (error) {
      if (typeof console !== 'undefined') console.warn(`[gl] ${error.message}`);
      return null;
    }
  }

  function createTexture(gl, options) {
    const opts = options || {};
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, opts.filter || gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, opts.filter || gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, opts.wrap || gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, opts.wrap || gl.CLAMP_TO_EDGE);
    return texture;
  }

  function createTarget(gl, width, height, internalFormat, format, type) {
    const texture = createTexture(gl, {});
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, Math.max(1, width), Math.max(1, height), 0, format, type, null);
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { texture, framebuffer, width: Math.max(1, width), height: Math.max(1, height) };
  }

  function deleteTarget(gl, target) {
    if (!target) return;
    if (target.framebuffer) gl.deleteFramebuffer(target.framebuffer);
    if (target.texture) gl.deleteTexture(target.texture);
  }

  function checkError(gl, context) {
    const error = gl.getError();
    if (error !== gl.NO_ERROR) {
      throw Object.assign(new Error(`${context || 'gl'}: error ${error}`), { code: 'gl-error', glError: error });
    }
    return error;
  }

  return { supportsWebGL2, createContext, createProgram, createProgramSafe, createTexture, createTarget, deleteTarget, checkError };
})();
