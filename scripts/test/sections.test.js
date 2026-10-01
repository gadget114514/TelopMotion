'use strict';

// `SA.sections` names the blocks of a flat cue list: a silence (2 s by default)
// or a pseudo-split of a lyric wall. The detection is a pure function of the
// cues (and the audio analysis when there is one), so the automatic direction
// can read a block's own loudness and chorus mark from it.

const test = require('node:test');
const assert = require('node:assert/strict');

const sections = require('../../renderer/js/lyrics/sections.js');
const driver = require('../../renderer/js/lyrics/audio-driver.js');

// Two seconds of audio at 30 fps: one half loud, the other silent (the shape
// audio-driver.test.js builds). `loudSecond` puts the loud half at the end, so a
// cue pair can be placed on either side of the mark.
function fakeAnalysis(options) {
  const loudSecond = !!(options && options.loudSecond);
  const frames = [];
  for (let i = 0; i < 60; i += 1) {
    const loud = loudSecond ? i >= 30 : i < 30;
    const bands = new Float32Array(128);
    if (loud) {
      bands[5] = 0.8;
      bands[30] = 0.4;
      bands[80] = 0.1;
    }
    frames.push({ rms: loud ? 0.5 : 0, bands, wave: new Float32Array(4) });
  }
  return { fps: 30, frameCount: frames.length, frames };
}

// A cue every `step` seconds, all without a silence between them.
function line(count, step, options) {
  const opts = options || {};
  return Array.from({ length: count }, (_, i) => ({
    id: `c${i + 1}`,
    text: opts.text ? `${opts.text} ${i + 1}` : `line ${i + 1}`,
    start: Number((i * step).toFixed(3)),
    end: Number((i * step + (opts.length || 1)).toFixed(3)),
  }));
}

test('a silence of the gap length starts a new section', () => {
  const cues = [
    { id: 'a', start: 0, end: 1 },
    // exactly 2.0 s of silence: a boundary
    { id: 'b', start: 3, end: 4 },
    // 1.99 s: still the same block
    { id: 'c', start: 5.99, end: 7 },
  ];
  const blocks = sections.detect(cues);
  assert.equal(blocks.length, 2);
  assert.deepEqual(blocks[0].cueIds, ['a']);
  assert.deepEqual(blocks[1].cueIds, ['b', 'c']);
  assert.equal(blocks[0].start, 0);
  assert.equal(blocks[0].end, 1);
  assert.equal(blocks[1].start, 3);
  assert.equal(blocks[1].index, 1);
  // one notch tighter and the 2.0 s gap no longer cuts
  assert.equal(sections.detect(cues, { gap: 2.01 }).length, 1);
  // one notch looser and the 1.99 s gap cuts too
  assert.equal(sections.detect(cues, { gap: 1.99 }).length, 3);
});

test('the detection runs in start order and needs no audio', () => {
  const shuffled = [
    { id: 'c', start: 5, end: 6 },
    { id: 'a', start: 0, end: 1 },
    { id: 'b', start: 1.5, end: 2.5 },
  ];
  const blocks = sections.detect(shuffled);
  assert.deepEqual(blocks[0].cueIds, ['a', 'b']);
  assert.deepEqual(blocks[1].cueIds, ['c']);
  for (const block of blocks) {
    assert.equal(block.energy, null, 'no analysis, no energy');
    assert.equal(typeof block.chorus, 'boolean');
  }
  assert.deepEqual(sections.detect([]), []);
  assert.deepEqual(sections.detect(null), []);
});

test('a block longer than maxCues is pseudo-split into even chunks', () => {
  // 7 cues with no silence at all: one block, cut into 4 + 3
  const blocks = sections.detect(line(7, 1.2));
  assert.equal(blocks.length, 2);
  assert.deepEqual(blocks[0].cueIds, ['c1', 'c2', 'c3', 'c4']);
  assert.deepEqual(blocks[1].cueIds, ['c5', 'c6', 'c7']);
  assert.equal(blocks[1].start, 4 * 1.2);
  // the chunks stay in time order and never overlap
  for (let i = 1; i < blocks.length; i += 1) assert.ok(blocks[i].start >= blocks[i - 1].end - 1e-9);
  // maxCues is the ceiling per block, and a larger one keeps the whole run whole
  assert.equal(sections.detect(line(7, 1.2), { maxCues: 8 }).length, 1);
  assert.equal(sections.detect(line(9, 1.2), { maxCues: 3 }).length, 3);
  assert.deepEqual(sections.detect(line(9, 1.2), { maxCues: 3 })[1].cueIds, ['c4', 'c5', 'c6']);
});

