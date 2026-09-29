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

// --- palettes per scope ------------------------------------------------------

globalThis.SA.color = require('../../renderer/js/color.js');
const OLD = ['#101018', '#202838', '#ffffff', '#ff0000', '#000000'];
const NEW = ['#0a1a10', '#12301c', '#f0fff0', '#00c060', '#001008'];

function paletteFixture() {
  const doc = fixture();
  doc.style.palette = { id: 'old', name: 'old', colors: OLD.slice() };
  doc.style.edge = [{ type: 'glow', enabled: true, params: { color: '#ff0000', size: 3 } }];
  return doc;
}

test('setPalette on the project moves the literal colours with it, one undo reverts it', () => {
  store.load(paletteFixture());
  const before = snapshot();
  store.commands.setPalette('project', { id: 'new', name: 'new', colors: NEW });
  const doc = store.state.project;
  assert.deepEqual(doc.style.palette.colors, NEW);
  assert.equal(doc.style.edge[0].params.color, '#00c060');
  store.undo();
  assert.deepEqual(snapshot(), before);
});

test('a cue palette recolours only that cue and resets back onto the parent', () => {
  store.load(paletteFixture());
  store.commands.setPalette({ cueId: 'c1' }, { id: 'new', name: 'new', colors: NEW });
  const doc = store.state.project;
  assert.deepEqual(doc.cueStyles.c1.palette.colors, NEW);
  // the cue takes its own recoloured copy; the project keeps its colours
  assert.equal(doc.cueStyles.c1.edge[0].params.color, '#00c060');
  assert.equal(doc.style.edge[0].params.color, '#ff0000');
  assert.equal(projectModule.resolveStyle(doc, 'cue:c2').edge[0].params.color, '#ff0000');
  // a project change now leaves the cue (which has its own palette) alone
  store.commands.setPalette('project', { id: 'other', name: 'other', colors: ['#101018', '#202838', '#ffffff', '#3050ff', '#000000'] });
  assert.equal(store.state.project.style.edge[0].params.color, '#3050ff');
  assert.equal(store.state.project.cueStyles.c1.edge[0].params.color, '#00c060');
  // reset: back to the project's palette, colours moved onto it
  store.commands.resetPalette({ cueId: 'c1' });
  const reset = store.state.project;
  assert.equal(reset.cueStyles.c1.palette, undefined);
  assert.equal(projectModule.resolveStyle(reset, 'cue:c1').edge[0].params.color, '#3050ff');
});

test('editing one swatch only moves the colours tied to it', () => {
  store.load(paletteFixture());
  store.state.project.style.edge[0].params.shadow = '#101018';
  const colors = OLD.slice();
  colors[3] = '#00c060';
  store.commands.setPalette({ cueId: 'c1', beatId: 'c1:page0' }, { id: 'old', name: 'old', colors });
  const beat = store.state.project.beatStyles['c1:page0'];
  assert.equal(beat.edge[0].params.color, '#00c060');
  assert.equal(beat.edge[0].params.shadow, '#101018');
});

test('rerollPalette gives the scope a new palette inside the axes', () => {
  store.load(paletteFixture());
  const palette = store.commands.rerollPalette({ cueId: 'c2' });
  assert.ok(palette && palette.colors.length >= 5);
  assert.deepEqual(store.state.project.cueStyles.c2.palette.colors, palette.colors);
  assert.deepEqual(store.state.project.style.palette.colors, OLD);
});

test('a transaction groups many drag commands into one history entry', () => {
  store.load(fixture());
  const before = snapshot();
  assert.equal(store.beginTransaction('move cue'), true);
  store.commands.moveCue('c1', 0.5);
  store.commands.moveCue('c1', 1);
  store.commands.moveCue('c1', 1.5);
  assert.equal(store.endTransaction(), true);
  assert.equal(store.state.project.script.cues.find((cue) => cue.id === 'c1').start, 1.5);
  assert.equal(store.undo(), true);
  assert.deepEqual(snapshot(), before);
  assert.equal(store.canUndo(), false);
});

test('separate transactions stay separate even when they happen quickly', () => {
  store.load(fixture());
  store.beginTransaction('move cue');
  store.commands.moveCue('c1', 1);
  store.endTransaction();
  store.beginTransaction('move cue');
  store.commands.moveCue('c1', 2);
  store.endTransaction();
  assert.equal(store.undo(), true);
  assert.equal(store.state.project.script.cues.find((cue) => cue.id === 'c1').start, 1);
  assert.equal(store.undo(), true);
  assert.equal(store.state.project.script.cues.find((cue) => cue.id === 'c1').start, 0);
});

