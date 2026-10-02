'use strict';

// The shape layer draws a stroked path over the finished frame: the box comes
// from the engine's current text bounds, the trim runs with the beat (enter /
// exit / hold / beat) and the shader carries the matching branch. The uniform
// contract must stay stable, so the packing is checked here.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const FX_DIR = path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects');
const fx = require(path.join(FX_DIR, 'registry.js'));
for (const name of ['hold', 'enter', 'exit', 'post', 'selector', 'camera', 'shape-layer', 'softbody']) {
  require(path.join(FX_DIR, `${name}.js`));
}
const shapeLayer = require(path.join(FX_DIR, 'shape-layer.js'));

const BOX = { x0: 0.2, y0: 0.4, x1: 0.8, y1: 0.6 };
const ctx = (extra) => ({ envelope: 1, progress: 1, time: 0, textBox: BOX, ...extra });

test('the shape layer registers the shapes, the drives and the code 46 extension', () => {
  const entry = fx.get('post', 'shapeLayer');
  assert.ok(entry, 'post.shapeLayer is not registered');
  assert.equal(entry.defaults.target, 'frame');
  assert.equal(entry.pack, 'pro');
  assert.ok(entry.stackable);
  const shapeParam = entry.params.find((param) => param.key === 'shape');
  assert.deepEqual(shapeParam.options, shapeLayer.SHAPES);
  const driveParam = entry.params.find((param) => param.key === 'drive');
  assert.deepEqual(driveParam.options, shapeLayer.DRIVES);
  assert.equal(fx.postExtensions.shapeLayer.code, 46);
});

test('the uniforms carry the shape, the trim, the stroke and the text box', () => {
  const uniforms = fx.postUniforms(
    { type: 'shapeLayer', params: { shape: 'box', stroke: 6, padding: 0.1, repeat: 8, repeatScale: 1.4, repeatRotate: 30, repeatOpacity: 0.4, feather: 0.02, glow: 0.5, trimStart: 0.1, trimEnd: 0.9, trimOffset: 0.25 } },
    ctx()
  );
  assert.equal(uniforms.u_type, 46);
  assert.equal(uniforms.target, 'frame');
  assert.deepEqual(uniforms.u_params3, [BOX.x0, BOX.y0, BOX.x1, BOX.y1]);
  assert.deepEqual(uniforms.u_params.slice(0, 1), [shapeLayer.SHAPE_CODES.box]);
  assert.deepEqual(uniforms.u_params.slice(1), [0.1, 0.9, 0.25]);
  assert.deepEqual(uniforms.u_params2, [6, 8, 1.4, 30]);
  assert.equal(uniforms.u_colorB[0], 0.1, 'padding');
  assert.equal(uniforms.u_colorB[1], 0.4, 'repeat fade');
  assert.equal(uniforms.u_colorB[2], 1, 'round cap');
  assert.equal(uniforms.u_colorB[3], 0.02, 'feather');
  assert.equal(uniforms.u_colorA[3], 0.5, 'glow');
  assert.deepEqual(uniforms.u_params4, [0, 16, 0.5, 0], 'a plain stroke packs no pattern');
});

test('the stroke pattern packs into u_params4 and clamps to the widened range', () => {
  const patterns = require('../../renderer/js/lyrics/patterns.js');
  const entry = fx.get('post', 'shapeLayer');
  for (const key of ['pattern', 'patternSize', 'patternRatio', 'patternFlow', 'dashOn', 'dashOff', 'dashOffset']) {
    assert.ok(entry.params.some((param) => param.key === key), `post.shapeLayer has no ${key}`);
  }
  const patternParam = entry.params.find((param) => param.key === 'pattern');
  assert.deepEqual(patternParam.options, patterns.PATTERNS);
  assert.equal(entry.params.find((param) => param.key === 'stroke').max, 200, 'the heavy ceiling');
  const checker = fx.postUniforms(
    { type: 'shapeLayer', params: { shape: 'underline', pattern: 'checker', patternSize: 40, patternRatio: 0.3, patternFlow: 2, stroke: 500 } },
    ctx({ time: 1 })
  );
  assert.deepEqual(checker.u_params4, [patterns.CODES.checker, 40, 0.3, 2]);
  assert.equal(checker.u_params2[0], 200, 'the stroke clamps to the range');
  // a dash overrides the period / share and turns a solid pattern into dashed
  const dash = fx.postUniforms(
    { type: 'shapeLayer', params: { shape: 'underline', dashOn: 10, dashOff: 30, dashOffset: 0.25, patternFlow: 0 } },
    ctx({ time: 0 })
  );
  assert.deepEqual(dash.u_params4, [patterns.CODES.dashed, 40, 0.25, -0.25 / 40]);
  // an unknown pattern falls back to solid instead of leaking into the shader
  const unknown = fx.postUniforms({ type: 'shapeLayer', params: { shape: 'box', pattern: 'nope' } }, ctx());
  assert.equal(unknown.u_params4[0], 0);
});

