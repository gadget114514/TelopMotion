'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');

const fx = require('../../renderer/js/lyrics/effects/registry.js');
require('../../renderer/js/lyrics/effects/fill.js');
require('../../renderer/js/lyrics/effects/edge.js');
require('../../renderer/js/lyrics/effects/text-bg.js');
const textBg = require('../../renderer/js/lyrics/effects/text-bg.js');

const SHAPE_ORDER = [
  'none', 'square', 'rounded', 'circle', 'diamond', 'ring', 'bar', 'star', 'blob',
  'heart', 'splatter', 'scratch', 'drop', 'bracket', 'paper', 'cloud',
];

function entry(overrides) {
  return {
    letter: { char: 'a', path: 'l0', lineIdx: 0, wordIdx: 0 },
    state: {
      opacity: 1,
      px: 0,
      timing: { enterStart: 1, enterDur: 0.5, exitStart: 5, exitDur: 0.5 },
      ...(overrides || {}),
    },
  };
}

test('shape indices match the shader constants', () => {
  assert.deepEqual(Object.keys(textBg.SHAPES), SHAPE_ORDER);
  SHAPE_ORDER.forEach((name, index) => assert.equal(textBg.SHAPES[name], index, name));
});

test('bgShape defaults to none and bgMotion to follow', () => {
  assert.equal(fx.defaultsFor('bgShape').type, 'none');
  assert.equal(fx.defaultsFor('bgMotion').type, 'follow');
  assert.equal(fx.defaultsFor('bgFill').type, 'solid');
  assert.equal(fx.defaultsFor('bgEdge'), null);
});

test('bgFill and bgEdge are aliases of fill and edge', () => {
  const fillTypes = fx.list('fill').map((entry) => entry.type).sort();
  const bgFillTypes = fx.list('bgFill').map((entry) => entry.type).sort();
  assert.deepEqual(bgFillTypes, fillTypes);
  const edgeTypes = fx.list('edge').map((entry) => entry.type).sort();
  const bgEdgeTypes = fx.list('bgEdge').map((entry) => entry.type).sort();
  assert.deepEqual(bgEdgeTypes, edgeTypes);
  const entry = fx.get('bgFill', 'solid');
  assert.equal(entry.group, 'bgFill');
  assert.ok(entry.params.length === 0);
});

test('evaluateBg handles the lead boundary', () => {
  const shape = { type: 'square', params: { unit: 'cell', width: 1, height: 1, opacity: 1 } };
  const motion = { type: 'fade', params: { lead: 0.2, duration: 0.4 } };
  // before the entry window
  const early = textBg.evaluateBg(shape, motion, [entry()], null, null, 0.5, { seed: 1 });
  assert.ok(early.states[0].opacity < 0.05, `early ${early.states[0].opacity}`);
  // after the entry window
  const late = textBg.evaluateBg(shape, motion, [entry()], null, null, 1.4, { seed: 1 });
  assert.ok(late.states[0].opacity > 0.95, `late ${late.states[0].opacity}`);
});

test('a negative lead delays the background', () => {
  const shape = { type: 'square', params: { unit: 'cell', width: 1, height: 1 } };
  const motion = { type: 'fade', params: { lead: -0.3, duration: 0.2 } };
  const atEnter = textBg.evaluateBg(shape, motion, [entry()], null, null, 1.0, { seed: 1 });
  assert.ok(atEnter.states[0].opacity < 0.05, 'still hidden at the letter enter');
  const later = textBg.evaluateBg(shape, motion, [entry()], null, null, 1.6, { seed: 1 });
  assert.ok(later.states[0].opacity > 0.95, 'visible once the delay passed');
});

test('exit withText follows the letter opacity', () => {
  const shape = { type: 'square', params: { unit: 'cell', width: 1, height: 1 } };
  const motion = { type: 'follow', params: { exit: 'withText' } };
  const result = textBg.evaluateBg(shape, motion, [entry({ opacity: 0.4 })], null, null, 2, { seed: 1 });
  assert.ok(Math.abs(result.states[0].opacity - 0.4) < 1e-6, `opacity ${result.states[0].opacity}`);
});

test('exit fade uses its own envelope', () => {
  const shape = { type: 'square', params: { unit: 'cell', width: 1, height: 1 } };
  const motion = { type: 'follow', params: { exit: 'fade', exitDuration: 0.4 } };
  const half = textBg.evaluateBg(shape, motion, [entry()], null, null, 5.2, { seed: 1 });
  assert.ok(half.states[0].opacity < 0.6 && half.states[0].opacity > 0.3, `half ${half.states[0].opacity}`);
  const gone = textBg.evaluateBg(shape, motion, [entry()], null, null, 5.5, { seed: 1 });
  assert.ok(gone.states[0].opacity < 0.05, `gone ${gone.states[0].opacity}`);
});

