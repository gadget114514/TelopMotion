'use strict';

// Phase 1: a lyrics import shows the whole cue list at once. The timeline is
// booted on a stubbed DOM (the same style as boot.test.js) and `fitToCues`
// must satisfy `end * pxPerSecond <= viewWidth`, even below MIN_ZOOM. The
// store fires `script-imported`, which is what the timeline listens for.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const fx = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects', 'registry.js'));
for (const name of ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'background']) {
  require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects', `${name}.js`));
}
const projectModule = require(path.join(ROOT, 'renderer', 'js', 'studio', 'project.js'));
const SA = {
  fx,
  i18n: { t: (key) => key },
  project: projectModule,
  moods: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'moods.js')),
  rng: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'rng.js')),
  fillers: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'fillers.js')),
  textflow: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'textflow.js')),
  figures: require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'figures.js')),
  preview: { duration: () => 100, getPeaks: () => null, formatClock: (value) => `${value}s`, seek: () => {} },
  lyricsEngine: {
    beatForCue: (cue) => (cue ? { id: `${cue.id}:page0`, cueId: cue.id, start: cue.start, end: cue.end, kind: 'page', text: cue.text || '' } : null),
  },
};
globalThis.SA = SA;
require(path.join(ROOT, 'renderer', 'js', 'studio', 'store.js'));

function ctxStub() {
  const target = {};
  return new Proxy(target, {
    get(object, key) {
      if (key in object) return object[key];
      if (key === 'measureText') return () => ({ width: 10 });
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (key === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      return () => {};
    },
    set(object, key, value) {
      object[key] = value;
      return true;
    },
  });
}

function fakeElement(id) {
  const context = ctxStub();
  return {
    id,
    hidden: false,
    dataset: {},
    style: {},
    textContent: '',
    value: '120',
    min: '10',
    width: 0,
    height: 0,
    clientWidth: id === 'timeline-scroll' ? 800 : 100,
    clientHeight: 200,
    offsetWidth: 100,
    scrollTop: 0,
    listeners: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener(name, fn) {
      (this.listeners[name] = this.listeners[name] || []).push(fn);
    },
    removeEventListener() {},
    setPointerCapture() {},
    appendChild() {},
    remove() {},
    querySelectorAll: () => [],
    getContext: () => context,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 200 }),
  };
}

const nodes = new Map();
const created = [];
globalThis.document = {
  body: fakeElement('body'),
  documentElement: fakeElement('html'),
  getElementById: (id) => {
    if (!nodes.has(id)) nodes.set(id, fakeElement(id));
    return nodes.get(id);
  },
  querySelector: (selector) => fakeElement(selector),
  querySelectorAll: () => [],
  addEventListener() {},
  createElement: () => {
    const node = fakeElement('created');
    created.push(node);
    return node;
  },
};
globalThis.window = { addEventListener() {}, removeEventListener() {}, devicePixelRatio: 1 };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.requestAnimationFrame = (fn) => {
  fn();
  return 1;
};
globalThis.devicePixelRatio = 1;

require(path.join(ROOT, 'renderer', 'js', 'studio', 'timeline.js'));
const store = SA.store;
const timeline = SA.timeline;

function fixture() {
  return projectModule.defaults({
    script: {
      cues: [
        { id: 'c1', start: 0, end: 30, text: 'first', trackId: 'sub1' },
        { id: 'c2', start: 34, end: 62, text: 'second', trackId: 'sub1' },
        { id: 'c3', start: 70, end: 100, text: 'third', trackId: 'sub1' },
      ],
    },
    beats: {},
  });
}

