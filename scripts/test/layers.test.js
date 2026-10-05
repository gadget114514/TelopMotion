'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const layers = require('../../renderer/js/lyrics/gl/layers.js');

// A stub GL context: enough for create()/draw() to run without a GPU.
function makeGl(calls) {
  return {
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
    getUniformLocation: (program, name) => name,
    getAttribLocation: () => 0,
    createVertexArray: () => ({}),
    bindVertexArray() {},
    createBuffer: () => ({}),
    bindBuffer() {},
    bufferData() {},
    enableVertexAttribArray() {},
    vertexAttribPointer() {},
    useProgram() {},
    uniform2f(location, a, b) {
      calls.uniforms = calls.uniforms || {};
      (calls.uniforms[location] = calls.uniforms[location] || []).push([a, b]);
    },
    uniform1f(location, a) {
      calls.uniforms = calls.uniforms || {};
      (calls.uniforms[location] = calls.uniforms[location] || []).push([a]);
    },
    uniform1i(location, a) {
      calls.uniforms = calls.uniforms || {};
      (calls.uniforms[location] = calls.uniforms[location] || []).push([a]);
    },
    uniform3f(location, a, b, c) {
      calls.uniforms = calls.uniforms || {};
      (calls.uniforms[location] = calls.uniforms[location] || []).push([a, b, c]);
    },
    uniform4f(location, a, b, c, d) {
      calls.uniforms = calls.uniforms || {};
      (calls.uniforms[location] = calls.uniforms[location] || []).push([a, b, c, d]);
    },
    uniformMatrix2fv(location) {
      calls.uniforms = calls.uniforms || {};
      (calls.uniforms[location] = calls.uniforms[location] || []).push([]);
    },
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
}

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
  const gl = makeGl(calls);
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

test('isSceneLayer only recognises a scene3d layer', () => {
  assert.equal(layers.isSceneLayer({ type: 'scene3d' }), true);
  assert.equal(layers.isSceneLayer({ type: 'video' }), false);
  assert.equal(layers.isSceneLayer(null), false);
});

test('a scene3d layer renders through SA.three3d, uploads the frame and skips preload', async () => {
  const calls = { draws: 0, textures: 0, programs: 0, backdrops: 0 };
  const gl = makeGl(calls);
  const seen = [];
  globalThis.SA = {
    three3d: {
      render(layer, options) {
        seen.push({ layer, options });
        return { width: 320, height: 180 };
      },
    },
  };
  try {
    const pass = layers.create(gl);
    const drawn = pass.draw([{ id: 's', type: 'scene3d', scene: { preset: 'grid' } }], { width: 320, height: 180 }, 1.5);
    assert.equal(drawn, 1, 'the scene3d layer is drawn');
    assert.equal(calls.textures, 1, 'the rendered canvas is uploaded');
    assert.equal(calls.draws, 1);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].options.time, 1.5);
    assert.equal(seen[0].options.width, 320);
    assert.equal(await pass.preload([{ id: 's', type: 'scene3d' }]), 0, 'preload has nothing to fetch');
    pass.dispose();
  } finally {
    delete globalThis.SA;
  }
});

test('a scene3d layer is skipped when three is unavailable', () => {
  const calls = { draws: 0, textures: 0, programs: 0, backdrops: 0 };
  const gl = makeGl(calls);
  const pass = layers.create(gl);
  const drawn = pass.draw([{ id: 's', type: 'scene3d', scene: { preset: 'grid' } }], { width: 320, height: 180 }, 0);
  assert.equal(drawn, 0);
  assert.equal(calls.draws, 0);
  pass.dispose();
});

test('resolveLayerAt returns the layer itself when there is nothing to apply', () => {
  const layer = { id: 'a', transform: { x: 0.1 } };
  assert.equal(layers.resolveLayerAt(layer, null, 1), layer);
  assert.equal(layers.resolveLayerAt(layer, {}, 1), layer);
  assert.equal(layers.resolveLayerAt(layer, { 'layer:other': { 'transform.x': [{ t: 0, value: 5 }] } }, 1), layer);
  assert.equal(layers.resolveLayerAt(layer, { 'layer:a': {} }, 1), layer);
});

test('resolveLayerAt interpolates numbers, clamps out of range and offsets by start', () => {
  const keys = [
    { t: 0, value: 0, ease: 'linear' },
    { t: 2, value: 1, ease: 'linear' },
  ];
  const keyframes = { 'layer:a': { 'transform.x': keys } };
  const layer = { id: 'a', start: 0, transform: { x: 9, y: 0.25 } };
  const mid = layers.resolveLayerAt(layer, keyframes, 1);
  assert.ok(Math.abs(mid.transform.x - 0.5) < 1e-9, `midpoint: ${mid.transform.x}`);
  assert.equal(mid.transform.y, 0.25, 'unkeyed props keep the static value');
  assert.equal(layer.transform.x, 9, 'the input layer is not mutated');
  assert.equal(layers.resolveLayerAt(layer, keyframes, -5).transform.x, 0, 'before the first key clamps');
  assert.equal(layers.resolveLayerAt(layer, keyframes, 99).transform.x, 1, 'after the last key clamps');
  const shifted = { id: 'a', start: 2, transform: {} };
  assert.ok(Math.abs(layers.resolveLayerAt(shifted, keyframes, 3).transform.x - 0.5) < 1e-9, 'local time is relative to layer.start');
});