test('motion none is always visible', () => {
  const shape = { type: 'circle', params: { unit: 'em', width: 0.3, height: 0.3 } };
  const motion = { type: 'none', params: {} };
  const result = textBg.evaluateBg(shape, motion, [entry()], null, null, 0, { seed: 1 });
  assert.equal(result.states[0].opacity, 1);
  assert.equal(result.states[0].motionScaleX, 1);
});

test('cellMetrics keeps the cell centred for narrow glyphs', () => {
  const letter = {
    size: 100,
    advance: 0.2,
    advanceWithSpacing: 0.25,
    local: { penX: 0, penY: 0, cx: 12, cy: -30 },
  };
  const cell = textBg.cellMetrics(letter);
  assert.equal(cell.w, 25);
  assert.equal(cell.h, 100);
  assert.ok(Math.abs(cell.inkToCell[0] - (12.5 - 12)) < 1e-6);
  assert.ok(Math.abs(cell.inkToCell[1] - (-50 - -30)) < 1e-6);
});

test('cellMetricsFor normalises the runtime px advance to em', () => {
  // the scene letters carry px: 25 px advance at size 100 is the same cell as
  // 0.25 em -- the two must agree, and not span advance * size
  const px = {
    size: 100,
    advance: 20,
    advanceWithSpacing: 25,
    local: { penX: 0, penY: 0, cx: 12, cy: -30 },
  };
  const cell = textBg.cellMetricsFor(px);
  const em = textBg.cellMetrics({ ...px, advance: 0.2, advanceWithSpacing: 0.25 });
  assert.deepEqual(cell, em);
  assert.equal(cell.w, 25);
  assert.equal(cell.h, 100);
  // vertical text normalises the vertical advance the same way
  const vertical = textBg.cellMetricsFor({ size: 100, advanceV: 120, vertical: true, local: { penX: 0, penY: 0, cx: 0, cy: 0 } });
  assert.equal(vertical.w, 100);
  assert.equal(vertical.h, 120);
});

test('the trim / dash / stroke parameters reach the bg state', () => {
  const shape = { type: 'square', params: { unit: 'cell', stroke: 0.08, fill: 0.5, trimStart: 0.1, trimEnd: 0.9, trimOffset: 0.2, dashOn: 0.1, dashOff: 0.05, dashOffset: 0.3 } };
  const result = textBg.evaluateBg(shape, { type: 'none', params: {} }, [entry()], null, null, 0, { seed: 1 });
  const state = result.states[0];
  assert.deepEqual(state.trim, [0.1, 0.9, 0.2]);
  assert.deepEqual(state.dash, [0.1, 0.05, 0.3]);
  assert.equal(state.stroke, 0.08);
  assert.equal(state.fill, 0.5);
  // the defaults keep the previous look: full fill, no outline, no dash
  const plain = textBg.evaluateBg({ type: 'square', params: {} }, { type: 'follow', params: {} }, [entry()], null, null, 0, { seed: 1 });
  assert.deepEqual(plain.states[0].trim, [0, 1, 0]);
  assert.deepEqual(plain.states[0].dash, [0, 0, 0]);
  assert.equal(plain.states[0].stroke, 0);
  assert.equal(plain.states[0].fill, 1);
});

test('only the wipe motion clips the shape; every other motion keeps clip off', () => {
  // BG_FRAG skips the clip plane for v_clip <= -0.999, so -1 is the "off"
  // sentinel. A 0 here cuts the shape at its centre and draws its right half
  // only (a circle / heart / square came out as a semicircle).
  const motions = ['follow', 'fade', 'pop', 'stamp', 'spin', 'grow', 'flicker', 'bleed', 'float', 'fall', 'draw', 'none'];
  for (const type of motions) {
    for (const shapeType of ['square', 'circle', 'heart']) {
      const result = textBg.evaluateBg({ type: shapeType, params: { unit: 'em', width: 2 } }, { type, params: {} }, [entry()], null, null, 2, { seed: 1 });
      assert.equal(result.states[0].clip, -1, `${type}/${shapeType} clips the shape`);
    }
  }
  // the wipe walks the same plane from -1 to 1
  const wipe = textBg.evaluateBg(
    { type: 'heart', params: { unit: 'em', width: 2 } },
    { type: 'wipe', params: { lead: 0, duration: 1, ease: 'linear' } },
    [entry({ timing: { enterStart: 0, exitStart: 9, exitDur: 0.5 } })],
    null,
    null,
    0.5,
    { seed: 1 }
  );
  assert.ok(Math.abs(wipe.states[0].clip) < 1e-6, `halfway ${wipe.states[0].clip}`);
});