test('cancelTransaction restores the snapshot and leaves no history', () => {
  store.load(fixture());
  const before = snapshot();
  store.beginTransaction('move cue');
  store.commands.moveCue('c1', 2);
  assert.equal(store.cancelTransaction(), true);
  assert.deepEqual(snapshot(), before);
  assert.equal(store.canUndo(), false);
});

test('nested transactions commit once at the outermost end', () => {
  store.load(fixture());
  const before = snapshot();
  store.beginTransaction('outer');
  store.commands.moveCue('c1', 1);
  store.beginTransaction('inner');
  store.commands.moveCue('c1', 2);
  assert.equal(store.endTransaction(), false);
  assert.equal(store.endTransaction(), true);
  assert.equal(store.undo(), true);
  assert.deepEqual(snapshot(), before);
});

test('a no-op dispatch is not pushed to the history', () => {
  store.load(fixture());
  store.dispatch({ label: 'noop', areas: ['project'], do() {} });
  assert.equal(store.canUndo(), false);
  assert.equal(store.isDirty(), false);
});

test('undo drops a selection that no longer exists and restores deleted ones', () => {
  store.load(fixture());
  store.commands.addCue({ id: 'c3', start: 11, end: 12, text: 'new', trackId: 'sub1' });
  store.setSelection(['cue:c3'], 'cue');
  assert.deepEqual(store.state.selection.paths, ['cue:c3']);
  assert.equal(store.undo(), true);
  assert.equal(store.state.project.script.cues.some((cue) => cue.id === 'c3'), false);
  assert.deepEqual(store.state.selection.paths, []);

  store.setSelection(['cue:c2'], 'cue');
  store.commands.deleteCue('c2');
  assert.deepEqual(store.state.selection.paths, ['cue:c2']);
  assert.equal(store.undo(), true);
  assert.equal(store.state.project.script.cues.some((cue) => cue.id === 'c2'), true);
  assert.deepEqual(store.state.selection.paths, ['cue:c2']);
});

test('markClean tracks the saved entry across undo and redo', () => {
  store.load(fixture());
  store.markClean();
  assert.equal(store.isDirty(), false);
  store.commands.moveCue('c1', 1);
  assert.equal(store.isDirty(), true);
  assert.equal(store.undo(), true);
  assert.equal(store.isDirty(), false);
  assert.equal(store.redo(), true);
  assert.equal(store.isDirty(), true);
});

test('undoLabel and redoLabel name the next step', () => {
  store.load(fixture());
  assert.equal(store.undoLabel(), null);
  store.commands.moveCue('c1', 1);
  assert.equal(store.undoLabel(), 'move cue');
  assert.equal(store.redoLabel(), null);
  store.undo();
  assert.equal(store.undoLabel(), null);
  assert.equal(store.redoLabel(), 'move cue');
});

// --- fill sizing re-flow -----------------------------------------------------

globalThis.SA.textflow = require('../../renderer/js/lyrics/textflow.js');

test('switching to a fill style re-flows the beats and one undo reverts it', () => {
  store.load(fixture());
  const before = snapshot();
  store.commands.setStyleProp('project', 'text.fit', 'fill');
  const beat = store.state.project.beats.c1[0];
  assert.equal(beat.fit, 'fill');
  assert.ok(beat.fontScale > 1, `fontScale ${beat.fontScale}`);
  assert.equal(store.undo(), true);
  assert.deepEqual(snapshot(), before);
});

test('a fixed sizing style change leaves the beats alone', () => {
  store.load(fixture());
  const before = snapshot();
  store.commands.setStyleProp('project', 'text.size', 64);
  assert.deepEqual(snapshot().beats, before.beats);
});

test('editBeatText keeps the user lines and only resizes a fill beat', () => {
  store.load(fixture());
  store.commands.setStyleProp('project', 'text.fit', 'fill');
  const beatId = store.state.project.beats.c1[0].id;
  store.commands.editBeatText('c1', beatId, 'hello\nworld');
  const beat = store.state.project.beats.c1.find((entry) => entry.id === beatId);
  assert.deepEqual(beat.lines, ['hello', 'world']);
  assert.equal(beat.pinned, true);
  assert.equal(beat.fit, 'fill');
  assert.ok(beat.fontScale > 1, `fontScale ${beat.fontScale}`);
});

