'use strict';

const test = require('node:test');
const assert = require('node:assert');

const project = require('../../renderer/js/studio/project');

test('defaults produce a valid version 2 project with tracks', () => {
  const doc = project.defaults();
  assert.strictEqual(doc.format, 'telopmotion');
  assert.strictEqual(doc.version, 2);
  assert.strictEqual(doc.output.aspect, '16:9');
  assert.strictEqual(doc.output.width, 1920);
  assert.ok(Array.isArray(doc.script.cues));
  assert.deepStrictEqual(doc.overrides, {});
  assert.deepStrictEqual(doc.tracks.map((track) => track.kind), ['foreground', 'subtitle', 'figure', 'backdrop', 'filler', 'background']);
  assert.deepStrictEqual(doc.clips, []);
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
  const raw = { format: 'telopmotion', version: 1, custom: { hello: 'world' }, meta: { title: 'Song' } };
  const result = project.migrate(raw);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.project.version, 2);
  assert.deepStrictEqual(result.project.custom, { hello: 'world' });
  assert.strictEqual(result.project.meta.title, 'Song');
  assert.strictEqual(result.project.output.aspect, '16:9');
  assert.ok(result.project.meta.createdAt);
});

test('migrate turns the old style background into a whole-song clip', () => {
  const raw = {
    format: 'telopmotion',
    version: 1,
    style: { background: { type: 'noiseGradient', params: { scale: 2, speed: 0.3 } } },
    script: { cues: [{ id: 'c1', start: 0, end: 4, text: 'a' }, { id: 'c2', start: 4.5, end: 8, text: 'b' }] },
  };
  const doc = project.migrate(raw).project;
  assert.strictEqual(doc.style.background, undefined);
  const clip = doc.clips.find((entry) => entry.trackId === 'bg');
  assert.ok(clip);
  assert.strictEqual(clip.start, 0);
  assert.strictEqual(clip.end, 8);
  assert.deepStrictEqual(clip.spec, { type: 'noiseGradient', params: { scale: 2, speed: 0.3 } });
});

test('migrate merges consecutive shape beats into a backdrop clip and removes beat backgrounds', () => {
  const raw = {
    format: 'telopmotion',
    version: 1,
    script: { cues: [{ id: 'c1', start: 0, end: 4, text: 'a' }] },
    beats: { c1: [{ id: 'c1:page0', cueId: 'c1', start: 0, end: 2, kind: 'page' }, { id: 'c1:page1', cueId: 'c1', start: 2, end: 4, kind: 'page' }] },
    beatStyles: {
      'c1:page0': { background: { type: 'shapes', params: { kind: 'particles', count: 12, opacity: 0.4 } } },
      'c1:page1': { background: { type: 'shapes', params: { kind: 'particles', count: 12, opacity: 0.4 } } },
    },
  };
  const doc = project.migrate(raw).project;
  const clips = doc.clips.filter((entry) => entry.trackId === 'mid');
  assert.strictEqual(clips.length, 1);
  assert.strictEqual(clips[0].start, 0);
  assert.strictEqual(clips[0].end, 4);
  assert.strictEqual(clips[0].spec.type, 'particles');
  for (const beatStyle of Object.values(doc.beatStyles)) assert.strictEqual(beatStyle.background, undefined);
  const subtitle = doc.script.cues[0];
  assert.strictEqual(subtitle.trackId, 'sub1');
});

test('migrate spreads overlapping cues across subtitle tracks', () => {
  const raw = {
    format: 'telopmotion',
    version: 1,
    script: {
      cues: [
        { id: 'c1', start: 0, end: 3, text: 'a' },
        { id: 'c2', start: 1, end: 4, text: 'b' },
        { id: 'c3', start: 2, end: 5, text: 'c' },
        { id: 'c4', start: 6, end: 8, text: 'd' },
      ],
    },
  };
  const doc = project.migrate(raw).project;
  const track = (id) => doc.script.cues.find((cue) => cue.id === id).trackId;
  assert.strictEqual(track('c1'), 'sub1');
  assert.strictEqual(track('c2'), 'sub2');
  assert.strictEqual(track('c3'), 'sub3');
  assert.strictEqual(track('c4'), 'sub1');
  assert.ok(doc.tracks.some((entry) => entry.id === 'sub3'));
});

test('migrate materialises the gap fillers as clips', () => {
  const raw = {
    format: 'telopmotion',
    version: 1,
    script: { cues: [{ id: 'c1', start: 3, end: 6, text: 'a' }, { id: 'c2', start: 9, end: 11, text: 'b' }] },
    fillers: { enabled: true, minGap: 1, margin: 0.25, byKind: { intro: { type: 'shapes', params: {} }, interlude: { type: 'credits', params: {} } } },
  };
  const doc = project.migrate(raw).project;
  const clips = doc.clips.filter((entry) => entry.trackId === 'filler');
  assert.strictEqual(clips.length, 2);
  assert.strictEqual(clips[0].start, 0);
  assert.strictEqual(clips[0].end, 2.75);
  assert.strictEqual(clips[0].spec.type, 'shapes');
  assert.strictEqual(clips[1].start, 6.25);
  assert.strictEqual(clips[1].end, 8.75);
  assert.strictEqual(clips[1].spec.type, 'credits');
});

test('migrate rejects other formats and newer versions', () => {
  assert.strictEqual(project.migrate({ format: 'other', version: 1 }).ok, false);
  assert.strictEqual(project.migrate({ format: 'telopmotion', version: 99 }).ok, false);
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

test('migrate adds the figure track to older projects', () => {
  const doc = project.defaults();
  doc.tracks = doc.tracks.filter((track) => track.kind !== 'figure');
  const result = project.migrate(JSON.parse(JSON.stringify(doc)));
  assert.ok(result.ok);
  assert.deepStrictEqual(
    result.project.tracks.map((track) => track.kind),
    ['foreground', 'subtitle', 'figure', 'backdrop', 'filler', 'background']
  );
});
