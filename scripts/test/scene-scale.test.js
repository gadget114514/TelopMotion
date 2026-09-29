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

// a linear stand-in for the font layout: every metric is proportional to the
// requested size, exactly like the real metrics, so scaling is observable
function layoutStub(text, style, fonts, options) {
  const size = options.size;
  const chars = Array.from(String(text));
  const advance = size * 0.6;
  const letters = chars.map((char, index) => ({
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
  }));
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

global.window = global;
global.SA = { rng, project: projectApi, color, weird, lyricsFont: { layoutText: layoutStub } };
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

