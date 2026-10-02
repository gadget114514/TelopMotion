'use strict';

// shape-ops expands one authored shape into the primitive list the GL shape
// pass draws, and normalises the trim / dash / path op the pass expects.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const ops = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'shape-ops.js'));

test('trim and dash are clamped and normalised', () => {
  assert.deepEqual(ops.normalizeTrim({ trimStart: 0.8, trimEnd: 0.2, trimOffset: 0.5 }), [0.2, 0.8, 0.5], 'reversed ranges are sorted');
  assert.deepEqual(ops.normalizeTrim({}), [0, 1, 0]);
  assert.deepEqual(ops.normalizeTrim({ trimStart: -3, trimEnd: 9 }), [0, 1, 0]);
  assert.deepEqual(ops.normalizeDash({}), [0, 0, 0], 'no dash length means no dash');
  assert.deepEqual(ops.normalizeDash({ dashOn: 0.1 }), [0.1, 0.1, 0], 'the gap defaults to the dash');
  assert.deepEqual(ops.normalizeDash({ dashOn: 0.1, dashOff: 0.05, dashOffset: 0.2 }), [0.1, 0.05, 0.2]);
});

test('the path op maps to the shader code', () => {
  assert.deepEqual(ops.normalizePathOp({}), [0, 0, 0, 0]);
  assert.deepEqual(ops.normalizePathOp({ pathOp: 'zigzag', pathOpAmount: 0.4, pathOpFreq: 3 }, 1.5), [2, 0.4, 3, 1.5]);
  assert.deepEqual(ops.normalizePathOp({ pathOp: 'nope' }), [0, 0, 0, 0]);
  assert.deepEqual(ops.PATH_OPS, ['none', 'wiggle', 'zigzag', 'pucker', 'twist']);
});

test('the repeater walks copies outwards and fades them', () => {
  const instances = ops.repeaterInstances({}, { copies: 4, offset: 0.5, width: 10, position: { x: 1, y: 0 }, scale: 0.5, startOpacity: 1, endOpacity: 0 });
  assert.equal(instances.length, 4);
  assert.deepEqual(instances.map((entry) => entry.index), [0, 1, 2, 3]);
  assert.equal(instances[0].dx, 0);
  assert.equal(instances[1].dx, 5, '0.5 offset of a 10px shape');
  assert.equal(instances[2].dx, 5 + 2.5, 'the previous copy is already scaled');
  assert.equal(instances[1].scale, 0.5);
  assert.equal(instances[3].scale, 0.125);
  assert.equal(instances[3].opacity, 0);
  assert.ok(instances[1].opacity < instances[0].opacity);
  // a single copy is the shape itself
  assert.deepEqual(ops.repeaterInstances({}, { copies: 1 }), [{ index: 0, opacity: 1, dx: 0, dy: 0, rotation: 0, scale: 1 }]);
});

test('expand turns a spec into drawable primitives', () => {
  const rects = ops.expand({ kind: 'rect', x: 10, y: 20, w: 30, h: 40, radius: 4, opacity: 0.5 }, {});
  assert.equal(rects.length, 1);
  assert.equal(rects[0].kind, 'rect');
  assert.deepEqual([rects[0].x, rects[0].y, rects[0].w, rects[0].h], [10, 20, 30, 40]);
  assert.equal(rects[0].radius, 4);
  assert.equal(rects[0].opacity, 0.5);
  const ring = ops.expand({ kind: 'ring', x: 1, y: 2, radius: 12, ring: 3 }, {});
  assert.equal(ring[0].kind, 'circle');
  assert.equal(ring[0].ring, 3);
  const line = ops.expand({ kind: 'capsule', x: 0, y: 0, length: 10, stroke: 2 }, {});
  assert.equal(line[0].kind, 'capsule');
  assert.deepEqual([line[0].p0.x, line[0].p1.x], [-5, 5]);
  const poly = ops.expand({ kind: 'polygon', radius: 8, sides: 5 }, {});
  assert.equal(poly[0].sides, 5);
  // a repeater multiplies the list and scales each copy
  const repeated = ops.expand({ kind: 'rect', w: 10, h: 10 }, { copies: 3, offset: 1, width: 10, position: { x: 1, y: 0 }, scale: 1 });
  assert.equal(repeated.length, 3);
  assert.deepEqual(repeated.map((entry) => entry.x), [0, 10, 20]);
});