test('fitToCues fits the whole cue list, even below MIN_ZOOM', () => {
  store.load(fixture());
  timeline.init();
  timeline.setZoom(120);
  assert.equal(timeline.getZoom(), 120);

  timeline.fitToCues();
  const end = 100;
  const viewWidth = 800 - 90; // the time area right of the fixed label column
  const zoom = timeline.getZoom();
  assert.ok(zoom < 10, `the import zoom is below MIN_ZOOM (${zoom})`);
  assert.ok(end * zoom <= viewWidth + 1, `whole list visible: ${end * zoom} <= ${viewWidth}`);
  assert.equal(timeline.getScrollX(), 0);

  // the slider can come back: minZoom follows the cue fit
  timeline.setZoom(1);
  assert.ok(100 * timeline.getZoom() <= viewWidth + 1, `zoom-out still fits (${timeline.getZoom()})`);
  assert.ok(timeline.getZoom() >= zoom - 1e-9, 'minZoom never exceeds the cue fit');
});

test('the track checkbox toggles visibility as one undo step', () => {
  store.load(fixture());
  timeline.init();
  const canvas = document.getElementById('timeline-canvas');
  const down = canvas.listeners.pointerdown[0];
  assert.ok(typeof down === 'function', 'the timeline listens for pointerdown');
  // second row = the first subtitle track (foreground row is above it):
  // logical y 46..68, canvas y 33 (the ruler is fixed above the canvas)
  const click = () => down({ button: 0, pointerId: 1, clientX: 80, clientY: 33, currentTarget: canvas, preventDefault() {} });
  const sub = () => store.state.project.tracks.find((track) => track.id === 'sub1');
  assert.equal(!!sub().hidden, false);
  click();
  assert.equal(sub().hidden, true, 'unchecked hides the track');
  click();
  assert.equal(!!sub().hidden, false, 'checked shows it again');
  assert.equal(store.undo(), true);
  assert.equal(sub().hidden, true, 'undo restores the checkbox');
  assert.equal(store.redo(), true);
  assert.equal(!!sub().hidden, false);
});

test('dragging and double-clicking on the filler track create clips', () => {
  store.load(fixture());
  timeline.init();
  const canvas = document.getElementById('timeline-canvas');
  const down = canvas.listeners.pointerdown[0];
  const move = canvas.listeners.pointermove[0];
  const up = canvas.listeners.pointerup[0];
  const dbl = canvas.listeners.dblclick[0];
  const filler = store.state.project.tracks.find((track) => track.kind === 'filler');
  const index = store.state.project.tracks.indexOf(filler);
  let logicalY = 24;
  store.state.project.tracks.forEach((track, i) => {
    if (i < index) logicalY += track.kind === 'subtitle' ? 70 : track.kind === 'figure' ? 66 : 22; // subtitle 70, figure 66 (clips + fg + bg), others 22
  });
  logicalY += 11;
  const clientY = logicalY - 24;
  const event = (x) => ({ button: 0, pointerId: 1, clientX: x, clientY, currentTarget: canvas, preventDefault() {} });

  // a plain click only selects the track
  down(event(120));
  up(event(120));
  assert.equal(store.state.project.clips.filter((clip) => clip.trackId === filler.id).length, 0, 'a click adds nothing');

  down(event(120));
  move(event(300));
  up(event(300));
  // double-click adds a default-length clip at that time
  dbl(event(400));
  const clips = store.state.project.clips.filter((clip) => clip.trackId === filler.id);
  assert.equal(clips.length, 2, 'a drag and a double-click each added a clip');
  assert.ok(clips.every((clip) => clip.auto === undefined), 'hand filler clips are not auto');
  assert.ok(clips.every((clip) => clip.spec && clip.spec.type), 'the filler content spec was rolled');
});

