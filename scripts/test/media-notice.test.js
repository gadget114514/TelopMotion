'use strict';

// The ephemeral-media notice: video and audio live on temporary references,
// so a modal warns once per session when the first file of each kind is
// specified.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');

globalThis.window = globalThis;
globalThis.SA = globalThis.SA || {};
require(path.join(ROOT, 'renderer', 'js', 'i18n.js'));

function makeElement() {
  const element = {
    children: [],
    textContent: '',
    className: '',
    hidden: false,
    style: {},
    appendChild(child) {
      element.children.push(child);
      return child;
    },
    addEventListener() {},
  };
  return element;
}

function installDocument() {
  const root = makeElement();
  globalThis.document = {
    root,
    createElement() {
      return makeElement();
    },
    getElementById(id) {
      assert.equal(id, 'dialog-root');
      return root;
    },
  };
  return root;
}

function loadNotice() {
  delete require.cache[require.resolve(path.join(ROOT, 'renderer', 'js', 'studio', 'media-notice.js'))];
  require(path.join(ROOT, 'renderer', 'js', 'studio', 'media-notice.js'));
  return globalThis.SA.mediaNotice;
}

test('warn shows once per kind and ignores unknown kinds', () => {
  installDocument();
  const notice = loadNotice();
  assert.equal(notice.warn('video'), true);
  assert.equal(notice.warn('video'), false);
  assert.equal(notice.warn('audio'), true);
  assert.equal(notice.warn('audio'), false);
  assert.equal(notice.warn('image'), false);
  assert.equal(notice.warn(null), false);
  notice.reset();
  assert.equal(notice.warn('audio'), true);
});

test('warn builds a dialog with the i18n title, message and OK', () => {
  const root = installDocument();
  const notice = loadNotice();
  assert.equal(notice.warn('video'), true);
  assert.equal(root.children.length, 1);
  const dialog = root.children[0];
  assert.equal(dialog.className, 'dialog');
  const texts = [];
  const walk = (node) => {
    if (node.textContent) texts.push(node.textContent);
    for (const child of node.children || []) walk(child);
  };
  walk(dialog);
  assert.ok(texts.some((text) => text.includes('動画') || text.includes('Video') || text.includes('vídeo') || text.includes('vidéo') || text.includes('Видео')), `title/message present: ${JSON.stringify(texts)}`);
  assert.ok(texts.includes('OK'), 'OK button present');
  assert.equal(root.hidden, false);
});

test('the ephemeral strings exist in all five languages', () => {
  const i18n = globalThis.SA.i18n;
  for (const code of ['en', 'ja', 'es', 'fr', 'ru']) {
    i18n.set(code);
    for (const key of ['studio.media.ephemeralTitle', 'studio.media.ephemeralVideo', 'studio.media.ephemeralAudio', 'studio.media.ephemeralOk']) {
      const label = i18n.t(key);
      assert.ok(typeof label === 'string' && label.trim().length > 0, `${code} ${key}`);
      assert.notEqual(label, key, `${code} ${key} is missing`);
    }
  }
});

test('every video/audio entry point warns', () => {
  const fs = require('node:fs');
  const app = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'app.js'), 'utf8');
  const inspector = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'inspector.js'), 'utf8');
  const background = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'background-dialog.js'), 'utf8');
  const timeline = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'timeline.js'), 'utf8');
  assert.match(app, /mediaNotice\.warn\('video'\)/);
  assert.match(inspector, /mediaNotice\.warn\('video'\)/);
  assert.match(background, /mediaNotice\.warn\('video'\)/);
  assert.match(timeline, /mediaNotice\.warn\('video'\)/);
  assert.match(app, /mediaNotice\.warn\('audio'\)/);
  assert.match(timeline, /mediaNotice\.warn\('audio'\)/);
});