test('the shape layer shader reads the pattern and the cap', () => {
  const shaders = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'lyrics', 'gl', 'shaders.js'), 'utf8');
  const post = shaders.slice(shaders.indexOf('const POST_FRAG'), shaders.indexOf('const BLOOM_BRIGHT_FRAG'));
  for (const token of ['u_params4', 'patternMask', 'patternKind', 'patternFlow', 'capRound', 'pathPx']) {
    assert.ok(post.includes(token), `the shape layer branch does not read ${token}`);
  }
});

test('the drive moves the trim: enter grows the end, exit the start, hold and beat loop the offset', () => {
  const params = { shape: 'underline', trimStart: 0.1, trimEnd: 0.9, speed: 0.5 };
  const enter = fx.postUniforms({ type: 'shapeLayer', params: { ...params, drive: 'enter' } }, ctx({ progress: 0.5 }));
  assert.equal(enter.u_params[1], 0.1, 'enter keeps the start');
  assert.ok(Math.abs(enter.u_params[2] - (0.1 + 0.8 * 0.5)) < 1e-6, `enter end ${enter.u_params[2]}`);
  const exit = fx.postUniforms({ type: 'shapeLayer', params: { ...params, drive: 'exit' } }, ctx({ progress: 0.25 }));
  assert.ok(Math.abs(exit.u_params[1] - (0.1 + 0.8 * 0.25)) < 1e-6, `exit start ${exit.u_params[1]}`);
  assert.equal(exit.u_params[2], 0.9);
  const hold = fx.postUniforms({ type: 'shapeLayer', params: { ...params, drive: 'hold' } }, ctx({ progress: 0, time: 1 }));
  assert.ok(Math.abs(hold.u_params[3] - 0.5) < 1e-6, `hold offset ${hold.u_params[3]}`);
  const beat = fx.postUniforms({ type: 'shapeLayer', params: { ...params, drive: 'beat' } }, ctx({ progress: 0, time: 0.75, audioFeatures: { bpm: 120 } }));
  assert.ok(Math.abs(beat.u_params[3] - 0.5) < 1e-6, `beat offset ${beat.u_params[3]}`);
  const noBox = fx.postUniforms({ type: 'shapeLayer', params }, { envelope: 1, progress: 1, time: 0 });
  assert.deepEqual(noBox.u_params3, [0.2, 0.35, 0.8, 0.65], 'a missing text box falls back to the frame centre');
});

test('the shader carries the shape layer branch', () => {
  const shaders = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'lyrics', 'gl', 'shaders.js'), 'utf8');
  const post = shaders.slice(shaders.indexOf('const POST_FRAG'), shaders.indexOf('const BLOOM_BRIGHT_FRAG'));
  assert.ok(post.includes('type == 46'), 'POST_FRAG has no shape layer branch');
  for (const token of ['trimStart', 'trimEnd', 'trimOffset', 'u_params3', 'repeatScale', 'brackets']) {
    assert.ok(post.includes(token), `the shape layer branch does not read ${token}`);
  }
  // no reserved words in a declaration
  assert.ok(!/\b(half|fixed|input|output|filter)\s+\w+\s*=/.test(post), 'the shader declares a reserved word');
});

test('the shape layer is also a user-placeable background clip', () => {
  const entry = fx.get('background', 'shapeLayer');
  assert.ok(entry, 'background.shapeLayer is not registered');
  assert.equal(entry.pack, 'pro');
  const follow = entry.params.find((param) => param.key === 'followText');
  assert.deepEqual(follow.options, shapeLayer.FOLLOW_MODES);
  assert.equal(follow.default, 'block');
  for (const key of ['dashOn', 'dashOff', 'dashOffset', 'pathOp', 'pathOpAmount', 'pathOpFreq', 'repeatOffset', 'corner']) {
    assert.ok(entry.params.some((param) => param.key === key), `background.shapeLayer has no ${key}`);
  }
  const defaults = fx.paramDefaults('background', 'shapeLayer');
  assert.equal(defaults.shape, 'box');
  assert.equal(defaults.followText, 'block');
  assert.equal(defaults.trimEnd, 1);
  assert.equal(defaults.dashOn, 0);
  assert.equal(fx.withDefaults({ type: 'shapeLayer', params: {} }, 'background').params.stroke, 4);
});