test('bgMotion.draw traces the outline first and fills when the line is complete', () => {
  const shape = { type: 'square', params: { unit: 'cell', stroke: 0.06 } };
  const motion = { type: 'draw', params: { lead: 0, duration: 1, ease: 'linear' } };
  const fromZero = entry({ timing: { enterStart: 0, exitStart: 9, exitDur: 0.5 } });
  const quarter = textBg.evaluateBg(shape, motion, [fromZero], null, null, 0.25, { seed: 1 });
  assert.ok(Math.abs(quarter.states[0].trim[1] - 0.25) < 1e-6, `trim end ${quarter.states[0].trim[1]}`);
  assert.equal(quarter.states[0].fill, 0, 'the interior stays empty while the line is drawn');
  const late = textBg.evaluateBg(shape, motion, [fromZero], null, null, 0.9, { seed: 1 });
  assert.ok(late.states[0].fill > 0.5 && late.states[0].fill <= 1, `fill ${late.states[0].fill}`);
  const done = textBg.evaluateBg(shape, motion, [fromZero], null, null, 1.2, { seed: 1 });
  assert.deepEqual(done.states[0].trim, [0, 1, 0]);
  assert.equal(done.states[0].fill, 1);
  // without a stroke the draw still shows a line
  const thin = textBg.evaluateBg({ type: 'square', params: {} }, motion, [fromZero], null, null, 0.5, { seed: 1 });
  assert.ok(thin.states[0].stroke > 0, 'draw has no visible outline');
});

test('the draw motion is registered behind the pro pack', () => {
  const draw = fx.get('bgMotion', 'draw');
  assert.ok(draw, 'bgMotion.draw is not registered');
  assert.equal(draw.pack, 'pro');
  const listed = fx.list('bgMotion').map((descriptor) => descriptor.type);
  assert.ok(!listed.includes('draw'), 'the unpacked bgMotion list must not gain the draw motion');
  const all = fx.list('bgMotion', { packs: 'all' }).map((descriptor) => descriptor.type);
  assert.ok(all.includes('draw'));
  const square = fx.get('bgShape', 'square');
  for (const key of ['stroke', 'fill', 'trimStart', 'trimEnd', 'trimOffset', 'dashOn', 'dashOff', 'dashOffset']) {
    assert.ok(square.params.some((param) => param.key === key), `bgShape.square has no ${key}`);
  }
});

test('the bg state texture and shader carry the trim / dash rows', () => {
  const passes = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'lyrics', 'gl', 'passes.js'), 'utf8');
  assert.ok(passes.includes('BG_STATE_ROWS = 7'), 'the bg state texture is not 7 rows');
  assert.ok(passes.includes('state.stroke'), 'the stroke is not uploaded');
  assert.ok(passes.includes('state.fill'), 'the fill amount is not uploaded');
  const shaders = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'lyrics', 'gl', 'shaders.js'), 'utf8');
  const bg = shaders.slice(shaders.indexOf('const BG_FRAG'), shaders.indexOf('const BACKGROUND_FRAG'));
  for (const token of ['v_trim', 'v_dash', 'shapeParam', 'dashOn', 'fract(t + v_trim.z)']) {
    assert.ok(bg.includes(token), `BG_FRAG has no ${token}`);
  }
});

test('inkBoxFor is the letter itself, not the advance cell around it', () => {
  // NotoSans at 100 px: 'a' has a 56 x 100 cell around a 43 x 55 glyph, and
  // the glyph's ink centre sits 23 px above the cell centre. The shape quad
  // rides the ink box (and the shader's a_inkToCell stays 0), otherwise the
  // shape floats below the letter and is stretched to the cell aspect.
  const letter = {
    size: 100,
    advance: 56.1,
    advanceWithSpacing: 56.1,
    local: { penX: 500, penY: 500, cx: 526.3, cy: 473.3, w: 43.4, h: 55.5 },
  };
  assert.deepEqual(textBg.inkBoxFor(letter), { w: 43.4, h: 55.5 });
  // the advance cell is a different box, and stays available for the caret
  const cell = textBg.cellMetricsFor(letter);
  assert.ok(Math.abs(cell.w - 56.1) < 1e-6, `cell width ${cell.w}`);
  assert.equal(cell.h, 100);
  assert.ok(Math.abs(cell.inkToCell[1] - (450 - 473.3)) < 1e-6, 'the cell centre is the low one');
  // a letter with no ink box (a synthetic one) falls back to that cell
  assert.deepEqual(textBg.inkBoxFor({ size: 100, advance: 50, local: { penX: 0, penY: 0, cx: 0, cy: 0 } }), { w: 50, h: 100 });
});

