'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const duration = require('../../renderer/js/lyrics/duration.js');
const fillers = require('../../renderer/js/lyrics/fillers.js');
const credits = require('../../renderer/js/lyrics/credits.js');
const analysis = require('../../renderer/js/lyrics/audio-analysis.js');

function projectWith(cues, extra) {
  return {
    output: { maxDuration: null, overflow: 'compress' },
    dataset: {
      profile: { handle: 'suno', displayName: 'Suno' },
      songs: [{ id: 's1', title: 'First Light' }, { id: 's2', title: 'Second Wind' }],
    },
    script: { cues: cues.map((cue, index) => ({ id: `c${index}`, start: cue.start, end: cue.end, text: cue.text || 'text', meta: cue.meta || { kind: 'custom' }, ...cue })) },
    keyframes: {},
    markers: [],
    credits: extra && extra.credits ? extra.credits : undefined,
  };
}

test('computeDuration respects maxDuration and the credits end card', () => {
  const project = projectWith([{ start: 0, end: 10 }]);
  assert.equal(duration.computeDuration(project), 10);
  project.credits = { modes: { end: { enabled: true, duration: 5, afterLastCue: true }, element: { enabled: false }, always: { enabled: false } } };
  assert.equal(duration.computeDuration(project), 15);
  project.output.maxDuration = 12;
  assert.equal(duration.computeDuration(project), 12);
});

test('compress keeps cues at or above the minimum and never exceeds the maximum', () => {
  const project = projectWith([{ start: 0, end: 4 }, { start: 4.5, end: 8 }, { start: 8.5, end: 12 }]);
  project.output.maxDuration = 6;
  project.output.overflow = 'compress';
  const result = duration.fit(project);
  assert.equal(result.ok, true);
  const cues = project.script.cues;
  for (const cue of cues) {
    assert.ok(cue.end - cue.start >= duration.MIN_CUE - 1e-6, `cue length ${cue.end - cue.start}`);
  }
  assert.ok(cues[cues.length - 1].end <= 6 + 1e-6, `ends at ${cues[cues.length - 1].end}`);
});

test('drop keeps manual cues and removes low priority ones', () => {
  const project = projectWith([
    { start: 0, end: 4, meta: { kind: 'custom' } },
    { start: 4.2, end: 8.2, meta: { kind: 'stat' } },
    { start: 8.4, end: 12.4, meta: { kind: 'completion' } },
    { start: 14, end: 18, meta: { kind: 'song' } },
  ]);
  project.output.maxDuration = 13;
  project.output.overflow = 'drop';
  const result = duration.fit(project);
  assert.equal(result.ok, true);
  const kinds = project.script.cues.map((cue) => cue.meta.kind);
  assert.ok(kinds.includes('custom'), 'manual cue kept');
  assert.ok(kinds.includes('completion'), 'high priority kept');
  assert.ok(!kinds.includes('stat'), 'low priority dropped');
  assert.ok(project.script.cues.every((cue) => cue.end <= 13 + 1e-6));
});

test('cut gives exactly the maximum length', () => {
  const project = projectWith([{ start: 0, end: 20 }]);
  project.output.maxDuration = 8;
  project.output.overflow = 'cut';
  const result = duration.fit(project);
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'cut');
  assert.equal(project.script.cues[0].end, 8);
  assert.equal(duration.computeDuration(project), 8);
});

test('gaps finds intro, interlude and outro and respects minGap and margin', () => {
  const cues = [{ id: 'a', start: 3, end: 6 }, { id: 'b', start: 10, end: 12 }];
  const result = fillers.gaps(cues, 20);
  assert.equal(result.length, 3);
  assert.equal(result[0].kind, 'intro');
  assert.equal(result[1].kind, 'interlude');
  assert.equal(result[2].kind, 'outro');
  assert.equal(result[0].from, 0);
  assert.equal(result[0].to, 3 - 0.25);
  assert.equal(result[1].from, 6 + 0.25);
  assert.equal(result[1].to, 10 - 0.25);
  assert.equal(result[2].from, 12 + 0.25);
  assert.equal(result[2].to, 20);
  const tight = fillers.gaps([{ id: 'a', start: 0, end: 5 }, { id: 'b', start: 5.8, end: 8 }], 10);
  assert.ok(!tight.some((gap) => gap.kind === 'interlude'), 'short gap skipped');
});

