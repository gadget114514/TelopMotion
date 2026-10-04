'use strict';

// The song block (Settings -> Song): the title / author that name the first
// filler, and the tempo every beat grid follows. The field informs the app,
// the app divides cues into beats on the bar grid and the filler gaps bar by
// bar.

const test = require('node:test');
const assert = require('node:assert/strict');

const projectModule = require('../../renderer/js/studio/project.js');
const textflow = require('../../renderer/js/lyrics/textflow.js');
const fillers = require('../../renderer/js/lyrics/fillers.js');
const credits = require('../../renderer/js/lyrics/credits.js');

function flow(text, options) {
  const opts = options || {};
  return textflow.flow(
    { text, start: opts.start == null ? 0 : opts.start, end: opts.end == null ? 12 : opts.end, aspect: '16:9' },
    {
      style: { size: 96, lineHeight: 1.2, maxWidth: 0.9 },
      frame: { width: 1920, height: 1080 },
      settings: opts.settings || {},
    }
  );
}

function projectWith(extra) {
  return projectModule.defaults({
    script: { cues: [{ id: 'c1', start: 0, end: 12, text: 'one two three four five six seven eight nine ten eleven twelve', trackId: 'sub1' }] },
    ...(extra || {}),
  });
}

// --- the field ----------------------------------------------------------------

test('a new document has an empty song block and 0 BPM (follow the audio)', () => {
  const doc = projectModule.create({});
  assert.deepEqual(doc.song, { title: '', author: '', bpm: 0, length: 0 });
  assert.equal(projectModule.bpmOf(doc), 0);
});

test('migrate fills the song block in for a document saved without one', () => {
  const old = projectModule.defaults();
  delete old.song;
  const migrated = projectModule.migrate(JSON.parse(JSON.stringify(old)));
  assert.equal(migrated.ok, true);
  assert.deepEqual(migrated.project.song, { title: '', author: '', bpm: 0, length: 0 });
});

test('migrate keeps a typed song and drops a junk tempo', () => {
  const raw = projectModule.defaults({ song: { title: 'Neon Rain', author: 'Aoi', bpm: 'nope' } });
  const migrated = projectModule.migrate(JSON.parse(JSON.stringify(raw))).project;
  assert.equal(migrated.song.title, 'Neon Rain');
  assert.equal(migrated.song.author, 'Aoi');
  assert.equal(migrated.song.bpm, 0, 'a tempo that is not a number is no tempo');
});

test('songOf reads the name and the tempo, tempoOf falls back to the audio', () => {
  const doc = projectWith({ song: { title: 'Neon Rain', author: 'Aoi', bpm: 128 } });
  assert.deepEqual(projectModule.songOf(doc), { title: 'Neon Rain', author: 'Aoi', bpm: 128, length: 0 });
  assert.equal(projectModule.tempoOf(doc, 96), 128, 'the informed tempo wins over the audio one');
  assert.equal(projectModule.tempoOf(projectWith(), 96), 96, 'no informed tempo: the audio one');
  assert.equal(projectModule.tempoOf(projectWith(), 0), 120, 'neither: the engine default');
});

// --- cue -> beats -------------------------------------------------------------

test('the bar grid is one bar of the tempo, scaled by the chunk scale', () => {
  assert.equal(textflow.gridSecondsOf({ bpm: 120 }), 2);
  assert.equal(textflow.gridSecondsOf({ bpm: 128 }), Math.round((60 / 128) * 4 * 1000) / 1000);
  assert.equal(textflow.gridSecondsOf({ bpm: 120, chunkScale: 0.5 }), 1, 'a weird song halves the bar');
  assert.equal(textflow.gridSecondsOf({}), 0, 'no tempo, no grid');
  assert.equal(textflow.gridSecondsOf({ targetChunkDuration: 3 }), 3, 'the hand duration wins');
  assert.equal(textflow.gridSecondsOf({ bpm: 120, targetChunkDuration: 3 }), 3);
});

test('an informed tempo cuts a cue into one beat per bar', () => {
  const text = 'one two three four five six seven eight nine ten eleven twelve';
  const result = flow(text, { start: 0, end: 12, settings: { bpm: 120 } });
  assert.equal(result.pages.length, 6, `beats ${result.pages.length}`);
  for (const page of result.pages) assert.ok(Math.abs(page.to - page.from - 2) < 1e-6, `bar ${page.to - page.from}s`);
  assert.equal(result.pages[0].from, 0);
  assert.equal(result.pages[result.pages.length - 1].to, 12);
  // the whole cue is spoken, once
  assert.equal(result.pages.map((page) => page.text).join(' ').split(/\s+/).length, 12);
});

test('the grid follows the tempo: a faster song gets more, shorter beats', () => {
  const text = 'one two three four five six seven eight nine ten eleven twelve';
  const slow = flow(text, { start: 0, end: 12, settings: { bpm: 60 } });
  const fast = flow(text, { start: 0, end: 12, settings: { bpm: 180 } });
  assert.ok(slow.pages.length < fast.pages.length, `${slow.pages.length} < ${fast.pages.length}`);
  // bars are cut on the absolute grid, so both start on a bar line
  assert.equal(slow.pages[0].from, 0);
  assert.equal(fast.pages[0].from, 0);
});

test('a cue shorter than a bar stays one beat', () => {
  const result = flow('one two three', { start: 0, end: 1, settings: { bpm: 120 } });
  assert.equal(result.pages.length, 1);
});

