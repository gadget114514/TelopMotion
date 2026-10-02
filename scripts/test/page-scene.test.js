'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const pageLayout = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'page-layout.js'));
const pageScene = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'page-scene.js'));

// Mock layoutText that measures halfwidth chars as 0.55em, fullwidth as 1.0em
function mockLayoutText(text, style, fonts, options) {
  const size = (options && options.size) || (style && style.size) || 48;
  const isVertical = options && options.direction === 'vertical';
  const lines = String(text || '').split(/\r?\n/);
  const blockLines = [];
  let blockWidth = 0;
  let blockHeight = 0;

  for (let lIdx = 0; lIdx < lines.length; lIdx++) {
    const lineText = lines[lIdx];
    const letters = [];
    let pen = 0;

    for (let cIdx = 0; cIdx < lineText.length; cIdx++) {
      const char = lineText[cIdx];
      const isFull = char.charCodeAt(0) > 255;
      const advance = isFull ? size : size * 0.55;
      const l = {
        char,
        renderedChar: char,
        size,
        advance,
        x: isVertical ? 0 : pen,
        y: isVertical ? pen : 0,
        bbox: { x1: 0, y1: -size * 0.8, x2: advance, y2: size * 0.2 },
      };
      letters.push(l);
      pen += advance;
    }

    const word = { isSpace: false, width: pen, letters };
    const w = isVertical ? size : pen;
    const h = isVertical ? pen : size;
    blockWidth = Math.max(blockWidth, w);
    blockHeight = Math.max(blockHeight, h);
    blockLines.push({
      words: [word],
      width: w,
      height: h,
      baseline: size * 0.8,
      y: lIdx * size * 1.2,
      vertical: isVertical,
    });
  }

  return {
    lines: blockLines,
    bbox: { x1: 0, y1: 0, x2: blockWidth, y2: blockHeight },
    width: blockWidth,
    height: blockHeight,
    ascent: size * 0.8,
    descent: size * 0.2,
    size,
    lineHeight: size * 1.2,
    direction: isVertical ? 'vertical' : 'horizontal',
  };
}

test('page-scene builds composite layout for generic presets', () => {
  const genericTypes = ['flushLeft', 'center', 'flushRight', 'justify', 'vertical', 'grid'];
  const text = 'Line One\nLine Two Testing';
  const frame = { w: 1280, h: 720 };

  for (const type of genericTypes) {
    const layout = pageScene.build({
      compose: pageLayout.compose,
      layoutText: mockLayoutText,
      fonts: [],
      textStyle: { size: 40 },
      source: text,
      size: 40,
      frame,
      style: { page: { type, params: {} } },
    });

    assert.ok(layout.lines, `${type} has lines`);
    assert.equal(layout.width, 1280);
    assert.equal(layout.height, 720);
    assert.equal(layout.bbox.x2, 1280);
    assert.equal(layout.bbox.y2, 720);

    let letterCount = 0;
    for (const line of layout.lines) {
      for (const word of line.words) {
        for (const letter of word.letters) {
          letterCount++;
          assert.ok(Number.isFinite(letter.x), 'letter x is finite');
          assert.ok(Number.isFinite(letter.y), 'letter y is finite');
          assert.ok(letter.regionId, 'letter has regionId');
          assert.ok(letter.role, 'letter has role');
        }
      }
    }
    const expectedChars = text.replace(/\r?\n/g, '').length;
    assert.equal(letterCount, expectedChars, `${type} letter count matches text length`);
  }
});

test('page-scene justify expands inter-character space on non-last lines', () => {
  const text = 'FirstLineJustified\nEnd';
  const layout = pageScene.build({
    compose: pageLayout.compose,
    layoutText: mockLayoutText,
    fonts: [],
    textStyle: { size: 40 },
    source: text,
    size: 40,
    frame: { w: 1000, h: 600 },
    style: { page: { type: 'justify', params: { margin: 0.1 } } },
  });

  const line0 = layout.lines[0];
  const letters0 = line0.words[0].letters;
  const line1 = layout.lines[1];
  const letters1 = line1.words[0].letters;

  // First line should be spaced across target width
  const span0 = letters0[letters0.length - 1].x - letters0[0].x;
  // Second (last) line should not be justified
  const span1 = letters1[letters1.length - 1].x - letters1[0].x;

  assert.ok(span0 > span1, 'First line has larger span than second line due to justify');
});

test('page-scene cells positions letters on cell centers', () => {
  const text = 'ABCDEFGH';
  const layout = pageScene.build({
    compose: pageLayout.compose,
    layoutText: mockLayoutText,
    fonts: [],
    textStyle: { size: 30 },
    source: text,
    size: 30,
    frame: { w: 800, h: 600 },
    style: { page: { type: 'grid', params: { cols: 4, margin: 0.1, gap: 10 } } },
  });

  const letters = layout.lines[0].words[0].letters;
  assert.equal(letters.length, 8);
  // Row 0 has 4 letters, Row 1 has 4 letters
  assert.equal(letters[0].y, letters[1].y, 'letters in row 0 have same y');
  assert.ok(letters[4].y > letters[0].y, 'row 1 is lower than row 0');
});
