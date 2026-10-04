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

test('the per-letter text colour is a fill uniform, off unless asked for', () => {
  const instance = fx.withDefaults({ type: 'solid', params: {} }, 'fill');
  const colors = { fill: [1, 0.5, 0.2, 1] };
  // the glyph body paints itself in the beat fill unless a per-letter colour
  // was declared (a scoped text span or a variation fgColor)
  assert.equal(fx.fillUniforms(instance, { colors }).u_letterTint, 0);
  assert.equal(fx.fillUniforms(instance, { colors, letterTint: true }).u_letterTint, 1);
  // the background pass keeps its own gate: the tint multiplies the shape colour
  assert.equal(fx.fillUniforms(instance, { colors, maskTint: true }).u_maskTint, 0, 'maskTint is the bg role only');
  assert.equal(fx.fillUniforms(instance, { colors, role: 'bg', maskTint: true }).u_maskTint, 1);
});

test('the pattern fills pack their geometry into u_params2', () => {
  const patternTypes = ['stripes', 'checker', 'diamondGrid', 'halftone', 'hatch', 'randomSpeckle'];
  for (const type of patternTypes) {
    const descriptor = fx.get('fill', type);
    assert.ok(descriptor, `fill.${type} is not registered`);
    assert.equal(descriptor.pack, 'pro', `fill.${type} must stay in the pro pack`);
    assert.ok(descriptor.params.some((param) => param.key === 'ratio'), `fill.${type} has no ratio`);
    const instance = fx.withDefaults({ type, params: { angle: 45, size: 40, ratio: 0.3, speed: 0.5 } }, 'fill');
    const uniforms = fx.fillUniforms(instance, { colors: { fill: [1, 0.5, 0.2, 1], fill2: [0.2, 0.5, 1, 1] }, time: 2, progress: 0 });
    assert.equal(uniforms.u_params2.length, 4, `fill.${type} u_params2 length`);
    assert.ok(Math.abs(uniforms.u_params2[0] - Math.PI / 4) < 1e-9, `fill.${type} angle`);
    assert.equal(uniforms.u_params2[1], 40);
    assert.equal(uniforms.u_params2[2], 0.3);
    assert.equal(uniforms.u_params2[3], 0.5);
    assert.ok(uniforms.u_type >= 15, `fill.${type} code ${uniforms.u_type}`);
  }
});

test('the checker fill alternates its two colours instead of blending them', () => {
  const vm = require('node:vm');
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '../../renderer/js/lyrics/gl/shaders.js'), 'utf8');
  const sandbox = { window: {} };
  sandbox.SA = sandbox.window.SA = {};
  vm.runInNewContext(source, sandbox);
  const frag = sandbox.SA.glShaders.FILL_FRAG;
  const start = frag.indexOf('type == 16');
  assert.ok(start >= 0, 'the checker branch is missing');
  const end = frag.indexOf('} else if', start);
  const branch = frag.slice(start, end < 0 ? undefined : end);
  // blending the two colours by ratio collapses to a flat colour at 0.5, so
  // the cell parity has to pick a pure palette colour instead
  assert.match(branch, /mix\(u_colorA, u_colorB, on\)/);
  assert.ok(!branch.includes('1.0 - ratio'), 'the checker must not blend by ratio');
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

test('the multi-line edge expands into a ring per layer', () => {
  const instance = fx.withDefaults({ type: 'multiLine', params: { count: 3, width: 2, gap: 3, widthDecay: 0.8, colorRule: 'alternate', layerDelay: 0.06 } }, 'edge');
  const context = { colorSet: { stroke: [1, 1, 1, 1] }, maxDistance: 108, width: 1920, height: 1080, time: 1, localTime: 1 };
  const uniforms = fx.edgeUniformsAll(instance, context);
  assert.equal(uniforms.length, 3);
  for (const entry of uniforms) assertUniforms(entry, 'edge.multiLine');
  // the outer rings sit farther out and their inner cut grows with them
  assert.ok(uniforms[1].u_params[2] > uniforms[0].u_params[2], 'ring radius must grow');
  assert.ok(uniforms[2].u_params2[3] > uniforms[1].u_params2[3], 'inner radius must grow');
  // the layer delay hides the outer rings at the start, the first ring shows
  const early = fx.edgeUniformsAll(instance, { ...context, time: 0, localTime: 0 });
  assert.equal(early.length, 1);
  // a single-line instance stays a single uniform
  const single = fx.withDefaults({ type: 'outline', params: {} }, 'edge');
  assert.equal(fx.edgeUniformsAll(single, { ...context, localTime: 0 }).length, 1);
});

