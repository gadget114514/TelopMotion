'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const layers = require('../../renderer/js/lyrics/gl/layers.js');

test('fitRect covers, contains, stretches and keeps actual size', () => {
  const cover = layers.fitRect('cover', 100, 50, 200, 200);
  assert.equal(cover.w, 400);
  assert.equal(cover.h, 200);
  assert.equal(cover.x, -100);
  assert.equal(cover.y, 0);
  const contain = layers.fitRect('contain', 100, 50, 200, 200);
  assert.equal(contain.w, 200);
  assert.equal(contain.h, 100);
  assert.equal(contain.x, 0);
  assert.equal(contain.y, 50);
  const stretch = layers.fitRect('stretch', 10, 10, 320, 180);
  assert.deepEqual(stretch, { x: 0, y: 0, w: 320, h: 180 });
  const actual = layers.fitRect('actual', 64, 32, 320, 180);
  assert.equal(actual.w, 64);
  assert.equal(actual.h, 32);
  assert.equal(actual.x, 128);
  assert.equal(actual.y, 74);
  assert.deepEqual(layers.fitRect('contain', 0, 0, 320, 180), { x: 0, y: 0, w: 320, h: 180 });
});

test('parseColor accepts hex strings, objects and rejects junk', () => {
  assert.deepEqual(layers.parseColor('#ff0000'), [1, 0, 0, 1]);
  assert.deepEqual(layers.parseColor('#0f0'), [0, 1, 0, 1]);
  const withAlpha = layers.parseColor('#0000ff80');
  assert.equal(withAlpha[2], 1);
  assert.ok(Math.abs(withAlpha[3] - 128 / 255) < 1e-6);
  assert.deepEqual(layers.parseColor({ value: '#ffffff' }), [1, 1, 1, 1]);
  assert.deepEqual(layers.parseColor('nope'), [0, 0, 0, 1]);
});

test('evaluateLayerMotion ramps in and out and hides outside the window', () => {
  const layer = {
    id: 'motion-layer',
    start: 2,
    end: 6,
    motion: { in: { type: 'fade', duration: 1, delay: 0 }, out: { type: 'fade', duration: 1, delay: 0 } },
  };
  const frame = { width: 320, height: 180 };
  assert.equal(layers.evaluateLayerMotion(layer, 1, frame).visible, false);
  assert.equal(layers.evaluateLayerMotion(layer, 7, frame).visible, false);
  assert.ok(layers.evaluateLayerMotion(layer, 2, frame).opacity < 0.05, 'starts transparent');
  assert.ok(Math.abs(layers.evaluateLayerMotion(layer, 3, frame).opacity - 1) < 1e-6, 'fully visible after the in ramp');
  assert.ok(Math.abs(layers.evaluateLayerMotion(layer, 4.5, frame).opacity - 1) < 1e-6, 'visible in the middle');
  const fadingOut = layers.evaluateLayerMotion(layer, 5.5, frame).opacity;
  assert.ok(fadingOut > 0.1 && fadingOut < 0.9, 'exit ramp is partial');
  assert.ok(layers.evaluateLayerMotion(layer, 6, frame).visible, 'end time is inside the window');
  const noWindow = layers.evaluateLayerMotion({ id: 'plain' }, 3, frame);
  assert.equal(noWindow.opacity, 1);
  assert.equal(noWindow.visible, true);
});

test('blendCode maps custom modes and filterState packs parameters', () => {
  assert.equal(layers.blendCode('normal'), 0);
  assert.equal(layers.blendCode('multiply'), 0);
  assert.equal(layers.blendCode('overlay'), layers.CUSTOM_BLENDS.overlay);
  assert.equal(layers.blendCode('colorBurn'), layers.CUSTOM_BLENDS.colorBurn);
  const chromatic = layers.filterState({ type: 'chromaticAberration', params: { amount: 8, radial: true } });
  assert.equal(chromatic.code, 1);
  assert.equal(chromatic.params[0], 8);
  assert.equal(chromatic.params[2], 1);
  const glitch = layers.filterState({ type: 'glitchBlocks', params: { blockSize: 16, rate: 0.5 } });
  assert.equal(glitch.code, 3);
  assert.equal(glitch.params[0], 16);
  assert.equal(glitch.params[1], 0.5);
  assert.deepEqual(layers.filterState({ type: 'none' }), { code: 0, params: [0, 0, 0, 0] });
});