test('the loudness of a block is its own span against the song p90', () => {
  const analysis = fakeAnalysis();
  const cues = [
    { id: 'loud', start: 0, end: 1 },
    { id: 'quiet', start: 1, end: 2 },
  ];
  // gap 0: the two halves touch, so only the zero threshold splits them
  const blocks = sections.detect(cues, { analysis, gap: 0 });
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].energy, 1, 'the loud second saturates');
  assert.equal(blocks[1].energy, 0, 'the silent second is zero');
  // the shared reference gives the same numbers as the single-range call
  const ref = driver.energyRef(analysis);
  assert.ok(ref && ref.p90 > 0);
  assert.equal(driver.rangeEnergy(analysis, 0, 1, ref), driver.rangeEnergy(analysis, 0, 1));
  assert.equal(driver.rangeEnergy(null, 0, 1), null, 'no analysis still means no energy');
});

test('the loud blocks are the chorus', () => {
  const analysis = fakeAnalysis();
  // the first second of the fake song is the loud one
  const blocks = sections.detect(
    [
      { id: 'chorus', start: 0, end: 1 },
      { id: 'verse', start: 1, end: 2 },
    ],
    { analysis, gap: 0 }
  );
  assert.deepEqual(blocks.map((block) => block.chorus), [true, false]);
  // the same two blocks with the loud half at the end: the mark follows the
  // loudness, not the position
  const flipped = sections.detect(
    [
      { id: 'verse', start: 0, end: 1 },
      { id: 'chorus', start: 1, end: 2 },
    ],
    { analysis: fakeAnalysis({ loudSecond: true }), gap: 0 }
  );
  assert.deepEqual(flipped.map((block) => block.chorus), [false, true]);
  // a flat song has nothing to set a chorus against
  const flat = sections.detect([{ id: 'only', start: 0, end: 2 }], { analysis, gap: 0 });
  assert.equal(flat.length, 1);
  assert.equal(flat[0].chorus, false, 'one block is not a chorus');
});

test('without music a repeated line marks the chorus', () => {
  const cues = [
    { id: 'v1', text: 'Verse line', start: 0, end: 1 },
    { id: 'v2', text: 'Second verse', start: 1.5, end: 2.5 },
    { id: 'c1', text: 'Sing it back', start: 6, end: 7 },
    { id: 'c2', text: 'Sing it back', start: 7.5, end: 8.5 },
  ];
  const blocks = sections.detect(cues);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].chorus, false, 'the verses do not repeat');
  assert.equal(blocks[1].chorus, true, 'the chorus sings its line twice');
  // a written label beats the guess
  const labelled = sections.detect([
    { id: 'v1', text: 'Verse line', start: 0, end: 1, meta: { section: 'chorus' } },
    { id: 'v2', text: 'Sing it back', start: 1.5, end: 2.5 },
    { id: 'c2', text: 'Sing it back', start: 6, end: 7 },
  ]);
  assert.deepEqual(labelled.map((block) => block.chorus), [true, true]);
});

test('the detection is pure: the same input gives the same blocks', () => {
  const cues = line(9, 1.1);
  const analysis = fakeAnalysis();
  const first = sections.detect(cues, { analysis, gap: 1.5, maxCues: 3 });
  const second = sections.detect(cues.slice().reverse(), { analysis, gap: 1.5, maxCues: 3 });
  assert.deepEqual(first, second);
  // the detection never mutates the cues it was handed
  assert.equal(cues[0].start, 0);
  assert.equal(cues.length, 9);
  assert.equal(sections.DEFAULT_GAP, 2);
  assert.equal(sections.DEFAULT_MAX_CUES, 4);
});
