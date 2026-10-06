'use strict';

// The subtitle track's text foreground row: the glyph body itself, toggled
// with the track's `textHidden` flag (data, never the style). The background
// keeps its glyph-shaped holes (knockout) even with the text hidden, and the
// knocked-out passes live under Text BG (`bgShape`) or Text Graphics
// (`ornShape` + the text-attached extras). The engine cannot run without
// WebGL here, so the wiring is pinned on the source.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');

test('the timeline draws the text foreground row with its own switch', () => {
  const timeline = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'timeline.js'), 'utf8');
  assert.ok(timeline.includes("'text-track'"), 'the text foreground row is missing');
  assert.ok(timeline.includes("checkType: 'track-text-check'"), 'the text foreground checkbox is missing');
  assert.ok(timeline.includes('textForegroundSpans'), 'the text foreground spans are missing');
  assert.ok(timeline.includes('drawTextBodyTrack'), 'the text body draw function is missing');
  assert.ok(timeline.includes('{ textHidden: !track.textHidden }'), 'the switch does not flip textHidden');
  assert.ok(timeline.includes("'track-text-check'"), 'the hit handling is missing');
  // the knocked-out passes stay on their own rows: the background shapes on
  // Text BG, the ornaments and extras on Text Graphics
  assert.ok(timeline.includes('drawTextGraphicsTrack'), 'the text graphics draw function is missing');
  assert.ok(!timeline.includes('drawTextForegroundTrack'), 'the stale text foreground draw function is still referenced');
});

test('the three rows are labelled Text FG, Text BG and Text Graphics', () => {
  const i18n = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'i18n.js'), 'utf8');
  assert.ok(i18n.includes("textForeground: 'Text FG'"), 'the en Text FG label is missing');
  assert.ok(i18n.includes("textForeground: '文字FG'"), 'the ja Text FG label is missing');
  assert.ok(i18n.includes("textGraphics: 'Text Graphics'"), 'the en Text Graphics label is missing');
  assert.ok(i18n.includes("textGraphics: '文字グラフィクス'"), 'the ja Text Graphics label is missing');
  const timeline = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'timeline.js'), 'utf8');
  assert.ok(timeline.includes("t('studio.track.textForeground')"), 'the text row does not use the Text Foreground label');
  assert.ok(timeline.includes("t('studio.track.textGraphics')"), 'the graphics row does not use the Text Graphics label');
});

test('the knockout runs with the text hidden and only shape passes are knocked out', () => {
  const engine = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'lyrics', 'engine.js'), 'utf8');
  // mask + knockout no longer depend on the text switch ...
  assert.ok(engine.includes('const maskNeeded = textOn || !!variation'), 'the mask is not built when the text is hidden');
  assert.ok(engine.includes('if (variation) {\n          pipeline.knockout();'), 'the knockout does not run with the text hidden');
  // ... and the knocked-out passes are the shape passes only: the definition
  // background on the Text BG row, the ornaments on the Text Graphics row
  const ornAt = engine.indexOf("drawBackgroundPass(active, t, project, 'orn')");
  const bgAt = engine.indexOf("drawBackgroundPass(active, t, project, 'bg')");
  assert.ok(ornAt >= 0 && bgAt > ornAt, 'the shape passes are missing or misordered');
  assert.ok(engine.includes('const bgActive = !bgOff'), 'the background pass is not on the Text BG switch');
  assert.ok(engine.includes('const ornActive = fgOn'), 'the ornament pass is not on the Text Graphics switch');
});
