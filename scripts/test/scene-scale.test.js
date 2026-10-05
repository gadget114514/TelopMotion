'use strict';

// The lyrics scene is laid out in the pixels of the frame being rendered. At a
// preview quality below 100% that frame is smaller than the project output, and
// `scene.js` must scale the whole layout so the motion evaluator, the GL passes
// and the overlay keep using one coordinate space.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const rng = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'rng.js'));
const projectApi = require(path.join(ROOT, 'renderer', 'js', 'studio', 'project.js'));
const color = require(path.join(ROOT, 'renderer', 'js', 'color.js'));
const weird = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'weird.js'));
const scope = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'scope.js'));
const fx = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects', 'registry.js'));
for (const name of ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'background', 'color', 'text-bg', 'repeat', 'warp', 'animator', 'selector', 'camera', 'shape-layer', 'softbody', 'staged-presets']) {
  require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects', `${name}.js`));
}

// a linear stand-in for the font layout: every metric is proportional to the
// requested size, exactly like the real metrics, so scaling is observable
function layoutStub(text, style, fonts, options) {
  const size = options.size;
  const chars = Array.from(String(text));
  const advance = size * 0.6;
  // `textOffset` is the beat text's code-point cursor, which the `range` scope
  // addresses (the real layout counts it the same way, font.js)
  let cursor = 0;
  const letters = chars.map((char, index) => {
    const textOffset = cursor;
    cursor += Array.from(char).length;
    return {
      char,
      glyph: null,
      fontId: 'stub',
      src: 'stub',
      raster: null,
      advance,
      advanceWithSpacing: advance,
      x: index * advance,
      y: size,
      bbox: { x1: 0, y1: -size * 0.8, x2: advance, y2: 0 },
      textOffset,
    };
  });
  const width = chars.length * advance;
  const line = { words: [{ letters, width }], width, height: size * 1.2, baseline: size, y: 0 };
  return {
    lines: [line],
    bbox: { x1: 0, y1: -size * 0.8, x2: width, y2: 0 },
    width,
    height: size * 1.2,
    ascent: size,
    descent: size * 0.3,
    size,
    lineHeight: size * 1.2,
    direction: 'horizontal',
  };
}

// A layout that honours the composition spans: the scoped `text` entries reach
// the layout as synthetic spans, so their scale / colour are observable here.
function composeLayoutStub(text, style, fonts, options) {
  const layout = layoutStub(text, style, fonts, options);
  const spans = (options.compose && options.compose.spans) || [];
  const size = options.size;
  let cursor = 0;
  for (const letter of layout.lines[0].words[0].letters) {
    let span = null;
    for (const candidate of spans) if (cursor >= candidate.from && cursor < candidate.to) { span = candidate; break; }
    if (span) {
      const scale = Number(span.scale) || 1;
      const letterSize = size * scale;
      letter.size = letterSize;
      letter.advance = letterSize * 0.6;
      letter.advanceWithSpacing = letterSize * 0.6;
      letter.bbox = { x1: 0, y1: -letterSize * 0.8, x2: letterSize * 0.6, y2: 0 };
      letter.span = span;
      letter.spanIndex = span.spanIndex;
      letter.spanColor = span.color || null;
    }
    cursor += Array.from(letter.char).length;
  }
  return layout;
}

global.window = global;
global.SA = { rng, project: projectApi, color, weird, scope, fx, lyricsFont: { layoutText: layoutStub } };
require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'scene.js'));
const sceneApi = global.SA.lyricsScene;

function fixture() {
  const doc = projectApi.create({});
  doc.script.cues = [{ id: 'c1', start: 0, end: 3, text: 'ABC', spans: [], fx: {}, meta: { kind: 'custom' } }];
  doc.beats = {
    c1: [{ id: 'c1:single0', cueId: 'c1', kind: 'single', start: 0, end: 3, text: 'ABC', lines: ['ABC'], fontScale: 1 }],
  };
  return { doc, beat: doc.beats.c1[0] };
}

// a single-line beat carrying scoped entries
function scopedFixture(scoped, text) {
  const doc = projectApi.create({});
  const words = text || 'ABCDEF';
  doc.script.cues = [{ id: 'c1', start: 0, end: 3, text: words, spans: [], fx: {}, meta: { kind: 'custom' } }];
  doc.beats = { c1: [{ id: 'c1:single0', cueId: 'c1', kind: 'single', start: 0, end: 3, text: words, fontScale: 1 }] };
  if (scoped) doc.beatStyles = { 'c1:single0': { scoped } };
  return { doc, beat: doc.beats.c1[0] };
}

