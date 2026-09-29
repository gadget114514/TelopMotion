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
  preview: { duration: () => 100, getPeaks: () => null, formatClock: (value) => `${value}s` },
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
  createElement: () => fakeElement('created'),
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
