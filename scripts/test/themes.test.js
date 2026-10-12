'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');

// Mock localStorage
const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) || null,
  setItem: (key, val) => storage.set(key, String(val)),
  removeItem: (key) => storage.delete(key),
  clear: () => storage.clear(),
};

// Mock window and SA
globalThis.window = globalThis;
const SA = (globalThis.SA = {});

require(path.join(ROOT, 'renderer', 'js', 'i18n.js'));
SA.presets = {
  list: () => [{ id: 'preset_classic', style: { enter: { type: 'fade' } } }],
  labelFor: (preset) => `Preset ${preset.id}`,
};
SA.moods = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'moods.js'));
SA.genParams = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'gen-params.js'));
SA.textBg = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects', 'text-bg.js'));
SA.project = require(path.join(ROOT, 'renderer', 'js', 'studio', 'project.js'));

let dispatchedActions = [];
SA.store = {
  state: {
    project: {
      style: {
        animation: { type: 'fade' },
        text: { size: 96 },
      },
      styleMode: {
        axes: { speed: 0.5, energy: 0.5 },
      },
      cueStyles: {},
    },
  },
  clone: (v) => (v == null ? v : JSON.parse(JSON.stringify(v))),
  dispatch: (action) => {
    dispatchedActions.push(action);
    if (typeof action.do === 'function') {
      action.do(SA.store.state.project);
    }
  },
};

require(path.join(ROOT, 'renderer', 'js', 'studio', 'themes.js'));

test('themes.list returns builtin and user themes', () => {
  storage.clear();
  const all = SA.themes.list();
  assert.ok(Array.isArray(all));
  assert.ok(all.some((t) => t.builtin && t.id === 'builtin:preset_classic'));
});

test('themes.save creates a user theme and saves to localStorage', () => {
  storage.clear();
  const entry = SA.themes.save('My Custom Theme', { animation: { type: 'pop' } }, { speed: 0.8 }, 'pop');
  assert.ok(entry);
  assert.equal(entry.name, 'My Custom Theme');
  assert.equal(entry.builtin, false);
  assert.deepEqual(entry.style, { animation: { type: 'pop' } });

  const userList = SA.themes.userThemes();
  assert.equal(userList.length, 1);
  assert.equal(userList[0].id, entry.id);
});

test('themes.get retrieves theme by id', () => {
  storage.clear();
  const entry = SA.themes.save('Searchable Theme', { enter: { type: 'slide' } });
  const found = SA.themes.get(entry.id);
  assert.ok(found);
  assert.equal(found.name, 'Searchable Theme');

  const builtin = SA.themes.get('builtin:preset_classic');
  assert.ok(builtin);
  assert.equal(builtin.builtin, true);

  assert.equal(SA.themes.get('nonexistent_id'), null);
});

test('themes.update updates existing user theme', () => {
  storage.clear();
  const entry = SA.themes.save('Original Name', { enter: { type: 'slide' } });
  const updated = SA.themes.update(entry.id, { name: 'New Name' });
  assert.ok(updated);
  assert.equal(updated.name, 'New Name');

  const fetched = SA.themes.get(entry.id);
  assert.equal(fetched.name, 'New Name');
});

test('themes.duplicate duplicates a theme', () => {
  storage.clear();
  const entry = SA.themes.save('Theme to Copy', { fill: { type: 'solid' } });
  const copy = SA.themes.duplicate(entry.id);
  assert.ok(copy);
  assert.notEqual(copy.id, entry.id);
  assert.ok(copy.name.includes('Theme to Copy'));

  const userList = SA.themes.userThemes();
  assert.equal(userList.length, 2);
});

test('themes.remove deletes a user theme', () => {
  storage.clear();
  const entry = SA.themes.save('Theme to Delete', { fill: { type: 'solid' } });
  assert.equal(SA.themes.userThemes().length, 1);

  SA.themes.remove(entry.id);
  assert.equal(SA.themes.userThemes().length, 0);
  assert.equal(SA.themes.get(entry.id), null);
});

test('themes.capture captures present project style groups', () => {
  const captured = SA.themes.capture();
  assert.ok(captured);
  assert.deepEqual(captured.animation, { type: 'fade' });
});

test('themes.apply dispatches project style update', () => {
  storage.clear();
  dispatchedActions = [];
  const entry = SA.themes.save('Apply Target Theme', { enter: { type: 'zoom' } });

  const applied = SA.themes.apply(entry.id);
  assert.ok(applied);
  assert.equal(applied.id, entry.id);
  assert.ok(dispatchedActions.length > 0);
  assert.equal(dispatchedActions[0].label, 'apply theme');
  assert.deepEqual(SA.store.state.project.style.enter, { type: 'zoom' });
});
