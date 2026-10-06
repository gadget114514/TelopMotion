'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const HTML = fs.readFileSync(path.join(ROOT, 'renderer', 'studio.html'), 'utf8');
const I18N = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'i18n.js'), 'utf8');

function fakeElement() {
  return {
    hidden: false,
    dataset: {},
    style: {},
    textContent: '',
    attrs: {},
    classList: {
      names: new Set(),
      add(name) {
        this.names.add(name);
      },
      remove(name) {
        this.names.delete(name);
      },
      toggle(name, on) {
        if (on) this.names.add(name);
        else this.names.delete(name);
      },
      contains(name) {
        return this.names.has(name);
      },
    },
    setAttribute(name, value) {
      this.attrs[name] = value;
    },
  };
}

test('studio.html ships the boot overlay before the app scripts', () => {
  assert.match(HTML, /id="boot"/);
  assert.match(HTML, /id="boot-status"[^>]*data-i18n="studio\.boot\.loading"/);
  assert.match(HTML, /id="boot-bar"[^>]*role="progressbar"/);
  assert.match(HTML, /id="boot-elapsed"/);
  assert.match(HTML, /class="boot-spinner"/);
  const bootScript = HTML.indexOf('js/studio/boot.js');
  const appScript = HTML.indexOf('js/studio/app.js');
  assert.ok(bootScript > 0 && appScript > bootScript, 'boot.js must load before app.js');
  // every language carries the boot strings (en / ja / es / fr / ru)
  assert.equal((I18N.match(/boot: \{ loading:/g) || []).length, 5);
});

test('every effect module loads before the code that reads it, staged-presets last', () => {
  const src = (file) => {
    const index = HTML.indexOf(`js/lyrics/effects/${file}.js`);
    assert.ok(index > 0, `studio.html does not load effects/${file}.js`);
    return index;
  };
  // registry first, then the primitives, then the presets that reference them
  assert.ok(src('registry') < src('enter'));
  assert.ok(src('warp') < src('animator'), 'animator reads the warp helpers');
  assert.ok(src('hold') < src('warp'), 'the warp holds extend hold.js');
  assert.ok(src('post') < src('camera'), 'camera registers a post extension');
  assert.ok(src('enter') < src('animator') && src('exit') < src('animator') && src('hold') < src('animator'));
  for (const file of ['enter', 'exit', 'hold', 'warp', 'animator', 'camera', 'background', 'post']) {
    assert.ok(src(file) < src('staged-presets'), `staged-presets must load after ${file}`);
  }
  // motion.js resolves effect types while evaluating a beat
  assert.ok(src('animator') < HTML.indexOf('js/lyrics/motion.js'));
  assert.ok(src('camera') < HTML.indexOf('js/lyrics/engine.js'));
});

test('boot progress is monotonic, clamps and finishes', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const nodes = {
    boot: fakeElement(),
    'boot-status': fakeElement(),
    'boot-bar': fakeElement(),
    'boot-fill': fakeElement(),
  };
  globalThis.document = { getElementById: (id) => nodes[id] || null };
  globalThis.SA = globalThis.SA || {};
  globalThis.SA.i18n = { t: (key) => key };
  require('../../renderer/js/studio/boot.js');
  const boot = globalThis.SA.boot;

  assert.equal(boot.progress(), 0);
  boot.set(30, 'studio.boot.project');
  assert.equal(nodes['boot-fill'].style.transform, 'scaleX(0.3)');
  assert.equal(nodes['boot-bar'].attrs['aria-valuenow'], '30');
  assert.equal(nodes['boot-status'].textContent, 'studio.boot.project');

  boot.set(12); // never goes backwards
  assert.equal(nodes['boot-fill'].style.transform, 'scaleX(0.3)');
  boot.busy(true); // indeterminate shimmer while a long step runs
  assert.ok(nodes.boot.classList.contains('is-busy'));
  boot.busy(false);
  assert.equal(nodes.boot.classList.contains('is-busy'), false);
  boot.set(180); // clamps at 100
  assert.equal(nodes['boot-fill'].style.transform, 'scaleX(1)');
  assert.equal(boot.progress(), 100);

  boot.busy(true);
  boot.finish();
  assert.equal(nodes.boot.classList.contains('is-busy'), false);
  assert.equal(nodes['boot-status'].dataset.i18n, 'studio.boot.ready');
  t.mock.timers.tick(400); // MIN_VISIBLE
  assert.ok(nodes.boot.classList.contains('is-done'));
  t.mock.timers.tick(260); // FADE
  assert.equal(nodes.boot.hidden, true);

  boot.set(50); // finished: further updates are ignored
  assert.equal(boot.progress(), 100);
});

test('boot shows elapsed seconds while starting', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const nodes = {
    boot: fakeElement(),
    'boot-status': fakeElement(),
    'boot-bar': fakeElement(),
    'boot-fill': fakeElement(),
    'boot-elapsed': fakeElement(),
  };
  globalThis.document = { getElementById: (id) => nodes[id] || null };
  globalThis.SA = globalThis.SA || {};
  globalThis.SA.i18n = { t: (key) => key };
  delete require.cache[require.resolve('../../renderer/js/studio/boot.js')];
  require('../../renderer/js/studio/boot.js');
  const boot = globalThis.SA.boot;

  boot.set(10);
  assert.equal(nodes['boot-elapsed'].textContent, '0s');
  t.mock.timers.tick(1250); // the chain keeps running while unfinished
  boot.finish();
  const frozen = nodes['boot-elapsed'].textContent;
  t.mock.timers.tick(5000); // finished: the elapsed clock stops
  assert.equal(nodes['boot-elapsed'].textContent, frozen);
});

test('boot bar creeps toward the next step on the compositor', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const animations = [];
  const fill = fakeElement();
  fill.animate = (keyframes, options) => {
    const animation = { keyframes, options, cancelled: false, cancel() { this.cancelled = true; } };
    animations.push(animation);
    return animation;
  };
  const nodes = { boot: fakeElement(), 'boot-status': fakeElement(), 'boot-bar': fakeElement(), 'boot-fill': fill };
  globalThis.document = { getElementById: (id) => nodes[id] || null };
  globalThis.SA = globalThis.SA || {};
  globalThis.SA.i18n = { t: (key) => key };
  delete require.cache[require.resolve('../../renderer/js/studio/boot.js')];
  require('../../renderer/js/studio/boot.js');
  const boot = globalThis.SA.boot;

  // jump to 20, then creep 90% of the way to 60 over 5 s without reaching it
  boot.set(20, 'studio.boot.fonts', 60, 5000);
  const first = animations[0];
  assert.equal(first.options.duration, 5000);
  assert.equal(first.options.fill, 'forwards');
  assert.deepEqual(first.keyframes.map((frame) => frame.transform), ['scaleX(0)', 'scaleX(0.2)', 'scaleX(0.56)']);
  assert.equal(fill.style.transform, 'scaleX(0.56)');
  assert.equal(boot.progress(), 20); // the reported progress is the step, not the creep

  // a later step replaces the running creep
  boot.set(60);
  assert.ok(first.cancelled);
  assert.equal(animations[1].options.duration, 220);
  assert.equal(fill.style.transform, 'scaleX(0.6)');

  boot.finish();
  assert.equal(fill.style.transform, 'scaleX(1)');
  t.mock.timers.tick(400);
  t.mock.timers.tick(260);
  assert.equal(nodes.boot.hidden, true);
});