test('the remove button on a track header deletes that track and its clips', () => {
  store.load(fixture());
  const id = store.commands.addTrack('figure');
  assert.ok(id, 'figure track added');
  timeline.init();
  const canvas = document.getElementById('timeline-canvas');
  const down = canvas.listeners.pointerdown[0];
  const move = canvas.listeners.pointermove[0];
  const up = canvas.listeners.pointerup[0];
  const fig = store.state.project.tracks.find((track) => track.id === id);
  const index = store.state.project.tracks.indexOf(fig);
  let logicalY = 24;
  store.state.project.tracks.forEach((track, i) => {
    if (i < index) logicalY += track.kind === 'subtitle' ? 70 : track.kind === 'figure' ? 66 : 22; // subtitle 70, figure 66 (clips + fg + bg), others 22
  });
  logicalY += 11;
  const clientY = logicalY - 24;
  const event = (x) => ({ button: 0, pointerId: 1, clientX: x, clientY, currentTarget: canvas, preventDefault() {} });
  // put a clip on the track so the removal drops it too
  down(event(120));
  move(event(240));
  up(event(240));
  assert.equal(store.state.project.clips.filter((clip) => clip.trackId === id).length, 1, 'the clip exists');
  // the remove button sits left of the visibility checkbox
  down(event(90 - 29));
  up(event(90 - 29));
  assert.equal(store.state.project.tracks.some((track) => track.id === id), false, 'the track is gone');
  assert.equal(store.state.project.clips.filter((clip) => clip.trackId === id).length, 0, 'its clips are gone');
  assert.equal(store.undo(), true);
  assert.equal(store.state.project.tracks.some((track) => track.id === id), true, 'undo restores the track');
});

test('the last subtitle track keeps its remove button hidden', () => {
  store.load(fixture());
  timeline.init();
  const canvas = document.getElementById('timeline-canvas');
  const down = canvas.listeners.pointerdown[0];
  // second row = the only subtitle track: its remove button is not drawn, so
  // the click (at the x where the button would sit, left of the checkbox)
  // selects the track instead of deleting it
  down({ button: 0, pointerId: 1, clientX: 38, clientY: 33, currentTarget: canvas, preventDefault() {} });
  assert.equal(store.state.project.tracks.some((track) => track.kind === 'subtitle'), true, 'the track stays');
  assert.deepEqual(store.state.selection.paths, ['track:sub1'], 'the click selects the track');
});

test('the background track checkbox hides its clips and shows them as a lane', () => {
  const doc = fixture();
  doc.clips.push({ id: 'bgclip', trackId: 'bg', start: 0, end: 100, spec: { type: 'solid', params: {} }, opacity: 1, fadeIn: 0, fadeOut: 0, colors: null });
  store.load(doc);
  timeline.init();
  const canvas = document.getElementById('timeline-canvas');
  const down = canvas.listeners.pointerdown[0];
  const up = canvas.listeners.pointerup[0];
  const bg = () => store.state.project.tracks.find((track) => track.kind === 'background');
  // rows: ruler 24, fg 22, sub1 26, sub1 background 22, sub1 graphics 22, fig 66,
  // mid 22, filler 22, bg layer 22, then the background clip lane
  const bgLayerCenter = 24 + 22 + 26 + 22 + 22 + 66 + 22 + 22 + 11;
  const clipLaneCenter = bgLayerCenter + 22;
  const click = (x, y) => {
    const event = { button: 0, pointerId: 1, clientX: x, clientY: y - 24, currentTarget: canvas, preventDefault() {} };
    down(event);
    up(event);
  };
  // the background clip is visible on its own lane and can be selected
  click(210, clipLaneCenter);
  assert.deepEqual(store.state.selection.paths, ['clip:bgclip'], 'the background clip is selectable');
  // the header checkbox must reflect that the clips count as track content:
  // green (drawn) while the track is visible, grey once it is hidden
  const context = canvas.getContext('2d');
  const boxes = [];
  context.rect = (x, y, w, h) => {
    if (Math.abs(w - 9) < 0.01 && Math.abs(h - 9) < 0.01) boxes.push({ color: context.strokeStyle, y });
  };
  const boxColor = () => {
    boxes.length = 0;
    timeline.draw();
    const box = boxes.find((entry) => Math.abs(entry.y - (bgLayerCenter - 4.5)) < 0.01);
    return box ? box.color : null;
  };
  assert.equal(boxColor(), '#4dc8a0', 'the background clips keep the checkbox checked');
  // the checkbox hides the whole track: its clips and its layers
  click(80, bgLayerCenter);
  assert.equal(bg().hidden, true, 'the checkbox sets the hidden flag');
  assert.equal(boxColor(), '#6b7386', 'a hidden track draws an unchecked box');
  click(80, bgLayerCenter);
  assert.equal(!!bg().hidden, false, 'clicking again shows the track');
  assert.equal(boxColor(), '#4dc8a0', 'the checkbox reports the track visible again');
});

