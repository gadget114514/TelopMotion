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
globalThis.window = globalThis;
globalThis.SA = globalThis.SA || {};
globalThis.SA.project = projectModule;
globalThis.SA.moods = require('../../renderer/js/lyrics/moods.js');
globalThis.SA.weird = require('../../renderer/js/lyrics/weird.js');
globalThis.SA.genParams = require('../../renderer/js/lyrics/gen-params.js');
globalThis.SA.paletteRoles = require('../../renderer/js/lyrics/palette-roles.js');
globalThis.SA.rng = require('../../renderer/js/lyrics/rng.js');
globalThis.SA.fillers = require('../../renderer/js/lyrics/fillers.js');
globalThis.SA.credits = require('../../renderer/js/lyrics/credits.js');
globalThis.SA.textflow = require('../../renderer/js/lyrics/textflow.js');
globalThis.SA.random = require('../../renderer/js/lyrics/random.js');
globalThis.SA.figures = require('../../renderer/js/lyrics/figures.js');
globalThis.SA.keywords = require('../../renderer/js/lyrics/keywords.js');
globalThis.SA.compositions = require('../../renderer/js/lyrics/compositions.js');
globalThis.SA.direct = require('../../renderer/js/studio/direct.js');
// the palette dice draw through the colors module (studio.html loads it after
// the store; the test needs it on SA before the reroll commands run)
require('../../renderer/js/studio/colors.js');
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