test('the shape batch centres the quad on the letter, so no cell offset is uploaded', () => {
  const passes = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'lyrics', 'gl', 'passes.js'), 'utf8');
  const body = passes.slice(passes.indexOf('function buildBgBatch'), passes.indexOf('function buildPiecesBatch'));
  assert.ok(body.includes('inkBoxFor'), 'the batch uses the ink box');
  assert.ok(/positions\.push\(cx, cy, i, 0, 0, box\.w, box\.h, em, em\)/.test(body), 'a_inkToCell is 0');
  assert.ok(!body.includes('cellMetricsFor'), 'the advance cell no longer drives the quad');
});

test('the background is exactly one cell and carries no size knob', () => {
  assert.equal(textBg.backgroundScale, undefined, 'the background scale draw is gone');
  assert.equal(textBg.BG_SCALE_MIN, undefined);
  assert.equal(textBg.BG_SCALE_MAX, undefined);
  // every letter, every beat, every seed: one cell, the letter's own cell
  for (const params of [{}, { maxScale: 2.4 }, { maxScale: 1 }, { width: 3, height: 3, unit: 'cell' }]) {
    const bg = textBg.evaluateBg({ type: 'square', params }, { type: 'follow', params: {} }, [entry(), entry()], null, null, 2, { seed: 4242, group: 'bgShape' });
    for (const state of bg.states) {
      assert.equal(state.sizeX, 1, `background width for ${JSON.stringify(params)}`);
      assert.equal(state.sizeY, 1, `background height for ${JSON.stringify(params)}`);
    }
  }
  // the cap cannot shrink the one-cell background either
  const states = [{ sizeX: 1, sizeY: 1, motionScaleX: 1.2, motionScaleY: 1, params: { maxScale: 2.4 } }];
  textBg.capBackground(states, 'cell', { w: 800, h: 200 }, { cell: 2.5, emExtra: 0.6, emPx: 96 });
  assert.equal(states[0].sizeX, 1, 'the motion scale is not mistaken for a size');
});

test('capBackground still clamps a cell ornament including its motion scale', () => {
  const states = [{ sizeX: 2.4, sizeY: 2.4, motionScaleX: 1.2, motionScaleY: 1, params: {} }];
  textBg.capBackground(states, 'cell', { w: 800, h: 200 }, { cell: 1.25, emExtra: 0.6, emPx: 96 });
  assert.ok(Math.abs(states[0].sizeX * 1.2 - 1.25) < 1e-9, `the cap includes the motion scale (${states[0].sizeX * 1.2})`);
  // a background-scale `maxScale` left in a stored style no longer overrides the cap
  const legacy = [{ sizeX: 4, sizeY: 4, motionScaleX: 1, motionScaleY: 1, params: { maxScale: 2 } }];
  textBg.capBackground(legacy, 'cell', { w: 800, h: 200 }, {});
  assert.equal(legacy[0].sizeX, 1.25);
  assert.equal(legacy[0].sizeY, 1.25);
});

test('capBackground keeps cell / em sizes inside the engine caps', () => {
  const cell = [
    { sizeX: 2, sizeY: 2, motionScaleX: 1, motionScaleY: 1, params: {} },
    { sizeX: 1, sizeY: 1, motionScaleX: 2, motionScaleY: 1, params: {} },
  ];
  textBg.capBackground(cell, 'cell', { w: 800, h: 200 }, { cell: 1.25, emExtra: 0.6, emPx: 96 });
  assert.ok(cell[0].sizeX <= 1.25 && cell[0].sizeY <= 1.25, 'cell size clamped');
  assert.ok(cell[1].sizeX * cell[1].motionScaleX <= 1.25 + 1e-9, 'the motion scale is part of the limit');
  // em: the cap is the text box + 0.6 em
  const em = [{ sizeX: 8, sizeY: 8, motionScaleX: 1, motionScaleY: 1, params: {} }];
  textBg.capBackground(em, 'em', { w: 480, h: 96 }, { cell: 1.25, emExtra: 0.6, emPx: 96 });
  assert.ok(Math.abs(em[0].sizeX - (480 / 96 + 0.6)) < 1e-9, `em x ${em[0].sizeX}`);
  assert.ok(Math.abs(em[0].sizeY - (96 / 96 + 0.6)) < 1e-9, `em y ${em[0].sizeY}`);
  // the definition background carries no geometry at all ...
  assert.equal(fx.paramDefaults('bgShape', 'square').width, undefined);
  assert.equal(fx.paramDefaults('bgShape', 'square').unit, undefined);
  // ... the ornament square keeps the free geometry
  assert.equal(fx.paramDefaults('ornShape', 'square').width, 1.05);
  const randomRange = fx.get('ornShape', 'square').params.find((param) => param.key === 'width').random;
  assert.deepEqual(randomRange, [0.7, 1.15]);
});

