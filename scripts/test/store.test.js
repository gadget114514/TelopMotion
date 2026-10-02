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