test('videoTargetFor wraps loops and clamps when not looping', () => {
  const video = { duration: 4 };
  const looping = { start: 2, video: { speed: 2, offset: 0.5, loop: true } };
  const wrapped = layers.videoTargetFor(looping, 4, video);
  assert.ok(wrapped >= 0.5 && wrapped <= 4, `wrapped target in range: ${wrapped}`);
  const once = { start: 2, video: { speed: 2, offset: 0.5, loop: false } };
  const clamped = layers.videoTargetFor(once, 4, video);
  assert.ok(clamped <= video.duration, 'non-loop target never exceeds the clip');
  const plain = { video: { speed: 1, offset: 0 } };
  assert.equal(layers.videoTargetFor(plain, 1.5, video), 1.5);
});

test('create() builds a usable pass against a stub GL context', () => {
  const calls = { draws: 0, textures: 0, programs: 0, backdrops: 0 };
  const gl = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    ARRAY_BUFFER: 5,
    STATIC_DRAW: 6,
    FLOAT: 7,
    TEXTURE_2D: 8,
    RGBA: 9,
    UNSIGNED_BYTE: 10,
    TEXTURE_MIN_FILTER: 11,
    TEXTURE_MAG_FILTER: 12,
    TEXTURE_WRAP_S: 13,
    TEXTURE_WRAP_T: 14,
    LINEAR: 15,
    CLAMP_TO_EDGE: 16,
    UNPACK_PREMULTIPLY_ALPHA_WEBGL: 17,
    TEXTURE0: 18,
    TEXTURE1: 19,
    TRIANGLES: 19,
    BLEND: 20,
    SRC_ALPHA: 21,
    ONE_MINUS_SRC_ALPHA: 22,
    ONE: 23,
    DST_COLOR: 24,
    ZERO: 25,
    ONE_MINUS_SRC_COLOR: 26,
    drawingBufferWidth: 320,
    drawingBufferHeight: 180,
    createShader: () => ({}),
    shaderSource() {},
    compileShader() {},
    getShaderParameter: () => true,
    createProgram: () => {
      calls.programs += 1;
      return {};
    },
    attachShader() {},
    bindAttribLocation() {},
    linkProgram() {},
    getProgramParameter: () => true,
    getUniformLocation: () => ({}),
    getAttribLocation: () => 0,
    createVertexArray: () => ({}),
    bindVertexArray() {},
    createBuffer: () => ({}),
    bindBuffer() {},
    bufferData() {},
    enableVertexAttribArray() {},
    vertexAttribPointer() {},
    useProgram() {},
    uniform2f() {},
    uniform1f() {},
    uniform1i() {},
    uniform3f() {},
    uniform4f() {},
    uniformMatrix2fv() {},
    activeTexture() {},
    bindTexture() {},
    texImage2D() {
      calls.textures += 1;
    },
    copyTexImage2D() {
      calls.backdrops += 1;
    },
    texParameteri() {},
    pixelStorei() {},
    createTexture: () => ({}),
    deleteTexture() {},
    deleteVertexArray() {},
    deleteProgram() {},
    enable() {},
    disable() {},
    blendFuncSeparate() {},
    drawArrays() {
      calls.draws += 1;
    },
  };
  const pass = layers.create(gl);
  const drawn = pass.draw(
    [
      { id: 'a', type: 'solid', color: '#ffffff', opacity: 1 },
      { id: 'b', type: 'solid', color: '#000000', opacity: 0 },
      { id: 'c', type: 'solid', color: '#ff0000', blend: 'add' },
      { id: 'd', type: 'solid', color: '#0000ff', blend: 'overlay', start: 0 },
    ],
    { width: 320, height: 180 },
    0.5
  );
  assert.equal(drawn, 3, 'disabled/transparent layers are skipped');
  assert.equal(calls.draws, 3);
  assert.equal(calls.backdrops, 1, 'custom blend captures the backdrop once');
  assert.equal(pass.textureCount(), 0);
  pass.dispose();
});