test('resolveLayerAt overrides opacity and crop absolutely and honours hold', () => {
  const keyframes = {
    'layer:a': {
      opacity: [
        { t: 0, value: 1, ease: 'linear' },
        { t: 1, value: 0, ease: 'linear' },
      ],
      'crop.l': [{ t: 0, value: 0.25, ease: 'linear' }],
      'transform.y': [
        { t: 0, value: 0, ease: 'hold' },
        { t: 1, value: 1, ease: 'linear' },
      ],
    },
  };
  const layer = { id: 'a', opacity: 1, transform: { y: 9 }, crop: { l: 0 } };
  const half = layers.resolveLayerAt(layer, keyframes, 0.5);
  assert.ok(Math.abs(half.opacity - 0.5) < 1e-9);
  assert.equal(half['crop'].l, 0.25);
  assert.equal(half.transform.y, 0, 'hold keeps the segment start value');
});

test('layerGeometry matches the legacy calculation with default anchor and no crop', () => {
  const width = 320;
  const height = 180;
  const rect = { x: 0, y: 0, w: width, h: height };
  const layer = { id: 'g', transform: { x: 0.1, y: -0.2, scale: 2, rotate: 30 } };
  const motion = layers.evaluateLayerMotion(layer, 0, { width, height });
  const geo = layers.layerGeometry(layer, motion, rect, width, height);
  const scale = 2 * motion.scaleX;
  const cx = rect.x + rect.w / 2 + 0.1 * width + motion.x;
  const cy = rect.y + rect.h / 2 + -0.2 * height + motion.y;
  assert.ok(Math.abs(geo.centerX - cx) < 1e-9);
  assert.ok(Math.abs(geo.centerY - cy) < 1e-9);
  assert.ok(Math.abs(geo.halfX - (rect.w * scale) / 2) < 1e-9);
  assert.ok(Math.abs(geo.halfY - (rect.h * 2 * motion.scaleY) / 2) < 1e-9);
  assert.deepEqual(geo.uvRect, [0, 0, 1, 1]);
});

test('layerGeometry keeps the anchor fixed and applies crop to rect and uv', () => {
  const width = 200;
  const height = 100;
  const rect = { x: 10, y: 20, w: width, h: height };
  const motion = { x: 0, y: 0, rot: 0, scaleX: 1, scaleY: 1 };
  const anchored = { id: 'a', transform: { rotate: 90, anchorX: 0, anchorY: 0 } };
  const geo = layers.layerGeometry(anchored, motion, rect, width, height);
  const c0x = rect.x + width / 2;
  const c0y = rect.y + height / 2;
  const px = c0x - width / 2;
  const py = c0y - height / 2;
  // the anchor's world position never moves: center - R(half) == P
  const rad = (90 * Math.PI) / 180;
  const anchorWorldX = geo.centerX - (Math.cos(rad) * geo.halfX - Math.sin(rad) * geo.halfY);
  const anchorWorldY = geo.centerY - (Math.sin(rad) * geo.halfX + Math.cos(rad) * geo.halfY);
  assert.ok(Math.abs(anchorWorldX - px) < 1e-9, `${anchorWorldX} vs ${px}`);
  assert.ok(Math.abs(anchorWorldY - py) < 1e-9, `${anchorWorldY} vs ${py}`);
  const cropped = { id: 'c', transform: {}, crop: { l: 0.5, t: 0, r: 0, b: 0 } };
  const slim = layers.layerGeometry(cropped, motion, rect, width, height);
  assert.ok(Math.abs(slim.halfX - 50) < 1e-9, `half width: ${slim.halfX}`);
  assert.ok(Math.abs(slim.centerX - (rect.x + 150)) < 1e-9, `center shifts right: ${slim.centerX}`);
  assert.deepEqual(slim.uvRect, [0.5, 0, 1, 1]);
});

test('draw() with keyframes evaluates center, opacity and uvRect from the keys', () => {
  const calls = { draws: 0, textures: 0, programs: 0, backdrops: 0 };
  const gl = makeGl(calls);
  const pass = layers.create(gl);
  const keyframes = {
    'layer:k': {
      'transform.x': [
        { t: 0, value: 0, ease: 'linear' },
        { t: 2, value: 0.5, ease: 'linear' },
      ],
      opacity: [
        { t: 0, value: 1, ease: 'linear' },
        { t: 2, value: 0, ease: 'linear' },
      ],
      'crop.l': [{ t: 0, value: 0.25, ease: 'linear' }],
    },
  };
  const drawn = pass.draw([{ id: 'k', type: 'solid', color: '#ffffff' }], { width: 320, height: 180 }, 1, { keyframes });
  assert.equal(drawn, 1);
  const center = calls.uniforms['u_center'][0];
  // crop.l=0.25 shrinks the rect (w0=240, left edge at x=80) and the keyed
  // transform.x=0.25 adds 80: 80 + 120 + 80 = 280.
  assert.ok(Math.abs(center[0] - 280) < 1e-9, `center.x: ${center[0]}`);
  assert.ok(Math.abs(center[1] - 90) < 1e-9);
  assert.ok(Math.abs(calls.uniforms['u_opacity'][0][0] - 0.5) < 1e-9);
  assert.deepEqual(calls.uniforms['u_uvRect'][0], [0.25, 0, 1, 1]);
  pass.dispose();
});
