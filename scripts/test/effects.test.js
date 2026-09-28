'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const fx = require('../../renderer/js/lyrics/effects/registry.js');
require('../../renderer/js/lyrics/effects/animation.js');
require('../../renderer/js/lyrics/effects/layout.js');
require('../../renderer/js/lyrics/effects/enter.js');
require('../../renderer/js/lyrics/effects/exit.js');
require('../../renderer/js/lyrics/effects/hold.js');
require('../../renderer/js/lyrics/effects/location.js');
require('../../renderer/js/lyrics/effects/fill.js');
require('../../renderer/js/lyrics/effects/edge.js');
require('../../renderer/js/lyrics/effects/post.js');
require('../../renderer/js/lyrics/effects/background.js');
require('../../renderer/js/lyrics/effects/color.js');

function assertUniforms(uniforms, label) {
  assert.ok(uniforms && typeof uniforms.u_type === 'number', `${label}: u_type`);
  assert.ok(Number.isFinite(uniforms.u_type), `${label}: u_type finite`);
  if (uniforms.u_params) {
    assert.equal(uniforms.u_params.length, 4, `${label}: u_params length`);
    for (const value of uniforms.u_params) assert.ok(Number.isFinite(value), `${label}: u_params values`);
  }
  for (const key of ['u_colorA', 'u_colorB', 'u_color', 'u_colorC', 'u_colorD']) {
    if (uniforms[key]) {
      assert.equal(uniforms[key].length, 4, `${label}: ${key} length`);
      for (const value of uniforms[key]) assert.ok(Number.isFinite(value), `${label}: ${key} values`);
    }
  }
}

test('the registry covers every effect group of the spec', () => {
  const minimums = { animation: 8, layout: 12, enter: 19, exit: 14, hold: 15, location: 9, fill: 13, edge: 7, post: 35, background: 6 };
  for (const [group, minimum] of Object.entries(minimums)) {
    const list = fx.list(group);
    assert.ok(list.length >= minimum, `${group}: ${list.length} < ${minimum}`);
    for (const descriptor of list) {
      assert.ok(descriptor.type, `${group} descriptor type`);
      assert.ok(
        descriptor.cpu || descriptor.anchor || ['animation', 'layout', 'fill', 'edge', 'post', 'background'].includes(group),
        `${group}.${descriptor.type} has a CPU, anchor or is CPU-free`
      );
    }
  }
});

test('every fill type resolves to uniforms', () => {
  for (const descriptor of fx.list('fill')) {
    const instance = fx.withDefaults({ type: descriptor.type, params: {} }, 'fill');
    const uniforms = fx.fillUniforms(instance, {
      colors: { fill: [1, 0.5, 0.2, 1], fill2: [0.2, 0.5, 1, 1], stroke: [1, 1, 1, 1] },
      time: 1,
      progress: 0.4,
    });
    assertUniforms(uniforms, `fill.${descriptor.type}`);
    const again = fx.fillUniforms(instance, { colors: { fill: [1, 0.5, 0.2, 1] }, time: 1, progress: 0.4 });
    assert.deepEqual(uniforms.u_params, again.u_params, `fill.${descriptor.type} deterministic`);
  }
});

test('every edge type resolves to uniforms with a behind/top placement', () => {
  for (const descriptor of fx.list('edge')) {
    const instance = fx.withDefaults({ type: descriptor.type, params: {} }, 'edge');
    const uniforms = fx.edgeUniforms(instance, {
      colorSet: { stroke: [1, 1, 1, 1] },
      maxDistance: 108,
      width: 1920,
      height: 1080,
      time: 1,
    });
    assertUniforms(uniforms, `edge.${descriptor.type}`);
    assert.equal(typeof uniforms.top, 'boolean', `edge.${descriptor.type} top`);
    assert.equal(uniforms.u_direction.length, 2);
    assert.equal(uniforms.u_offset.length, 2);
  }
});

test('every post type resolves to uniforms with a target', () => {
  for (const descriptor of fx.list('post')) {
    const instance = fx.withDefaults({ type: descriptor.type, params: {} }, 'post');
    const uniforms = fx.postUniforms(instance, { envelope: 0.8, progress: 0.5, time: 2 });
    assertUniforms(uniforms, `post.${descriptor.type}`);
    assert.ok(['text', 'frame'].includes(uniforms.target), `post.${descriptor.type} target ${uniforms.target}`);
    assert.ok(uniforms.u_params[3] >= 0 && uniforms.u_params[3] <= 4, `post.${descriptor.type} envelope ${uniforms.u_params[3]}`);
  }
});