test('buildScene scales every metric for a reduced render frame', () => {
  const { doc, beat } = fixture();
  const full = sceneApi.buildScene(doc, beat, [], {});
  const half = sceneApi.buildScene(doc, beat, [], { scale: 0.5 });

  assert.equal(full.scale, 1);
  assert.equal(half.scale, 0.5);
  assert.equal(half.size, full.size * 0.5, 'font size');
  assert.equal(half.layout.lineHeight, full.layout.lineHeight * 0.5, 'line height');
  assert.equal(half.blockBBox.x2, full.blockBBox.x2 * 0.5, 'block width');
  assert.equal(half.blockBBox.y2, full.blockBBox.y2 * 0.5, 'block height');
  assert.equal(half.letters.length, full.letters.length);
  for (let i = 0; i < full.letters.length; i += 1) {
    assert.equal(half.letters[i].local.x, full.letters[i].local.x * 0.5, `letter ${i} x`);
    assert.equal(half.letters[i].local.w, full.letters[i].local.w * 0.5, `letter ${i} width`);
    assert.equal(half.letters[i].local.h, full.letters[i].local.h * 0.5, `letter ${i} height`);
    assert.equal(half.letters[i].size, full.letters[i].size * 0.5, `letter ${i} size`);
  }
});

test('buildScene caches per scale and clamps a bad scale to 1', () => {
  const { doc, beat } = fixture();
  const half = sceneApi.buildScene(doc, beat, [], { scale: 0.5 });
  const again = sceneApi.buildScene(doc, beat, [], { scale: 0.5 });
  assert.equal(again, half, 'the same scale reuses the scene');
  const full = sceneApi.buildScene(doc, beat, [], { scale: 1 });
  assert.notEqual(full, half, 'another scale is another scene');
  const bad = sceneApi.buildScene(doc, beat, [], { scale: 0 });
  assert.equal(bad.scale, 1, 'a non-positive scale falls back to 1');
});

test('a fill beat keeps its flow lines and skips re-wrapping', () => {
  const { doc, beat } = fixture();
  sceneApi.clearCache();
  const calls = [];
  const original = global.SA.lyricsFont.layoutText;
  global.SA.lyricsFont.layoutText = (text, style, fonts, options) => {
    calls.push({ text, options });
    return layoutStub(text, style, fonts, options);
  };
  try {
    sceneApi.buildScene(doc, beat, [], {});
    const fillBeat = { ...beat, id: 'c1:single1', fit: 'fill' };
    sceneApi.buildScene(doc, fillBeat, [], {});
    assert.equal(calls.length, 2);
    assert.equal(calls[0].options.maxWidth, doc.style.text.maxWidth * doc.output.width);
    assert.equal(calls[1].options.maxWidth, Infinity, 'fill beat should not be re-wrapped');
  } finally {
    global.SA.lyricsFont.layoutText = original;
  }
  sceneApi.clearCache();
});

test('no scoped text entry leaves the layout exactly as it was', () => {
  const { doc, beat } = scopedFixture(null);
  const calls = [];
  const original = global.SA.lyricsFont.layoutText;
  global.SA.lyricsFont.layoutText = (text, style, fonts, options) => {
    calls.push(options);
    return layoutStub(text, style, fonts, options);
  };
  try {
    const scene = sceneApi.buildScene(doc, beat, [], {});
    // no composition is handed to the layout at all
    assert.equal(calls.length, 1);
    assert.equal(calls[0].compose, undefined, 'the plain layout takes no compose');
    assert.equal(scene.letters.length, 6);
    assert.equal(scene.letters[0].span, null, 'no letter belongs to a span');
    assert.deepEqual(scene.letters.map((letter) => letter.spanIndex), [null, null, null, null, null, null]);
  } finally {
    global.SA.lyricsFont.layoutText = original;
  }
  sceneApi.clearCache();
});

test('a scoped text span scales every other letter', () => {
  const scoped = [{ group: 'text', type: 'span', params: { scale: 1.5 }, scope: { kind: 'nth', unit: 'letter', every: 2, offset: 0 } }];
  const { doc, beat } = scopedFixture(scoped);
  const original = global.SA.lyricsFont.layoutText;
  global.SA.lyricsFont.layoutText = composeLayoutStub;
  try {
    sceneApi.clearCache();
    const scene = sceneApi.buildScene(doc, beat, [], {});
    const sizes = scene.letters.map((letter) => Math.round(letter.size));
    assert.deepEqual(sizes, [144, 96, 144, 96, 144, 96], 'letters 0, 2 and 4 grew');
    // every letter carries the index of the span it came from
    assert.deepEqual(scene.letters.map((letter) => letter.spanIndex), [0, null, 1, null, 2, null], 'the run-length spans are indexed');
    // the size changed, so the letters are still one line with a shared baseline
    assert.equal(scene.layout.lines.length, 1);
  } finally {
    global.SA.lyricsFont.layoutText = original;
  }
  sceneApi.clearCache();
});