test('ornShape and its companions default to none / follow', () => {
  assert.equal(fx.defaultsFor('ornShape').type, 'none');
  assert.equal(fx.defaultsFor('ornMotion').type, 'follow');
  assert.equal(fx.defaultsFor('ornFill').type, 'solid');
  assert.equal(fx.defaultsFor('ornEdge'), null);
  const shapes = fx.list('ornShape').map((descriptor) => descriptor.type).sort();
  assert.deepEqual(shapes, ['bar', 'blob', 'bracket', 'circle', 'cloud', 'diamond', 'drop', 'heart', 'paper', 'ring', 'rounded', 'scratch', 'splatter', 'square', 'star']);
});

test('a background square is forced to the letter cell; an ornament keeps its geometry', () => {
  const shape = { type: 'square', params: { unit: 'em', width: 2, height: 2, lockAspect: false, offset: { x: 0.3, y: -0.4 }, rotation: 30 } };
  const bg = textBg.evaluateBg(shape, { type: 'follow', params: {} }, [entry()], null, null, 0, { seed: 1, group: 'bgShape' });
  assert.equal(bg.unit, 'cell');
  assert.equal(bg.group, 'bgShape');
  for (const state of bg.states) {
    assert.equal(state.sizeX, 1);
    assert.equal(state.sizeY, 1);
    assert.equal(state.offsetX, 0);
    assert.equal(state.offsetY, 0);
    assert.equal(state.rotation, 0);
    assert.equal(state.shapeIndex, textBg.SHAPES.square);
  }
  // a variation carrying geometry cannot move the background either, but its
  // colour and visibility still apply
  const variation = [{ shapeIndex: textBg.SHAPES.star, sizeMul: [2, 2], offsetAdd: [0.5, 0.5], rotAdd: 45, color: [1, 0, 0, 1] }];
  const varied = textBg.evaluateBg(shape, { type: 'follow', params: {} }, [entry()], variation, null, 0, { seed: 1, group: 'bgShape' });
  assert.equal(varied.states[0].sizeX, 1);
  assert.equal(varied.states[0].offsetX, 0);
  assert.equal(varied.states[0].rotation, 0);
  assert.equal(varied.states[0].shapeIndex, textBg.SHAPES.square);
  assert.deepEqual(varied.states[0].color, [1, 0, 0, 1], 'the vary colour survives');
  // without an explicit group the shape decides: a cell square is a background
  const inferred = textBg.evaluateBg({ type: 'square', params: { unit: 'cell', width: 2 } }, { type: 'follow', params: {} }, [entry()], null, null, 0, { seed: 1 });
  assert.equal(inferred.states[0].sizeX, 1);
  // the same data as an ornament keeps every geometry parameter
  const orn = textBg.evaluateBg({ ...shape, params: { ...shape.params, unit: 'cell' } }, { type: 'follow', params: {} }, [entry()], null, null, 0, { seed: 1, group: 'ornShape' });
  assert.equal(orn.states[0].sizeX, 2);
  assert.equal(orn.states[0].rotation, 30);
  assert.equal(orn.states[0].offsetX, 0.3);
});

test('splitStyle sorts the legacy bg groups into background and ornament', () => {
  const bg = textBg.splitStyle(
    {
      bgShape: { type: 'square', params: { unit: 'cell', width: 1.2, height: 1.2, opacity: 0.8, offset: { x: 0.1, y: 0 }, layer: 'front' } },
      bgFill: { type: 'solid', params: {} },
      bgMotion: { type: 'pop', params: {} },
    },
    { shape: { type: 'square', params: { unit: 'cell' } } }
  );
  assert.equal(bg.kind, 'bg');
  assert.deepEqual(bg.style.bgShape.params, { opacity: 0.8 }, 'the geometry parameters are dropped');
  assert.ok(bg.style.bgFill && bg.style.bgMotion);
  assert.equal(bg.style.ornShape, undefined);
  // every other shape (and the em square) is an ornament; the moved bag keeps
  // a `bgShape: none` so an inherited background is cancelled
  for (const shape of [
    { type: 'rounded', params: { unit: 'cell', width: 1.2 } },
    { type: 'star', params: { unit: 'cell' } },
    { type: 'bar', params: { unit: 'cell', height: 0.4 } },
    { type: 'square', params: { unit: 'em', width: 0.3 } },
  ]) {
    const split = textBg.splitStyle({
      bgShape: shape,
      bgFill: { type: 'solid', params: {} },
      bgEdge: [{ type: 'outline' }],
      bgMotion: { type: 'follow', params: {} },
    });
    assert.equal(split.kind, 'orn', shape.type);
    assert.deepEqual(split.style.bgShape, { type: 'none', params: {}, enabled: true });
    assert.equal(split.style.ornShape.type, shape.type);
    assert.ok(split.style.ornFill && split.style.ornEdge && split.style.ornMotion);
    assert.equal(split.style.bgFill, undefined);
  }
  // the root bag carries nothing to cancel
  const root = textBg.splitStyle({ bgShape: { type: 'circle', params: {} } }, { shadow: false });
  assert.equal(root.style.bgShape, undefined);
  assert.equal(root.style.ornShape.type, 'circle');
  // a bag patching only the fill follows the resolved inherited shape
  const bgFillOnly = textBg.splitStyle({ bgFill: { type: 'solid', params: {} } }, { shape: { type: 'square', params: { unit: 'cell' } } });
  assert.equal(bgFillOnly.changed, false);
  const ornFillOnly = textBg.splitStyle({ bgFill: { type: 'solid', params: {} } }, { shape: { type: 'star', params: {} } });
  assert.equal(ornFillOnly.kind, 'orn');
  assert.ok(ornFillOnly.style.ornFill);
  assert.equal(ornFillOnly.style.bgShape.type, 'none');
});

