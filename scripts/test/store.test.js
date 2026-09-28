'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const fx = require('../../renderer/js/lyrics/effects/registry.js');
require('../../renderer/js/lyrics/effects/animation.js');
require('../../renderer/js/lyrics/effects/layout.js');
require('../../renderer/js/lyrics/effects/enter.js');
require('../../renderer/js/lyrics/effects/exit.js');
require('../../renderer/js/lyrics/effects/hold.js');
require('../../renderer/js/lyrics/effects/location.js');
require('../../renderer/js/lyrics/effects/fill.js');
require('../../renderer/js/lyrics/effects/edge.js');
require('../../renderer/js/lyrics/effects/post.js');
require('../../renderer/js/lyrics/effects/background.js');

const projectModule = require('../../renderer/js/studio/project.js');
globalThis.SA = globalThis.SA || {};
globalThis.SA.project = projectModule;
globalThis.SA.moods = require('../../renderer/js/lyrics/moods.js');
globalThis.SA.rng = require('../../renderer/js/lyrics/rng.js');
globalThis.SA.fillers = require('../../renderer/js/lyrics/fillers.js');
require('../../renderer/js/studio/store.js');
const store = globalThis.SA.store;

void fx;

function fixture() {
  return projectModule.defaults({
    styleMode: { order: 'cycle', seed: 12345, locked: [], axes: { speed: 0.5, energy: 0.5, softness: 0.5, density: 0.5, brightness: 0.5 } },
    script: {
      cues: [
        { id: 'c1', start: 0, end: 4, text: 'hello', trackId: 'sub1' },
        { id: 'c2', start: 7, end: 10, text: 'world', trackId: 'sub1' },
      ],
    },
    beats: { c1: [{ id: 'c1:page0', cueId: 'c1', start: 0, end: 4, kind: 'page', text: 'hello' }] },
    clips: [
      { id: 'clip1', trackId: 'bg', start: 0, end: 8, spec: { type: 'solid', params: {} }, opacity: 1, fadeIn: 0.3, fadeOut: 0.3, colors: null },
    ],
  });
}

function snapshot() {
  return JSON.parse(JSON.stringify(store.state.project));
}

test('splitClip then undo restores the project exactly', () => {
  store.load(fixture());
  const before = snapshot();
  store.commands.splitClip('clip1', 3);
  assert.equal(store.state.project.clips.length, 2);
  const first = store.state.project.clips.find((clip) => clip.id === 'clip1');
  assert.equal(first.end, 3);
  assert.equal(store.undo(), true);
  assert.deepEqual(snapshot(), before);
});

test('trimClip then undo restores the project exactly', () => {
  store.load(fixture());
  const before = snapshot();
  store.commands.trimClip('clip1', 'start', 1.5);
  assert.equal(store.state.project.clips[0].start, 1.5);
  assert.equal(store.undo(), true);
  assert.deepEqual(snapshot(), before);
});

test('moveClip then undo restores the project exactly', () => {
  store.load(fixture());
  const before = snapshot();
  store.commands.moveClip('clip1', 2);
  assert.equal(store.state.project.clips[0].start, 2);
  assert.equal(store.state.project.clips[0].end, 10);
  assert.equal(store.undo(), true);
  assert.deepEqual(snapshot(), before);
});

test('rerollCue changes enter / exit and beat sizes, one undo reverts it', () => {
  store.load(fixture());
  const before = snapshot();
  store.commands.rerollCue('c1');
  assert.ok(store.state.project.cueStyles.c1.enter, 'enter replaced');
  assert.ok(store.state.project.cueStyles.c1.exit, 'exit replaced');
  assert.equal(store.state.project.beatStyles['c1:page0'].text.size != null, true);
  assert.equal(store.undo(), true);
  assert.deepEqual(snapshot(), before);
});

test('setCueTrack moves a cue and refuses overlaps on the target track', () => {
  const doc = fixture();
  doc.tracks.push({ id: 'sub2', kind: 'subtitle', name: 'sub2' });
  doc.script.cues.push({ id: 'c4', start: 8, end: 9, text: 'overlap', trackId: 'sub1' });
  store.load(doc);
  store.commands.setCueTrack('c2', 'sub2');
  assert.equal(store.state.project.script.cues.find((cue) => cue.id === 'c2').trackId, 'sub2', 'free track accepted');
  store.commands.setCueTrack('c4', 'sub2');
  assert.equal(store.state.project.script.cues.find((cue) => cue.id === 'c4').trackId, 'sub1', 'overlap rejected');
  store.commands.setCueTrack('c4', 'sub1');
  assert.equal(store.state.project.script.cues.find((cue) => cue.id === 'c4').trackId, 'sub1');
});

test('regenerateFillers rebuilds the filler clips from the gaps', () => {
  store.load(fixture());
  store.commands.regenerateFillers();
  const clips = store.state.project.clips.filter((clip) => clip.trackId === 'filler');
  assert.ok(clips.length >= 1, `clips ${clips.length}`);
  const total = clips.reduce((sum, clip) => sum + (clip.end - clip.start), 0);
  assert.ok(total > 0);
});

test('removeTrack moves its cues to another subtitle track and drops its clips', () => {
  const doc = fixture();
  doc.tracks.push({ id: 'sub2', kind: 'subtitle', name: 'sub2' });
  doc.script.cues[1].trackId = 'sub2';
  store.load(doc);
  store.commands.removeTrack('sub2');
  assert.equal(store.state.project.script.cues.find((cue) => cue.id === 'c2').trackId, 'sub1');
  assert.equal(store.state.project.tracks.some((track) => track.id === 'sub2'), false);
});