test('the drive maps the beat progress to the trim', () => {
  const spec = { trimStart: 0.1, trimEnd: 0.9, speed: 0.5 };
  assert.deepEqual(ops.trimForDrive({ ...spec, drive: 'enter' }, { progress: 0.5 }), [0.1, 0.5, 0]);
  assert.deepEqual(ops.trimForDrive({ ...spec, drive: 'enter' }, { progress: 0 }), [0.1, 0.1, 0]);
  assert.deepEqual(ops.trimForDrive({ ...spec, drive: 'exit' }, { progress: 0.5 }), [0.5, 0.9, 0]);
  assert.deepEqual(ops.trimForDrive({ ...spec, drive: 'hold' }, { time: 1 }), [0.1, 0.9, 0.5]);
  assert.deepEqual(ops.trimForDrive({ ...spec, drive: 'beat' }, { time: 0.75, bpm: 120 }), [0.1, 0.9, 0.5]);
});

test('a named shape fits the text box handed in by the engine', () => {
  const box = { x0: 100, y0: 200, x1: 500, y1: 300 };
  const opts = { box, progress: 1 };
  const underline = ops.expand({ shape: 'underline', stroke: 4, padding: 0.1 }, opts);
  assert.equal(underline.length, 1);
  assert.equal(underline[0].kind, 'capsule');
  // padding is a fraction of the shorter box side (100px -> 10px)
  assert.deepEqual([underline[0].p0.y, underline[0].p1.y], [310, 310]);
  assert.deepEqual([underline[0].p0.x, underline[0].p1.x], [90, 510]);
  const boxed = ops.expand({ shape: 'box', stroke: 6, padding: 0, corner: 0.2 }, opts);
  assert.deepEqual([boxed[0].kind, boxed[0].x, boxed[0].y, boxed[0].w, boxed[0].h], ['rect', 100, 200, 400, 100]);
  assert.equal(boxed[0].stroke, 6);
  const ring = ops.expand({ shape: 'ring', stroke: 5, padding: 0 }, opts);
  assert.equal(ring[0].kind, 'circle');
  assert.equal(ring[0].ring, 5);
  assert.equal(ring[0].radius, 200, 'the ring covers the longer box side');
  const brackets = ops.expand({ shape: 'brackets', stroke: 3, padding: 0 }, opts);
  assert.equal(brackets.length, 6, 'brackets are two risers and four arms');
  assert.ok(ops.expand({ shape: 'box' }, {}).length === 0, 'no box on screen means nothing to draw');
});

test('followText line repeats the shape for every line box', () => {
  const box = { x0: 0, y0: 0, x1: 400, y1: 100 };
  const boxes = [box, { x0: 0, y0: 120, x1: 300, y1: 220 }];
  const block = ops.expand({ shape: 'strike', stroke: 2, padding: 0 }, { box, boxes });
  assert.equal(block.length, 1);
  const line = ops.expand({ shape: 'strike', stroke: 2, padding: 0, followText: 'line' }, { box, boxes });
  assert.equal(line.length, 2);
  assert.ok(line[1].p0.y > line[0].p0.y, 'the second line sits lower');
  assert.deepEqual(ops.FOLLOW_MODES, ['block', 'line', 'word', 'char', 'span']);
});