test('generated text backgrounds stay inside the caps', () => {
  const effects = ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'post', 'background', 'color', 'vary'];
  for (const name of effects) require(`../../renderer/js/lyrics/effects/${name}.js`);
  const moods = require('../../renderer/js/lyrics/moods.js');
  const context = { letterCount: 12, cjk: false, hasPrevious: true, badgeId: false, hasCard: false, aspect: '16:9' };
  let backgrounds = 0;
  let ornaments = 0;
  for (let seed = 1; seed <= 100; seed += 1) {
    const style = moods.generate({ axes: { speed: 0.5, energy: 0.6, softness: 0.5, density: 0.6, brightness: 0.4, weird: 0.7 }, seed, context }).style;
    // the background is always a cell square with no geometry in the data
    const shape = style.bgShape;
    if (shape && shape.type && shape.type !== 'none') {
      assert.equal(shape.type, 'square', `seed ${seed} background type ${shape.type}`);
      // the automatic direction stores no size of its own: the box is the cell
      assert.equal(shape.params.maxScale, undefined, `seed ${seed} background maxScale ${shape.params.maxScale}`);
      assert.equal(shape.params.width, undefined, `seed ${seed} background width ${shape.params.width}`);
      const bg = textBg.evaluateBg(shape, style.bgMotion || { type: 'follow', params: {} }, [entry()], null, null, 2, { seed, group: 'bgShape' });
      assert.ok(bg, `seed ${seed} background does not evaluate`);
      for (const state of bg.states) {
        assert.equal(state.sizeX, 1, `seed ${seed} background width`);
        assert.equal(state.sizeY, 1, `seed ${seed} background height`);
        assert.equal(state.offsetX, 0);
        assert.equal(state.rotation, 0);
      }
      backgrounds += 1;
    }
    // the ornaments keep their data geometry and stay inside the caps
    const orn = style.ornShape;
    if (orn && orn.type && orn.type !== 'none') {
      const params = orn.params || {};
      const unit = params.unit === 'em' ? 'em' : 'cell';
      const limit = unit === 'em' ? 1.6 : 1.25;
      assert.ok(Number(params.width) <= limit + 1e-9, `seed ${seed} ${unit} width ${params.width}`);
      assert.ok(Number(params.height) <= limit + 1e-9, `seed ${seed} ${unit} height ${params.height}`);
      const ornBg = textBg.evaluateBg(orn, style.ornMotion || { type: 'follow', params: {} }, [entry()], null, null, 2, { seed, group: 'ornShape' });
      if (ornBg) {
        textBg.capBackground(ornBg.states, ornBg.unit, { w: 700, h: 120 }, { emPx: 96 });
        for (const state of ornBg.states) {
          const effectiveX = state.sizeX * Math.abs(state.motionScaleX);
          const effectiveY = state.sizeY * Math.abs(state.motionScaleY);
          if (ornBg.unit === 'cell') {
            assert.ok(effectiveX <= 1.25 + 1e-9 && effectiveY <= 1.25 + 1e-9, `seed ${seed} cell effective ${effectiveX}x${effectiveY}`);
          } else {
            assert.ok(effectiveX <= 700 / 96 + 0.6 + 1e-9 && effectiveY <= 120 / 96 + 0.6 + 1e-9, `seed ${seed} em effective ${effectiveX}x${effectiveY}`);
          }
        }
      }
      ornaments += 1;
    }
  }
  assert.ok(backgrounds >= 1, `only ${backgrounds} backgrounds drawn`);
  assert.ok(ornaments > 20, `only ${ornaments} ornaments drawn`);
});