test('dragging on a figure track creates a clip', () => {
  store.load(fixture());
  const id = store.commands.addTrack('figure');
  assert.ok(id, 'figure track added');
  timeline.init();
  const canvas = document.getElementById('timeline-canvas');
  const down = canvas.listeners.pointerdown[0];
  const move = canvas.listeners.pointermove[0];
  const up = canvas.listeners.pointerup[0];
  const fig = store.state.project.tracks.find((track) => track.id === id);
  const index = store.state.project.tracks.indexOf(fig);
  // rows: ruler 24, foreground 22, sub1 26, sub1 background 22, sub1 graphics 22, mid 22, filler 22, bg 22, figure 22
  let logicalY = 24;
  store.state.project.tracks.forEach((track, i) => {
    if (i < index) logicalY += track.kind === 'subtitle' ? 70 : track.kind === 'figure' ? 66 : 22; // subtitle 70, figure 66 (clips + fg + bg), others 22
  });
  logicalY += 11;
  const clientY = logicalY - 24; // the canvas starts under the fixed ruler
  const event = (x) => ({ button: 0, pointerId: 1, clientX: x, clientY, currentTarget: canvas, preventDefault() {} });
  down(event(120));
  move(event(240));
  up(event(240));
  const clips = store.state.project.clips.filter((clip) => clip.trackId === id);
  assert.equal(clips.length, 1, 'one clip was created');
  assert.equal(clips[0].spec.type, 'figure');
  assert.ok(clips[0].end > clips[0].start, 'the drag set the span');
});

test('hovering a truncated row label reveals its full text', () => {
  const doc = fixture();
  doc.tracks.find((track) => track.id === 'sub1').name = '字幕1とても長いテスト名';
  store.load(doc);
  timeline.init();
  const canvas = document.getElementById('timeline-canvas');
  // metrics that actually truncate the 90 px fixed label column
  const context = canvas.getContext('2d');
  context.measureText = (text) => ({ width: String(text).length * 7 });
  timeline.draw();

  const tip = created.filter((node) => node.className === 'timeline-tip').pop();
  assert.ok(tip, 'the label tooltip element is created');
  assert.equal(tip.hidden, true, 'hidden while no label is hovered');

  const move = canvas.listeners.pointermove[0];
  // the subtitle cue row starts at y 46 (ruler 24 + foreground 22), height 26
  const overLabel = { pointerId: 1, clientX: 40, clientY: 46 + 13 - 24, currentTarget: canvas, preventDefault() {} };
  move(overLabel);
  assert.equal(tip.hidden, false, 'the truncated label shows its tooltip');
  assert.equal(tip.textContent, 'studio.track.subtitle 1とても長いテスト名', 'the full label text is shown');

  move({ ...overLabel, clientX: 400 });
  assert.equal(tip.hidden, true, 'the tooltip hides over the time area');
});

test('store.commands.importSrt fires script-imported', () => {
  store.load(fixture());
  timeline.init();
  const events = [];
  const off = store.on('script-imported', (payload) => events.push(payload));
  store.commands.importSrt([{ id: 'x1', start: 0, end: 5, text: 'hello' }], { name: 'a.srt' });
  assert.equal(events.length, 1);
  assert.equal(events[0].count, 1);
  assert.equal(events[0].name, 'a.srt');
  off();
  store.commands.importSrt([{ id: 'x2', start: 0, end: 5, text: 'hello' }], { name: 'b.srt' });
  assert.equal(events.length, 1, 'the listener is removed');
  // the timeline subscribed itself and (with an immediate rAF) already refit
  const end = Math.max(...store.state.project.script.cues.map((cue) => cue.end));
  assert.ok(end * timeline.getZoom() <= 800 - 90 + 1);
});
