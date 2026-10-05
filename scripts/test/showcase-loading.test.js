'use strict';

// Showcase loading runs through the shared busy dialog: the JSONs are big and
// `loadFromObject` blocks the main thread, so every Help → showcase path must
// open through `openShowcaseAsset` (which paints `withBusy` first).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');

const LOADERS = [
  ['showcase', 'data/showcase.json'],
  ['easeShowcase', 'data/ease-showcase.json'],
  ['figureShowcase', 'data/figure-showcase.json'],
  ['backdropShowcase', 'data/backdrop-showcase.json'],
  ['fontShowcase', 'data/font-showcase.json'],
  ['layerShowcase', 'data/layer-showcase.json'],
  ['decorShowcase', 'data/decor-showcase.json'],
  ['themeShowcase', 'data/theme-showcase.json'],
  ['fillerShowcase', 'data/filler-showcase.json'],
  ['directShowcase', 'data/direct-showcase.json'],
  ['cameraShowcase', 'data/camera-showcase.json'],
  ['colorShowcase', 'data/color-showcase.json'],
  ['cloneShowcase', 'data/clone-showcase.json'],
  ['letterFxShowcase', 'data/letter-fx-showcase.json'],
  ['shaderShowcase', 'data/shader-showcase.json'],
];

function appSource() {
  return fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'app.js'), 'utf8');
}

test('the shared loader paints the busy dialog before reading', () => {
  const app = appSource();
  assert.match(app, /async function openShowcaseAsset\(file, localize\)/);
  assert.match(app, /withBusy\('studio\.busy\.open'/);
  assert.match(app, /SA\.platform\.readAsset\(file\)/);
  assert.match(app, /SA\.io\.loadFromObject\(localize \? localize\(JSON\.parse\(text\)\) : JSON\.parse\(text\)\)/);
});

test('every Help showcase loader delegates to the shared loader', () => {
  const app = appSource();
  assert.equal(LOADERS.length, 15);
  for (const [, file] of LOADERS) {
    const escaped = file.replace(/\./g, '\\.');
    assert.match(app, new RegExp(`openShowcaseAsset\\('${escaped}'`), `${file} must load through openShowcaseAsset`);
  }
  // no loader reads its asset directly any more: one read site, under the dialog
  const directReads = app.match(/readAsset\('data\/[a-z-]+-?showcase\.json'\)/g) || [];
  assert.deepEqual(directReads, [], `direct asset reads bypass the dialog: ${directReads}`);
});

test('the opening label exists in all five languages', () => {
  globalThis.window = globalThis;
  globalThis.SA = globalThis.SA || {};
  require(path.join(ROOT, 'renderer', 'js', 'i18n.js'));
  const i18n = globalThis.SA.i18n;
  for (const code of ['en', 'ja', 'es', 'fr', 'ru']) {
    i18n.set(code);
    const label = i18n.t('studio.busy.open');
    assert.ok(typeof label === 'string' && label.trim().length > 0, `${code} label`);
    assert.notEqual(label, 'studio.busy.open', `${code} label is missing`);
  }
});
