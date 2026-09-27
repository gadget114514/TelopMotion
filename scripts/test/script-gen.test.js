'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const scriptGen = require('../../renderer/js/script-gen');

function loadAchievements() {
  const code = fs.readFileSync(path.join(__dirname, '../../renderer/js/achievements.js'), 'utf8');
  const sandbox = { window: {}, SA: {} };
  vm.runInNewContext(code, sandbox);
  return sandbox.SA.achievements;
}

const achievements = loadAchievements();
const dataset = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'dataset.json'), 'utf8'));
const evaluation = achievements.evaluate(dataset);

const STRINGS = {
  'studio.script.locked': 'Locked',
  'studio.script.stat.songs': '{value} songs',
  'studio.script.stat.plays': '{value} total plays',
  'studio.script.stat.likes': '{value} total likes',
  'studio.script.stat.comments': '{value} total comments',
  'studio.script.stat.runtime': '{value} of music',
  'studio.script.stat.followers': '{value} followers',
  'studio.script.topSong': '#{rank} {title}\n{value} {statLabel}',
  'studio.script.completion': '{unlocked}/{total} achievements · {percent}%',
  'studio.script.outro': 'Made with TelopMotion (unofficial)',
  'stats.plays': 'Plays',
  'stats.likes': 'Likes',
  'stats.comments': 'Comments',
};

function t(key, vars) {
  const template = STRINGS[key] != null ? STRINGS[key] : key;
  return template.replace(/\{(\w+)\}/g, (match, name) => (vars && vars[name] != null ? String(vars[name]) : match));
}

const format = {
  fmtInt: (n) => String(Math.round(n || 0)),
  fmtNum: (n) => String(n || 0),
  fmtDuration: (seconds) => `${Math.round((seconds || 0) / 60)}m`,
  detailText: (badge) => (badge.detail && badge.detail.type === 'song' && badge.detail.song ? badge.detail.song.title : ''),
};

test('fixture evaluation has 32 badges and at least one unlock', () => {
  assert.strictEqual(evaluation.total, 32);
  assert.ok(evaluation.unlockedCount > 0);
});

test('default build orders cues: intro, badges, stats, songs, completion, outro', () => {
  const cues = scriptGen.build(evaluation, dataset, {}, t, format);
  const kinds = cues.map((cue) => cue.meta.kind);
  assert.strictEqual(kinds[0], 'intro');
  assert.strictEqual(kinds[kinds.length - 1], 'outro');
  assert.strictEqual(kinds.filter((kind) => kind === 'badge').length, evaluation.unlockedCount);
  assert.strictEqual(kinds.filter((kind) => kind === 'stat').length, 6);
  assert.strictEqual(kinds.filter((kind) => kind === 'song').length, 6);
  assert.strictEqual(kinds.filter((kind) => kind === 'completion').length, 1);

  const badgeIndex = kinds.indexOf('badge');
  const statIndex = kinds.indexOf('stat');
  const songIndex = kinds.indexOf('song');
  const completionIndex = kinds.indexOf('completion');
  assert.ok(badgeIndex < statIndex && statIndex < songIndex && songIndex < completionIndex);
});

test('timing uses perCue, gap, introLen and outroLen', () => {
  const cues = scriptGen.build(evaluation, dataset, {}, t, format);
  assert.strictEqual(cues[0].start, 0);
  assert.strictEqual(cues[0].end, 3.5);
  assert.ok(Math.abs(cues[1].start - 3.8) < 1e-9);
  assert.ok(Math.abs(cues[1].end - 3.8 - 2.8) < 1e-9);
  const last = cues[cues.length - 1];
  assert.ok(Math.abs(last.end - last.start - 3) < 1e-9);
  for (let i = 1; i < cues.length; i += 1) {
    assert.ok(cues[i].start > cues[i - 1].end - 1e-9, `cue ${i} starts after the previous ends`);
  }
});

test('intro text is the display name and handle, and stat texts use the templates', () => {
  const cues = scriptGen.build(evaluation, dataset, {}, t, format);
  assert.strictEqual(cues[0].text, 'Fixture Artist\n@fixture');
  const stats = cues.filter((cue) => cue.meta.kind === 'stat').map((cue) => cue.text);
  assert.ok(stats.some((text) => text.includes('songs')));
  assert.ok(stats.some((text) => text.endsWith('followers')));
  const completion = cues.find((cue) => cue.meta.kind === 'completion');
  assert.ok(completion.text.includes(`${evaluation.unlockedCount}/${evaluation.total}`));
  assert.ok(completion.text.includes(`${Math.round(evaluation.completion * 100)}%`));
  assert.strictEqual(cues[cues.length - 1].text, 'Made with TelopMotion (unofficial)');
});

test('which=all reveals every badge and marks the locked ones', () => {
  const cues = scriptGen.build(evaluation, dataset, { reveal: { which: 'all' } }, t, format);
  const badges = cues.filter((cue) => cue.meta.kind === 'badge');
  assert.strictEqual(badges.length, 32);
  const locked = badges.filter((cue) => cue.meta.badgeId && evaluation.badges.find((badge) => badge.id === cue.meta.badgeId && !badge.unlocked));
  assert.strictEqual(locked.length, 32 - evaluation.unlockedCount);
  for (const cue of locked) assert.ok(cue.text.endsWith('Locked'), cue.text);
});

test('tier order sorts badges by tier rank', () => {
  const cues = scriptGen.build(evaluation, dataset, { reveal: { which: 'all', order: 'tier' } }, t, format);
  const badges = cues.filter((cue) => cue.meta.kind === 'badge');
  const rank = { white: 0, bronze: 1, silver: 2, gold: 3 };
  for (let i = 1; i < badges.length; i += 1) {
    assert.ok(rank[badges[i].meta.tier] >= rank[badges[i - 1].meta.tier], `tier order at ${i}`);
  }
});

test('disabling sections removes their cues', () => {
  const cues = scriptGen.build(evaluation, dataset, { intro: false, reveal: { enabled: false }, stats: { enabled: false }, topSongs: { enabled: false }, completion: false, outro: false }, t, format);
  assert.strictEqual(cues.length, 0);
});

test('top songs text contains rank, title and metric', () => {
  const cues = scriptGen.build(evaluation, dataset, {}, t, format);
  const songs = cues.filter((cue) => cue.meta.kind === 'song' && cue.meta.stat === 'plays');
  assert.strictEqual(songs[0].text, '#1 Big Hit\n120000 Plays');
  assert.strictEqual(songs[0].meta.songId, 's1');
});

test('fitToDuration scales everything to the requested length', () => {
  const cues = scriptGen.build(evaluation, dataset, {}, t, format);
  const natural = cues[cues.length - 1].end;
  const fitted = scriptGen.fitToDuration(cues, 30);
  assert.ok(Math.abs(fitted[fitted.length - 1].end - 30) < 1e-6);
  const scale = 30 / natural;
  assert.ok(Math.abs(fitted[0].end - cues[0].end * scale) < 1e-3);
  assert.strictEqual(fitted.length, cues.length);
});

test('fitToAudio applies fitToDuration inside build', () => {
  const cues = scriptGen.build(evaluation, dataset, { fitToAudio: true, audioDuration: 12 }, t, format);
  assert.ok(Math.abs(cues[cues.length - 1].end - 12) < 1e-6);
});
