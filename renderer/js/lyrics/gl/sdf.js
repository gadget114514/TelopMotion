window.SA = window.SA || {};

SA.glSdf = (() => {
  'use strict';

  const SEED_VERT = `#version 300 es
  precision highp float;
  out vec2 v_uv;
  void main() {
    vec2 pos = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
    v_uv = pos;
    gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
  }`;

  const SEED_FRAG = `#version 300 es
  precision highp float;
  in vec2 v_uv;
  uniform sampler2D u_mask;
  uniform vec2 u_size;
  out vec4 fragColor;
  float maskAt(vec2 uv) {
    vec2 clamped = clamp(uv, vec2(0.0), vec2(1.0));
    return texture(u_mask, clamped).a;
  }
  void main() {
    float center = maskAt(v_uv);
    float edge = 0.0;
    vec2 texel = 1.0 / u_size;
    if (abs(center - maskAt(v_uv + vec2(texel.x, 0.0))) > 0.05) edge = 1.0;
    if (abs(center - maskAt(v_uv - vec2(texel.x, 0.0))) > 0.05) edge = 1.0;
    if (abs(center - maskAt(v_uv + vec2(0.0, texel.y))) > 0.05) edge = 1.0;
    if (abs(center - maskAt(v_uv - vec2(0.0, texel.y))) > 0.05) edge = 1.0;
    fragColor = vec4(edge > 0.5 ? v_uv * u_size : vec2(-1.0), 0.0, 1.0);
  }`;

  const STEP_FRAG = `#version 300 es
  precision highp float;
  in vec2 v_uv;
  uniform sampler2D u_prev;
  uniform vec2 u_size;
  uniform float u_step;
  out vec4 fragColor;
  vec2 nearest(vec2 uv) {
    vec2 point = uv * u_size;
    vec2 best = texelFetch(u_prev, ivec2(uv * u_size), 0).rg;
    float bestDistance = best.x < 0.0 ? 1e9 : distance(best, point);
    for (int y = -1; y <= 1; y += 1) {
      for (int x = -1; x <= 1; x += 1) {
        vec2 offset = vec2(float(x), float(y)) * u_step;
        vec2 sampleUv = uv + offset / u_size;
        if (sampleUv.x < 0.0 || sampleUv.x > 1.0 || sampleUv.y < 0.0 || sampleUv.y > 1.0) continue;
        vec2 candidate = texelFetch(u_prev, ivec2(sampleUv * u_size), 0).rg;
        if (candidate.x < 0.0) continue;
        float candidateDistance = distance(candidate, point);
        if (candidateDistance < bestDistance) {
          bestDistance = candidateDistance;
          best = candidate;
        }
      }
    }
    return best;
  }
  void main() {
    fragColor = vec4(nearest(v_uv), 0.0, 1.0);
  }`;

  const RESOLVE_FRAG = `#version 300 es
  precision highp float;
  in vec2 v_uv;
  uniform sampler2D u_seed;
  uniform sampler2D u_mask;
  uniform vec2 u_size;
  uniform float u_maxDistance;
  out vec4 fragColor;
  void main() {
    vec2 point = v_uv * u_size;
    vec2 seed = texelFetch(u_seed, ivec2(point), 0).rg;
    float inside = step(0.5, texture(u_mask, v_uv).a);
    float signed = 1.0;
    if (seed.x >= 0.0) {
      float distance = length(seed - point);
      signed = inside > 0.5 ? -distance : distance;
    } else {
      // no mask edge anywhere in the field (a beat whose letters are all
      // invisible): there is no shape to outline, so report a sentinel the
      // consumers can tell apart from a real outside distance. Without it the
      // edge pass reads the empty field as "just outside" everywhere and
      // paints a frame-sized outline / glow over the beat.
      signed = -1000.0 * u_maxDistance;
    }
    fragColor = vec4(signed / u_maxDistance, texture(u_mask, v_uv).a, 0.0, 1.0);
  }`;

  function jumpSteps(size) {
    const steps = [];
    let k = 1;
    while (k * 2 < size) k *= 2;
    while (k >= 1) {
      steps.push(k);
      k = Math.floor(k / 2);
    }
    return steps;
  }

  function createSdfPass(gl, options) {
    const floatTargets = !!(options && options.floatTargets);
    const seedProgram = SA.gl.createProgram(gl, SEED_VERT, SEED_FRAG);
    const stepProgram = SA.gl.createProgram(gl, SEED_VERT, STEP_FRAG);
    const resolveProgram = SA.gl.createProgram(gl, SEED_VERT, RESOLVE_FRAG);
    let a = null;
    let b = null;

    function ensure(width, height) {
      const halfWidth = Math.max(1, Math.floor(width / 2));
      const halfHeight = Math.max(1, Math.floor(height / 2));
      if (!a || a.width !== halfWidth || a.height !== halfHeight) {
        if (a) SA.gl.deleteTarget(gl, a);
        if (b) SA.gl.deleteTarget(gl, b);
        a = SA.gl.createTarget(gl, halfWidth, halfHeight, gl.RG16F, gl.RG, gl.FLOAT);
        b = SA.gl.createTarget(gl, halfWidth, halfHeight, gl.RG16F, gl.RG, gl.FLOAT);
      }
      return { halfWidth, halfHeight };
    }

    function run(maskTexture, width, height, maxDistance) {
      if (!floatTargets) return null;
      const { halfWidth, halfHeight } = ensure(width, height);
      gl.disable(gl.BLEND);
      gl.bindFramebuffer(gl.FRAMEBUFFER, a.framebuffer);
      gl.viewport(0, 0, halfWidth, halfHeight);
      gl.useProgram(seedProgram.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, maskTexture);
      gl.uniform1i(seedProgram.uniforms.u_mask, 0);
      gl.uniform2f(seedProgram.uniforms.u_size, halfWidth, halfHeight);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      const steps = jumpSteps(Math.max(halfWidth, halfHeight));
      let source = a;
      let target = b;
      gl.useProgram(stepProgram.program);
      gl.uniform1i(stepProgram.uniforms.u_prev, 0);
      gl.uniform2f(stepProgram.uniforms.u_size, halfWidth, halfHeight);
      for (const step of steps) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
        gl.viewport(0, 0, halfWidth, halfHeight);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, source.texture);
        gl.uniform1f(stepProgram.uniforms.u_step, step);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        const swap = source;
        source = target;
        target = swap;
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(0, 0, halfWidth, halfHeight);
      gl.useProgram(resolveProgram.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, source.texture);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, maskTexture);
      gl.uniform1i(resolveProgram.uniforms.u_seed, 0);
      gl.uniform1i(resolveProgram.uniforms.u_mask, 1);
      gl.uniform2f(resolveProgram.uniforms.u_size, halfWidth, halfHeight);
      gl.uniform1f(resolveProgram.uniforms.u_maxDistance, maxDistance || Math.max(halfWidth, halfHeight) * 0.25);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.activeTexture(gl.TEXTURE0);
      return target;
    }

    function dispose() {
      gl.deleteProgram(seedProgram.program);
      gl.deleteProgram(stepProgram.program);
      gl.deleteProgram(resolveProgram.program);
      if (a) SA.gl.deleteTarget(gl, a);
      if (b) SA.gl.deleteTarget(gl, b);
    }

    return { run, dispose, jumpSteps: () => jumpSteps(1024) };
  }

  return { createSdfPass, jumpSteps, SEED_FRAG, STEP_FRAG, RESOLVE_FRAG };
})();
