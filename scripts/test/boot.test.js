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
  const bootScript = HTML.indexOf('js/studio/boot.js');
  const appScript = HTML.indexOf('js/studio/app.js');
  assert.ok(bootScript > 0 && appScript > bootScript, 'boot.js must load before app.js');
  // every language carries the boot strings (en / ja / es / fr / ru)
  assert.equal((I18N.match(/boot: \{ loading:/g) || []).length, 5);
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
  assert.equal(nodes['boot-fill'].style.width, '30%');
  assert.equal(nodes['boot-bar'].attrs['aria-valuenow'], '30');
  assert.equal(nodes['boot-status'].textContent, 'studio.boot.project');

  boot.set(12); // never goes backwards
  assert.equal(nodes['boot-fill'].style.width, '30%');
  boot.busy(true); // indeterminate shimmer while a long step runs
  assert.ok(nodes.boot.classList.contains('is-busy'));
  boot.busy(false);
  assert.equal(nodes.boot.classList.contains('is-busy'), false);
  boot.set(180); // clamps at 100
  assert.equal(nodes['boot-fill'].style.width, '100%');
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