test('the engine and the studio wire the placeable clip', () => {
  const engine = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'lyrics', 'engine.js'), 'utf8');
  for (const token of ['SA.shapeOps.expand', 'textBoxesForClip', 'textBoxesPx', "'shapeLayer'", 'boxes: boxes ? boxes.lines : null', 'textBoxCache']) {
    assert.ok(engine.includes(token), `engine.js has no ${token}`);
  }
  const inspector = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'inspector.js'), 'utf8');
  // the unpacked primitives (`plain` / `solid` / `gradient` / `card` ...) carry
  // no pack, so the list has to ask for `null` next to the UI packs
  assert.match(inspector, /SA\.fx\.list\('background', \{ packs: \[null,/, 'the clip type list does not offer the extended background types');
  assert.ok(inspector.includes('type === \'shapeLayer\''), 'the inspector does not treat shapeLayer as an fx clip');
  const timeline = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'timeline.js'), 'utf8');
  assert.ok(timeline.includes('addClipTypeMenu'), 'the timeline has no clip type menu');
});

test('the timeline background menu offers the unpacked types too', () => {
  // `packs: ['font', 'pro']` would hide every unpacked primitive, so the menu
  // could not reach `plain` / `solid` / `gradient` / `card` at all
  const timeline = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'timeline.js'), 'utf8');
  assert.match(timeline, /SA\.fx\.list\('background', \{ packs: \[null,/, 'the timeline drops the unpacked background types');
  const FX_DIR = path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects');
  const fx = require(path.join(FX_DIR, 'registry.js'));
  require(path.join(FX_DIR, 'background.js'));
  const offered = fx.list('background', { packs: [null, 'font', 'pro'] }).map((descriptor) => descriptor.type);
  for (const type of ['none', 'plain', 'solid', 'gradient', 'noiseGradient', 'card', 'cover', 'image']) {
    assert.ok(offered.includes(type), `the menu does not offer background.${type}`);
  }
});

test('scale parameter is defined with random range and scales the text box bounds', () => {
  const entry = fx.get('post', 'shapeLayer');
  const scaleParam = entry.params.find((param) => param.key === 'scale');
  assert.ok(scaleParam, 'scale param is registered');
  assert.deepEqual(scaleParam.random, [0.85, 1.25], 'scale param defines random range');

  const scaled = fx.postUniforms(
    { type: 'shapeLayer', params: { shape: 'box', scale: 1.5 } },
    ctx()
  );
  // cx = 0.5, cy = 0.5; box is { x0: 0.2, y0: 0.4, x1: 0.8, y1: 0.6 }
  // scaled x0 = 0.5 + (0.2 - 0.5) * 1.5 = 0.05
  // scaled y0 = 0.5 + (0.4 - 0.5) * 1.5 = 0.35
  // scaled x1 = 0.5 + (0.8 - 0.5) * 1.5 = 0.95
  // scaled y1 = 0.5 + (0.6 - 0.5) * 1.5 = 0.65
  assert.ok(Math.abs(scaled.u_params3[0] - 0.05) < 1e-6);
  assert.ok(Math.abs(scaled.u_params3[1] - 0.35) < 1e-6);
  assert.ok(Math.abs(scaled.u_params3[2] - 0.95) < 1e-6);
  assert.ok(Math.abs(scaled.u_params3[3] - 0.65) < 1e-6);
  assert.equal(scaleParam.min, 0.1);
  assert.equal(scaleParam.max, 10);
});

test('resolveGraphicParams randomizes scale for frame shapes', () => {
  const direct = require(path.join(ROOT, 'renderer', 'js', 'studio', 'direct.js'));
  const boxResolved = direct.resolveGraphicParams({ shape: 'box' }, () => 0.5);
  assert.equal(boxResolved.scale, Math.round((0.9 + 0.5 * 0.25) * 100) / 100);
  assert.equal(boxResolved.padding, Math.round((0.06 + 0.5 * 0.18) * 100) / 100);
  assert.equal(boxResolved.stroke, Math.round((2.5 + 0.5 * 3.5) * 10) / 10);

  const scaledResolved = direct.resolveGraphicParams({ shape: 'box' }, () => 0.5, 3);
  assert.equal(scaledResolved.scale, Math.round(3 * (0.9 + 0.5 * 0.25) * 100) / 100);
});