test('the pinned profile options override the genre tables', () => {
  const rng = require('../../renderer/js/lyrics/rng.js');
  const moods = require('../../renderer/js/lyrics/moods.js');
  const axes = { speed: 0.5, energy: 0.5, softness: 0.5, density: 0.5, brightness: 0.5, weird: 0.6 };
  const palette = ['#101018', '#202838', '#eef2ff', '#ff8a3d', '#05060a', '#ffc247'];
  const genre = { bg: { chance: 0, placement: { enclose: 1 } } };
  const style = {};
  const applied = moods.applyGenreBackground(style, genre, axes, rng.rngFor(7, 'bg'), palette, false, {
    chance: 1,
    placement: { bgAccent: 1 },
    varyChance: 1,
    edgeChance: 1,
  });
  assert.equal(applied, true);
  // a pinned accent is not a background: it lands on the ornament groups
  // (a basic mark hugs its letter instead: a cell-sized shape behind it)
  if (!(style.ornShape.params.unit === 'cell' && style.ornShape.params.width === 1)) {
    assert.equal(style.ornShape.params.unit, 'em');
    assert.equal(style.ornShape.params.layer, 'front');
  }
  assert.notEqual(style.ornShape.params.vary, 'none');
  assert.ok(Array.isArray(style.ornEdge) && style.ornEdge.length > 0);
  assert.equal(style.bgShape, undefined);
  // a pinned zero blocks the draw even when the genre wants one
  assert.equal(moods.applyGenreBackground({}, { bg: { chance: 1 } }, axes, rng.rngFor(7, 'bg2'), palette, false, { chance: 0 }), false);
  // without options the genre's own zero still keeps the classic behaviour
  assert.equal(moods.applyGenreBackground({}, genre, axes, rng.rngFor(7, 'bg3'), palette, false), false);
  // a lone pinned placement weight always lands on that placement
  const placed = {};
  assert.equal(moods.applyGenreBackground(placed, null, axes, rng.rngFor(7, 'bg4'), palette, false, { chance: 1, placement: { bgUnderlay: 1 } }), true);
  assert.equal(placed.ornShape.params.layer, 'behind');
  assert.ok(['em', 'cell'].includes(placed.ornShape.params.unit));
  // a pinned enclose square is the definition background: a cell square with
  // no geometry in the data (the shape draw is random, so scan for a square)
  let enclosed = null;
  for (let seed = 1; seed <= 60 && !enclosed; seed += 1) {
    const candidate = {};
    moods.applyGenreBackground(candidate, null, axes, rng.rngFor(seed, 'bg-square'), palette, false, { chance: 1, placement: { bgEnclose: 1 } });
    if (candidate.bgShape) enclosed = candidate;
  }
  assert.ok(enclosed, 'no enclose square seed found');
  assert.equal(enclosed.bgShape.type, 'square');
  assert.equal(enclosed.bgShape.params.unit, undefined);
  assert.equal(enclosed.bgShape.params.width, undefined);
  assert.ok(enclosed.bgFill && enclosed.bgMotion);
  assert.equal(enclosed.ornShape, undefined);
});

test('the same seed keeps its draw and only the destination splits', () => {
  const rng = require('../../renderer/js/lyrics/rng.js');
  const moods = require('../../renderer/js/lyrics/moods.js');
  const axes = { speed: 0.5, energy: 0.6, softness: 0.5, density: 0.5, brightness: 0.5, weird: 0.3 };
  const palette = ['#101018', '#202838', '#eef2ff', '#ff8a3d', '#05060a', '#ffc247'];
  const genre = { bg: { chance: 0.35, placement: { enclose: 0.5, accent: 0.3, underlay: 0.2 }, shapes: { square: 3, circle: 2, bar: 1, star: 1, '*': 0 } } };
  let backgrounds = 0;
  let ornaments = 0;
  for (let seed = 1; seed <= 600; seed += 1) {
    const first = {};
    const second = {};
    const applied = moods.applyGenreBackground(first, genre, axes, rng.rngFor(seed, 'bg-split'), palette, false);
    moods.applyGenreBackground(second, genre, axes, rng.rngFor(seed, 'bg-split'), palette, false);
    // the same seed draws exactly the same picture ...
    assert.deepEqual(second, first, `seed ${seed} is not deterministic`);
    if (!applied) {
      assert.deepEqual(first, {}, `seed ${seed} skipped but wrote data`);
      continue;
    }
    // ... and the shape lands on the side the definition asks for
    const bgOn = first.bgShape && first.bgShape.type && first.bgShape.type !== 'none';
    const ornOn = first.ornShape && first.ornShape.type && first.ornShape.type !== 'none';
    assert.ok(bgOn || ornOn, `seed ${seed} drew nothing`);
    if (bgOn) {
      assert.equal(first.bgShape.type, 'square', `seed ${seed} background type`);
      assert.equal(first.bgShape.params.unit, undefined, `seed ${seed} background unit`);
      backgrounds += 1;
    }
    if (ornOn) {
      // a letter-sized mark is a cell shape of exactly one letter box
      if (first.ornShape.type === 'square') assert.ok(first.ornShape.params.unit === 'em' || first.ornShape.params.width === 1, `seed ${seed} ornament square`);
      ornaments += 1;
    }
  }
  assert.ok(backgrounds > 5, `only ${backgrounds} backgrounds`);
  assert.ok(ornaments > 5, `only ${ornaments} ornaments`);
});