test('redo re-applies the fill re-flow of a style change', () => {
  store.load(fixture());
  store.commands.setStyleProp('project', 'text.fit', 'fill');
  const filled = snapshot();
  assert.equal(store.undo(), true);
  assert.equal(store.state.project.beats.c1[0].fit, undefined);
  assert.equal(store.redo(), true);
  assert.deepEqual(snapshot(), filled);
});

// --- history after undo / redo ----------------------------------------------

test('an edit right after undo is a fresh entry and drops the stale redo', () => {
  store.load(fixture());
  store.commands.moveCue('c1', 1, { coalesceKey: 'cue:c1:move' });
  const afterMove = snapshot();
  store.commands.setStyleProp('project', 'text.size', 80, { coalesceKey: 'style:text.size' });
  assert.equal(store.undo(), true);
  // the retry happens inside the coalesce window of the undone edit: it must
  // not fold into the move entry below (nor keep the undone step redoable)
  store.commands.setStyleProp('project', 'text.size', 64, { coalesceKey: 'style:text.size' });
  assert.equal(store.state.project.style.text.size, 64);
  assert.equal(store.canRedo(), false);
  assert.equal(store.undo(), true);
  assert.deepEqual(snapshot(), afterMove);
  assert.equal(store.redo(), true);
  assert.equal(store.state.project.style.text.size, 64);
});

test('an edit right after redo is a fresh entry too', () => {
  store.load(fixture());
  store.commands.moveCue('c1', 1, { coalesceKey: 'cue:c1:move' });
  store.commands.setStyleProp('project', 'text.size', 80, { coalesceKey: 'style:text.size' });
  store.undo();
  store.undo();
  assert.equal(store.redo(), true);
  store.commands.setStyleProp('project', 'text.size', 64, { coalesceKey: 'style:text.size' });
  assert.equal(store.undo(), true);
  const doc = store.state.project;
  assert.equal(doc.script.cues.find((cue) => cue.id === 'c1').start, 1);
  assert.equal(doc.style.text.size, 96);
  assert.equal(store.redo(), true);
  assert.equal(store.state.project.style.text.size, 64);
});

// --- recent features ---------------------------------------------------------

test('setFontSet is undoable and redoable with its media font metadata', () => {
  store.load(fixture());
  const before = snapshot();
  const set = { exclusive: true, fonts: [{ id: 'user:abc123', fontClass: 'sans' }, { id: 'NotoSans-Regular', fontClass: null }] };
  const media = [{ id: 'user:abc123', family: 'My Font', cjk: true }];
  store.commands.setFontSet(set, media);
  assert.deepEqual(store.state.project.fontSet, set);
  assert.deepEqual(store.state.project.media.fonts, media);
  assert.equal(store.undo(), true);
  assert.deepEqual(snapshot(), before);
  assert.equal(store.redo(), true);
  assert.deepEqual(store.state.project.fontSet, set);
  assert.deepEqual(store.state.project.media.fonts, media);
});

test('a shapeLayer clip can be added, edited and undone / redone', () => {
  store.load(fixture());
  const before = snapshot();
  const id = store.commands.addClip({ start: 8, end: 11, spec: { type: 'shapeLayer', params: { shape: 'underline', follow: 'followText' } } }, 'bg');
  assert.ok(id, 'clip created');
  assert.equal(store.state.project.clips.some((clip) => clip.id === id), true);
  store.commands.updateClip(id, { spec: { type: 'shapeLayer', params: { shape: 'box', follow: 'line' } } }, { coalesceKey: `clip:${id}:spec` });
  assert.equal(store.state.project.clips.find((clip) => clip.id === id).spec.params.shape, 'box');
  assert.equal(store.undo(), true);
  assert.equal(store.state.project.clips.find((clip) => clip.id === id).spec.params.shape, 'underline');
  assert.equal(store.undo(), true);
  assert.deepEqual(snapshot(), before);
  assert.equal(store.redo(), true);
  assert.equal(store.redo(), true);
  assert.equal(store.state.project.clips.find((clip) => clip.id === id).spec.params.shape, 'box');
});
