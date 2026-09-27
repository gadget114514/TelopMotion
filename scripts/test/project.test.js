'use strict';

const test = require('node:test');
const assert = require('node:assert');

const project = require('../../renderer/js/studio/project');

test('defaults produce a valid version 1 project', () => {
  const doc = project.defaults();
  assert.strictEqual(doc.format, 'sunostudio');
  assert.strictEqual(doc.version, 1);
  assert.strictEqual(doc.output.aspect, '16:9');
  assert.strictEqual(doc.output.width, 1920);
  assert.ok(Array.isArray(doc.script.cues));
  assert.deepStrictEqual(doc.overrides, {});
});

test('create embeds the dataset and applies the aspect', () => {
  const dataset = { profile: { handle: 'x' }, songs: [] };
  const doc = project.create({ dataset, aspect: '9:16', lang: 'ja' });
  assert.strictEqual(doc.dataset, dataset);
  assert.strictEqual(doc.output.aspect, '9:16');
  assert.strictEqual(doc.output.width, 1080);
  assert.strictEqual(doc.output.height, 1920);
  assert.strictEqual(doc.meta.lang, 'ja');
});

test('mergeDeep merges objects and replaces arrays', () => {
  const merged = project.mergeDeep({ a: { b: 1, c: 2 }, list: [1, 2] }, { a: { c: 3 }, list: [9] });
  assert.deepStrictEqual(merged, { a: { b: 1, c: 3 }, list: [9] });
});

test('migrate fills missing fields, keeps unknown fields and bumps the version', () => {
  const raw = { format: 'sunostudio', version: 1, custom: { hello: 'world' }, meta: { title: 'Song' } };
  const result = project.migrate(raw);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.project.version, 1);
  assert.deepStrictEqual(result.project.custom, { hello: 'world' });
  assert.strictEqual(result.project.meta.title, 'Song');
  assert.strictEqual(result.project.output.aspect, '16:9');
  assert.ok(result.project.meta.createdAt);
});

test('migrate rejects other formats and newer versions', () => {
  assert.strictEqual(project.migrate({ format: 'other', version: 1 }).ok, false);
  assert.strictEqual(project.migrate({ format: 'sunostudio', version: 99 }).ok, false);
  assert.strictEqual(project.migrate(null).ok, false);
});

test('parsePath understands cue, beat and letter segments', () => {
  const parsed = project.parsePath('cue:c1/beat:c1:page2/line:1/word:3/letter:0');
  assert.strictEqual(parsed.cueId, 'c1');
  assert.strictEqual(parsed.beatId, 'c1:page2');
  assert.strictEqual(parsed.kind, 'page');
  assert.strictEqual(parsed.line, 1);
  assert.strictEqual(parsed.word, 3);
  assert.strictEqual(parsed.letter, 0);
});

test('resolveStyle follows the documented resolution order', () => {
  const doc = project.defaults({
    style: { enter: { type: 'fade' }, text: { size: 96 } },
    cueStyles: { c1: { enter: { type: 'slide' }, text: { size: 72 } } },
    beatKindStyle: { page: { enter: { params: { dir: 'up' } } } },
    beatStyles: { 'c1:page1': { enter: { params: { dir: 'down' } } } },
    overrides: {
      'cue:c1/beat:c1:page1/line:0': { text: { size: 48 } },
      'cue:c1/beat:c1:page1/line:0/word:1/letter:0': { transform: { x: 12 } },
    },
  });
  const style = project.resolveStyle(doc, 'cue:c1/beat:c1:page1/line:0/word:1/letter:0');
  assert.strictEqual(style.enter.type, 'slide');
  assert.strictEqual(style.enter.params.dir, 'down');
  assert.strictEqual(style.text.size, 48);
  assert.strictEqual(style.transform.x, 12);

  const cueStyle = project.resolveStyle(doc, 'cue:c1');
  assert.strictEqual(cueStyle.enter.type, 'slide');
  assert.strictEqual(cueStyle.text.size, 72);
  assert.strictEqual(cueStyle.transform, undefined);

  const beatStyle = project.resolveStyle(doc, 'cue:c1/beat:c1:page1');
  assert.strictEqual(beatStyle.enter.params.dir, 'down');
  assert.strictEqual(beatStyle.text.size, 72);
});

test('setDimensions switches the output size', () => {
  const doc = project.defaults();
  project.setDimensions(doc, '9:16');
  assert.strictEqual(doc.output.aspect, '9:16');
  assert.strictEqual(doc.output.width, 1080);
  assert.strictEqual(doc.output.height, 1920);
});
