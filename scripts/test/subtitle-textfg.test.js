'use strict';

// The subtitle track's Text FG row: the glyph body itself, toggled with the
// track's `textHidden` flag (data, never the style). The background keeps its
// glyph-shaped holes (knockout) even with the text hidden, and the
// knocked-out passes live under Text BG (`bgShape`) or Graphics (`ornShape`
// and the other text-attached extras). The engine cannot run without WebGL
// here, so the wiring is pinned on the source.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');

test('the timeline draws the Text FG row with its own switch', () => {
  const timeline = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'timeline.js'), 'utf8');
  assert.ok(timeline.includes("'text-track'"), 'the Text FG row is missing');
  assert.ok(timeline.includes("checkType: 'track-text-check'"), 'the Text FG checkbox is missing');
  assert.ok(timeline.includes('textForegroundSpans'), 'the Text FG spans are missing');
  assert.ok(timeline.includes('drawTextBodyTrack'), 'the text body draw function is missing');
  assert.ok(timeline.includes('{ textHidden: !track.textHidden }'), 'the switch does not flip textHidden');
  assert.ok(timeline.includes("'track-text-check'"), 'the hit handling is missing');
});

test('the rows are labelled Text FG, Text BG and Graphics', () => {
  const i18n = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'i18n.js'), 'utf8');
  assert.ok(i18n.includes("textForeground: 'Text FG'"), 'the en Text FG label is missing');
  assert.ok(i18n.includes("textForeground: '文字FG'"), 'the ja Text FG label is missing');
  // Text Graphics was folded into Graphics: no second graphics switch remains
  assert.equal(i18n.includes('textGraphics'), false, 'the textGraphics key must be gone');
  assert.equal(i18n.includes('hideForeground'), false, 'the hideForeground key must be gone');
  assert.equal(i18n.includes('fgTrackVisible'), false, 'the fgTrackVisible key must be gone');
  const timeline = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'timeline.js'), 'utf8');
  assert.ok(timeline.includes("t('studio.track.textForeground')"), 'the text row does not use the Text FG label');
  assert.equal(timeline.includes("'fg-track'"), false, 'the text graphics row must be gone');
});

test('the knockout runs with the text hidden and only shape passes are knocked out', () => {
  const engine = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'lyrics', 'engine.js'), 'utf8');
  // mask + knockout no longer depend on the text switch ...
  assert.ok(engine.includes('const maskNeeded = textOn || !!variation'), 'the mask is not built when the text is hidden');
  assert.ok(engine.includes('if (variation) {\n          pipeline.knockout();'), 'the knockout does not run with the text hidden');
  // ... and the knocked-out passes are the shape passes only: the definition
  // background on the Text BG row, the ornaments on the Graphics row
  const ornAt = engine.indexOf("drawBackgroundPass(active, t, project, 'orn')");
  const bgAt = engine.indexOf("drawBackgroundPass(active, t, project, 'bg')");
  assert.ok(ornAt >= 0 && bgAt > ornAt, 'the shape passes are missing or misordered');
  assert.ok(engine.includes('const bgActive = !bgOff'), 'the background pass is not on the Text BG switch');
  assert.ok(engine.includes('const ornActive = graphicsOn'), 'the ornament pass is not on the Graphics switch');
});