test('long gaps pick the longGap spec and pinned clips follow their cues', () => {
  const cues = [{ id: 'a', start: 2, end: 4 }, { id: 'b', start: 20, end: 22 }];
  const result = fillers.gaps(cues, 30);
  const interlude = result.find((gap) => gap.kind === 'interlude');
  assert.equal(interlude.long, true);
  assert.equal(interlude.spec.type, 'shapes');
  const pinned = fillers.gaps(cues, 30, { clips: { 'a>b': { type: 'countdown', params: {} } } });
  const pinnedGap = pinned.find((gap) => gap.kind === 'interlude');
  assert.equal(pinnedGap.pinned, true);
  assert.equal(pinnedGap.spec.type, 'countdown');
});

test('credits expand the template placeholders and produce element and end modes', () => {
  const project = projectWith([{ start: 0, end: 10 }]);
  project.credits = {
    title: { source: 'song', songId: 's2', text: '' },
    artist: { source: 'profile', text: '', showHandle: true },
    extra: { text: 'Suno v5' },
    template: '{title} — {artist} ({extra})',
    modes: { element: { enabled: true, at: 'time', time: 1, duration: 3 }, always: { enabled: true, position: 'topRight' }, end: { enabled: true, duration: 6, afterLastCue: true } },
  };
  const lines = credits.expandTemplate(project, credits.settingsFor(project), { year: 2026 });
  assert.equal(lines[0], 'Second Wind — Suno @suno (Suno v5)');
  const list = credits.elements(project);
  const element = list.find((entry) => entry.mode === 'element');
  const end = list.find((entry) => entry.mode === 'end');
  assert.equal(element.start, 1);
  assert.equal(element.end, 4);
  assert.equal(end.start, 10);
  assert.equal(end.end, 16);
  assert.equal(credits.extendsDuration(project), 16);
  const always = credits.alwaysOn(project, 5);
  assert.ok(always, 'always-on credit is active');
  assert.equal(always.position, 'topRight');
});

test('the FFT finds a 440 Hz peak in the right band', () => {
  const sampleRate = 48000;
  const size = 1024;
  const re = new Float32Array(size);
  const im = new Float32Array(size);
  for (let i = 0; i < size; i += 1) re[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate);
  analysis.fftReal(re, im);
  let peak = 0;
  let peakBin = 0;
  for (let bin = 1; bin < size / 2; bin += 1) {
    const magnitude = Math.hypot(re[bin], im[bin]);
    if (magnitude > peak) {
      peak = magnitude;
      peakBin = bin;
    }
  }
  const frequency = (peakBin / size) * sampleRate;
  assert.ok(Math.abs(frequency - 440) < sampleRate / size, `peak ${frequency}`);
});

test('analyze is deterministic and groups the sine into one band', () => {
  const sampleRate = 48000;
  const seconds = 0.5;
  const data = new Float32Array(sampleRate * seconds);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.8;
  const first = analysis.analyze([data], sampleRate, 30);
  const second = analysis.analyze([data], sampleRate, 30);
  assert.equal(first.frameCount, second.frameCount);
  assert.deepEqual(first.frames[5].bands, second.frames[5].bands);
  assert.ok(first.frames[5].rms > 0.3, `rms ${first.frames[5].rms}`);
  const band = analysis.dominantBandForFrequency(440, sampleRate);
  const peak = analysis.bandPeak(first.frames, band);
  const other = analysis.bandPeak(first.frames, Math.max(0, band - 20));
  assert.ok(peak.peak > other.peak, `band peak ${peak.peak} vs ${other.peak}`);
});
