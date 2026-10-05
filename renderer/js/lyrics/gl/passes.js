window.SA = window.SA || {};

SA.glPasses = (() => {
  'use strict';

  let batches = new WeakMap();
  const REP_CODES = { mesh: 0, stroke: 1, pieces: 2, particles: 3, sand: 4, dust: 5 };
  const SAND_GRAINS = 160;
  const DUST_GRAINS = 360;
  const FALLBACK_DEFORM_CODES = {
    jelly: 1, wobbleWarp: 2, twist: 3, breathing: 4, melt: 5,
    stretch: 15, skew: 16, swirl: 17,
    zoomBlock: 31,
  };
  const DEFORM_CODES = typeof SA !== 'undefined' && SA.warp && SA.warp.DEFORM_CODES ? SA.warp.DEFORM_CODES : FALLBACK_DEFORM_CODES;

  function clamp01(value) {
    return Math.max(0, Math.min(1, value));
  }

  // Per-letter state texture: 26 RGBA rows. Rows 0-4 are the original layout,
  // rows 5-6 hold the second and third deformation slots, row 7 the block-warp
  // origin and half-size, row 8 the wipe / flash / mask fields. Rows 9-21 carry
  // the soft body lattice (25 vec2: xy is an even node, zw the next odd node)
  // and row 22 the lattice / decor flags. Row 23 carries the sand parameters
  // (wind, gravity, grain size, pile flag) or the dust parameters
  // (windX, windY, size, turbulence). Row 24 carries spread / strength, row 25
  // the dissolve mode / direction / bias (see DISSOLVE_ROW).
  const STATE_ROWS = 26;
  const SAND_ROW = 23;
  const SAND_ROW2 = 24; // spread, strength
  const DISSOLVE_ROW = 25; // mode, dir.x, dir.y, bias
  const LATTICE_ROW0 = 9;
  const LATTICE_ROW1 = 21;
  const LATTICE_FLAGS_ROW = 22;
  const LATTICE_POINTS = 25;

  // Text background state texture: 7 RGBA rows. Rows 0-4 are the original
  // layout, row 5 the trim / outline stroke and row 6 the dash / fill amount.
  const BG_STATE_ROWS = 7;

  // At most three deformations survive per letter; the largest |amount| wins
  // inside each group. A block-space deformation (warp, font size) reserves one
  // slot, so a strong letter deformation can never hide the block scale.
  function deformSlots(state) {
    const list = state && Array.isArray(state.deform) ? state.deform : null;
    if (!list || !list.length) return null;
    const letter = [];
    const block = [];
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const code = DEFORM_CODES[item.type] || 0;
      if (!code) continue;
      (code >= 20 ? block : letter).push({ code, item });
    }
    if (!letter.length && !block.length) return null;
    // twist / twistBlock are degrees, so 12deg must not outrank an amount of 0.3
    const magnitude = (entry) => {
      const amount = Math.abs(Number(entry.item.amount) || 0);
      return entry.code === 3 || entry.code === 30 ? amount / 90 : amount;
    };
    const byAmount = (a, b) => magnitude(b) - magnitude(a);
    letter.sort(byAmount);
    block.sort(byAmount);
    const letterSlots = block.length ? letter.slice(0, 2) : letter.slice(0, 3);
    return [...letterSlots, ...block.slice(0, 1)];
  }

  function deformParam(item) {
    if (item.param != null) return item.param;
    return item.freq || item.scale || item.seed || 0;
  }

  function packStateRows(states, data, stride) {
    for (let i = 0; i < states.length; i += 1) {
      const state = states[i];
      const at = (row) => (row * stride + i) * 4;
      data[at(0)] = state.x || 0;
      data[at(0) + 1] = state.y || 0;
      data[at(0) + 2] = state.rot || 0;
      data[at(0) + 3] = state.scale == null ? (state.scaleX == null ? 1 : state.scaleX) : state.scale;
      data[at(1)] = state.scaleY == null ? 1 : state.scaleY;
      data[at(1) + 1] = state.skew || state.skewX || 0;
      data[at(1) + 2] = state.opacity == null ? 1 : state.opacity;
      data[at(1) + 3] = state.blur || 0;
      data[at(2)] = state.tiltX || 0;
      data[at(2) + 1] = state.tiltY || 0;
      data[at(2) + 2] = state.visibleFrac == null ? 1 : state.visibleFrac;
      data[at(2) + 3] = state.reprProgress == null ? 1 : state.reprProgress;
      const slots = deformSlots(state);
      for (let slot = 0; slot < 3; slot += 1) {
        const row = slot === 0 ? 3 : slot === 1 ? 5 : 6;
        const entry = slots && slots[slot];
        data[at(row)] = entry ? entry.code : 0;
        data[at(row) + 1] = entry ? Number(entry.item.amount) || 0 : 0;
        data[at(row) + 2] = entry ? Number(entry.item.time) || 0 : 0;
        data[at(row) + 3] = entry ? deformParam(entry.item) : 0;
      }
      const origin = state.warpOrigin || null;
      const half = state.blockHalf || null;
      data[at(7)] = origin ? origin.x || 0 : 0;
      data[at(7) + 1] = origin ? origin.y || 0 : 0;
      data[at(7) + 2] = half ? half.x || 0 : 0;
      data[at(7) + 3] = half ? half.y || 0 : 0;
      data[at(8)] = state.wipeMode == null ? 0 : state.wipeMode;
      data[at(8) + 1] = state.wipeSoft == null ? 0 : state.wipeSoft;
      data[at(8) + 2] = state.flash || 0;
      data[at(8) + 3] = state.maskFrac == null ? 1 : state.maskFrac;
      // the soft body lattice: rows 9-21, row 22 carries the on / decor flags.
      // Every letter must write the rows (the buffer is reused across frames).
      for (let row = LATTICE_ROW0; row <= LATTICE_FLAGS_ROW; row += 1) {
        const base = at(row);
        data[base] = 0;
        data[base + 1] = 0;
        data[base + 2] = 0;
        data[base + 3] = 0;
      }
      const lattice = state.softLattice;
      if (lattice && lattice.length >= LATTICE_POINTS * 2) {
        for (let point = 0; point < LATTICE_POINTS; point += 1) {
          const row = LATTICE_ROW0 + (point >> 1);
          const offset = (point & 1) * 2;
          data[at(row) + offset] = lattice[point * 2] || 0;
          data[at(row) + offset + 1] = lattice[point * 2 + 1] || 0;
        }
        data[at(LATTICE_FLAGS_ROW)] = 1;
      }
      // row 22.yzw rides the per-glyph dissolve (cell scale, progress, edge
      // width): only x was ever read from this row, so the dissolve needs no
      // extra row. 0 progress leaves the glyph untouched.
      const dissolve = state.dissolve || null;
      data[at(LATTICE_FLAGS_ROW) + 1] = dissolve ? dissolve.scale || 0 : 0;
      data[at(LATTICE_FLAGS_ROW) + 2] = dissolve ? dissolve.progress || 0 : 0;
      data[at(LATTICE_FLAGS_ROW) + 3] = dissolve ? dissolve.edge || 0 : 0;
      // row 25 rides the dissolve mode / direction / bias. Every letter must
      // write it (the buffer is reused across frames), so 0 when unused.
      data[at(DISSOLVE_ROW)] = dissolve ? dissolve.mode || 0 : 0;
      data[at(DISSOLVE_ROW) + 1] = dissolve && dissolve.dir ? dissolve.dir.x || 0 : 0;
      data[at(DISSOLVE_ROW) + 2] = dissolve && dissolve.dir ? dissolve.dir.y || 0 : 0;
      data[at(DISSOLVE_ROW) + 3] = dissolve ? dissolve.bias || 0 : 0;
      // dust shares the sand rows with its own layout (windX, windY, size,
      // turbulence / spread, amount); row 24.zw stays the em info slot.
      const sand = state.sand || null;
      const dust = !sand && state.dust ? state.dust : null;
      if (dust) {
        data[at(SAND_ROW)] = dust.windX || 0;
        data[at(SAND_ROW) + 1] = dust.windY || 0;
        data[at(SAND_ROW) + 2] = dust.size || 0;
        data[at(SAND_ROW) + 3] = dust.turbulence || 0;
        data[at(SAND_ROW2)] = dust.spread || 0;
        data[at(SAND_ROW2) + 1] = dust.amount || 0;
      } else {
        data[at(SAND_ROW)] = sand ? sand.wind || 0 : 0;
        data[at(SAND_ROW) + 1] = sand ? sand.gravity || 0 : 0;
        data[at(SAND_ROW) + 2] = sand ? sand.grain || 0 : 0;
        data[at(SAND_ROW) + 3] = sand && sand.pile ? 1 : 0;
        data[at(SAND_ROW2)] = sand ? sand.spread || 0 : 0;
        data[at(SAND_ROW2) + 1] = sand ? sand.strength || 0 : 0;
      }
      data[at(SAND_ROW2) + 2] = 0;
      data[at(SAND_ROW2) + 3] = 0;
      data[at(4)] = REP_CODES[state.represent] == null ? 0 : REP_CODES[state.represent];
      data[at(4) + 1] = state.reprProgress == null ? 1 : state.reprProgress;
      data[at(4) + 2] = state.colorMix || 0;
      data[at(4) + 3] = (i % 97) / 97;
    }
  }

  // --- batches -----------------------------------------------------------------

  // The splitTone em box per scene, so the passes that rewrite the state
  // texture without a mesh batch (letterBlur, textBackground) can keep row
  // 24.zw intact.
  let emInfoByScene = new WeakMap();

  function writeEmInfo(data, stride, emInfo, count) {
    if (!emInfo || emInfo.length < count * 2) return;
    for (let i = 0; i < count; i += 1) {
      data[(SAND_ROW2 * stride + i) * 4 + 2] = emInfo[i * 2];
      data[(SAND_ROW2 * stride + i) * 4 + 3] = emInfo[i * 2 + 1];
    }
  }

  // Per-letter em-box descriptor for the splitTone fill (basis 'em'): the em
  // centre and half-height expressed in the ink-normalised space the fill
  // shader reads (q in -0.5..0.5, y down). Pure: letters carry
  // ascent / descent (px at render size), meshes carry the ink bbox + scale.
  // The mesh origin is the pen (baseline) position.
  function packEmInfo(letters, meshes) {
    const out = new Float32Array(letters.length * 2);
    for (let i = 0; i < letters.length; i += 1) {
      const letter = letters[i] || {};
      const mesh = (meshes && meshes[i]) || {};
      const size = Number(letter.size) || 0;
      const ascent = letter.ascent != null ? Number(letter.ascent) : size * 0.88;
      const descent = letter.descent != null ? Number(letter.descent) : size * 0.12;
      const scale = mesh.scale || 1;
      const bb = mesh.bbox || { x0: 0, y0: 0, x1: 0, y1: 0 };
      const cy = ((bb.y0 + bb.y1) / 2) * scale;
      const halfH = Math.max(1e-3, ((bb.y1 - bb.y0) / 2) * scale);
      const top = -ascent;
      const bottom = descent;
      out[i * 2] = ((top + bottom) / 2 - cy) / halfH;
      out[i * 2 + 1] = ((bottom - top) / 2) / halfH;
    }
    return out;
  }

  function meshAttributes(gl, scene) {
    const positions = [];
    const indices = [];
    const colors = new Uint8Array(scene.letters.length * 4);
    const meshes = [];
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
      // the text pass draws the subdivided mesh: non-linear deformation of
      // earcut's long slivers would show as faceted edges
      const fill = mesh.fillFine || mesh.fill;
      const source = fill.positions;
      for (let j = 0; j < source.length; j += 2) {
        positions.push(source[j] * scale - cx, source[j + 1] * scale - cy, i, halfW, halfH);
      }
      const localIndices = fill.indices;
      for (let j = 0; j < localIndices.length; j += 1) indices.push(base + localIndices[j]);
      const color = letter.color || { r: 1, g: 1, b: 1, a: 1 };
      colors[i * 4] = Math.round(clamp01(color.r) * 255);
      colors[i * 4 + 1] = Math.round(clamp01(color.g) * 255);
      colors[i * 4 + 2] = Math.round(clamp01(color.b) * 255);
      colors[i * 4 + 3] = Math.round(clamp01(color.a) * 255);
      meshes.push(mesh);
    }
    const emInfo = packEmInfo(scene.letters, meshes);
    return { positions, indices, colors, emInfo };
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
    const { positions, indices, colors, emInfo } = meshAttributes(gl, scene);
    const batch = makeVao(gl, positions, indices, { stride: 20 });
    batch.colors = colors;
    batch.emInfo = emInfo;
    emInfoByScene.set(scene, emInfo);
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
      // The quad rides the letter's own ink box — the same box, and the same
      // centre, the glyph mesh is built on — so a shape lands on its letter
      // instead of on the advance cell, which sits lower and is a different
      // aspect. `a_inkToCell` is therefore 0 here; `a_em` stays the em square
      // for the shapes authored in em.
      const box = SA.textBg ? SA.textBg.inkBoxFor(letter) : { w: letter.size || 1, h: letter.size || 1 };
      const em = Math.max(1, Number(letter.size) || 1);
      const base = positions.length / 9;
      for (const [cx, cy] of corners) {
        positions.push(cx, cy, i, 0, 0, box.w, box.h, em, em);
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

  // Sand: `grains` interior points per letter in the mesh's letter-local
  // space (centered on the bbox), so the grains sit exactly on the glyph.
  // extra = (random, size factor), centroid is unused. Dust reuses the same
  // layout with more grains; the per-letter thinning comes from the state.
  function buildSandBatch(gl, scene, grains) {
    const count = Math.max(1, Math.round(grains) || SAND_GRAINS);
    const positions = [];
    for (let i = 0; i < scene.letters.length; i += 1) {
      const letter = scene.letters[i];
      const mesh = SA.lyricsScene.meshOf(letter);
      const scale = mesh.scale || 1;
      const bb = mesh.bbox || { x0: 0, y0: 0, x1: 0, y1: 0 };
      const cx = ((bb.x0 + bb.x1) / 2) * scale;
      const cy = ((bb.y0 + bb.y1) / 2) * scale;
      const halfW = Math.max(1, ((bb.x1 - bb.x0) / 2) * scale);
      const halfH = Math.max(1, ((bb.y1 - bb.y0) / 2) * scale);
      const fill = mesh.fill;
      if (!fill || !fill.positions || !fill.positions.length) continue;
      const scaled = { positions: new Float32Array(fill.positions.length), indices: fill.indices };
      for (let j = 0; j < fill.positions.length; j += 1) scaled.positions[j] = fill.positions[j] * scale;
      const random = SA.rng.rngFor(0x5a4d, letter.path, 'sand');
      const samples = SA.geometry.sampleInterior(scaled, count, random);
      for (let j = 0; j < count; j += 1) {
        const rnd = ((i * 31 + j * 17) % 97) / 97;
        const size = 0.55 + ((j * 53 + i * 7) % 11) / 11 * 0.9;
        positions.push(samples[j * 2] - cx, samples[j * 2 + 1] - cy, i, halfW, halfH, rnd, size, 0, 0);
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
      sand: buildSandBatch(gl, scene),
      dust: buildSandBatch(gl, scene, DUST_GRAINS),
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
        if (/^u_(type|repMode|count|octaves|mode|mode2|mode3|kind)$/.test(name)) gl.uniform1i(location, Math.round(value));
        else gl.uniform1f(location, value);
      } else if (Array.isArray(value)) {
        if (value.length === 2) gl.uniform2f(location, value[0], value[1]);
        else if (value.length === 3) gl.uniform3f(location, value[0], value[1], value[2]);
        else if (value.length === 4) gl.uniform4f(location, value[0], value[1], value[2], value[3]);
      }
    }
  }

  function createProgramSafe(gl, vert, frag, attribs) {
    return SA.gl.createProgramSafe(gl, vert, frag, attribs);
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
      mask: createProgramSafe(gl, SA.glShaders.QUAD_VERT, SA.glShaders.MASK_FRAG),
      composite: createProgramSafe(gl, SA.glShaders.QUAD_VERT, SA.glShaders.COMPOSITE_FRAG),
      blurField: createProgramSafe(gl, SA.glShaders.BLUR_FIELD_VERT, SA.glShaders.BLUR_FIELD_FRAG, ['a_corner', 'a_letter', 'a_inkToCell', 'a_cell', 'a_em']),
      blur: createProgramSafe(gl, SA.glShaders.QUAD_VERT, SA.glShaders.TEXT_VBLUR_FRAG),
    };
    void opts;
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
        // the baked text mask (glyph alpha + a padding ring) the clip layers
        // are knocked out with; full resolution RGBA8
        mask: make(width, height),
        scene: make(width, height),
        postA: make(width, height),
        postB: make(width, height),
        blurField: make(width, height),
        blurA: make(width, height),
        blurB: make(width, height),
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
      for (const key of ['text', 'info', 'layer', 'mask', 'scene', 'postA', 'postB', 'blurField', 'blurA', 'blurB']) {
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

    // A full-frame mathematical field (gl/fields.js) drawn into the bound layer.
    // The program of each field is compiled the first time it is drawn; a field
    // whose shader does not build is skipped for the rest of the session.
    const fieldPrograms = new Map();
    let simRunner = null;
    function simTexture(field) {
      // without float render targets (or the module) the sim is simply not drawn
      if (opts.floatTargets === false || !SA.glSim) return null;
      if (!simRunner) simRunner = SA.glSim.createRunner(gl, { floatTargets: true });
      return simRunner.textureFor(field);
    }
    function drawField(field, frame) {
      if (!field || !SA.glFields || !SA.color) return false;
      let entry = fieldPrograms.get(field.id);
      if (entry === undefined) {
        const source = SA.glFields.fragment(field.id);
        entry = source ? createProgramSafe(gl, SA.glShaders.QUAD_VERT, source) : null;
        fieldPrograms.set(field.id, entry);
      }
      if (!entry) return false;
      // a simulated field is not a formula: its state has to be carried to this
      // frame's step first, and the texture handed to the display shader
      let simTex = null;
      if (SA.glFields.simOf(field.id)) {
        simTex = simTexture(field);
        if (!simTex) return false;
      }
      const rgb = (hex) => {
        const parsed = SA.color.parse(hex);
        return [parsed.r, parsed.g, parsed.b];
      };
      gl.useProgram(entry.program);
      if (simTex && entry.uniforms.u_sim) {
        gl.activeTexture(gl.TEXTURE5);
        gl.bindTexture(gl.TEXTURE_2D, simTex.texture);
        gl.uniform1i(entry.uniforms.u_sim, 5);
      }
      applyUniforms(gl, entry, SA.glFields.uniformsOf(field, frame, rgb));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return true;
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
      stateData = new Float32Array(stateCapacity * STATE_ROWS * 4);
      gl.bindTexture(gl.TEXTURE_2D, stateTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, stateCapacity, STATE_ROWS, 0, gl.RGBA, gl.FLOAT, null);
    }

    function ensureColorTexture(count) {
      if (count <= 0) return;
      if (count <= colorData.length / 4) return;
      colorData = new Uint8Array(Math.max(16, count) * 4);
      gl.bindTexture(gl.TEXTURE_2D, colorTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, Math.max(16, count), 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }

    function uploadState(states, batch, colorOverride) {
      ensureStateTexture(states.length);
      ensureColorTexture(states.length);
      packStateRows(states, stateData, states.length);
      // row 24.zw: em centre / em half (splitTone basis em)
      writeEmInfo(stateData, states.length, batch && batch.emInfo, states.length);
      if (colorOverride) colorData.set(colorOverride.subarray(0, Math.min(colorOverride.length, colorData.length)));
      else colorData.set(batch.colors.subarray(0, Math.min(batch.colors.length, colorData.length)));
      gl.bindTexture(gl.TEXTURE_2D, stateTexture);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, states.length, STATE_ROWS, gl.RGBA, gl.FLOAT, stateData.subarray(0, states.length * STATE_ROWS * 4));
      gl.bindTexture(gl.TEXTURE_2D, colorTexture);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, states.length, 1, gl.RGBA, gl.UNSIGNED_BYTE, colorData.subarray(0, states.length * 4));
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, stateTexture);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, colorTexture);
    }

    // Uploads the per-letter state and draws the mesh into the currently bound
    // target. The caller owns the framebuffer, viewport, clear and blend state,
    // so several scenes can stack into one target without clearing in between.
    function drawTextMesh(batchSet, batch, states, colorOverride) {
      uploadState(states, batchSet.mesh || batch, colorOverride);
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
      drawTextMesh(batchSet, batch, states, colorOverride);
    }

    // Bakes every visible beat's glyphs into targets.mask: one clear, then the
    // meshes stacked without clearing, then the sdf pass and MASK_FRAG. The
    // glyph alpha alone is the mask when the environment has no float targets.
    // `entries` is [{ scene, letters, variant, colorOverride }].
    function buildTextMask(entries, options) {
      if (!targets || !targets.mask || !entries || !entries.length) return false;
      const opts = options || {};
      gl.bindFramebuffer(gl.FRAMEBUFFER, targets.textFramebuffer);
      gl.viewport(0, 0, width, height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      let drawn = false;
      for (const entry of entries) {
        if (!entry || !entry.scene || !entry.letters || !entry.letters.length) continue;
        const batchSet = sceneBatches(gl, entry.scene, entry.variant);
        const batch = batchSet.mesh;
        if (!batch || !batch.count) continue;
        drawTextMesh(batchSet, batch, entry.letters, entry.colorOverride);
        drawn = true;
      }
      if (!drawn) return false;
      const maxDistance = Math.max(1, Math.max(width, height) * 0.1);
      const sdfTarget = sdfPass.run(targets.text.texture, width, height, maxDistance);
      gl.disable(gl.BLEND);
      bind(targets.mask, null);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, targets.text.texture);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, sdfTarget ? sdfTarget.texture : targets.text.texture);
      gl.useProgram(programs.mask.program);
      gl.uniform1i(programs.mask.uniforms.u_text, 0);
      gl.uniform1i(programs.mask.uniforms.u_sdf, 1);
      gl.uniform1f(programs.mask.uniforms.u_strength, clamp01(opts.strength == null ? 1 : opts.strength));
      gl.uniform1f(programs.mask.uniforms.u_radius, Math.max(0, Number(opts.radius) || 0) / maxDistance);
      gl.uniform1f(programs.mask.uniforms.u_feather, Math.max(0, Number(opts.feather) || 0) / maxDistance);
      gl.uniform1f(programs.mask.uniforms.u_sdfAmount, sdfTarget ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.activeTexture(gl.TEXTURE0);
      return true;
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

    // Per-letter blur: renders the blur radius of every letter into a field
    // (max blended, so a pixel sees the largest radius around it), then blurs
    // the text colour with two 13-tap passes. The info attachment is left
    // alone; only the colour attachment 0 is exchanged.
    function letterBlur(scene, states, variant) {
      if (!targets || !states || !states.length) return false;
      let maxBlur = 0;
      for (const state of states) {
        const blur = Number(state && state.blur) || 0;
        if (blur > maxBlur) maxBlur = blur;
      }
      if (maxBlur <= 0.25) return false;
      const batch = sceneBatches(gl, scene, variant).bg;
      if (!batch || !batch.count) return false;
      ensureStateTexture(states.length);
      ensureColorTexture(states.length);
      packStateRows(states, stateData, states.length);
      writeEmInfo(stateData, states.length, emInfoByScene.get(scene), states.length);
      gl.bindTexture(gl.TEXTURE_2D, stateTexture);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, states.length, STATE_ROWS, gl.RGBA, gl.FLOAT, stateData.subarray(0, states.length * STATE_ROWS * 4));

      // 1) the blur field: one expanded quad per letter, max blended
      gl.bindFramebuffer(gl.FRAMEBUFFER, targets.blurField.framebuffer);
      gl.viewport(0, 0, width, height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.MAX);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(programs.blurField.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, stateTexture);
      gl.uniform1i(programs.blurField.uniforms.u_state, 0);
      gl.uniform2f(programs.blurField.uniforms.u_resolution, width, height);
      gl.bindVertexArray(batch.vao);
      gl.drawElements(gl.TRIANGLES, batch.count, gl.UNSIGNED_INT, 0);
      gl.bindVertexArray(null);
      gl.blendEquation(gl.FUNC_ADD);
      gl.disable(gl.BLEND);

      // 2) horizontal and vertical gaussian passes
      const blurPass = (source, target, dx, dy) => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
        gl.viewport(0, 0, target.width, target.height);
        gl.disable(gl.BLEND);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, source.texture);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, targets.blurField.texture);
        gl.useProgram(programs.blur.program);
        gl.uniform1i(programs.blur.uniforms.u_text, 0);
        gl.uniform1i(programs.blur.uniforms.u_field, 1);
        gl.uniform2f(programs.blur.uniforms.u_texel, 1 / Math.max(1, width), 1 / Math.max(1, height));
        gl.uniform2f(programs.blur.uniforms.u_direction, dx, dy);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      };
      blurPass(targets.text, targets.blurA, 1, 0);
      blurPass(targets.blurA, targets.blurB, 0, 1);

      // 3) write the blurred colour back into attachment 0, keep the info
      gl.bindFramebuffer(gl.FRAMEBUFFER, targets.textFramebuffer);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
      gl.viewport(0, 0, width, height);
      gl.disable(gl.BLEND);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, targets.blurB.texture);
      gl.useProgram(programs.copy.program);
      gl.uniform1i(programs.copy.uniforms.u_texture, 0);
      gl.uniform1f(programs.copy.uniforms.u_opacity, 1);
      if (programs.copy.uniforms.u_offset) gl.uniform2f(programs.copy.uniforms.u_offset, 0, 0);
      if (programs.copy.uniforms.u_scale) gl.uniform1f(programs.copy.uniforms.u_scale, 1);
      if (programs.copy.uniforms.u_angle) gl.uniform1f(programs.copy.uniforms.u_angle, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
      gl.activeTexture(gl.TEXTURE0);
      return true;
    }

    function ensureBgStateTexture(count) {
      if (count <= bgStateCapacity) return;
      bgStateCapacity = Math.max(16, count);
      bgStateData = new Float32Array(bgStateCapacity * BG_STATE_ROWS * 4);
      if (!bgStateTexture) bgStateTexture = SA.gl.createTexture(gl, {});
      gl.bindTexture(gl.TEXTURE_2D, bgStateTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, bgStateCapacity, BG_STATE_ROWS, 0, gl.RGBA, gl.FLOAT, null);
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
        // row 4 w rides the bubble body+tail code (body * 4 + tail); the old
        // `roughness` never reached the fragment shader, and every other
        // shape uploads 0, which the shader ignores
        bgStateData[(4 * stride + i) * 4 + 3] = state.tailCode == null ? 0 : state.tailCode;
        // row 5: trim (start, end, offset) + outline stroke; row 6: dash
        // (on, off, offset) + the interior fill amount (bgMotion.draw)
        const trim = Array.isArray(state.trim) ? state.trim : [0, 1, 0];
        const dash = Array.isArray(state.dash) ? state.dash : [0, 0, 0];
        bgStateData[(5 * stride + i) * 4] = trim[0];
        bgStateData[(5 * stride + i) * 4 + 1] = trim[1];
        bgStateData[(5 * stride + i) * 4 + 2] = trim[2] == null ? 0 : trim[2];
        bgStateData[(5 * stride + i) * 4 + 3] = state.stroke == null ? 0 : state.stroke;
        bgStateData[(6 * stride + i) * 4] = dash[0];
        bgStateData[(6 * stride + i) * 4 + 1] = dash[1] == null ? 0 : dash[1];
        bgStateData[(6 * stride + i) * 4 + 2] = dash[2] == null ? 0 : dash[2];
        bgStateData[(6 * stride + i) * 4 + 3] = state.fill == null ? 1 : state.fill;
      }
      gl.bindTexture(gl.TEXTURE_2D, bgStateTexture);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, states.length, BG_STATE_ROWS, gl.RGBA, gl.FLOAT, bgStateData.subarray(0, states.length * BG_STATE_ROWS * 4));
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
      packStateRows(states, stateData, states.length);
      writeEmInfo(stateData, states.length, emInfoByScene.get(scene), states.length);
      if (mesh) colorData.set(mesh.colors.subarray(0, Math.min(mesh.colors.length, colorData.length)));
      gl.bindTexture(gl.TEXTURE_2D, stateTexture);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, states.length, STATE_ROWS, gl.RGBA, gl.FLOAT, stateData.subarray(0, states.length * STATE_ROWS * 4));
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
    function knockoutTexture(texture) {
      if (!texture) return;
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
      bind(targets.layer, null);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.useProgram(programs.copy.program);
      gl.uniform1i(programs.copy.uniforms.u_texture, 0);
      gl.uniform1f(programs.copy.uniforms.u_opacity, 1);
      if (programs.copy.uniforms.u_offset) gl.uniform2f(programs.copy.uniforms.u_offset, 0, 0);
      if (programs.copy.uniforms.u_scale) gl.uniform1f(programs.copy.uniforms.u_scale, 1);
      if (programs.copy.uniforms.u_angle) gl.uniform1f(programs.copy.uniforms.u_angle, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.activeTexture(gl.TEXTURE0);
    }

    function knockout() {
      if (!targets.text) return;
      knockoutTexture(targets.text.texture);
    }

    // Punches the baked text mask (glyphs + padding ring) out of the current
    // layer: the figure / accent layers float behind the subtitle glyphs.
    function maskLayer() {
      if (!targets.mask) return;
      knockoutTexture(targets.mask.texture);
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
      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D, stateTexture);
      gl.useProgram(programs.fill.program);
      const values = { ...uniforms, u_resolution: [width, height] };
      applyUniforms(gl, programs.fill, values);
      gl.uniform1i(programs.fill.uniforms.u_text, 0);
      gl.uniform1i(programs.fill.uniforms.u_info, 1);
      gl.uniform1i(programs.fill.uniforms.u_sdf, 2);
      gl.uniform1i(programs.fill.uniforms.u_image, 3);
      if (programs.fill.uniforms.u_state) gl.uniform1i(programs.fill.uniforms.u_state, 4);
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
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, targets.mask ? targets.mask.texture : targets.text.texture);
      gl.useProgram(programs.post.program);
      applyUniforms(gl, programs.post, { ...uniforms, u_resolution: [width, height] });
      gl.uniform1i(programs.post.uniforms.u_text, 0);
      gl.uniform1i(programs.post.uniforms.u_sdf, 1);
      gl.uniform1i(programs.post.uniforms.u_mask, 2);
      // a text-target post moves with the letters: it is never masked
      gl.uniform1f(programs.post.uniforms.u_maskAmount, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.activeTexture(gl.TEXTURE0);
      // swap layer and postA
      const layer = targets.layer;
      targets.layer = targets.postA;
      targets.postA = layer;
    }

    // Applies one frame-wide graphic over the whole picture. With `options.mask`
    // the baked text mask is composited back from the source: the glyphs (and
    // their padding ring) are restored, so a light leak, a shape layer or a
    // camera move can never cover the subtitle.
    function postFrame(uniforms, options) {
      const opts = options || {};
      const source = targets.scene;
      const target = targets.postB;
      gl.disable(gl.BLEND);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(0, 0, target.width, target.height);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, source.texture);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, targets.text.texture);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, targets.mask ? targets.mask.texture : targets.text.texture);
      gl.useProgram(programs.post.program);
      applyUniforms(gl, programs.post, { ...uniforms, u_resolution: [width, height] });
      gl.uniform1i(programs.post.uniforms.u_text, 0);
      gl.uniform1i(programs.post.uniforms.u_sdf, 1);
      gl.uniform1i(programs.post.uniforms.u_mask, 2);
      gl.uniform1f(programs.post.uniforms.u_maskAmount, opts.mask ? 1 : 0);
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
      for (const program of fieldPrograms.values()) {
        if (program) gl.deleteProgram(program.program);
      }
      fieldPrograms.clear();
      // the simulations hold their own ping-pong pairs and keyframes
      if (simRunner) simRunner.dispose();
      simRunner = null;
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
      drawField,
      text,
      textBackground,
      buildTextMask,
      letterBlur,
      knockout,
      maskLayer,
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
      _test: { deformSlots, packStateRows, packEmInfo, STATE_ROWS, BG_STATE_ROWS },
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
      stateData = new Float32Array(stateCapacity * STATE_ROWS * 4);
      gl.bindTexture(gl.TEXTURE_2D, stateTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, stateCapacity, STATE_ROWS, 0, gl.RGBA, gl.FLOAT, null);
    }

    function ensureColorTexture(count) {
      if (count <= colorCapacity) return;
      colorCapacity = Math.max(16, count);
      colorData = new Uint8Array(colorCapacity * 4);
      gl.bindTexture(gl.TEXTURE_2D, colorTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, colorCapacity, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }

    // The fallback shares the 9-row layout of the full pipeline so the shader
    // sees the same deform slots, block-warp origin and wipe fields.
    function packStates(states) {
      packStateRows(states, stateData, states.length);
    }

    function draw(glState, scene, states, resolution) {
      const batch = sceneBatch(gl, scene);
      if (!batch.count) return 0;
      ensureStateTexture(states.length);
      ensureColorTexture(states.length);
      packStates(states);
      colorData.set(batch.colors.subarray(0, Math.min(batch.colors.length, colorData.length)));
      gl.bindTexture(gl.TEXTURE_2D, stateTexture);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, states.length, STATE_ROWS, gl.RGBA, gl.FLOAT, stateData.subarray(0, states.length * STATE_ROWS * 4));
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
      gl.uniform4f(compositeProgram.uniforms.u_clearColor, clearColor[0], clearColor[1], clearColor[2], clearColor[3] == null ? 1 : clearColor[3]);
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
    // pure helpers, exposed for the unit tests (no GL context needed)
    _test: { deformSlots, packStateRows, packEmInfo, STATE_ROWS, BG_STATE_ROWS },
  };
})();