test('followText word, char, and span enclose words, characters, or substrings', () => {
  const chars = [
    { x0: 0, y0: 0, x1: 20, y1: 40, char: 'H', index: 0, lineIdx: 0, wordIdx: 0 },
    { x0: 20, y0: 0, x1: 40, y1: 40, char: 'e', index: 1, lineIdx: 0, wordIdx: 0 },
    { x0: 40, y0: 0, x1: 60, y1: 40, char: 'l', index: 2, lineIdx: 0, wordIdx: 0 },
    { x0: 60, y0: 0, x1: 80, y1: 40, char: 'l', index: 3, lineIdx: 0, wordIdx: 0 },
    { x0: 80, y0: 0, x1: 100, y1: 40, char: 'o', index: 4, lineIdx: 0, wordIdx: 0 },
    { x0: 110, y0: 0, x1: 130, y1: 40, char: ' ', index: 5, lineIdx: 0, wordIdx: 0 },
    { x0: 140, y0: 0, x1: 160, y1: 40, char: 'W', index: 6, lineIdx: 0, wordIdx: 1 },
    { x0: 160, y0: 0, x1: 180, y1: 40, char: 'o', index: 7, lineIdx: 0, wordIdx: 1 },
    { x0: 180, y0: 0, x1: 200, y1: 40, char: 'r', index: 8, lineIdx: 0, wordIdx: 1 },
    { x0: 200, y0: 0, x1: 220, y1: 40, char: 'l', index: 9, lineIdx: 0, wordIdx: 1 },
    { x0: 220, y0: 0, x1: 240, y1: 40, char: 'd', index: 10, lineIdx: 0, wordIdx: 1 },
  ];
  const words = [
    { x0: 0, y0: 0, x1: 100, y1: 40, lineIdx: 0, wordIdx: 0 },
    { x0: 140, y0: 0, x1: 240, y1: 40, lineIdx: 0, wordIdx: 1 },
  ];
  const box = { x0: 0, y0: 0, x1: 240, y1: 40 };

  // word follow mode
  const wordBoxes = ops.expand({ shape: 'box', stroke: 2, padding: 0, followText: 'word' }, { box, words, chars });
  assert.equal(wordBoxes.length, 2, 'two words generate two boxes');
  assert.equal(wordBoxes[0].w, 100);
  assert.equal(wordBoxes[1].w, 100);
  assert.equal(wordBoxes[1].x, 140);

  // char follow mode
  const charBoxes = ops.expand({ shape: 'box', stroke: 2, padding: 0, followText: 'char' }, { box, words, chars });
  assert.equal(charBoxes.length, 11, '11 characters generate 11 boxes');

  // span follow mode with matchText
  const matchWorld = ops.expand({ shape: 'box', stroke: 2, padding: 0, followText: 'span', matchText: 'World' }, { box, words, chars });
  assert.equal(matchWorld.length, 1);
  assert.equal(matchWorld[0].x, 140);
  assert.equal(matchWorld[0].w, 100);

  // span follow mode with spanFrom / spanTo (e.g. "Hello" -> chars 0..4)
  const spanHello = ops.expand({ shape: 'box', stroke: 2, padding: 0, followText: 'span', spanFrom: 0, spanTo: 4 }, { box, words, chars });
  assert.equal(spanHello.length, 1);
  assert.equal(spanHello[0].x, 0);
  assert.equal(spanHello[0].w, 100);

  // span matching multiple occurrences (e.g. 'l')
  const matchL = ops.expand({ shape: 'box', stroke: 2, padding: 0, followText: 'span', matchText: 'l' }, { box, words, chars });
  // 'll' in Hello is contiguous so it forms 1 box, 'l' in World forms 1 box -> total 2 boxes
  assert.equal(matchL.length, 2);
  assert.equal(matchL[0].x, 40);
  assert.equal(matchL[0].w, 40); // 'll' (40 to 80)
  assert.equal(matchL[1].x, 200);
  assert.equal(matchL[1].w, 20); // 'l' (200 to 220)
});

test('the drive and the dash reach the expanded primitives', () => {
  const box = { x0: 0, y0: 0, x1: 100, y1: 100 };
  const half = ops.expand({ shape: 'box', drive: 'enter', trimStart: 0.2, trimEnd: 0.8, dashOn: 0.1, dashOffset: 0.25 }, { box, progress: 0.5 });
  assert.deepEqual(half[0].trim, [0.2, 0.5, 0]);
  assert.deepEqual(half[0].dash, [0.1, 0.1, 0.25]);
  const hold = ops.expand({ shape: 'box', drive: 'hold', speed: 1, trimOffset: 0.5 }, { box, time: 0.25 });
  assert.deepEqual(hold[0].trim, [0, 1, 0.75]);
});

test('the shape pass carries the trim, dash, cap and path op', () => {
  const source = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'lyrics', 'gl', 'shapes.js'), 'utf8');
  for (const token of ['u_trim', 'u_dash', 'u_cap', 'u_warp', 'pathParam', 'warpPoint', 'u_pattern', 'u_patternParams', 'patternMask']) {
    assert.ok(source.includes(token), `shapes.js has no ${token}`);
  }
  // the trim defaults keep the previous look (no trim, no dash, round cap)
  assert.ok(source.includes('opts.trim || [0, 1, 0]'), 'the trim default changed');
  assert.ok(source.includes("Array.isArray(opts.dash) ? opts.dash : [0, 0, 0]"), 'the dash default changed');
  assert.ok(source.includes("opts.cap === 'butt' ? 0 : 1"), 'the cap default changed');
  // the pattern library is shared with gl/shaders.js, not copied
  assert.ok(source.includes('SA.glShaders.PATTERN_GLSL'), 'the shape pass does not reuse the shared pattern library');
  // every primitive wrapper forwards the shape-op uniforms
  for (const wrapper of ['rect', 'circle', 'ring', 'capsule', 'polygon']) {
    const start = source.indexOf(`function ${wrapper}(options)`);
    assert.ok(start > 0, `shapes.js has no ${wrapper} wrapper`);
    const body = source.slice(start, source.indexOf('\n    }', start));
    for (const token of ['trim: opts.trim', 'dash: opts.dash', 'pathOp: opts.pathOp', 'pattern: opts.pattern', 'patternParams: opts.patternParams']) {
      assert.ok(body.includes(token), `${wrapper} does not forward ${token}`);
    }
  }
  // a stroked outline keeps room for the stroke: the quad is padded
  const circle = source.slice(source.indexOf('function circle(options)'), source.indexOf('function ring(options)'));
  assert.ok(circle.includes('opts.stroke'), 'circle does not pad its quad for a stroke');
});

