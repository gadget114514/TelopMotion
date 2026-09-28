window.SA = window.SA || {};

SA.glPasses = (() => {
  'use strict';

  let batches = new WeakMap();
  const DEFORM_CODES = { jelly: 1, wobbleWarp: 2, twist: 3, breathing: 4, melt: 5 };
  const REP_CODES = { mesh: 0, stroke: 1, pieces: 2, particles: 3 };

  function clamp01(value) {
    return Math.max(0, Math.min(1, value));
  }

  // --- batches -----------------------------------------------------------------

  function meshAttributes(gl, scene) {
    const positions = [];
    const indices = [];
    const colors = new Uint8Array(scene.letters.length * 4);
    for (let i = 0; i < scene.letters.length; i += 1) {
      const letter = scene.letters[i];
      const mesh = SA.lyricsScene.meshOf(letter);
      const scale = mesh.scale || 1;
      const bb = mesh.bbox || { x0: 0, y0: 0, x1: 0, y1: 0 };
      const cx = ((bb.x0 + bb.x1) / 2) * scale;
      const cy = ((bb.y0 + bb.y1) / 2) * scale;
      const halfW = Math.max(1, ((bb.x1 - bb.x0) / 2) * scale);
      const halfH = Math.max(1, ((bb.y1 - bb.y0) / 2) * scale);
      const base = positions.length / 5;
      const source = mesh.fill.positions;
      for (let j = 0; j < source.length; j += 2) {
        positions.push(source[j] * scale - cx, source[j + 1] * scale - cy, i, halfW, halfH);
      }
      const localIndices = mesh.fill.indices;
      for (let j = 0; j < localIndices.length; j += 1) indices.push(base + localIndices[j]);
      const color = letter.color || { r: 1, g: 1, b: 1, a: 1 };
      colors[i * 4] = Math.round(clamp01(color.r) * 255);
      colors[i * 4 + 1] = Math.round(clamp01(color.g) * 255);
      colors[i * 4 + 2] = Math.round(clamp01(color.b) * 255);
      colors[i * 4 + 3] = Math.round(clamp01(color.a) * 255);
    }
    return { positions, indices, colors };
  }

  function makeVao(gl, positions, indices, extra) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, Float32Array.from(positions), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, extra.stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, extra.stride, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, extra.stride, 12);
    if (extra.extraOffset != null) {
      gl.enableVertexAttribArray(3);
      gl.vertexAttribPointer(3, 2, gl.FLOAT, false, extra.stride, extra.extraOffset);
      gl.enableVertexAttribArray(4);
      gl.vertexAttribPointer(4, 2, gl.FLOAT, false, extra.stride, extra.centroidOffset);
    }
    let indexBuffer = null;
    if (indices) {
      indexBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, Uint32Array.from(indices), gl.STATIC_DRAW);
    }
    gl.bindVertexArray(null);
    return { vao, positionBuffer, indexBuffer, count: indices ? indices.length : positions.length / 5 };
  }

  function buildMeshBatch(gl, scene) {
    const { positions, indices, colors } = meshAttributes(gl, scene);
    const batch = makeVao(gl, positions, indices, { stride: 20 });
    batch.colors = colors;
    return batch;
  }

  function buildStrokeBatch(gl, scene) {
    const positions = [];
    const indices = [];
    for (let i = 0; i < scene.letters.length; i += 1) {
      const letter = scene.letters[i];
      const mesh = SA.lyricsScene.meshOf(letter);
      const scale = mesh.scale || 1;
      const bb = mesh.bbox || { x0: 0, y0: 0, x1: 0, y1: 0 };
      const halfW = Math.max(1, ((bb.x1 - bb.x0) / 2) * scale);
      const halfH = Math.max(1, ((bb.y1 - bb.y0) / 2) * scale);
      const stroke = mesh.stroke;
      if (!stroke || !stroke.positions.length) continue;
      const base = positions.length / 7;
      const source = stroke.positions;
      for (let j = 0; j < source.length; j += 4) {
        positions.push(source[j] * scale, source[j + 1] * scale, i, halfW, halfH, source[j + 2], source[j + 3]);
      }
      const localIndices = stroke.indices;
      for (let j = 0; j < localIndices.length; j += 1) indices.push(base + localIndices[j]);
    }
    if (!positions.length) return null;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, Float32Array.from(positions), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 28, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 28, 12);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, 28, 20);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 2, gl.FLOAT, false, 28, 20);
    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, Uint32Array.from(indices), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, positionBuffer, indexBuffer, count: indices.length };
  }

  // One quad per letter for the text background pass.
  function buildBgBatch(gl, scene) {
    const positions = [];
    const indices = [];
    const corners = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ];
    for (let i = 0; i < scene.letters.length; i += 1) {
      const letter = scene.letters[i];
      const cell = SA.textBg ? SA.textBg.cellMetrics(letter) : { w: letter.size || 1, h: letter.size || 1, inkToCell: [0, 0] };
      const em = Math.max(1, Number(letter.size) || 1);
      const base = positions.length / 9;
      for (const [cx, cy] of corners) {
        positions.push(cx, cy, i, cell.inkToCell[0], cell.inkToCell[1], cell.w, cell.h, em, em);
      }
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    if (!positions.length) return null;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, Float32Array.from(positions), gl.STATIC_DRAW);
    const stride = 36;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 20);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 2, gl.FLOAT, false, stride, 28);
    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, Uint32Array.from(indices), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, positionBuffer, indexBuffer, count: indices.length };
  }

  function buildPiecesBatch(gl, scene) {
    const positions = [];
    for (let i = 0; i < scene.letters.length; i += 1) {
      const letter = scene.letters[i];
      const mesh = SA.lyricsScene.meshOf(letter);
      const scale = mesh.scale || 1;
      const bb = mesh.bbox || { x0: 0, y0: 0, x1: 0, y1: 0 };
      const halfW = Math.max(1, ((bb.x1 - bb.x0) / 2) * scale);
      const halfH = Math.max(1, ((bb.y1 - bb.y0) / 2) * scale);
      const pieces = mesh.pieces;
      if (!pieces || !pieces.positions.length) continue;
      for (let j = 0; j < pieces.positions.length; j += 2) {
        const vertex = j / 2;
        positions.push(
          pieces.positions[j] * scale,
          pieces.positions[j + 1] * scale,
          i,
          halfW,
          halfH,
          pieces.triIds[vertex],
          pieces.areas[vertex],
          pieces.centroids[j] * scale,
          pieces.centroids[j + 1] * scale
        );
      }
    }
    if (!positions.length) return null;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, Float32Array.from(positions), gl.STATIC_DRAW);
    const stride = 36;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 20);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 2, gl.FLOAT, false, stride, 28);
    gl.bindVertexArray(null);
    return { vao, positionBuffer, indexBuffer: null, count: positions.length / 9 };
  }

  function buildParticlesBatch(gl, scene, sources) {
    const perLetter = 48;
    const positions = [];
    for (let i = 0; i < scene.letters.length; i += 1) {
      const letter = scene.letters[i];
      const mesh = SA.lyricsScene.meshOf(letter);
      const scale = mesh.scale || 1;
      const bb = mesh.bbox || { x0: 0, y0: 0, x1: 0, y1: 0 };
      const halfW = Math.max(1, ((bb.x1 - bb.x0) / 2) * scale);
      const halfH = Math.max(1, ((bb.y1 - bb.y0) / 2) * scale);
      const samples = letter.samples && letter.samples.interior ? letter.samples.interior : SA.lyricsScene.samplesOf(letter, perLetter).interior;
      if (!samples || !samples.length) continue;
      const count = Math.min(perLetter, samples.length / 2);
      const source = sources && sources[i];
      for (let j = 0; j < count; j += 1) {
        const x = samples[j * 2] * scale;
        const y = samples[j * 2 + 1] * scale;
        let sx = x;
        let sy = y;
        if (source && source.length >= count * 2) {
          const sourceIndex = Math.floor((j / Math.max(1, count - 1)) * (source.length / 2 - 1));
          sx = source[sourceIndex * 2] * scale;
          sy = source[sourceIndex * 2 + 1] * scale;
        } else if (source) {
          sx = 0;
          sy = 0;
        } else {
          sx = x;
          sy = y;
        }
        const random = ((i * 31 + j * 17) % 97) / 97;
        positions.push(x, y, i, halfW, halfH, random, 0.4, sx, sy);
      }
    }
    if (!positions.length) return null;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, Float32Array.from(positions), gl.STATIC_DRAW);
    const stride = 36;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 20);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 2, gl.FLOAT, false, stride, 28);
    gl.bindVertexArray(null);
    return { vao, positionBuffer, indexBuffer: null, count: positions.length / 9 };
  }

  function sceneBatches(gl, scene, variant) {
    let variants = batches.get(scene);
    if (!variants) {
      variants = new Map();
      batches.set(scene, variants);
    }
    const key = (variant && variant.key) || '';
    if (variants.has(key)) return variants.get(key);
    const built = {
      mesh: buildMeshBatch(gl, scene),
      stroke: buildStrokeBatch(gl, scene),
      pieces: buildPiecesBatch(gl, scene),
      particles: buildParticlesBatch(gl, scene, variant && variant.sources),
      bg: buildBgBatch(gl, scene),
    };
    variants.set(key, built);
    return built;
  }

  function clearBatches() {
    batches = new WeakMap();
  }

  function sceneBatch(gl, scene) {
    return sceneBatches(gl, scene).mesh;
  }

  // --- uniforms ----------------------------------------------------------------

  function applyUniforms(gl, program, values) {
    if (!values) return;
    for (const [name, value] of Object.entries(values)) {
      const location = program.uniforms[name];
      if (location == null || value == null) continue;
      if (typeof value === 'number') {
        if (/^u_(type|repMode|count|octaves)$/.test(name)) gl.uniform1i(location, Math.round(value));
        else gl.uniform1f(location, value);
      } else if (Array.isArray(value)) {
        if (value.length === 2) gl.uniform2f(location, value[0], value[1]);
        else if (value.length === 3) gl.uniform3f(location, value[0], value[1], value[2]);
        else if (value.length === 4) gl.uniform4f(location, value[0], value[1], value[2], value[3]);
      }
    }
  }

  function createProgramSafe(gl, vert, frag, attribs) {
    try {
      return SA.gl.createProgram(gl, vert, frag, attribs);
    } catch (error) {
      if (typeof console !== 'undefined') console.warn(`[gl] ${error.message}`);
      return null;
    }
  }

  // --- pipeline ----------------------------------------------------------------

  function createPipeline(gl, options) {
    const opts = options || {};
    const programs = {
      text: createProgramSafe(gl, SA.glShaders.TEXT_VERT, SA.glShaders.TEXT_FRAG, ['a_pos', 'a_letter', 'a_bbox']),
      bg: createProgramSafe(gl, SA.glShaders.BG_VERT, SA.glShaders.BG_FRAG, ['a_corner', 'a_letter', 'a_inkToCell', 'a_cell', 'a_em']),
      rep: createProgramSafe(gl, SA.glShaders.REP_VERT, SA.glShaders.REP_FRAG, ['a_pos', 'a_letter', 'a_bbox', 'a_extra', 'a_centroid']),
      fill: createProgramSafe(gl, SA.glShaders.QUAD_VERT, SA.glShaders.FILL_FRAG),
      edge: createProgramSafe(gl, SA.glShaders.QUAD_VERT, SA.glShaders.EDGE_FRAG),
      post: createProgramSafe(gl, SA.glShaders.QUAD_VERT, SA.glShaders.POST_FRAG),
      bloomBright: createProgramSafe(gl, SA.glShaders.QUAD_VERT, SA.glShaders.BLOOM_BRIGHT_FRAG),
      bloomDown: createProgramSafe(gl, SA.glShaders.QUAD_VERT, SA.glShaders.BLOOM_DOWN_FRAG),
      bloomUp: createProgramSafe(gl, SA.glShaders.QUAD_VERT, SA.glShaders.BLOOM_UP_FRAG),
      background: createProgramSafe(gl, SA.glShaders.QUAD_VERT, SA.glShaders.BACKGROUND_FRAG),
      copy: createProgramSafe(gl, SA.glShaders.QUAD_VERT, SA.glShaders.COPY_FRAG),
      composite: createProgramSafe(gl, SA.glShaders.QUAD_VERT, SA.glShaders.COMPOSITE_FRAG),
    };
    for (const [name, program] of Object.entries(programs)) {
      if (!program) {
        if (typeof console !== 'undefined') console.warn(`[gl] pipeline disabled: ${name} failed to compile`);
        return null;
      }
    }

    const sdfPass = SA.glSdf.createSdfPass(gl, { floatTargets: opts.floatTargets !== false });
    let width = Math.max(1, opts.width || 1920);
    let height = Math.max(1, opts.height || 1080);
    let targets = null;
    let stateTexture = null;
    let colorTexture = null;
    let bgStateTexture = null;
    let stateData = new Float32Array(4);
    let colorData = new Uint8Array(4);
    let bgStateData = new Float32Array(4);
    let stateCapacity = 0;
    let bgStateCapacity = 0;
    let cardTexture = null;
    let cardKey = null;

    function createTargets() {
      disposeTargets();
      const make = (w, h) => SA.gl.createTarget(gl, w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
      const text = make(width, height);
      const info = make(width, height);
      const framebuffer = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, text.texture, 0);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, info.texture, 0);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      const bloom = [];
      let bloomWidth = width;
      let bloomHeight = height;
      for (let i = 0; i < 5; i += 1) {
        bloomWidth = Math.max(1, Math.floor(bloomWidth / 2));
        bloomHeight = Math.max(1, Math.floor(bloomHeight / 2));
        bloom.push(make(bloomWidth, bloomHeight));
      }
      targets = {
        text,
        info,
        textFramebuffer: framebuffer,
        layer: make(width, height),
        scene: make(width, height),
        postA: make(width, height),
        postB: make(width, height),
        bloom,
      };
      stateTexture = SA.gl.createTexture(gl, {});
      colorTexture = SA.gl.createTexture(gl, {});
      stateCapacity = 0;
      stateData = new Float32Array(4);
      colorData = new Uint8Array(4);
    }

    function disposeTargets() {
      if (!targets) return;
      for (const key of ['text', 'info', 'layer', 'scene', 'postA', 'postB']) {
        if (targets[key]) SA.gl.deleteTarget(gl, targets[key]);
      }
      for (const target of targets.bloom || []) SA.gl.deleteTarget(gl, target);
      if (targets.textFramebuffer) gl.deleteFramebuffer(targets.textFramebuffer);
      targets = null;
      if (stateTexture) gl.deleteTexture(stateTexture);
      if (colorTexture) gl.deleteTexture(colorTexture);
      stateTexture = null;
      colorTexture = null;
    }

    function resize(nextWidth, nextHeight) {
      const w = Math.max(1, Math.round(nextWidth));
      const h = Math.max(1, Math.round(nextHeight));
      if (w === width && h === height && targets) return;
      width = w;
      height = h;
      createTargets();
    }

    function bind(target, clearColor) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(0, 0, target.width, target.height);
      if (clearColor) {
        gl.clearColor(clearColor[0], clearColor[1], clearColor[2], clearColor.length > 3 ? clearColor[3] : 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
    }

    function fullscreen(program, uniforms, target) {
      if (target) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
        gl.viewport(0, 0, target.width, target.height);
      }
      gl.useProgram(program.program);
      applyUniforms(gl, program, uniforms);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    function beginScene(clearColor) {
      gl.disable(gl.BLEND);
      bind(targets.scene, clearColor || [0.043, 0.051, 0.07, 1]);
    }

    function drawSolid(color) {
      gl.disable(gl.BLEND);
      bind(targets.scene, color);
    }

    function drawBackground(uniforms, card, opacity) {
      const alpha = opacity == null ? 1 : Math.max(0, Math.min(1, opacity));
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      bind(targets.scene, null);
      gl.useProgram(programs.background.program);
      applyUniforms(gl, programs.background, uniforms);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, card && card.texture ? card.texture : cardTexture || (cardTexture = makeFallbackTexture()));
      gl.uniform1i(programs.background.uniforms.u_card, 0);
      gl.uniform2f(programs.background.uniforms.u_resolution, width, height);
      if (programs.background.uniforms.u_opacity) gl.uniform1f(programs.background.uniforms.u_opacity, alpha);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disable(gl.BLEND);
    }

    function makeFallbackTexture() {
      const texture = SA.gl.createTexture(gl, {});
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([20, 24, 34, 255]));
      return texture;
    }

    function uploadCard(source) {
      if (!source) return null;
      if (!cardTexture) cardTexture = SA.gl.createTexture(gl, {});
      gl.bindTexture(gl.TEXTURE_2D, cardTexture);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
      cardKey = true;
      return { texture: cardTexture };
    }

    function beginLayer() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, targets.layer.framebuffer);
      gl.viewport(0, 0, width, height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    }

    function ensureStateTexture(count) {
      if (count <= stateCapacity) return;
      stateCapacity = Math.max(16, count);
      stateData = new Float32Array(stateCapacity * 5 * 4);
      gl.bindTexture(gl.TEXTURE_2D, stateTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, stateCapacity, 5, 0, gl.RGBA, gl.FLOAT, null);
    }

    function ensureColorTexture(count) {
      if (count <= 0) return;
      if (count <= colorData.length / 4) return;
      colorData = new Uint8Array(Math.max(16, count) * 4);
      gl.bindTexture(gl.TEXTURE_2D, colorTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, Math.max(16, count), 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }

    function packStates(states) {
      const stride = states.length;
      for (let i = 0; i < states.length; i += 1) {
        const state = states[i];
        stateData[(0 * stride + i) * 4] = state.x || 0;
        stateData[(0 * stride + i) * 4 + 1] = state.y || 0;
        stateData[(0 * stride + i) * 4 + 2] = state.rot || 0;
        stateData[(0 * stride + i) * 4 + 3] = state.scale == null ? (state.scaleX == null ? 1 : state.scaleX) : state.scale;
        stateData[(1 * stride + i) * 4] = state.scaleY == null ? 1 : state.scaleY;
        stateData[(1 * stride + i) * 4 + 1] = state.skew || state.skewX || 0;
        stateData[(1 * stride + i) * 4 + 2] = state.opacity == null ? 1 : state.opacity;
        stateData[(1 * stride + i) * 4 + 3] = state.blur || 0;
        stateData[(2 * stride + i) * 4] = state.tiltX || 0;
        stateData[(2 * stride + i) * 4 + 1] = state.tiltY || 0;
        stateData[(2 * stride + i) * 4 + 2] = state.visibleFrac == null ? 1 : state.visibleFrac;
        stateData[(2 * stride + i) * 4 + 3] = state.reprProgress == null ? 1 : state.reprProgress;
        const deform = Array.isArray(state.deform) && state.deform.length ? state.deform[0] : null;
        stateData[(3 * stride + i) * 4] = deform ? DEFORM_CODES[deform.type] || 0 : 0;
        stateData[(3 * stride + i) * 4 + 1] = deform ? deform.amount || 0 : 0;
        stateData[(3 * stride + i) * 4 + 2] = deform ? deform.time || 0 : 0;
        stateData[(3 * stride + i) * 4 + 3] = deform ? deform.freq || deform.scale || deform.seed || 0 : 0;
        stateData[(4 * stride + i) * 4] = REP_CODES[state.represent] == null ? 0 : REP_CODES[state.represent];
        stateData[(4 * stride + i) * 4 + 1] = state.reprProgress == null ? 1 : state.reprProgress;
        stateData[(4 * stride + i) * 4 + 2] = state.colorMix || 0;
        stateData[(4 * stride + i) * 4 + 3] = (i % 97) / 97;
      }
    }

    function uploadState(states, batch, colorOverride) {
      ensureStateTexture(states.length);
      ensureColorTexture(states.length);
      packStates(states);
      if (colorOverride) colorData.set(colorOverride.subarray(0, Math.min(colorOverride.length, colorData.length)));
      else colorData.set(batch.colors.subarray(0, Math.min(batch.colors.length, colorData.length)));
      gl.bindTexture(gl.TEXTURE_2D, stateTexture);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, states.length, 5, gl.RGBA, gl.FLOAT, stateData.subarray(0, states.length * 5 * 4));
      gl.bindTexture(gl.TEXTURE_2D, colorTexture);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, states.length, 1, gl.RGBA, gl.UNSIGNED_BYTE, colorData.subarray(0, states.length * 4));
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, stateTexture);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, colorTexture);
    }

    function text(scene, states, variant, colorOverride) {
      if (!states.length) return;
      const batchSet = sceneBatches(gl, scene, variant);
      const batch = batchSet.mesh;
      if (!batch || !batch.count) return;
      gl.bindFramebuffer(gl.FRAMEBUFFER, targets.textFramebuffer);
      gl.viewport(0, 0, width, height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      uploadState(states, batch, colorOverride);
      gl.useProgram(programs.text.program);
      gl.uniform1i(programs.text.uniforms.u_state, 0);
      gl.uniform1i(programs.text.uniforms.u_color, 1);
      gl.uniform2f(programs.text.uniforms.u_resolution, width, height);
      gl.uniform1f(programs.text.uniforms.u_perspective, 1200);
      gl.bindVertexArray(batch.vao);
      gl.drawElements(gl.TRIANGLES, batch.count, gl.UNSIGNED_INT, 0);
      gl.bindVertexArray(null);
      gl.activeTexture(gl.TEXTURE0);
    }

    function representation(scene, states, modeName, variant, strokeColor) {
      if (!states.length) return;
      const mode = REP_CODES[modeName];
      if (!mode) return;
      const batchSet = sceneBatches(gl, scene, variant);
      const batch = batchSet[modeName];
      if (!batch || !batch.count) return;
      gl.bindFramebuffer(gl.FRAMEBUFFER, targets.layer.framebuffer);
      gl.viewport(0, 0, width, height);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      uploadState(states, batchSet.mesh || batch);
      gl.useProgram(programs.rep.program);
      gl.uniform1i(programs.rep.uniforms.u_state, 0);
      gl.uniform1i(programs.rep.uniforms.u_color, 1);
      gl.uniform1i(programs.rep.uniforms.u_repMode, mode);
      gl.uniform2f(programs.rep.uniforms.u_resolution, width, height);
      gl.uniform1f(programs.rep.uniforms.u_perspective, 1200);
      const color = strokeColor || [1, 1, 1, 1];
      gl.uniform4f(programs.rep.uniforms.u_strokeColor, color[0], color[1], color[2], color[3]);
      gl.bindVertexArray(batch.vao);
      if (batch.indexBuffer) gl.drawElements(gl.TRIANGLES, batch.count, gl.UNSIGNED_INT, 0);
      else gl.drawArrays(gl.POINTS, 0, batch.count);
      gl.bindVertexArray(null);
      gl.activeTexture(gl.TEXTURE0);
    }

    function sdf() {
      if (!targets.text) return null;
      return sdfPass.run(targets.text.texture, width, height, Math.max(width, height) * 0.1);
    }

    function ensureBgStateTexture(count) {
      if (count <= bgStateCapacity) return;
      bgStateCapacity = Math.max(16, count);
      bgStateData = new Float32Array(bgStateCapacity * 5 * 4);
      if (!bgStateTexture) bgStateTexture = SA.gl.createTexture(gl, {});
      gl.bindTexture(gl.TEXTURE_2D, bgStateTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, bgStateCapacity, 5, 0, gl.RGBA, gl.FLOAT, null);
    }

    function uploadBgState(states) {
      ensureBgStateTexture(states.length);
      const stride = states.length;
      for (let i = 0; i < states.length; i += 1) {
        const state = states[i] || {};
        bgStateData[(0 * stride + i) * 4] = state.sizeX == null ? 1 : state.sizeX;
        bgStateData[(0 * stride + i) * 4 + 1] = state.sizeY == null ? 1 : state.sizeY;
        bgStateData[(0 * stride + i) * 4 + 2] = state.offsetX || 0;
        bgStateData[(0 * stride + i) * 4 + 3] = state.offsetY || 0;
        bgStateData[(1 * stride + i) * 4] = state.rotation || 0;
        bgStateData[(1 * stride + i) * 4 + 1] = state.shapeIndex || 0;
        bgStateData[(1 * stride + i) * 4 + 2] = state.motionScaleX == null ? 1 : state.motionScaleX;
        bgStateData[(1 * stride + i) * 4 + 3] = state.motionScaleY == null ? 1 : state.motionScaleY;
        const color = state.color || [1, 1, 1, 1];
        bgStateData[(2 * stride + i) * 4] = color[0];
        bgStateData[(2 * stride + i) * 4 + 1] = color[1];
        bgStateData[(2 * stride + i) * 4 + 2] = color[2];
        bgStateData[(2 * stride + i) * 4 + 3] = (color[3] == null ? 1 : color[3]) * (state.opacity == null ? 1 : state.opacity);
        bgStateData[(3 * stride + i) * 4] = state.clip == null ? -1 : state.clip;
        bgStateData[(3 * stride + i) * 4 + 1] = state.wobbleSeed || 0;
        bgStateData[(3 * stride + i) * 4 + 2] = state.rotateWithLetter === false ? 0 : 1;
        bgStateData[(3 * stride + i) * 4 + 3] = state.scaleWithLetter === false ? 0 : 1;
        const dir = state.clipDir || [1, 0];
        bgStateData[(4 * stride + i) * 4] = dir[0];
        bgStateData[(4 * stride + i) * 4 + 1] = dir[1];
        bgStateData[(4 * stride + i) * 4 + 2] = state.amount == null ? 5 : state.amount;
        bgStateData[(4 * stride + i) * 4 + 3] = state.roughness == null ? 0.5 : state.roughness;
      }
      gl.bindTexture(gl.TEXTURE_2D, bgStateTexture);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, states.length, 5, gl.RGBA, gl.FLOAT, bgStateData.subarray(0, states.length * 5 * 4));
      gl.activeTexture(gl.TEXTURE0);
    }

    // Renders the per-letter background shapes into the text mask target.
    function textBackground(scene, states, bgStates, opts) {
      if (!states.length || !bgStates || !bgStates.length) return;
      const batchSet = sceneBatches(gl, scene);
      const batch = batchSet.bg;
      if (!batch || !batch.count) return;
      const mesh = batchSet.mesh;
      ensureStateTexture(states.length);
      ensureColorTexture(states.length);
      packStates(states);
      if (mesh) colorData.set(mesh.colors.subarray(0, Math.min(mesh.colors.length, colorData.length)));
      gl.bindTexture(gl.TEXTURE_2D, stateTexture);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, states.length, 5, gl.RGBA, gl.FLOAT, stateData.subarray(0, states.length * 5 * 4));
      uploadBgState(bgStates);
      gl.bindFramebuffer(gl.FRAMEBUFFER, targets.textFramebuffer);
      gl.viewport(0, 0, width, height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(programs.bg.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, stateTexture);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, bgStateTexture);
      gl.uniform1i(programs.bg.uniforms.u_state, 0);
      gl.uniform1i(programs.bg.uniforms.u_bgState, 1);
      gl.uniform2f(programs.bg.uniforms.u_resolution, width, height);
      gl.uniform1f(programs.bg.uniforms.u_perspective, 1200);
      gl.uniform1f(programs.bg.uniforms.u_unitMode, opts && opts.unit === 'em' ? 1 : 0);
      gl.bindVertexArray(batch.vao);
      gl.drawElements(gl.TRIANGLES, batch.count, gl.UNSIGNED_INT, 0);
      gl.bindVertexArray(null);
      gl.activeTexture(gl.TEXTURE0);
    }

    // Punches the current text mask out of the layer (knockout backgrounds).
    function knockout() {
      if (!targets.text) return;
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
      bind(targets.layer, null);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, targets.text.texture);
      gl.useProgram(programs.copy.program);
      gl.uniform1i(programs.copy.uniforms.u_texture, 0);
      gl.uniform1f(programs.copy.uniforms.u_opacity, 1);
      if (programs.copy.uniforms.u_offset) gl.uniform2f(programs.copy.uniforms.u_offset, 0, 0);
      if (programs.copy.uniforms.u_scale) gl.uniform1f(programs.copy.uniforms.u_scale, 1);
      if (programs.copy.uniforms.u_angle) gl.uniform1f(programs.copy.uniforms.u_angle, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.activeTexture(gl.TEXTURE0);
    }

    function fill(uniforms) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      bind(targets.layer, null);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, targets.text.texture);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, targets.info.texture);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, (uniforms && uniforms.sdfTexture) || targets.text.texture);
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, (uniforms && uniforms.imageTexture) || fallback());
      gl.useProgram(programs.fill.program);
      const values = { ...uniforms, u_resolution: [width, height] };
      applyUniforms(gl, programs.fill, values);
      gl.uniform1i(programs.fill.uniforms.u_text, 0);
      gl.uniform1i(programs.fill.uniforms.u_info, 1);
      gl.uniform1i(programs.fill.uniforms.u_sdf, 2);
      gl.uniform1i(programs.fill.uniforms.u_image, 3);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.activeTexture(gl.TEXTURE0);
    }

    function fallback() {
      if (!cardTexture) cardTexture = makeFallbackTexture();
      return cardTexture;
    }

    function edge(uniforms) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      bind(targets.layer, null);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, targets.text.texture);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, (uniforms && uniforms.sdfTexture) || targets.text.texture);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, targets.info.texture);
      gl.useProgram(programs.edge.program);
      applyUniforms(gl, programs.edge, { ...uniforms, u_resolution: [width, height] });
      gl.uniform1i(programs.edge.uniforms.u_text, 0);
      gl.uniform1i(programs.edge.uniforms.u_sdf, 1);
      gl.uniform1i(programs.edge.uniforms.u_info, 2);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.activeTexture(gl.TEXTURE0);
    }

    function post(uniforms) {
      const source = targets.layer;
      const target = targets.postA;
      gl.disable(gl.BLEND);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(0, 0, target.width, target.height);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, source.texture);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, (uniforms && uniforms.sdfTexture) || targets.text.texture);
      gl.useProgram(programs.post.program);
      applyUniforms(gl, programs.post, { ...uniforms, u_resolution: [width, height] });
      gl.uniform1i(programs.post.uniforms.u_text, 0);
      gl.uniform1i(programs.post.uniforms.u_sdf, 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.activeTexture(gl.TEXTURE0);
      // swap layer and postA
      const layer = targets.layer;
      targets.layer = targets.postA;
      targets.postA = layer;
    }

    function postFrame(uniforms) {
      const source = targets.scene;
      const target = targets.postB;
      gl.disable(gl.BLEND);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(0, 0, target.width, target.height);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, source.texture);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, targets.text.texture);
      gl.useProgram(programs.post.program);
      applyUniforms(gl, programs.post, { ...uniforms, u_resolution: [width, height] });
      gl.uniform1i(programs.post.uniforms.u_text, 0);
      gl.uniform1i(programs.post.uniforms.u_sdf, 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.activeTexture(gl.TEXTURE0);
      const scene = targets.scene;
      targets.scene = targets.postB;
      targets.postB = scene;
    }

    function commitLayer(opacity, transform) {
      const t = transform || {};
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      bind(targets.scene, null);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, targets.layer.texture);
      gl.useProgram(programs.copy.program);
      gl.uniform1i(programs.copy.uniforms.u_texture, 0);
      gl.uniform1f(programs.copy.uniforms.u_opacity, opacity == null ? 1 : opacity);
      if (programs.copy.uniforms.u_offset) gl.uniform2f(programs.copy.uniforms.u_offset, t.dx || 0, t.dy || 0);
      if (programs.copy.uniforms.u_scale) gl.uniform1f(programs.copy.uniforms.u_scale, t.scale == null ? 1 : t.scale);
      if (programs.copy.uniforms.u_angle) gl.uniform1f(programs.copy.uniforms.u_angle, ((t.rotate || 0) * Math.PI) / 180);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.activeTexture(gl.TEXTURE0);
    }

    function bloom(threshold, intensity) {
      const mips = targets.bloom;
      if (!mips || !mips.length) return;
      gl.disable(gl.BLEND);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, targets.scene.texture);
      fullscreen(programs.bloomBright, { u_threshold: threshold == null ? 0.65 : threshold }, mips[0]);
      gl.uniform1i(programs.bloomBright.uniforms.u_text, 0);
      for (let i = 1; i < mips.length; i += 1) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, mips[i - 1].texture);
        gl.useProgram(programs.bloomDown.program);
        gl.bindFramebuffer(gl.FRAMEBUFFER, mips[i].framebuffer);
        gl.viewport(0, 0, mips[i].width, mips[i].height);
        gl.uniform1i(programs.bloomDown.uniforms.u_text, 0);
        gl.uniform2f(programs.bloomDown.uniforms.u_texel, 1 / mips[i - 1].width, 1 / mips[i - 1].height);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      for (let i = mips.length - 1; i > 0; i -= 1) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, mips[i].texture);
        gl.useProgram(programs.bloomUp.program);
        gl.bindFramebuffer(gl.FRAMEBUFFER, mips[i - 1].framebuffer);
        gl.viewport(0, 0, mips[i - 1].width, mips[i - 1].height);
        gl.uniform1i(programs.bloomUp.uniforms.u_text, 0);
        gl.uniform1f(programs.bloomUp.uniforms.u_intensity, i === mips.length - 1 ? 1 : 0.8);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      bind(targets.scene, null);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, mips[0].texture);
      gl.useProgram(programs.bloomUp.program);
      gl.uniform1i(programs.bloomUp.uniforms.u_text, 0);
      gl.uniform1f(programs.bloomUp.uniforms.u_intensity, intensity == null ? 0.7 : intensity);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disable(gl.BLEND);
      gl.activeTexture(gl.TEXTURE0);
    }

    function finish() {
      gl.disable(gl.BLEND);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, width, height);
      gl.useProgram(programs.copy.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, targets.scene.texture);
      gl.uniform1i(programs.copy.uniforms.u_texture, 0);
      gl.uniform1f(programs.copy.uniforms.u_opacity, 1);
      if (programs.copy.uniforms.u_offset) gl.uniform2f(programs.copy.uniforms.u_offset, 0, 0);
      if (programs.copy.uniforms.u_scale) gl.uniform1f(programs.copy.uniforms.u_scale, 1);
      if (programs.copy.uniforms.u_angle) gl.uniform1f(programs.copy.uniforms.u_angle, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.activeTexture(gl.TEXTURE0);
    }

    function dispose() {
      sdfPass.dispose();
      for (const program of Object.values(programs)) {
        if (program) gl.deleteProgram(program.program);
      }
      disposeTargets();
      if (cardTexture) gl.deleteTexture(cardTexture);
      if (bgStateTexture) gl.deleteTexture(bgStateTexture);
      cardTexture = null;
      bgStateTexture = null;
    }

    createTargets();
    return {
      ready: true,
      width,
      height,
      resize,
      beginScene,
      drawSolid,
      drawBackground,
      uploadCard,
      beginLayer,
      text,
      textBackground,
      knockout,
      representation,
      sdf,
      fill,
      edge,
      post,
      postFrame,
      commitLayer,
      bloom,
      finish,
      dispose,
      targets: () => targets,
      debugError: () => gl.getError(),
    };
  }

  // --- simple text pass (fallback when the pipeline cannot be created) ---------

  function createTextPass(gl) {
    const text = SA.gl.createProgram(gl, SA.glShaders.TEXT_VERT, SA.glShaders.TEXT_FRAG, ['a_pos', 'a_letter', 'a_bbox']);
    const compositeProgram = SA.gl.createProgram(gl, SA.glShaders.QUAD_VERT, SA.glShaders.COMPOSITE_FRAG);
    const stateTexture = SA.gl.createTexture(gl, {});
    const colorTexture = SA.gl.createTexture(gl, {});
    let stateData = new Float32Array(4);
    let colorData = new Uint8Array(4);
    let stateCapacity = 0;
    let colorCapacity = 0;

    function ensureStateTexture(count) {
      if (count <= stateCapacity) return;
      stateCapacity = Math.max(16, count);
      stateData = new Float32Array(stateCapacity * 5 * 4);
      gl.bindTexture(gl.TEXTURE_2D, stateTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, stateCapacity, 5, 0, gl.RGBA, gl.FLOAT, null);
    }

    function ensureColorTexture(count) {
      if (count <= colorCapacity) return;
      colorCapacity = Math.max(16, count);
      colorData = new Uint8Array(colorCapacity * 4);
      gl.bindTexture(gl.TEXTURE_2D, colorTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, colorCapacity, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }

    function packStates(states) {
      const width = states.length;
      for (let i = 0; i < states.length; i += 1) {
        const state = states[i];
        stateData[(0 * width + i) * 4] = state.x || 0;
        stateData[(0 * width + i) * 4 + 1] = state.y || 0;
        stateData[(0 * width + i) * 4 + 2] = state.rot || 0;
        stateData[(0 * width + i) * 4 + 3] = state.scale == null ? (state.scaleX == null ? 1 : state.scaleX) : state.scale;
        stateData[(1 * width + i) * 4] = state.scaleY == null ? 1 : state.scaleY;
        stateData[(1 * width + i) * 4 + 1] = state.skew || state.skewX || 0;
        stateData[(1 * width + i) * 4 + 2] = state.opacity == null ? 1 : state.opacity;
        stateData[(1 * width + i) * 4 + 3] = state.blur || 0;
        stateData[(2 * width + i) * 4] = state.tiltX || 0;
        stateData[(2 * width + i) * 4 + 1] = state.tiltY || 0;
        stateData[(2 * width + i) * 4 + 2] = state.visibleFrac == null ? 1 : state.visibleFrac;
        stateData[(2 * width + i) * 4 + 3] = state.reprProgress == null ? 1 : state.reprProgress;
        const deform = Array.isArray(state.deform) && state.deform.length ? state.deform[0] : null;
        stateData[(3 * width + i) * 4] = deform ? DEFORM_CODES[deform.type] || 0 : 0;
        stateData[(3 * width + i) * 4 + 1] = deform ? deform.amount || 0 : 0;
        stateData[(3 * width + i) * 4 + 2] = deform ? deform.time || 0 : 0;
        stateData[(3 * width + i) * 4 + 3] = deform ? deform.freq || deform.scale || deform.seed || 0 : 0;
        stateData[(4 * width + i) * 4 + 1] = state.reprProgress == null ? 1 : state.reprProgress;
        stateData[(4 * width + i) * 4 + 2] = state.colorMix || 0;
      }
    }

    function draw(glState, scene, states, resolution) {
      const batch = sceneBatch(gl, scene);
      if (!batch.count) return 0;
      ensureStateTexture(states.length);
      ensureColorTexture(states.length);
      packStates(states);
      colorData.set(batch.colors.subarray(0, Math.min(batch.colors.length, colorData.length)));
      gl.bindTexture(gl.TEXTURE_2D, stateTexture);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, states.length, 5, gl.RGBA, gl.FLOAT, stateData.subarray(0, states.length * 5 * 4));
      gl.bindTexture(gl.TEXTURE_2D, colorTexture);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, states.length, 1, gl.RGBA, gl.UNSIGNED_BYTE, colorData.subarray(0, states.length * 4));

      gl.useProgram(text.program);
      gl.uniform1i(text.uniforms.u_state, 0);
      gl.uniform1i(text.uniforms.u_color, 1);
      gl.uniform2f(text.uniforms.u_resolution, resolution.width, resolution.height);
      gl.uniform1f(text.uniforms.u_perspective, 1200);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, stateTexture);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, colorTexture);
      gl.bindVertexArray(batch.vao);
      gl.drawElements(gl.TRIANGLES, batch.count, gl.UNSIGNED_INT, 0);
      gl.bindVertexArray(null);
      return batch.count;
    }

    function drawComposite(glState, target, clearColor) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, glState.canvas.width, glState.canvas.height);
      gl.disable(gl.BLEND);
      gl.useProgram(compositeProgram.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, target.texture);
      gl.uniform1i(compositeProgram.uniforms.u_texture, 0);
      gl.uniform3f(compositeProgram.uniforms.u_clearColor, clearColor[0], clearColor[1], clearColor[2]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    function dispose(glState) {
      glState.deleteProgram(text.program);
      glState.deleteProgram(compositeProgram.program);
      glState.deleteTexture(stateTexture);
      glState.deleteTexture(colorTexture);
    }

    return { text, compositeProgram, stateTexture, colorTexture, draw, drawComposite, dispose };
  }

  return {
    createPipeline,
    createTextPass,
    sceneBatches,
    sceneBatch,
    clearBatches,
    DEFORM_CODES,
    REP_CODES,
  };
})();
