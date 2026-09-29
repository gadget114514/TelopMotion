'use strict';

// Phase 0: `SA.direct` owns the automatic direction. The fixture was captured
// by running the pre-extraction `auto direct` dispatch body (HEAD's app.js) in
// Node, so this test pins the w=0 output to the old behaviour byte for byte.
// Later phases must keep reproducing it.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const fx = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects', 'registry.js'));
for (const name of ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'background']) {
  require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects', `${name}.js`));
}

const SA = {
  fx,
  rng: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'rng.js')),
  color: require(path.join(ROOT, 'renderer', 'js', 'color.js')),
  moods: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'moods.js')),
  textflow: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'textflow.js')),
  project: require(path.join(ROOT, 'renderer', 'js', 'studio', 'project.js')),
  fillers: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'fillers.js')),
  direct: require(path.join(ROOT, 'renderer', 'js', 'studio', 'direct.js')),
};
globalThis.SA = SA;

const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'direct-w0.json'), 'utf8'));

function prepare(doc, fixture, extra) {
  return SA.direct.prepare(doc, {
    axes: fixture.axes,
    seed: fixture.seed,
    genre: null,
    direction: 'horizontal',
    look: null,
    lookClip: null,
    themeStyle: JSON.parse(JSON.stringify(fixture.themeStyle)),
    cueLooks: {},
    analysis: null,
    ...(extra || {}),
  });
}

function runOn(doc, fixture, extra) {
  SA.direct.run(doc, prepare(doc, fixture, extra));
  return doc;
}

function outputOf(doc) {
  return JSON.parse(JSON.stringify({
    cueStyles: doc.cueStyles,
    beatStyles: doc.beatStyles,
    style: doc.style,
    styleMode: doc.styleMode,
    textFlow: doc.textFlow,
    fillers: doc.fillers,
    clips: (doc.clips || []).map((clip) => {
      const { auto, ...rest } = clip;
      return rest;
    }),
  }));
}

test('w=0 reproduces the pre-extraction snapshot exactly', () => {
  const doc = JSON.parse(JSON.stringify(FIXTURE.input));
  runOn(doc, FIXTURE);
  assert.deepEqual(outputOf(doc), {
    cueStyles: FIXTURE.cueStyles,
    beatStyles: FIXTURE.beatStyles,
    style: FIXTURE.style,
    styleMode: FIXTURE.styleMode,
    textFlow: FIXTURE.textFlow,
    fillers: FIXTURE.fillers,
    clips: FIXTURE.clips,
  });
});

test('the run is deterministic for one seed', () => {
  const first = runOn(JSON.parse(JSON.stringify(FIXTURE.input)), FIXTURE);
  const second = runOn(JSON.parse(JSON.stringify(FIXTURE.input)), FIXTURE);
  assert.deepEqual(outputOf(first), outputOf(second));
});

test('generated clips carry auto: true and re-runs replace only those', () => {
  const doc = runOn(JSON.parse(JSON.stringify(FIXTURE.input)), FIXTURE);
  assert.ok(doc.clips.length > 0);
  assert.ok(doc.clips.every((clip) => clip.auto === true), 'every generated clip is auto');
  const before = outputOf(doc);
  runOn(doc, FIXTURE);
  assert.deepEqual(outputOf(doc), before, 'a second run does not duplicate or move the clips');
});

test('clips without auto are kept', () => {
  const doc = JSON.parse(JSON.stringify(FIXTURE.input));
  const manualMid = { id: 'manual_mid', trackId: 'mid', start: 1, end: 2.5, spec: { type: 'solid', params: {} }, opacity: 1, fadeIn: 0, fadeOut: 0, colors: null };
  const manualFiller = { id: 'manual_filler', trackId: 'filler', start: 4, end: 5, spec: { type: 'none', params: {} }, opacity: 1, fadeIn: 0, fadeOut: 0, colors: null };
  const manualBg = { id: 'manual_bg', trackId: 'bg', start: 0, end: 26, spec: { type: 'solid', params: { color: '#123456' } }, opacity: 1, fadeIn: 0, fadeOut: 0, colors: null };
  doc.clips = [manualMid, manualFiller, manualBg];
  runOn(doc, FIXTURE);
  const ids = doc.clips.map((clip) => clip.id);
  assert.ok(ids.includes('manual_mid'));
  assert.ok(ids.includes('manual_filler'));
  assert.ok(ids.includes('manual_bg'));
  assert.ok(!doc.clips.some((clip) => clip.trackId === 'bg' && clip.auto), 'a user background is not replaced');
  assert.ok(doc.clips.filter((clip) => clip.trackId === 'mid' && clip.auto).length > 0, 'auto backdrop clips still appear next to the manual one');
});

test('prepare clamps the theme size into the weird size band', () => {
  const doc = JSON.parse(JSON.stringify(FIXTURE.input));
  doc.output = { ...doc.output, aspect: '9:16', width: 1080, height: 1920 };
  const huge = prepare(doc, FIXTURE, {
    axes: { ...FIXTURE.axes, weird: 1 },
    themeStyle: { ...JSON.parse(JSON.stringify(FIXTURE.themeStyle)), text: { ...(FIXTURE.themeStyle.text || {}), size: 9999 } },
  });
  assert.equal(huge.portrait, true);
  assert.ok(huge.themeStyle.text.size <= 146, `portrait weird=1 caps at 146, got ${huge.themeStyle.text.size}`);
  const small = prepare(doc, FIXTURE, {
    axes: { ...FIXTURE.axes, weird: 1 },
    themeStyle: { ...JSON.parse(JSON.stringify(FIXTURE.themeStyle)), text: { ...(FIXTURE.themeStyle.text || {}), size: 1 } },
  });
  assert.ok(small.themeStyle.text.size >= 36, `portrait weird=1 floor is 36, got ${small.themeStyle.text.size}`);
});
