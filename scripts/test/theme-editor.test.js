'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');

// Set up mock DOM environment
function mockElement(tag) {
  const children = [];
  const classList = new Set();
  const eventListeners = {};
  return {
    tagName: tag.toUpperCase(),
    className: '',
    textContent: '',
    title: '',
    value: '',
    type: '',
    min: '',
    max: '',
    step: '',
    hidden: false,
    innerHTML: '',
    dataset: {},
    classList: {
      add: (c) => classList.add(c),
      remove: (c) => classList.delete(c),
      contains: (c) => classList.has(c),
    },
    style: {},
    appendChild: (child) => {
      children.push(child);
      return child;
    },
    children,
    addEventListener: (event, handler) => {
      (eventListeners[event] || (eventListeners[event] = [])).push(handler);
    },
    click: () => {
      for (const h of eventListeners.click || []) h();
    },
  };
}

const mockRoot = mockElement('div');
mockRoot.id = 'dialog-root';

globalThis.window = globalThis;
globalThis.document = {
  getElementById: (id) => (id === 'dialog-root' ? mockRoot : null),
  createElement: (tag) => mockElement(tag),
};

const SA = (globalThis.SA = {});

require(path.join(ROOT, 'renderer', 'js', 'i18n.js'));
SA.color = require(path.join(ROOT, 'renderer', 'js', 'color.js'));
SA.moods = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'moods.js'));
SA.genParams = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'gen-params.js'));
SA.genres = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'genres.js'));
SA.keywords = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'keywords.js'));
SA.paletteRoles = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'palette-roles.js'));
SA.project = require(path.join(ROOT, 'renderer', 'js', 'studio', 'project.js'));

SA.store = {
  state: {
    project: {
      style: {
        palette: { id: 'p_custom', name: 'Custom Palette', colors: ['#ff0000', '#00ff00', '#0000ff'] },
      },
      styleMode: {
        axes: { speed: 0.9, energy: 0.8, weird: 0.9 },
        genre: 'rock',
        params: { holdChance: 0.99, sizeCenter: 0.8, decoNone: 1 },
        typeWeights: { hold: { pulse: 0 } },
        usePalettes: ['p_custom'],
      },
    },
  },
  clone: (v) => (v == null ? v : JSON.parse(JSON.stringify(v))),
  dispatch: () => {},
};

SA.controls = {
  typeLabel: (g, t) => `${g}:${t}`,
};

SA.studio = {
  toast: () => {},
};

SA.themes = {
  get: () => null,
};

require(path.join(ROOT, 'renderer', 'js', 'studio', 'theme-editor.js'));

test('themeEditor.open loads draft with existing values', () => {
  SA.themeEditor.open(null);
  const draft = SA.themeEditor.getDraft();
  assert.ok(draft, 'draft should be initialized');
  assert.equal(draft.genre, 'rock');
  assert.equal(draft.axes.speed, 0.9);
  assert.equal(draft.params.holdChance, 0.99);
  assert.equal(draft.params.sizeCenter, 0.8);
  assert.deepEqual(draft.typeWeights, { hold: { pulse: 0 } });
  assert.deepEqual(draft.usePalettes, ['p_custom']);
});

test('themeEditor.resetDraft resets all dialogue values to default', () => {
  SA.themeEditor.open(null);
  let draft = SA.themeEditor.getDraft();
  assert.equal(draft.genre, 'rock');

  // Call resetDraft
  SA.themeEditor.resetDraft();
  draft = SA.themeEditor.getDraft();

  // All axes should be reset to defaultAxes
  assert.equal(draft.axes.speed, 0.5);
  assert.equal(draft.axes.energy, 0.5);
  assert.equal(draft.axes.softness, 0.6);
  assert.equal(draft.axes.density, 0.5);
  assert.equal(draft.axes.brightness, 0.6);
  assert.equal(draft.axes.weird, SA.moods.WEIRD_DEFAULT);
  assert.equal(draft.axes.smartness, SA.moods.SMART_DEFAULT);
  assert.equal(draft.axes.fear, 0);

  // Genre should be reset to null
  assert.equal(draft.genre, null);
  assert.equal(draft.direction, 'horizontal');

  // Params and typeWeights should be cleared (all auto)
  assert.deepEqual(draft.params, {});
  assert.deepEqual(draft.typeWeights, {});
  assert.deepEqual(draft.usePalettes, []);
  assert.equal(draft.style, null);
  assert.equal(draft.id, null);
});

test('themeEditor dialog actions includes the reset button', () => {
  SA.themeEditor.open(null);
  const resetLabel = SA.i18n.t('studio.themeEditor.reset');
  assert.ok(resetLabel, 'reset label should be translated');

  // Traverse mockRoot to find the reset button
  function findButtonWithText(node, text) {
    if (node.textContent === text && (node.tagName === 'BUTTON' || node.className.includes('btn'))) {
      return node;
    }
    for (const child of node.children || []) {
      const found = findButtonWithText(child, text);
      if (found) return found;
    }
    return null;
  }

  const btn = findButtonWithText(mockRoot, resetLabel);
  assert.ok(btn, `Reset button with label "${resetLabel}" should exist in dialog-actions`);

  // Clicking the button should execute resetDraft
  SA.themeEditor.getDraft().params.testParam = 42;
  assert.equal(SA.themeEditor.getDraft().params.testParam, 42);
  btn.click();
  assert.equal(SA.themeEditor.getDraft().params.testParam, undefined);
  assert.deepEqual(SA.themeEditor.getDraft().params, {});
});