test('basic marks are letter-sized and centred, and the background edge uses the font edge vocabulary', () => {
  const rng = require('../../renderer/js/lyrics/rng.js');
  const moods = require('../../renderer/js/lyrics/moods.js');
  const axes = { speed: 0.5, energy: 0.6, softness: 0.5, density: 0.5, brightness: 0.5, weird: 0.2 };
  const palette = ['#101018', '#202838', '#eef2ff', '#ff8a3d', '#05060a', '#ffc247'];
  const basic = new Set(['square', 'rounded', 'circle', 'diamond', 'star', 'heart']);
  const edgeTypes = new Set();
  let letterSized = 0;
  let applied = 0;
  for (let seed = 1; seed <= 200; seed += 1) {
    const style = {};
    if (!moods.applyGenreBackground(style, null, axes, rng.rngFor(seed, 'bg-basic'), palette, false, { chance: 1, edgeChance: 1 })) continue;
    applied += 1;
    const orn = style.ornShape;
    if (orn && basic.has(orn.type)) {
      assert.equal(orn.params.unit, 'cell', `seed ${seed} ${orn.type} unit`);
      assert.equal(orn.params.width, 1);
      assert.equal(orn.params.height, 1);
      assert.equal(orn.params.offset, undefined, `seed ${seed} ${orn.type} must stay centred`);
      assert.equal(orn.params.layer, 'behind');
      letterSized += 1;
    }
    for (const edge of style.ornEdge || style.bgEdge || []) edgeTypes.add(edge.type);
  }
  assert.ok(letterSized > 10, `only ${letterSized} letter-sized marks`);
  assert.ok(edgeTypes.has('neonGlow') && edgeTypes.has('outline'), [...edgeTypes].join());
  // unpinned, the background is the exception
  let present = 0;
  for (let seed = 1; seed <= 200; seed += 1) {
    if (moods.applyGenreBackground({}, null, axes, rng.rngFor(seed, 'bg-rare'), palette, false)) present += 1;
  }
  assert.ok(present < 70, `${present}/200 looks carry a background`);
});

test('the theme scatter knobs drive offset, size and colour spread of the marks', () => {
  const rng = require('../../renderer/js/lyrics/rng.js');
  const moods = require('../../renderer/js/lyrics/moods.js');
  const genParams = require('../../renderer/js/lyrics/gen-params.js');
  for (const key of ['bgOffsetScatter', 'bgSizeScatter', 'bgColorScatter']) {
    assert.ok(genParams.PARAMS.some((param) => param.key === key), `${key} is not a theme parameter`);
  }
  const axes = { speed: 0.5, energy: 0.5, softness: 0.5, density: 0.5, brightness: 0.5, weird: 0 };
  const palette = ['#101018', '#202838', '#eef2ff', '#ff8a3d', '#05060a', '#ffc247', '#44aa88', '#cc3366'];
  let checked = 0;
  for (let seed = 1; seed <= 80; seed += 1) {
    const flat = {};
    const spread = {};
    const base = { chance: 1, placement: { bgAccent: 1 } };
    moods.applyGenreBackground(flat, null, axes, rng.rngFor(seed, 'sc'), palette, false, base);
    moods.applyGenreBackground(spread, null, axes, rng.rngFor(seed, 'sc'), palette, false, { ...base, offsetScatter: 1, sizeScatter: 1, colorScatter: 1 });
    if (!flat.ornShape) continue;
    assert.equal(flat.ornShape.params.varyOffset, undefined);
    assert.equal(flat.ornShape.params.varySize, undefined);
    assert.ok(spread.ornShape.params.varyOffset > 0 && spread.ornShape.params.varySize > 0);
    assert.notEqual(spread.ornShape.params.vary, 'none');
    assert.ok(spread.ornShape.params.varyColors.length >= flat.ornShape.params.varyColors.length);
    checked += 1;
  }
  assert.ok(checked > 10);
});
