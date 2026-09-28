'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const effectsDir = path.join(__dirname, '..', '..', 'renderer', 'js', 'lyrics', 'effects');
const fx = require(path.join(effectsDir, 'registry.js'));
for (const name of ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'background', 'color', 'text-bg']) {
  require(path.join(effectsDir, `${name}.js`));
}

const STRINGS = require('../../renderer/js/studio/fx-strings.js');
const LANGS = ['en', 'ja', 'es', 'fr', 'ru'];
const GROUPS = ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'background', 'bgShape', 'bgFill', 'bgEdge', 'bgMotion'];
const labelGroup = (group) => fx.baseOf(group);

function lookup(table, key) {
  return String(key)
    .split('.')
    .reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), table);
}

test('every language has the full fx table', () => {
  for (const code of LANGS) {
    assert.ok(STRINGS[code] && STRINGS[code].fx, `missing fx table for ${code}`);
    assert.ok(STRINGS[code].fx.param, `missing param table for ${code}`);
    assert.ok(STRINGS[code].fx.value, `missing value table for ${code}`);
  }
});

test('every effect type has a label in every language', () => {
  let count = 0;
  for (const group of GROUPS) {
    for (const descriptor of fx.list(group)) {
      count += 1;
      for (const code of LANGS) {
        const label = lookup(STRINGS[code], `fx.${labelGroup(group)}.${descriptor.type}`);
        assert.strictEqual(typeof label, 'string', `${code}: ${group}.${descriptor.type} is missing`);
        assert.ok(label.trim().length > 0, `${code}: ${group}.${descriptor.type} is empty`);
      }
    }
  }
  assert.ok(count >= 140, `expected at least 140 effect types, found ${count}`);
});

test('every effect parameter has a label in every language', () => {
  const keys = new Set();
  for (const group of GROUPS) {
    for (const descriptor of fx.list(group)) {
      for (const param of descriptor.params || []) keys.add(param.key);
    }
  }
  for (const key of keys) {
    for (const code of LANGS) {
      const label = lookup(STRINGS[code], `fx.param.${key}`);
      assert.strictEqual(typeof label, 'string', `${code}: param.${key} is missing`);
      assert.ok(label.trim().length > 0, `${code}: param.${key} is empty`);
    }
  }
  assert.ok(keys.size >= 140, `expected at least 140 parameters, found ${keys.size}`);
});

test('every select option has a translated value in every language', () => {
  const options = new Set();
  for (const group of GROUPS) {
    for (const descriptor of fx.list(group)) {
      for (const param of descriptor.params || []) {
        if (param.kind !== 'select') continue;
        for (const option of param.options || []) options.add(option);
      }
    }
  }
  for (const option of options) {
    for (const code of LANGS) {
      const label = lookup(STRINGS[code], `fx.value.${option}`);
      assert.strictEqual(typeof label, 'string', `${code}: value.${option} is missing`);
      assert.ok(label.trim().length > 0, `${code}: value.${option} is empty`);
    }
  }
  assert.ok(options.size >= 40, `expected at least 40 select options, found ${options.size}`);
});

test('the five languages expose the same fx keys', () => {
  const flatten = (node, prefix, out) => {
    for (const [key, value] of Object.entries(node)) {
      const next = prefix ? `${prefix}.${key}` : key;
      if (value && typeof value === 'object' && !Array.isArray(value)) flatten(value, next, out);
      else out.add(next);
    }
    return out;
  };
  const base = [...flatten(STRINGS.en.fx, '', new Set())].sort();
  for (const code of LANGS.slice(1)) {
    const other = [...flatten(STRINGS[code].fx, '', new Set())].sort();
    assert.deepStrictEqual(other, base, `${code} key set differs from en`);
  }
});