test('the pattern vocabulary is shared and reaches the expanded primitives', () => {
  const patterns = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'patterns.js'));
  assert.deepEqual(ops.PATTERNS, patterns.PATTERNS);
  assert.equal(ops.PATTERNS.length, 20, 'the vocabulary grew or shrank');
  assert.equal(new Set(ops.PATTERNS).size, ops.PATTERNS.length, 'duplicate pattern name');
  assert.equal(ops.PATTERN_CODES.solid, 0, 'solid must stay the no-op code');
  assert.equal(ops.PATTERN_CODES.dashed, 1);
  assert.equal(ops.PATTERN_CODES.dotted, 2);
  assert.equal(ops.PATTERN_CODES.sketch, 15);
  assert.equal(ops.PATTERN_CODES.doubleDashed, 16);
  assert.equal(ops.PATTERN_CODES.squareChain, 17);
  assert.equal(ops.PATTERN_CODES.chain, 18);
  assert.equal(ops.PATTERN_CODES.ornament, 19);
  assert.equal(patterns.codeOf('nope'), 0);
  // a spec with a pattern reaches the primitive list with the packed params
  // (the flow is already this frame's phase: patternFlow x time)
  const box = ops.expand({ shape: 'box', pattern: 'railroad', patternSize: 32, patternRatio: 0.4, patternFlow: 1.5 }, { box: { x0: 0, y0: 0, x1: 100, y1: 100 }, time: 2 });
  assert.equal(box[0].pattern, ops.PATTERN_CODES.railroad);
  assert.deepEqual(box[0].patternParams, [32, 0.4, 3]);
  // solid / missing patterns pack the no-op params
  const solid = ops.expand({ shape: 'box' }, { box: { x0: 0, y0: 0, x1: 100, y1: 100 } });
  assert.equal(solid[0].pattern, 0);
  assert.deepEqual(solid[0].patternParams, [0, 0, 0]);
  // the stroke floor is the hairline scale on both paths
  assert.equal(ops.expand({ kind: 'capsule', length: 10, stroke: 0.01 }, {})[0].lineWidth, 0.1);
  assert.equal(ops.namedSpecs({ shape: 'box' }, { x0: 0, y0: 0, x1: 100, y1: 100 })[0].kind, 'rect');
});

test('extended enclosing shapes expand into primitives', () => {
  const box = { x0: 100, y0: 200, x1: 500, y1: 300 };
  const opts = { box, progress: 1 };

  // overline
  const overline = ops.expand({ shape: 'overline', stroke: 4, padding: 0.1 }, opts);
  assert.equal(overline.length, 1);
  assert.equal(overline[0].kind, 'capsule');
  assert.deepEqual([overline[0].p0.y, overline[0].p1.y], [190, 190]);

  // topBottom
  const topBottom = ops.expand({ shape: 'topBottom', stroke: 4, padding: 0.1 }, opts);
  assert.equal(topBottom.length, 2);
  assert.equal(topBottom[0].p0.y, 190);
  assert.equal(topBottom[1].p0.y, 310);

  // sides
  const sides = ops.expand({ shape: 'sides', stroke: 4, padding: 0.1 }, opts);
  assert.equal(sides.length, 2);
  assert.ok(sides[0].angle === 90);
  assert.ok(sides[1].angle === 90);

  // sidesSemicircle
  const semi = ops.expand({ shape: 'sidesSemicircle', stroke: 4, padding: 0.1 }, opts);
  assert.ok(semi.length >= 8, 'sidesSemicircle produces arc segments');

  // sidesSemiellipse
  const semiEl = ops.expand({ shape: 'sidesSemiellipse', stroke: 4, padding: 0.1 }, opts);
  assert.ok(semiEl.length >= 8, 'sidesSemiellipse produces arc segments');

  // capsule
  const capsule = ops.expand({ shape: 'capsule', stroke: 4, padding: 0.1 }, opts);
  assert.equal(capsule.length, 1);
  assert.equal(capsule[0].kind, 'rect');
  assert.ok(capsule[0].radius > 0);

  // ornament
  const ornament = ops.expand({ shape: 'ornament', stroke: 4, padding: 0.1 }, opts);
  assert.ok(ornament.length >= 6, 'ornament frame produces ornate corners');
});