test('setTrackColor stores the background base colour and undo restores it', () => {
  store.load(fixture());
  const before = snapshot();
  const bgId = store.state.project.tracks.find((track) => track.kind === 'background').id;
  store.commands.setTrackColor(bgId, { kind: 'solid', value: '#00b140', alpha: 1 });
  assert.deepEqual(store.state.project.tracks.find((track) => track.id === bgId).color, { kind: 'solid', value: '#00b140', alpha: 1 });
  assert.equal(store.undo(), true);
  assert.deepEqual(snapshot(), before);
  store.commands.setTrackColor(bgId, { kind: 'solid', value: '#ffffff', alpha: 1 });
  store.commands.setTrackColor(bgId, null);
  assert.equal('color' in store.state.project.tracks.find((track) => track.id === bgId), false);
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
  const doc = fixture();
  assert.equal(doc.fillers.enabled, true, 'a fresh document fills its gaps');
  store.load(doc);
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

test('removeTrack removes the last subtitle track with its cues', () => {
  const doc = fixture();
  doc.tracks = doc.tracks.filter((track) => track.kind !== 'subtitle' || track.id === 'sub1');
  store.load(doc);
  store.commands.removeTrack('sub1');
  assert.equal(store.state.project.tracks.some((track) => track.kind === 'subtitle'), false);
  assert.equal(store.state.project.script.cues.filter((cue) => (cue.trackId || 'sub1') === 'sub1').length, 0);
  const id = store.commands.addTrack('subtitle');
  const tracks = store.state.project.tracks;
  const fgAt = tracks.findIndex((track) => track.kind === 'foreground');
  if (fgAt >= 0) assert.equal(tracks.findIndex((track) => track.id === id), fgAt + 1);
});

// --- palettes per scope ------------------------------------------------------

globalThis.SA.color = require('../../renderer/js/color.js');
globalThis.SA.fx = fx;
globalThis.SA.scope = require('../../renderer/js/lyrics/scope.js');
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

test('a hand edit on an auto clip pins it', () => {
  store.load(fixture());
  store.state.project.clips.push({ id: 'auto_mid', auto: true, trackId: 'mid', start: 0, end: 4, spec: { type: 'solid', params: {} }, opacity: 1, fadeIn: 0, fadeOut: 0, colors: null });
  store.commands.trimClip('auto_mid', 'end', 3);
  const trimmed = store.state.project.clips.find((clip) => clip.id === 'auto_mid');
  assert.equal(trimmed.end, 3);
  assert.equal(trimmed.auto, undefined, 'a trim removes the auto flag');

  store.load(fixture());
  store.state.project.clips.push({ id: 'auto_mid2', auto: true, trackId: 'mid', start: 0, end: 4, spec: { type: 'solid', params: {} }, opacity: 1, fadeIn: 0, fadeOut: 0, colors: null });
  const idsBefore = new Set(store.state.project.clips.map((clip) => clip.id));
  store.commands.splitClip('auto_mid2', 2);
  const split = store.state.project.clips.filter((clip) => clip.id === 'auto_mid2' || !idsBefore.has(clip.id));
  assert.equal(split.length, 2);
  assert.ok(split.every((clip) => clip.auto === undefined), 'both halves are pinned');

  store.load(fixture());
  store.state.project.clips.push({ id: 'auto_mid3', auto: true, trackId: 'mid', start: 0, end: 4, spec: { type: 'solid', params: {} }, opacity: 1, fadeIn: 0, fadeOut: 0, colors: null });
  store.commands.updateClip('auto_mid3', { opacity: 0.5 });
  assert.equal(store.state.project.clips.find((clip) => clip.id === 'auto_mid3').auto, undefined, 'an update removes the auto flag');

  store.load(fixture());
  store.state.project.clips.push({ id: 'auto_mid4', auto: true, trackId: 'mid', start: 0, end: 4, spec: { type: 'solid', params: {} }, opacity: 1, fadeIn: 0, fadeOut: 0, colors: null });
  const copyId = store.commands.duplicateClip('auto_mid4');
  assert.equal(store.state.project.clips.find((clip) => clip.id === copyId).auto, undefined, 'the duplicate is pinned');
});

test('figure and text tracks take hand-placed clips, overlaps included', () => {
  store.load(fixture());
  for (const kind of ['figure', 'textAnim']) {
    const trackId = store.commands.addTrack(kind);
    assert.ok(trackId, `${kind} track created`);
    const track = store.state.project.tracks.find((entry) => entry.id === trackId);
    assert.equal(track.kind, kind);
    const first = store.commands.addClip({ start: 1, end: 3, spec: { type: kind === 'figure' ? 'figure' : 'textAnim', params: {} } }, trackId);
    const second = store.commands.addClip({ start: 2, end: 5, spec: { type: kind === 'figure' ? 'figure' : 'textAnim', params: {} } }, trackId);
    const clips = store.state.project.clips.filter((clip) => clip.trackId === trackId);
    assert.equal(clips.length, 2, `${kind}: overlapping clips are kept`);
    assert.ok(clips.every((clip) => clip.auto === undefined), `${kind}: hand clips are not auto`);
    assert.equal(store.undo(), true);
    assert.equal(store.state.project.clips.filter((clip) => clip.trackId === trackId).length, 1, `${kind}: one undo removes one clip`);
    void first;
    void second;
  }
});

test('rerollColors changes only the chosen kinds and one undo restores it', () => {
  const doc = fixture();
  doc.style.palette = { id: 'p', name: 'p', colors: ['#101018', '#202838', '#ffffff', '#ff0000', '#000000', '#ffcc00'] };
  doc.clips.push(
    { id: 'mid1', trackId: 'mid', start: 0, end: 4, spec: { type: 'split', params: { layout: 'halves', parts: 2, motion: 'slide', colors: ['#ff0000', '#00ff00'] } }, colors: ['#ff0000', '#00ff00'] },
    { id: 'mid2', trackId: 'mid', start: 4, end: 8, spec: { type: 'solid', params: {} }, colors: ['#00ff00', '#0000ff'] },
    { id: 'fill1', trackId: 'filler', start: 4, end: 6, spec: { type: 'pattern', params: { mode: 'grid', color: '#ff0000' } }, colors: ['#ff0000'] }
  );
  store.load(doc);
  const before = snapshot();
  const fillerBefore = JSON.stringify(store.state.project.clips.find((clip) => clip.id === 'fill1'));
  const palette = store.commands.rerollColors({ kinds: ['backdrop'] });
  assert.ok(palette && palette.colors.length >= 3);
  const mid1 = store.state.project.clips.find((clip) => clip.id === 'mid1');
  assert.notEqual(mid1.colors[0], '#ff0000');
  assert.equal(store.state.project.clips.find((clip) => clip.id === 'fill1').colors[0], '#ff0000', 'the filler is kept');
  assert.equal(JSON.stringify(store.state.project.clips.find((clip) => clip.id === 'fill1')), fillerBefore);
  assert.equal(store.undo(), true);
  assert.deepEqual(snapshot(), before);
});

test('rerollColors with style changes the style palette and leaves every clip alone', () => {
  const doc = fixture();
  doc.clips.push({ id: 'mid1', trackId: 'mid', start: 0, end: 4, spec: { type: 'solid', params: {} }, colors: ['#ff0000', '#00ff00'] });
  store.load(doc);
  const clipsBefore = JSON.stringify(store.state.project.clips);
  const result = store.commands.rerollColors({ style: true, kinds: [] });
  assert.ok(result);
  assert.ok(store.state.project.style.palette && store.state.project.style.palette.colors.length >= 3);
  assert.equal(JSON.stringify(store.state.project.clips), clipsBefore);
});

test('rerollColors with clipIds touches only the given clip', () => {
  const doc = fixture();
  doc.style.palette = { id: 'p', name: 'p', colors: ['#101018', '#202838', '#ffffff', '#ff0000', '#000000', '#ffcc00'] };
  doc.clips.push(
    { id: 'mid1', trackId: 'mid', start: 0, end: 4, spec: { type: 'solid', params: {} }, colors: ['#ff0000', '#00ff00'] },
    { id: 'mid2', trackId: 'mid', start: 4, end: 8, spec: { type: 'solid', params: {} }, colors: ['#00ff00', '#0000ff'] }
  );
  store.load(doc);
  const untouched = JSON.stringify(store.state.project.clips.find((clip) => clip.id === 'mid2'));
  store.commands.rerollColors({ kinds: ['backdrop'], clipIds: ['mid1'] });
  assert.notEqual(store.state.project.clips.find((clip) => clip.id === 'mid1').colors[0], '#ff0000');
  assert.equal(JSON.stringify(store.state.project.clips.find((clip) => clip.id === 'mid2')), untouched);
});

test('paletteCandidates draws candidates without touching the history', () => {
  store.load(fixture());
  const before = snapshot();
  const undoBefore = store.canUndo();
  const list = store.commands.paletteCandidates(3);
  assert.equal(list.length, 3);
  assert.ok(list.every((palette) => palette && Array.isArray(palette.colors) && palette.colors.length >= 3));
  assert.equal(store.canUndo(), undoBefore, 'no history entry');
  assert.deepEqual(snapshot(), before);
});

test('setSubtitleBackgroundsHidden flags every subtitle track in one undo step', () => {
  const doc = fixture();
  store.load(doc);
  const before = snapshot();
  assert.equal(store.state.project.tracks.filter((track) => track.kind === 'subtitle').every((track) => !track.bgHidden), true);
  store.commands.setSubtitleBackgroundsHidden(true);
  for (const track of store.state.project.tracks) {
    if (track.kind === 'subtitle') assert.equal(track.bgHidden, true, track.id);
  }
  // the background data is untouched
  assert.equal(store.state.project.style.bgShape, before.style.bgShape);
  assert.equal(store.undo(), true);
  assert.deepEqual(snapshot(), before);
  // one more undo does not go back to the previous state again
  store.commands.setSubtitleBackgroundsHidden(false);
  assert.equal(store.undo(), true);
  assert.deepEqual(snapshot(), before);
});

test('rerollBeat draws the selected beat style in one undo step', () => {
  const doc = fixture();
  store.load(doc);
  const before = snapshot();
  store.commands.rerollBeat('c1', 'c1:page0');
  const bag = store.state.project.beatStyles['c1:page0'];
  assert.ok(bag && Object.keys(bag).length > 0, 'the beat gained its own style');
  assert.ok(bag.enter || bag.exit || bag.fill || bag.post || bag.hold || bag.edge || bag.animation, JSON.stringify(bag));
  assert.equal(store.undo(), true);
  assert.deepEqual(snapshot(), before);
});

test('rerollBeat draws a fresh typeface for the beat', () => {
  const doc = fixture();
  store.load(doc);
  const fonts = new Set();
  for (let attempt = 0; attempt < 12; attempt += 1) {
    store.commands.rerollBeat('c1', 'c1:page0');
    const bag = store.state.project.beatStyles['c1:page0'];
    assert.ok(bag.text && bag.text.fontId, 'the beat carries its own font');
    fonts.add(bag.text.fontId);
  }
  assert.ok(fonts.size > 1, `the font moves between re-rolls (${[...fonts].join(', ')})`);
});

test('rerollCue draws a fresh typeface for the cue', () => {
  store.load(fixture());
  store.commands.rerollCue('c1');
  const bag = store.state.project.cueStyles.c1;
  assert.ok(bag.text && bag.text.fontId, 'the cue carries its own font');
});

test('varyAll re-draws the style bags of every cue in one undo step', () => {
  const doc = fixture();
  // vary keeps the types, so the song needs a drawn effect to re-draw
  doc.style.enter = { type: 'slide', params: {} };
  store.load(doc);
  const before = snapshot();
  store.commands.varyAll();
  const project = store.state.project;
  assert.equal(project.beats.c1[0].variation, 1, 'the variation slot steps');
  assert.ok(Object.keys(project.cueStyles.c1 || {}).length > 0, 'cue c1 was varied');
  assert.ok(Object.keys(project.cueStyles.c2 || {}).length > 0, 'cue c2 was varied');
  assert.notDeepEqual(snapshot().beatStyles, before.beatStyles, 'the beat styles moved');
  assert.equal(store.undo(), true);
  assert.deepEqual(snapshot(), before);
});

test('rerollClip redraws a figure clip with a fresh motif and moves', () => {
  const doc = fixture();
  doc.tracks.push({ id: 'fig', kind: 'figure', name: '図形' });
  doc.beats = { c1: [{ id: 'c1:page0', cueId: 'c1', start: 0, end: 4, kind: 'page', text: 'hello' }] };
  doc.clips.push({
    id: 'fig1',
    trackId: 'fig',
    start: 0,
    end: 4,
    spec: SA.figures.generate({ span: { start: 0, end: 4 }, axes: { weird: 0.5 }, seed: 1, id: 'fig1' }),
    opacity: 0.9,
    fadeIn: 0,
    fadeOut: 0,
    colors: null,
  });
  store.load(doc);
  const before = JSON.stringify(store.state.project.clips.find((clip) => clip.id === 'fig1').spec);
  let changed = false;
  for (let attempt = 0; attempt < 5 && !changed; attempt += 1) {
    store.commands.rerollClip('fig1');
    const after = JSON.stringify(store.state.project.clips.find((clip) => clip.id === 'fig1').spec);
    changed = after !== before;
  }
  assert.equal(changed, true, 'the figure re-roll changed the spec');
  assert.equal(store.undo(), true);
});

test('rerollClip preserves figure clip disabled state', () => {
  const doc = fixture();
  doc.tracks.push({ id: 'fig', kind: 'figure', name: '図形' });
  doc.beats = { c1: [{ id: 'c1:page0', cueId: 'c1', start: 0, end: 4, kind: 'page', text: 'hello' }] };
  doc.clips.push({
    id: 'fig_dis',
    trackId: 'fig',
    start: 0,
    end: 4,
    disabled: true,
    spec: SA.figures.generate({ span: { start: 0, end: 4 }, axes: { weird: 0.5 }, seed: 1, id: 'fig_dis', enabled: false }),
    opacity: 0.9,
    fadeIn: 0,
    fadeOut: 0,
    colors: null,
  });
  store.load(doc);
  store.commands.rerollClip('fig_dis');
  const clip = store.state.project.clips.find((c) => c.id === 'fig_dis');
  assert.equal(clip.spec.params.enabled, false);
  assert.equal(clip.disabled, true);
});

test('a composition-mode cue re-roll redraws its beats through composeBeat', () => {
  const doc = fixture();
  doc.styleMode.compose = true;
  doc.beats = { c1: [{ id: 'c1:page0', cueId: 'c1', start: 0, end: 4, kind: 'page', text: 'hello' }] };
  doc.beatStyles = {
    'c1:page0': { text: { compose: { id: 'heroCenter', text: 'hello', breaks: [], spans: [] } } },
  };
  store.load(doc);
  store.commands.rerollCue('c1');
  const style = store.state.project.beatStyles['c1:page0'];
  assert.ok(style.text && style.text.compose, 'the beat carries a composition');
  assert.ok(globalThis.SA.compositions.get(style.text.compose.id), `known composition ${style.text.compose.id}`);
  assert.equal(style.location.type, 'grid');
  assert.deepEqual(style.hold, []);
  assert.equal(store.undo(), true);
});

test('a weird-0 composition cue re-roll pins the beats to the theme size', () => {
  const doc = fixture();
  doc.styleMode.compose = true;
  doc.style.text = { ...(doc.style.text || {}), size: 80 };
  doc.beats = { c1: [{ id: 'c1:page0', cueId: 'c1', start: 0, end: 4, kind: 'page', text: 'hello' }] };
  store.load(doc);
  store.commands.rerollCue('c1');
  const style = store.state.project.beatStyles['c1:page0'];
  assert.ok(style.text && style.text.compose, 'the beat carries a composition');
  assert.equal(style.text.size, 80, 'the weird-0 run keeps the one size');
});

test('a weird-0 composition beat re-roll keeps the theme size', () => {
  const doc = fixture();
  doc.styleMode.compose = true;
  doc.style.text = { ...(doc.style.text || {}), size: 80 };
  doc.beats = { c1: [{ id: 'c1:page0', cueId: 'c1', start: 0, end: 4, kind: 'page', text: 'hello' }] };
  store.load(doc);
  store.commands.rerollBeat('c1', 'c1:page0');
  const bag = store.state.project.beatStyles['c1:page0'];
  assert.ok(bag && bag.text, 'the beat carries a style');
  assert.equal(bag.text.size, 80, 'the weird-0 run keeps the one size');
});

test('a beat re-roll follows the section plan the run stored', () => {
  // The run stored its blocks (with their boost) on the styleMode. A re-roll
  // has no music to measure, so it restores the plan: the beat is redrawn with
  // its own block's profile instead of the song's average.
  const doc = fixture();
  doc.script.cues = [
    { id: 'c1', start: 0, end: 3, text: 'first block', trackId: 'sub1' },
    { id: 'c2', start: 10, end: 13, text: 'second block', trackId: 'sub1' },
  ];
  doc.styleMode.axes = { ...doc.styleMode.axes, weird: 0.6 };
  doc.styleMode.compose = true;
  doc.styleMode.sections = {
    gap: 2,
    maxCues: 4,
    strength: 1,
    list: [
      { index: 0, cueIds: ['c1'], start: 0, end: 3, energy: 1, chorus: true, boost: 0.3, salt: 111 },
      { index: 1, cueIds: ['c2'], start: 10, end: 13, energy: 0.2, chorus: false, boost: 0.05, salt: 222 },
    ],
  };
  doc.beats = {
    c1: [{ id: 'c1:page0', cueId: 'c1', start: 0, end: 3, kind: 'page', text: 'first block' }],
    c2: [{ id: 'c2:page0', cueId: 'c2', start: 10, end: 13, kind: 'page', text: 'second block' }],
  };
  store.load(doc);
  // the plan survives the load and drives the re-roll
  store.commands.rerollBeat('c1', 'c1:page0');
  const bag = store.state.project.beatStyles['c1:page0'];
  assert.ok(bag && bag.text && bag.text.compose, 'the beat is redrawn as a composition');
  assert.ok(globalThis.SA.compositions.get(bag.text.compose.id), `known composition ${bag.text.compose.id}`);
  assert.equal(store.state.project.styleMode.sections.list.length, 2, 'the plan is untouched');
  assert.equal(store.undo(), true);
});

test('a project without a section plan re-rolls on the song profile', () => {
  const doc = fixture();
  doc.styleMode.compose = true;
  doc.beats = { c1: [{ id: 'c1:page0', cueId: 'c1', start: 0, end: 4, kind: 'page', text: 'hello' }] };
  store.load(doc);
  assert.equal(store.state.project.styleMode.sections, undefined);
  store.commands.rerollBeat('c1', 'c1:page0');
  const bag = store.state.project.beatStyles['c1:page0'];
  assert.ok(bag && bag.text && bag.text.compose, 'the beat is redrawn');
  assert.equal(store.undo(), true);
});

test('invertBeatScheme toggles the role order and undoes in one step', () => {
  const doc = fixture();
  doc.style.palette = { id: 'p', name: 'p', colors: ['#101018', '#202838', '#eef2ff', '#ff8a3d', '#05060a', '#ffc247'] };
  doc.styleMode.axes = { ...doc.styleMode.axes, weird: 0.7 };
  store.load(doc);
  const before = snapshot();
  assert.equal(store.commands.invertBeatScheme('c1', 'c1:page0'), 'TMBD');
  assert.equal(store.state.project.beatStyles['c1:page0'].colorScheme, 'TMBD');
  // a second press goes back to the base colours
  assert.equal(store.commands.invertBeatScheme('c1', 'c1:page0'), null);
  assert.equal(store.state.project.beatStyles['c1:page0'].colorScheme, undefined);
  assert.equal(store.undo(), true);
  assert.equal(store.state.project.beatStyles['c1:page0'].colorScheme, 'TMBD');
  assert.equal(store.undo(), true);
  assert.deepEqual(snapshot(), before);
});

test('rerollBeatScheme picks another role order of the same palette', () => {
  const doc = fixture();
  doc.style.palette = { id: 'p', name: 'p', colors: ['#101018', '#202838', '#eef2ff', '#ff8a3d', '#05060a', '#ffc247'] };
  doc.styleMode.axes = { ...doc.styleMode.axes, weird: 0.7 };
  store.load(doc);
  const candidates = globalThis.SA.paletteRoles.schemes(store.state.project.style.palette.colors, 0.7);
  assert.ok(candidates.length >= 2, `candidates ${candidates.length}`);
  const pick = store.commands.rerollBeatScheme('c1', 'c1:page0');
  assert.ok(pick && pick.id);
  assert.equal(store.state.project.beatStyles['c1:page0'].colorScheme, pick.id);
  const again = store.commands.rerollBeatScheme('c1', 'c1:page0');
  assert.ok(again && again.id);
  assert.notEqual(again.id, pick.id, 'never re-picks the current order');
  assert.equal(store.undo(), true);
  assert.equal(store.state.project.beatStyles['c1:page0'].colorScheme, pick.id);
});

test('setBeatColorLegacy switches between the classic and the palette-set modes', () => {
  const doc = fixture();
  doc.style.palette = { id: 'p', name: 'p', colors: ['#101018', '#202838', '#eef2ff', '#ff8a3d', '#05060a', '#ffc247'] };
  doc.style.paletteSet = { max: 5, change: 0.5, invert: 0.2, extra: [{ id: 'p2', name: 'p2', colors: ['#0a1a10', '#12301c', '#f0fff0', '#00c060', '#001008', '#9be8c8'] }] };
  doc.styleMode.axes = { ...doc.styleMode.axes, weird: 0.7 };
  store.load(doc);
  const before = snapshot();
  // ON: the beat takes the classic mode and draws a scheme now
  const classic = store.commands.setBeatColorLegacy('c1', 'c1:page0', true);
  assert.ok(classic.scheme && classic.scheme.length === 4, `scheme ${classic.scheme}`);
  assert.equal(classic.index, 0);
  assert.equal(classic.invert, false);
  const on = store.state.project.beatStyles['c1:page0'];
  assert.equal(on.colorLegacy, true);
  assert.equal(on.colorScheme, classic.scheme);
  assert.equal(on.paletteIndex, undefined);
  assert.equal(on.paletteInvert, undefined);
  // OFF: the classic state is replaced by the palette-set draw
  const result = store.commands.setBeatColorLegacy('c1', 'c1:page0', false);
  assert.equal(result.scheme, null, 'the palette-set mode draws no scheme');
  const off = store.state.project.beatStyles['c1:page0'] || {};
  assert.equal(off.colorLegacy, undefined);
  assert.equal(off.colorScheme, undefined);
  if (result.index) assert.equal(off.paletteIndex, result.index);
  if (result.invert) assert.equal(off.paletteInvert, true);
  // undo walks back OFF -> ON -> the original beat
  assert.equal(store.undo(), true);
  assert.equal(store.state.project.beatStyles['c1:page0'].colorScheme, classic.scheme);
  assert.equal(store.undo(), true);
  assert.deepEqual(snapshot(), before);
});

// --- the song (Settings -> Song) ---------------------------------------------

// a project with a leading silence (the intro gap the first filler fills) and a
// long one in the middle
function songFixture(extra) {
  return projectModule.defaults({
    script: {
      cues: [
        { id: 'c1', start: 3, end: 7, text: 'hello', trackId: 'sub1' },
        { id: 'c2', start: 19, end: 23, text: 'world', trackId: 'sub1' },
      ],
    },
    ...(extra || {}),
  });
}

test('setSong writes the title and the author, and the first filler shows them', () => {
  store.load(songFixture());
  store.commands.setSong({ title: 'Neon Rain', author: 'Aoi', bpm: 0 });
  const doc = store.state.project;
  // `length` (0 = end with the last cue) came with the song-length field
  assert.deepEqual(doc.song, { title: 'Neon Rain', author: 'Aoi', titleFontId: '', authorFontId: '', bpm: 0, length: 0 });
  const settings = globalThis.SA.fillers.settingsFor(doc);
  const intro = globalThis.SA.fillers.gaps(doc.script.cues, 23, settings).find((gap) => gap.kind === 'intro');
  assert.equal(intro.spec.params.list[0].type, 'credits', 'the first filler names the song');
  assert.deepEqual(globalThis.SA.credits.expandTemplate(doc, globalThis.SA.credits.settingsFor(doc), {}), ['Neon Rain', 'Aoi']);
  store.undo();
  assert.deepEqual(store.state.project.song, { title: '', author: '', titleFontId: '', authorFontId: '', bpm: 0, length: 0 });
});

test('setSong re-times the beats and re-cuts the automatic filler clips on the bar grid', () => {
  const doc = songFixture();
  // the long gap the automatic direction filled, whole
  doc.clips.push({ id: 'clip_filler_0', trackId: 'filler', start: 7.15, end: 18.85, auto: true, spec: { type: 'figures', params: {} }, opacity: 1, fadeIn: 0.3, fadeOut: 0.3, colors: null });
  // and one the user drew by hand, which the tempo must not touch
  doc.clips.push({ id: 'hand', trackId: 'filler', start: 7.15, end: 18.85, spec: { type: 'countdown', params: {} }, opacity: 1, fadeIn: 0, fadeOut: 0, colors: null });
  doc.script.cues[0].text = 'one two three four five six seven eight nine ten eleven twelve';
  store.load(doc);
  const before = snapshot();
  const beatsBefore = (store.state.project.beats.c1 || []).length;
  store.commands.setSong({ bpm: 120 });
  const after = store.state.project;
  assert.equal(after.song.bpm, 120);
  // the cue is cut into one beat per bar now
  const beats = after.beats.c1;
  assert.ok(beats.length > beatsBefore, `${beats.length} beats > ${beatsBefore}`);
  assert.ok(beats.slice(1).every((beat) => Math.abs(beat.start % 2) < 1e-6), 'the inner beats land on the bar grid');
  // the automatic filler gap came back bar by bar, the hand-made clip stayed
  const auto = after.clips.filter((clip) => clip.trackId === 'filler' && clip.auto);
  const interlude = auto.filter((clip) => clip.start > 6).sort((a, b) => a.start - b.start);
  assert.ok(interlude.length > 1, `the long gap is divided (${interlude.length} clips)`);
  for (let i = 1; i < interlude.length; i += 1) assert.equal(interlude[i].start, interlude[i - 1].end, 'the bars tile the gap');
  assert.ok(interlude.every((clip) => Math.abs(clip.start % 2) < 1e-6 || Math.abs((clip.start - 7.25) % 2) < 1e-6), 'the bars follow the grid');
  assert.ok(interlude.every((clip) => clip.fadeIn === 0 && clip.fadeOut === 0), 'the bars cut hard, they do not dip at every beat');
  // the intro names the song on its first bar only
  const intro = auto.filter((clip) => clip.start < 3).sort((a, b) => a.start - b.start);
  const creditsOf = (clip) => (clip.spec.params.list || []).some((part) => part && part.type === 'credits');
  assert.ok(creditsOf(intro[0]), 'the first filler shows the title');
  for (const clip of intro.slice(1)) assert.ok(!creditsOf(clip), 'the later bars do not repeat it');
  assert.equal(after.clips.filter((clip) => clip.id === 'hand').length, 1, 'a hand-made clip is never replaced');
  assert.equal(store.undo(), true);
  assert.deepEqual(snapshot(), before);
});

test('setSong drops the rhythm plan an older run cut for the old tempo', () => {
  const doc = fixture();
  doc.script.cues[0].textFlow = { chunk: 'phrase', chunkPlan: [1, 2, 3] };
  doc.textFlow = { chunk: 'phrase', targetChunkDuration: 2 };
  store.load(doc);
  store.commands.setSong({ bpm: 140 });
  assert.equal(store.state.project.script.cues[0].textFlow.chunkPlan, undefined);
  assert.equal(store.state.project.textFlow.targetChunkDuration, undefined);
  assert.equal(store.state.project.textFlow.chunk, 'phrase', 'the rest of the flow survives');
});

test('setSong keeps a junk tempo out of the project', () => {
  store.load(fixture());
  store.commands.setSong({ bpm: 'fast' });
  assert.equal(store.state.project.song.bpm, 0);
});

test('resetTheme leaves a plain subtitle and unpins the hand edits', () => {
  const doc = fixture();
  doc.style.text.fontId = 'NotoSansJP-Bold';
  doc.style.text.size = 140;
  doc.style.animation = { type: 'stagger', enabled: true, params: {} };
  doc.style.post = [{ type: 'glow', params: {}, enabled: true }];
  doc.cueStyles.c1 = { edge: [{ type: 'outline', params: {}, enabled: true }] };
  doc.beatStyles['c1:page0'] = { colorScheme: 'TMBD' };
  doc.overrides['cue:c1'] = { text: { size: 200 } };
  doc.keyframes['cue:c1'] = { 'transform.scale': [{ t: 0, v: 1 }] };
  doc.beats.c1[0] = { ...doc.beats.c1[0], pinned: true, fontScale: 1.6, fit: 'fill', bleed: true };
  doc.fillers.clips = { g0: { type: 'shapes', params: {}, pinned: true } };
  store.load(doc);
  const before = snapshot();
  store.commands.resetTheme();
  const after = store.state.project;
  assert.deepEqual(after.style, { ...projectModule.defaults().style, text: { ...projectModule.defaults().style.text, fontId: 'NotoSansJP-Bold' } });
  assert.deepEqual(after.cueStyles, {});
  assert.deepEqual(after.beatStyles, {});
  assert.deepEqual(after.overrides, {});
  assert.deepEqual(after.keyframes, {});
  assert.deepEqual(Object.values(after.beatKindStyle), [{}, {}, {}, {}, {}]);
  const beat = after.beats.c1[0];
  assert.equal(beat.pinned, false);
  assert.equal(beat.fontScale, 1);
  assert.equal(beat.fit, undefined);
  assert.equal(beat.bleed, undefined);
  assert.equal(beat.text, 'hello');
  assert.deepEqual(after.fillers.clips, {});
  assert.equal(store.undo(), true);
  assert.deepEqual(snapshot(), before);
});

// --- video tracks / moving items between tracks of one kind -----------------

test('a video track moves past other kinds and takes its layers when removed', () => {
  store.load(fixture());
  const id = store.commands.addTrack('video');
  assert.equal(id, 'video1');
  const tracks = () => store.state.project.tracks.map((track) => track.id);
  const bgAt = tracks().indexOf('bg');
  assert.equal(tracks().indexOf(id), bgAt - 1, 'a new video track sits just above the background');
  store.commands.moveTrack(id, 'up');
  assert.equal(tracks().indexOf(id), bgAt - 2, 'it moves past a track of another kind');
  store.commands.addLayer({ id: 'L1', slot: 'video', trackId: id, type: 'video', src: 'x.mp4' });
  store.commands.addLayer({ id: 'L2', slot: 'background', type: 'solid' });
  store.commands.removeTrack(id);
  assert.deepEqual(store.state.project.layers.map((layer) => layer.id), ['L2']);
});

test('tracks move past any kind in layer order, foreground and background stay fixed', () => {
  store.load(fixture());
  const tracks = () => store.state.project.tracks.map((track) => track.id);
  // default order: fg, sub1, fig, filler, mid, bg
  store.commands.moveTrack('sub1', 'down');
  assert.deepEqual(tracks(), ['fg', 'fig', 'sub1', 'filler', 'mid', 'bg'], 'a subtitle moves past a figure track');
  store.commands.moveTrack('mid', 'up');
  store.commands.moveTrack('mid', 'up');
  assert.equal(tracks().indexOf('mid') < tracks().indexOf('sub1'), true, 'a backdrop moves past subtitles');
  const before = tracks();
  store.commands.moveTrack('fg', 'down');
  store.commands.moveTrack('bg', 'up');
  assert.deepEqual(tracks(), before, 'foreground and background never move');
  store.commands.moveTrack('sub1', 'up');
  store.commands.moveTrack('sub1', 'up');
  assert.equal(tracks()[0], 'fg', 'no track moves past the foreground');
  store.commands.moveTrack('filler', 'down');
  store.commands.moveTrack('filler', 'down');
  assert.equal(tracks()[tracks().length - 1], 'bg', 'no track moves past the background');
});

test('moveCuesToTrack moves several cues at once and skips overlaps', () => {
  const doc = fixture();
  doc.tracks.splice(2, 0, { id: 'sub2', kind: 'subtitle', name: '字幕2' });
  doc.script.cues.push({ id: 'c3', start: 7.5, end: 8, text: 'x', trackId: 'sub2' });
  store.load(doc);
  const moved = store.commands.moveCuesToTrack(['c1', 'c2'], 'sub2');
  assert.equal(moved, 1);
  const trackOf = (id) => store.state.project.script.cues.find((cue) => cue.id === id).trackId;
  assert.equal(trackOf('c1'), 'sub2');
  assert.equal(trackOf('c2'), 'sub1', 'overlapping c3 keeps it on sub1');
  assert.equal(store.commands.moveCuesToTrack(['c1'], 'fig'), 0, 'not onto another kind');
});

test('moveClipsToTrack only moves clips between tracks of the same kind', () => {
  const doc = fixture();
  doc.tracks.splice(3, 0, { id: 'fig2', kind: 'figure', name: '図形2' });
  doc.clips.push({ id: 'f1', trackId: 'fig', start: 0, end: 2, spec: { type: 'figure', params: {} } });
  store.load(doc);
  assert.equal(store.commands.moveClipsToTrack(['f1', 'clip1'], 'fig2'), 1);
  const clips = store.state.project.clips;
  assert.equal(clips.find((clip) => clip.id === 'f1').trackId, 'fig2');
  assert.equal(clips.find((clip) => clip.id === 'clip1').trackId, 'bg', 'a background clip is not a figure');
});

// --- clip beats: figure sub-beats and combo layers ---------------------------

function clipBeatFixture() {
  globalThis.SA.fillerRender = globalThis.SA.fillerRender || require('../../renderer/js/lyrics/filler-render.js');
  if (!globalThis.SA.colors) {
    let n = 0;
    globalThis.SA.colors = {
      randomPalette(size) {
        n += 1;
        const colors = [];
        for (let i = 0; i < (size || 5); i += 1) colors.push(`#${((n * 2654435761 + i * 40503) >>> 8).toString(16).padStart(6, '0').slice(0, 6)}`);
        return { id: `rand${n}`, name: `Random ${n}`, colors };
      },
    };
  }
  const doc = fixture();
  doc.tracks.push({ id: 'fig', kind: 'figure', name: '図形' }, { id: 'bd', kind: 'backdrop', name: '後景' });
  doc.beats = { c1: [{ id: 'c1:page0', cueId: 'c1', start: 0, end: 4, kind: 'page', text: 'hello' }] };
  doc.clips.push({
    id: 'fig1', trackId: 'fig', start: 0, end: 4, opacity: 0.9, fadeIn: 0, fadeOut: 0, colors: null,
    spec: SA.figures.generate({ span: { start: 0, end: 4 }, beats: [{ start: 0, end: 2 }, { start: 2, end: 4 }], axes: { weird: 0.5 }, seed: 1, id: 'fig1' }),
  });
  doc.clips.push({
    id: 'bd1', trackId: 'bd', start: 0, end: 4, opacity: 1, fadeIn: 0, fadeOut: 0, colors: ['#223344', '#556677'],
    spec: { type: 'combo', params: { list: [{ type: 'pattern', params: { mode: 'dots', count: 10 } }, { type: 'sineWave', params: {} }] } },
  });
  store.load(doc);
  return doc;
}

test('recolorFigureBeat gives the sub-beat its own colours and reports the span', () => {
  clipBeatFixture();
  const report = store.commands.recolorFigureBeat('fig1', 0);
  const sub = store.state.project.clips.find((clip) => clip.id === 'fig1').spec.params.beats[0];
  assert.ok(Array.isArray(sub.colors) && sub.colors.length > 0, 'the sub-beat carries colours');
  assert.equal(sub.colorLock, true);
  assert.equal(report.op, 'recolor');
  assert.equal(report.start, sub.start);
  assert.equal(store.undo(), true);
  assert.equal(store.state.project.clips.find((clip) => clip.id === 'fig1').spec.params.beats[0].colors, undefined);
});

test('varyFigureBeat always moves size, variant and tone a visible step', () => {
  clipBeatFixture();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const before = { ...store.state.project.clips.find((clip) => clip.id === 'fig1').spec.params.beats[1] };
    const report = store.commands.varyFigureBeat('fig1', 1);
    const after = store.state.project.clips.find((clip) => clip.id === 'fig1').spec.params.beats[1];
    assert.ok(Math.abs(after.size - (before.size == null ? 1 : before.size)) >= 0.29, `size ${before.size} -> ${after.size}`);
    assert.notEqual(after.variant, before.variant || 0);
    assert.notEqual(after.tone, before.tone || 0);
    assert.deepEqual(after.move, before.move, 'vary keeps the moves');
    assert.match(report.detail, /size/);
  }
});

test('recolorClipLayer reaches a layer that has no colours of its own', () => {
  clipBeatFixture();
  const report = store.commands.recolorClipLayer('bd1', 1);
  const layer = store.state.project.clips.find((clip) => clip.id === 'bd1').spec.params.list[1];
  assert.ok(typeof layer.params.color === 'string' && layer.params.color.startsWith('#'), 'the layer got a colour');
  assert.equal(layer.colorLock, true);
  assert.equal(report.type, 'sineWave');
  const other = store.state.project.clips.find((clip) => clip.id === 'bd1').spec.params.list[0];
  assert.equal(other.colorLock, undefined, 'the other layer is untouched');
});

test('varyClipLayer keeps the layer type and reports the params it moved', () => {
  clipBeatFixture();
  const report = store.commands.varyClipLayer('bd1', 0);
  const layer = store.state.project.clips.find((clip) => clip.id === 'bd1').spec.params.list[0];
  assert.equal(layer.type, 'pattern');
  assert.ok(report.detail.length > 0, 'something moved');
});

test('the stage palette leaves a colour-locked layer alone', () => {
  const stage = require('../../renderer/js/lyrics/stage-palette.js');
  const clip = {
    colors: ['#112233'],
    spec: { type: 'combo', params: { list: [{ type: 'pattern', params: { color: '#ff0000' } }, { type: 'sineWave', colorLock: true, params: { color: '#ff0000' } }] } },
  };
  const result = stage.recolorClip(clip, ['#ff0000', '#00ff00'], { cue: ['#ff0000', '#00ff00'], to: ['#0000ff', '#ffff00'], text: [], key: 'k' }, 0);
  assert.notEqual(result.spec.params.list[0].params.color, '#ff0000');
  assert.equal(result.spec.params.list[1].params.color, '#ff0000');
});

test('clipBeatSpans cuts a backdrop at the lyric beats and returns figure beats', () => {
  clipBeatFixture();
  store.state.project.beats.c1 = [
    { id: 'c1:b0', cueId: 'c1', start: 0, end: 2, kind: 'page', text: 'a' },
    { id: 'c1:b1', cueId: 'c1', start: 2, end: 4, kind: 'page', text: 'b' },
  ];
  const bd = store.state.project.clips.find((clip) => clip.id === 'bd1');
  const spans = projectModule.clipBeatSpans(store.state.project, bd);
  assert.equal(spans.length, 2);
  assert.equal(spans[0].start, 0);
  assert.equal(spans[0].end, 2);
  assert.equal(spans[1].start, 2);
  assert.equal(spans[1].end, 4);
  const fig = store.state.project.clips.find((clip) => clip.id === 'fig1');
  const figSpans = projectModule.clipBeatSpans(store.state.project, fig);
  assert.equal(figSpans.length, fig.spec.params.beats.length);
  assert.equal(figSpans[0].start, Number(fig.spec.params.beats[0].start));
});

test('varyClipSegment stores the spans and gives only one segment its own spec', () => {
  clipBeatFixture();
  store.state.project.beats.c1 = [
    { id: 'c1:b0', cueId: 'c1', start: 0, end: 2, kind: 'page', text: 'a' },
    { id: 'c1:b1', cueId: 'c1', start: 2, end: 4, kind: 'page', text: 'b' },
  ];
  const bodyBefore = JSON.stringify(store.state.project.clips.find((clip) => clip.id === 'bd1').spec);
  const before = snapshot();
  const report = store.commands.varyClipSegment('bd1', 1);
  assert.ok(report, 'report returned');
  const clip = store.state.project.clips.find((entry) => entry.id === 'bd1');
  assert.equal(clip.segments.length, 2);
  assert.equal(clip.segments[0].spec, undefined);
  assert.ok(clip.segments[1].spec, 'the second segment has its own spec');
  assert.equal(JSON.stringify(clip.spec), bodyBefore, 'the body spec is untouched');
  assert.equal(store.undo(), true);
  assert.deepEqual(snapshot(), before);
  assert.equal(store.state.project.clips.find((entry) => entry.id === 'bd1').segments, undefined);
});

test('recolorClipSegment locks every layer of the segment spec', () => {
  clipBeatFixture();
  store.state.project.beats.c1 = [
    { id: 'c1:b0', cueId: 'c1', start: 0, end: 2, kind: 'page', text: 'a' },
    { id: 'c1:b1', cueId: 'c1', start: 2, end: 4, kind: 'page', text: 'b' },
  ];
  const report = store.commands.recolorClipSegment('bd1', 0);
  assert.equal(report.op, 'recolor');
  const seg = store.state.project.clips.find((clip) => clip.id === 'bd1').segments[0];
  assert.ok(seg.spec, 'the segment has its own spec');
  const layers = globalThis.SA.fillerRender.layersOf(seg.spec);
  assert.ok(layers.length >= 1);
  for (const layer of layers) {
    if (layer && layer.type !== 'split') assert.equal(layer.colorLock, true);
  }
});

test('move / split / trim shift and clamp the backdrop segments', () => {
  clipBeatFixture();
  store.state.project.beats.c1 = [
    { id: 'c1:b0', cueId: 'c1', start: 0, end: 2, kind: 'page', text: 'a' },
    { id: 'c1:b1', cueId: 'c1', start: 2, end: 4, kind: 'page', text: 'b' },
  ];
  store.commands.varyClipSegment('bd1', 1);
  store.commands.moveClip('bd1', 1);
  let clip = store.state.project.clips.find((entry) => entry.id === 'bd1');
  assert.equal(clip.start, 1);
  assert.equal(clip.segments[0].start, 1);
  assert.equal(clip.segments[0].end, 3);
  assert.equal(clip.segments[1].start, 3);
  assert.equal(clip.segments[1].end, 5);
  // split at 3: the first half keeps the plain segment (no spec -> dropped),
  // the second half keeps the varied one
  store.commands.splitClip('bd1', 3);
  const first = store.state.project.clips.find((entry) => entry.id === 'bd1');
  const second = store.state.project.clips.find((entry) => entry.id !== 'bd1' && entry.trackId === first.trackId && entry.start === 3);
  assert.ok(second, 'the second half exists');
  assert.equal(first.segments, undefined, 'the spec-less side drops its segments');
  assert.ok(second.segments && second.segments.length === 1 && second.segments[0].spec, 'the varied side keeps one segment');
  // trimming away the varied segment drops the segments: a fresh clip with a
  // spec on the second span, cut before it, keeps only the plain span
  clipBeatFixture();
  store.state.project.beats.c1 = [
    { id: 'c1:b0', cueId: 'c1', start: 0, end: 2, kind: 'page', text: 'a' },
    { id: 'c1:b1', cueId: 'c1', start: 2, end: 4, kind: 'page', text: 'b' },
  ];
  store.commands.varyClipSegment('bd1', 1);
  store.commands.trimClip('bd1', 'end', 1);
  assert.equal(store.state.project.clips.find((entry) => entry.id === 'bd1').segments, undefined);
});

test('moveClip and duplicateClip shift the figure sub-beats', () => {
  clipBeatFixture();
  store.commands.moveClip('fig1', 2);
  let fig = store.state.project.clips.find((clip) => clip.id === 'fig1');
  assert.equal(fig.start, 2);
  assert.deepEqual(fig.spec.params.beats.map((beat) => [beat.start, beat.end]), [[2, 4], [4, 6]]);
  const copyId = store.commands.duplicateClip('fig1');
  const copy = store.state.project.clips.find((clip) => clip.id === copyId);
  assert.equal(copy.start, 6);
  assert.deepEqual(copy.spec.params.beats.map((beat) => [beat.start, beat.end]), [[6, 8], [8, 10]]);
});

test('trimming a backdrop longer re-cuts the grown edge at the lyric beats', () => {
  clipBeatFixture();
  store.state.project.beats.c1 = [
    { id: 'c1:b0', cueId: 'c1', start: 0, end: 2, kind: 'page', text: 'a' },
    { id: 'c1:b1', cueId: 'c1', start: 2, end: 4, kind: 'page', text: 'b' },
  ];
  store.commands.varyClipSegment('bd1', 1);
  store.commands.trimClip('bd1', 'end', 6);
  const clip = store.state.project.clips.find((entry) => entry.id === 'bd1');
  assert.equal(clip.end, 6);
  assert.equal(clip.segments.length, 3);
  assert.ok(clip.segments[1].spec, 'the varied segment keeps its spec');
  assert.deepEqual([clip.segments[2].start, clip.segments[2].end], [4, 6]);
  assert.equal(clip.segments[2].spec, undefined, 'the grown edge is a plain span');
});

test('trimClip with baseSegments keeps the own spec across a shrink-and-grow drag', () => {
  clipBeatFixture();
  store.state.project.beats.c1 = [
    { id: 'c1:b0', cueId: 'c1', start: 0, end: 2, kind: 'page', text: 'a' },
    { id: 'c1:b1', cueId: 'c1', start: 2, end: 4, kind: 'page', text: 'b' },
  ];
  store.commands.varyClipSegment('bd1', 1);
  const base = JSON.parse(JSON.stringify(store.state.project.clips.find((clip) => clip.id === 'bd1').segments));
  store.commands.trimClip('bd1', 'end', 1, { baseSegments: base });
  store.commands.trimClip('bd1', 'end', 4, { baseSegments: base });
  const clip = store.state.project.clips.find((entry) => entry.id === 'bd1');
  assert.equal(clip.end, 4);
  assert.equal(clip.segments.length, 2);
  assert.ok(clip.segments[1].spec, 'the varied segment survives the drag');
});

test('resetClipSegment drops the last own look and removes the segments', () => {
  clipBeatFixture();
  store.state.project.beats.c1 = [
    { id: 'c1:b0', cueId: 'c1', start: 0, end: 2, kind: 'page', text: 'a' },
    { id: 'c1:b1', cueId: 'c1', start: 2, end: 4, kind: 'page', text: 'b' },
  ];
  store.commands.varyClipSegment('bd1', 0);
  assert.ok(store.state.project.clips.find((clip) => clip.id === 'bd1').segments[0].spec);
  store.commands.resetClipSegment('bd1', 0);
  assert.equal(store.state.project.clips.find((clip) => clip.id === 'bd1').segments, undefined);
});

test('splitEnter covers the beat gaplessly, unsplitEnter restores', () => {
  store.load(fixture());
  store.commands.splitEnter('c1', 'c1:page0', 'letter');
  const bag = store.state.project.beatStyles['c1:page0'];
  assert.ok(bag && Array.isArray(bag.scoped), 'scoped entries were written');
  const enters = bag.scoped.filter((entry) => entry.group === 'enter');
  // 'hello' is 5 letters: 5 gapless slices
  assert.equal(enters.length, 5);
  let cursor = 0;
  for (const entry of enters) {
    assert.equal(entry.scope.kind, 'slice');
    assert.equal(entry.scope.offset, cursor);
    assert.equal(entry.local, true);
    assert.equal(entry.split, true);
    assert.ok(entry.stagger && entry.stagger.each > 0, 'substring stagger');
    cursor += entry.scope.length;
  }
  assert.equal(cursor, 5);
  store.commands.unsplitEnter('c1', 'c1:page0');
  const after = store.state.project.beatStyles['c1:page0'];
  assert.ok(!after || !after.scoped || !after.scoped.some((entry) => entry && entry.split === true), 'split entries are gone');
  store.undo();
  const redone = store.state.project.beatStyles['c1:page0'];
  assert.ok(redone.scoped.some((entry) => entry && entry.split === true), 'undo brings the split back');
});

test('splitEnter word unit groups words with their spaces', () => {
  store.load(fixture());
  store.commands.splitEnter('c1', 'c1:page0', 'word');
  const enters = store.state.project.beatStyles['c1:page0'].scoped.filter((entry) => entry.group === 'enter');
  assert.equal(enters.length, 1);
  assert.equal(enters[0].scope.length, 5);
});