test('the outline carries the pattern vocabulary and the widened width range', () => {
  const patterns = require('../../renderer/js/lyrics/patterns.js');
  const width = fx.get('edge', 'outline').params.find((param) => param.key === 'width');
  assert.equal(width.min, 0.1, 'the hairline floor');
  assert.equal(width.max, 100, 'the heavy ceiling');
  const patternParam = fx.get('edge', 'outline').params.find((param) => param.key === 'pattern');
  assert.deepEqual(patternParam.options, patterns.PATTERNS);
  const checker = fx.withDefaults({ type: 'outline', params: { width: 120, pattern: 'checker' } }, 'edge');
  const uniforms = fx.edgeUniforms(checker, { colorSet: { stroke: [1, 1, 1, 1] }, maxDistance: 108, width: 1920, height: 1080 });
  assert.equal(uniforms.u_params2[0], patterns.CODES.checker, 'pattern code');
  assert.ok(Number.isFinite(uniforms.u_params[0]) && uniforms.u_params[0] > 0, `width is carried (${uniforms.u_params[0]})`);
  // a 100px stroke still fits inside the 192px field of a 1920px frame
  const full = fx.edgeUniforms(
    fx.withDefaults({ type: 'outline', params: { width: 100 } }, 'edge'),
    { colorSet: { stroke: [1, 1, 1, 1] }, maxDistance: 192, width: 1920, height: 1080 }
  );
  assert.ok(full.u_params[0] <= 1, `the widest stroke stays inside the sdf field (${full.u_params[0]})`);
  // every option the UI offers is a known code
  for (const option of patternParam.options) {
    assert.equal(typeof patterns.CODES[option], 'number', `${option} has no code`);
  }
  // the multi line stack packs its own pattern into the outline branch
  const multi = fx.edgeUniformsAll(
    fx.withDefaults({ type: 'multiLine', params: { count: 2, width: 2, pattern: 'railroad' } }, 'edge'),
    { colorSet: { stroke: [1, 1, 1, 1] }, maxDistance: 108, width: 1920, height: 1080, localTime: 1 }
  );
  assert.equal(multi[0].u_params2[0], patterns.CODES.railroad);
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
  // the unpacked types keep the original five shader codes so the older
  // effect catalogues stay byte-identical; `plain` is the flat-colour branch
  // added on top of them and `gradient` the directional ramp (eight
  // directions, two to four stops)
  const CODE_RANGE = { plain: [13, 13], gradient: [14, 14] };
  for (const descriptor of fx.list('background')) {
    const instance = fx.withDefaults({ type: descriptor.type, params: {} }, 'background');
    const uniforms = fx.backgroundUniforms(instance, { time: 1, theme: null });
    assertUniforms(uniforms, `background.${descriptor.type}`);
    const range = CODE_RANGE[descriptor.type] || [1, 5];
    assert.ok(uniforms.u_type >= range[0] && uniforms.u_type <= range[1], `background.${descriptor.type} code`);
  }
});

test('plain is a flat colour field and solid keeps its centre glow', () => {
  const plain = fx.backgroundUniforms({ type: 'plain', params: { color: '#204080' } }, { theme: null });
  const solid = fx.backgroundUniforms({ type: 'solid', params: { color: '#204080' } }, { theme: null });
  assert.equal(plain.u_type, 13);
  assert.deepEqual(plain.u_colorA, solid.u_colorA, 'both read the same colour');
  // solid rides the glow in u_params.z (the shader's -1 sentinel lifts it);
  // plain leaves it at the default 0 the flat branch never reads
  assert.equal(plain.u_params[2], 0);
  assert.equal(solid.u_params[2], -1);
  // the params schema matches, so the inspector builds the same colour control
  const keys = (type) => fx.get('background', type).params.map((param) => param.key);
  assert.deepEqual(keys('plain'), keys('solid'));
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

test('resolveColorSet: a missing fill2 follows the fill instead of turning white', () => {
  const colors = ['#000000', '#111111', '#0f1c50', '#0e2f4a'];
  const only = fx.resolveColorSet({ fill: { kind: 'palette', index: 2 } }, { palette: { colors } });
  assert.deepEqual(only.arrays.fill2, only.arrays.fill);
  assert.notDeepEqual(only.arrays.fill2, [1, 1, 1, 1]);
  const both = fx.resolveColorSet({ fill: { kind: 'palette', index: 2 }, fill2: { kind: 'palette', index: 3 } }, { palette: { colors } });
  assert.notDeepEqual(both.arrays.fill2, both.arrays.fill);
  // nothing at all still reads white
  const none = fx.resolveColorSet({}, {});
  assert.deepEqual(none.arrays.fill, [1, 1, 1, 1]);
  assert.deepEqual(none.arrays.stroke, [1, 1, 1, 1]);
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

test('every background shader code has exactly one branch', () => {
  const vm = require('node:vm');
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '../../renderer/js/lyrics/gl/shaders.js'), 'utf8');
  const sandbox = { window: {} };
  sandbox.SA = sandbox.window.SA = {};
  vm.runInNewContext(source, sandbox);
  const frag = sandbox.SA.glShaders.BACKGROUND_FRAG;
  // codes 3/4/5 (card / cover / image) share one `||` branch, so the match is
  // on the comparison rather than on a closing paren
  const branches = [...frag.matchAll(/u_type == (\d+)/g)].map((match) => Number(match[1]));
  // `none`/`solid` and `gradient`/`noiseGradient` share a code, so the check is
  // per distinct code rather than per type
  for (const code of new Set(Object.values(fx.backgroundTypes))) {
    assert.equal(branches.filter((value) => value === code).length, 1, `background code ${code}`);
  }
  // the flat branch must not grow a lift or a drift behind solid's glow
  const flat = frag.slice(frag.indexOf('u_type == 13)'), frag.indexOf('float opacity = clamp'));
  assert.equal(flat.includes('u_time'), false, 'the plain branch ignores the clock');
});
