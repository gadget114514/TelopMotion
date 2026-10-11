'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const aiTools = require('../../renderer/js/studio/ai-tools.js');
const project = require('../../renderer/js/studio/project.js');

const demo = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../demo/demo30-A.telopmotion.json'), 'utf8'));

test('set / insert / remove work on a working copy and leave the source alone', () => {
  const session = aiTools.createSession(demo, { migrate: project.migrate });
  const before = JSON.stringify(demo);
  const r = session.run('apply_patch', {
    summary: 'bigger text',
    ops: [{ op: 'set', path: '/style/text/size', value: 130 }],
  });
  assert.equal(r.ok, true);
  assert.equal(session.work().style.text.size, 130);
  assert.equal(JSON.stringify(demo), before);
  assert.equal(session.ops().length, 1);
  assert.deepEqual(session.summaries(), ['bigger text']);

  const cuesBefore = session.work().script.cues.length;
  session.run('apply_patch', { ops: [{ op: 'remove', path: '/script/cues/0' }] });
  assert.equal(session.work().script.cues.length, cuesBefore - 1);
});

test('protected and unsafe paths are rejected and change nothing', () => {
  const session = aiTools.createSession(demo, { migrate: project.migrate });
  for (const p of ['/version', '/format', '/media/audio', '/dataset', '/__proto__/x', 'style/text', '/style//x']) {
    const r = session.run('apply_patch', { ops: [{ op: 'set', path: p, value: 1 }] });
    assert.equal(r.ok, false, p);
  }
  assert.equal(session.ops().length, 0);
  assert.equal(({}).x, undefined);
});

test('a patch that breaks migrate is rolled back as a whole', () => {
  const session = aiTools.createSession(demo, { migrate: () => ({ ok: false, error: 'nope' }) });
  const r = session.run('apply_patch', { ops: [{ op: 'set', path: '/style/text/size', value: 5 }] });
  assert.equal(r.ok, false);
  assert.equal(session.work().style.text.size, demo.style.text.size);
});

test('a failing op in the middle applies none of the batch', () => {
  const session = aiTools.createSession(demo, { migrate: project.migrate });
  const r = session.run('apply_patch', {
    ops: [{ op: 'set', path: '/style/text/size', value: 77 }, { op: 'remove', path: '/nope/x' }],
  });
  assert.equal(r.ok, false);
  assert.equal(session.work().style.text.size, demo.style.text.size);
});

test('read_json truncates and digest stays small', () => {
  const session = aiTools.createSession(demo, { migrate: project.migrate });
  assert.equal(session.run('read_json', { path: '/script/cues/0' }).ok, true);
  assert.equal(session.run('read_json', { path: '/nope' }).ok, false);
  const d = session.run('get_overview').result;
  assert.equal(d.cueCount, demo.script.cues.length);
  assert.ok(JSON.stringify(d).length < 20000);
});

test('applyOps replays on a different document with the same result', () => {
  const ops = [{ op: 'set', path: '/style/text/size', value: 99 }, { op: 'insert', path: '/markers/-', value: { t: 1 } }];
  const a = aiTools.applyOps(JSON.parse(JSON.stringify(demo)), ops);
  assert.equal(a.style.text.size, 99);
  assert.deepEqual(a.markers[a.markers.length - 1], { t: 1 });
});

test('focus resolves the playhead and the selection to cue / beat', () => {
  const cue = demo.script.cues[1];
  const beat = demo.beats[cue.id][0];
  const f = aiTools.focus(demo, { playhead: cue.start + 0.1, selection: [`cue:${cue.id}/beat:${beat.id}`] });
  assert.equal(f.cueAtPlayhead.id, cue.id);
  assert.equal(f.beatAtPlayhead.id, beat.id);
  assert.equal(f.selection[0].beatId, beat.id);
  assert.equal(f.where.beatLook, `/beatStyles/${beat.id}`);
});

test('resolved_style returns the merged look and a beat patch lands in beatStyles', () => {
  const session = aiTools.createSession(demo, { migrate: project.migrate, resolveStyle: project.resolveStyle });
  const cue = demo.script.cues[0];
  const beat = demo.beats[cue.id][0];
  const el = `cue:${cue.id}/beat:${beat.id}`;
  const before = session.run('resolved_style', { element: el });
  assert.equal(before.ok, true);
  assert.ok(before.result.text);
  const patch = session.run('apply_patch', { ops: [{ op: 'set', path: `/beatStyles/${beat.id}`, value: { color: { fill: { kind: 'solid', value: '#ffffff' } } } }] });
  assert.equal(patch.ok, true);
  const after = session.run('resolved_style', { element: el });
  assert.equal(after.result.color.fill.value, '#ffffff');
  // other beats are untouched
  const other = demo.script.cues[2];
  const otherBeat = demo.beats[other.id][0];
  const same = session.run('resolved_style', { element: `cue:${other.id}/beat:${otherBeat.id}` });
  assert.notDeepEqual(same.result.color && same.result.color.fill && same.result.color.fill.value, '#ffffff');
});