test('a built scene carries the beat text offsets the range scope addresses', () => {
  const { doc, beat } = scopedFixture(null, 'ABC DEF');
  sceneApi.clearCache();
  const scene = sceneApi.buildScene(doc, beat, [], {});
  // the offsets count the code points of the beat text, so the range 4..7 is DE
  // F in 'ABC DEF' - the same window `maskForText` measures
  assert.deepEqual(scene.letters.map((letter) => letter.textOffset), [0, 1, 2, 3, 4, 5, 6]);
  const mask = (spec) => Array.from(scope.scopeMask(scene, spec), (value) => (value ? 1 : 0)).join('');
  assert.equal(mask({ kind: 'range', from: 4, to: 7 }), '0000111', 'the range covers D E F');
  const text = (spec) => Array.from(scope.maskForText('ABC DEF', spec), (value) => (value ? 1 : 0)).join('');
  assert.equal(text({ kind: 'range', from: 4, to: 7 }), '0000111', 'and the layout-time twin agrees');
  assert.equal(mask({ kind: 'slice', anchor: 'text', from: 'end', offset: 0, length: 2 }), '0000011', 'a slice tail works on the built scene too');
  assert.equal(text({ kind: 'slice', anchor: 'text', from: 'end', offset: 0, length: 2 }), '0000011');
});

test('a scoped text colour recolours the letters without resizing them', () => {
  const scoped = [{ group: 'text', type: 'span', params: { color: '#ff0000' }, scope: { kind: 'keyword', match: 'CD' } }];
  const { doc, beat } = scopedFixture(scoped);
  const original = global.SA.lyricsFont.layoutText;
  global.SA.lyricsFont.layoutText = composeLayoutStub;
  try {
    sceneApi.clearCache();
    const scene = sceneApi.buildScene(doc, beat, [], {});
    const rgb = (letter) => [letter.color.r, letter.color.g, letter.color.b].map((value) => Math.round(value * 255));
    assert.deepEqual(scene.letters.map(rgb), [
      [238, 242, 255], [238, 242, 255], [255, 0, 0], [255, 0, 0], [238, 242, 255], [238, 242, 255],
    ]);
    // a colour-only entry never touches the metrics
    assert.deepEqual(scene.letters.map((letter) => Math.round(letter.size)), [96, 96, 96, 96, 96, 96]);
  } finally {
    global.SA.lyricsFont.layoutText = original;
  }
  sceneApi.clearCache();
});

test('a scoped text preset applies its own defaults', () => {
  // the inspector writes the type and no params, so the preset's 1.45 has to
  // reach the layout
  const scoped = [{ group: 'text', type: 'spanEveryThird', params: {}, scope: { kind: 'nth', unit: 'letter', every: 3, offset: 0 } }];
  const { doc, beat } = scopedFixture(scoped);
  const original = global.SA.lyricsFont.layoutText;
  global.SA.lyricsFont.layoutText = composeLayoutStub;
  try {
    sceneApi.clearCache();
    const scene = sceneApi.buildScene(doc, beat, [], {});
    assert.deepEqual(scene.letters.map((letter) => Math.round(letter.size)), [139, 96, 96, 139, 96, 96]);
  } finally {
    global.SA.lyricsFont.layoutText = original;
  }
  sceneApi.clearCache();
});

test('scoped text entries compose with a real composition', () => {
  const scoped = [{ group: 'text', type: 'span', params: { scale: 2 }, scope: { kind: 'range', from: 0, to: 1 } }];
  const { doc, beat } = scopedFixture(scoped, 'ABCD');
  doc.beatStyles['c1:single0'].text = { compose: { text: 'ABCD', breaks: [], spans: [{ from: 1, to: 3, scale: 0.5 }] } };
  const original = global.SA.lyricsFont.layoutText;
  global.SA.lyricsFont.layoutText = composeLayoutStub;
  try {
    sceneApi.clearCache();
    const scene = sceneApi.buildScene(doc, beat, [], {});
    // A at 2, B and C at 0.5 (the composition), D untouched
    assert.deepEqual(scene.letters.map((letter) => Math.round(letter.size)), [192, 48, 48, 96]);
    // the composition's own span numbers survive the re-encoding, so a
    // `span` scope still addresses the composition rather than the synthetic run
    assert.equal(scene.letters[1].spanIndex, 0, 'B and C stay composition span 0');
    assert.notEqual(scene.letters[0].spanIndex, 0, 'the synthetic span has its own number');
  } finally {
    global.SA.lyricsFont.layoutText = original;
  }
  sceneApi.clearCache();
});