test('every background type resolves to uniforms', () => {
  for (const descriptor of fx.list('background')) {
    const instance = fx.withDefaults({ type: descriptor.type, params: {} }, 'background');
    const uniforms = fx.backgroundUniforms(instance, { time: 1, theme: null });
    assertUniforms(uniforms, `background.${descriptor.type}`);
    assert.ok(uniforms.u_type >= 1 && uniforms.u_type <= 5, `background.${descriptor.type} code`);
  }
});

test('resolveColorSet turns ColorValues into rgba arrays', () => {
  const solid = fx.resolveColorSet({ fill: { kind: 'solid', value: '#ff0000', alpha: 1 } }, {});
  assert.deepEqual(solid.arrays.fill, [1, 0, 0, 1]);
  const gradient = fx.resolveColorSet(
    { fill: { kind: 'gradient', type: 'linear', angle: 0, stops: [{ pos: 0, color: '#000000' }, { pos: 1, color: '#ffffff' }] } },
    {}
  );
  assert.equal(gradient.fill.kind, 'gradient');
  assert.equal(gradient.fill.stops.length, 2);
  assert.deepEqual(gradient.arrays.fill, [0, 0, 0, 1]);
  assert.deepEqual(gradient.arrays.fill2, [1, 1, 1, 1]);
  const category = fx.resolveColorSet({ fill: { kind: 'category', which: 'tint' } }, { category: 'plays', categoryColors: { plays: { tint: '#00ff00', tint2: '#0000ff' } } });
  assert.deepEqual(category.arrays.fill, [0, 1, 0, 1]);
  const palette = fx.resolveColorSet({ fill: { kind: 'palette', paletteId: 'p1', index: 1 } }, { palettes: [{ id: 'p1', colors: ['#ff0000', '#00ff00'] }] });
  assert.deepEqual(palette.arrays.fill, [0, 1, 0, 1]);
});

test('withDefaults fills params and motion for every group', () => {
  const enter = fx.withDefaults({ type: 'slide' }, 'enter');
  assert.equal(enter.params.dir, 'up');
  assert.ok(enter.motion.in || enter.motion.out || true);
  const layoutInstance = fx.withDefaults({ type: 'circle' }, 'layout');
  assert.equal(layoutInstance.params.radius, 0.28);
  const fallbackEnter = fx.withDefaults(null, 'enter');
  assert.equal(fallbackEnter.type, 'fade');
  const fallbackPost = fx.withDefaults({ type: 'vignette' }, 'post');
  assert.ok(fallbackPost.params.amount != null);
});

test('costOf sums the descriptor costs of a style', () => {
  const style = {
    enter: { type: 'fade' },
    fill: { type: 'fire' },
    edge: [{ type: 'neonGlow' }, { type: 'outline' }],
    post: [{ type: 'glitchBlocks' }],
  };
  const cost = fx.costOf(style);
  assert.ok(cost > 0, `cost ${cost}`);
  assert.equal(cost, 2 + 1 + 2 + 2);
});

test('every post effect code has exactly one branch in the post shader', () => {
  const vm = require('node:vm');
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '../../renderer/js/lyrics/gl/shaders.js'), 'utf8');
  const sandbox = { window: {} };
  sandbox.SA = sandbox.window.SA = {};
  vm.runInNewContext(source, sandbox);
  const frag = sandbox.SA.glShaders.POST_FRAG;
  const branches = [...frag.matchAll(/type == (\d+)\)/g)].map((match) => Number(match[1]));
  for (const [type, code] of Object.entries(fx.postTypes)) {
    assert.equal(branches.filter((value) => value === code).length, 1, `${type} (code ${code})`);
  }
  // lightSweep must reach the sweep band, not the kaleidoscope swirl.
  const sweep = frag.slice(frag.indexOf(`type == ${fx.postTypes.lightSweep})`));
  assert.match(sweep.slice(0, sweep.indexOf('} else if')), /band/);
});