test('the informed tempo wins over the tempo a run stored, and over its duration', () => {
  const doc = projectWith({ song: { bpm: 150 } });
  // a run that stored its own 100 BPM grid and the bar length it baked in
  doc.textFlow = { chunk: 'phrase', bpm: 100, targetChunkDuration: 2.4 };
  const options = textflow.cueOptions(doc, doc.script.cues[0]);
  assert.equal(options.settings.bpm, 150);
  assert.equal(options.settings.targetChunkDuration, 0, 'the stored duration is not used any more');
  assert.equal(textflow.gridSecondsOf(options.settings), Math.round((60 / 150) * 4 * 1000) / 1000);
});

test('without an informed tempo the stored one still cuts the cue', () => {
  const doc = projectWith({ textFlow: { chunk: 'phrase', bpm: 100, chunkScale: 0.5 } });
  const options = textflow.cueOptions(doc, doc.script.cues[0]);
  assert.equal(options.settings.bpm, 100);
  assert.equal(textflow.gridSecondsOf(options.settings), 1.2);
});

// --- filler -> beats ----------------------------------------------------------

const FILLER_CUES = [{ id: 'a', start: 2, end: 4 }, { id: 'b', start: 20, end: 22 }];

test('beatSegments cuts a gap on the bar grid and swallows the slivers', () => {
  assert.deepEqual(fillers.beatSegments(0, 8, 120), [[0, 2], [2, 4], [4, 6], [6, 8]]);
  // the tail before the first bar line is too short for a clip of its own
  assert.deepEqual(fillers.beatSegments(1.9, 6, 120), [[1.9, 4], [4, 6]]);
  // shorter than a bar: one clip
  assert.deepEqual(fillers.beatSegments(0, 1.5, 120), [[0, 1.5]]);
  // no tempo: the gap stays whole
  assert.deepEqual(fillers.beatSegments(0, 20, 0), [[0, 20]]);
});

test('an informed tempo divides every gap bar by bar, credits on the first bar only', () => {
  const plain = fillers.gaps(FILLER_CUES, 30, fillers.settingsFor({ fillers: { enabled: true } }));
  const informed = fillers.gaps(FILLER_CUES, 30, fillers.settingsFor({ fillers: { enabled: true }, song: { bpm: 120 } }));
  assert.equal(plain.length, 3, 'one clip per gap without a tempo');
  assert.ok(informed.length > plain.length, `${informed.length} bars > ${plain.length} gaps`);
  const intro = informed.filter((gap) => gap.kind === 'intro');
  assert.equal(intro[0].part, 0);
  assert.equal(intro[0].parts, intro.length);
  const hasCredits = (spec) => {
    if (spec.type === 'credits') return true;
    const list = spec.params && Array.isArray(spec.params.list) ? spec.params.list : [];
    return list.some((part) => part && part.type === 'credits');
  };
  assert.ok(hasCredits(intro[0].spec), 'the first bar of the intro names the song');
  for (const gap of intro.slice(1)) assert.ok(!hasCredits(gap.spec), 'the later bars do not repeat it');
  // the gaps still tile the whole silence, without a hole or an overlap
  const interlude = informed.filter((gap) => gap.kind === 'interlude');
  for (let i = 1; i < interlude.length; i += 1) assert.ok(Math.abs(interlude[i].from - interlude[i - 1].to) < 1e-6);
  // and every bar is its own clip, with its own identity for the draws
  assert.equal(new Set(informed.map((gap) => gap.clipKey)).size, informed.length);
  assert.ok(informed.every((gap) => gap.key), 'the gap key the pinning uses is kept');
});

test('settingsFor takes the tempo from the song, never from a stored filler', () => {
  assert.equal(fillers.settingsFor({ song: { bpm: 90 } }).bpm, 90);
  assert.equal(fillers.settingsFor({ song: { bpm: 0 }, fillers: { bpm: 200 } }).bpm, 0);
  assert.equal(fillers.bpmOf({}), 0);
});

// --- title and author ---------------------------------------------------------

test('the first filler shows the title and the author the project names', () => {
  const doc = projectWith({ song: { title: 'Neon Rain', author: 'Aoi', bpm: 120 } });
  const settings = credits.settingsFor(doc);
  assert.equal(credits.titleText(doc, settings), 'Neon Rain');
  assert.equal(credits.artistText(doc, settings), 'Aoi');
  assert.deepEqual(credits.expandTemplate(doc, settings, { year: 2026 }), ['Neon Rain', 'Aoi']);
  // and the intro gap carries the credits layer that reads them
  const intro = fillers.gaps(FILLER_CUES, 30, fillers.settingsFor(doc)).find((gap) => gap.kind === 'intro');
  assert.equal(intro.spec.type, 'combo');
  assert.equal(intro.spec.params.list[0].type, 'credits');
});

test('profile data still wins over the song fields, and a custom text still wins over both', () => {
  const withProfile = projectWith({
    song: { title: 'Neon Rain', author: 'Aoi' },
    dataset: { profile: { displayName: 'Aoi K.', handle: 'aoi' }, songs: [{ id: 's1', title: 'Paper Moon' }] },
  });
  const settings = credits.settingsFor(withProfile);
  assert.equal(credits.titleText(withProfile, settings), 'Paper Moon');
  assert.equal(credits.artistText(withProfile, settings), 'Aoi K. @aoi');
  const custom = credits.settingsFor({ ...withProfile, credits: { title: { source: 'custom', text: 'Cut' }, artist: { source: 'custom', text: 'Remix' } } });
  assert.equal(credits.titleText(withProfile, custom), 'Cut');
  assert.equal(credits.artistText(withProfile, custom), 'Remix');
  // a custom source left empty falls back to the informed name, not to nothing
  const empty = credits.settingsFor({ ...withProfile, credits: { title: { source: 'custom', text: '' }, artist: { source: 'custom', text: '' } } });
  assert.equal(credits.titleText(withProfile, empty), 'Neon Rain');
  assert.equal(credits.artistText(withProfile, empty), 'Aoi');
});