test('plate mode produces surface fill under the border with background pattern', () => {
  const box = { x0: 100, y0: 200, x1: 500, y1: 300 };
  const opts = { box, progress: 1 };

  // shape: plate with background color and pattern
  const plate = ops.expand({
    shape: 'plate',
    fillColor: '#112233',
    fillOpacity: 0.6,
    bgPattern: 'stripes',
    bgPatternSize: 30,
    stroke: 3,
  }, opts);

  // First primitive must be the plate surface
  assert.ok(plate.length >= 2, 'plate should produce at least surface + stroke');
  const surface = plate[0];
  assert.equal(surface.isPlateSurface, true);
  assert.equal(surface.stroke, 0);
  assert.equal(surface.color, '#112233');
  assert.equal(surface.opacity, 0.6);
  assert.equal(surface.pattern, ops.PATTERN_CODES.stripes);

  // Second primitive is the outer border
  const border = plate[1];
  assert.equal(border.kind, 'rect');
  assert.equal(border.stroke, 3);
});

test('animation layer drives enter, exit, and hold animations', () => {
  const box = { x0: 100, y0: 200, x1: 500, y1: 300 };

  // pop enter animation at progress 0.1
  const popEnter = ops.expand({
    shape: 'box',
    drive: 'auto',
    enterAnim: 'pop',
    in: 0.25,
  }, { box, progress: 0.1, time: 0.2 });
  assert.ok(popEnter[0].opacity > 0 && popEnter[0].opacity < 1);

  // shrink exit animation at progress 0.95
  const shrinkExit = ops.expand({
    shape: 'box',
    drive: 'auto',
    exitAnim: 'shrink',
    out: 0.25,
  }, { box, progress: 0.95, time: 1.9 });
  assert.ok(shrinkExit[0].opacity < 1);
  assert.ok(shrinkExit[0].w < 400);

  // flow hold animation increments trimOffset
  const holdFlow = ops.expand({
    shape: 'box',
    drive: 'auto',
    holdAnim: 'flow',
    speed: 1,
  }, { box, progress: 0.5, time: 2 });
  assert.ok(holdFlow[0].trim[2] > 0);
});

test('decorPrimitives expands high-level page decor items into GL primitives', () => {
  const decor = [
    { kind: 'rect', role: 'paper', x: 10, y: 20, w: 200, h: 100, radius: 8 },
    { kind: 'line', role: 'rule', x0: 0, y0: 50, x1: 200, y1: 50, lineWidth: 2 },
    { kind: 'circle', role: 'accent', x: 30, y: 30, r: 12 },
    { kind: 'bubble', role: 'paper', x: 50, y: 50, w: 100, h: 40, tailSide: 'left' },
    { kind: 'cells', role: 'rule', x: 0, y: 0, w: 100, h: 100, cols: 2, rows: 2 },
  ];
  const colors = {
    paper: '#111122',
    rule: '#444455',
    accent: '#ff2266',
  };
  const offset = { x: 50, y: 100 };
  const prims = ops.decorPrimitives(decor, { colors, offset, opacity: 0.8 });

  assert.ok(prims.length >= 5);
  // rect shifted by offset
  const rect = prims.find((p) => p.kind === 'rect' && p.w === 200);
  assert.equal(rect.x, 60);
  assert.equal(rect.y, 120);
  assert.equal(rect.color, '#111122');
  assert.equal(rect.opacity, 0.8);

  // capsule shifted by offset
  const line = prims.find((p) => p.kind === 'capsule' && p.lineWidth === 2);
  assert.equal(line.x0, 50);
  assert.equal(line.y0, 150);
  assert.equal(line.x1, 250);
  assert.equal(line.y1, 150);

  // bubble has both rect body and convex tail
  assert.ok(prims.some((p) => p.kind === 'convex'));
});


