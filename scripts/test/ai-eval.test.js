'use strict';

// The evaluation harness itself, driven by scripted "models": a good edit must
// pass its case, and each kind of bad edit must be caught by the matching check.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { ROOT, loadEnv, runCase } = require('../eval/run-case.js');

const env = loadEnv();
const cases = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/eval/cases.json'), 'utf8')).cases;
const byId = (id) => cases.find((c) => c.id === id);

// a model that makes one apply_patch call (or none) and then answers
function scripted(ops) {
  let turn = 0;
  return async () => {
    turn += 1;
    if (ops && turn === 1) {
      return {
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 't1', name: 'apply_patch', input: { summary: 'scripted', ops } }],
        usage: { input_tokens: 10, output_tokens: 5 },
      };
    }
    return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'done' }], usage: { input_tokens: 10, output_tokens: 5 } };
  };
}

const white = { color: { fill: { kind: 'solid', value: '#ffffff' } } };
const black = { color: { fill: { kind: 'solid', value: '#000000' } } };

async function run(id, ops) {
  return runCase(env, byId(id), { request: scripted(ops), model: 'fake' });
}

const failed = (result) => result.results.filter((r) => !r.pass).map((r) => r.name);

test('cases.json: every fixture loads and every scope names real ids', () => {
  for (const c of cases) {
    const doc = require('../eval/run-case.js').loadFixture(env, c.fixture);
    const cue = doc.script.cues.find((x) => x.id === (c.view.cue || c.scope.cue));
    assert.ok(cue, `${c.id}: cue`);
    if (c.scope.beat) assert.ok((doc.beats[cue.id] || []).some((b) => b.id === c.scope.beat), `${c.id}: beat`);
  }
});

test('a correct brighten edit passes', async () => {
  const result = await run('beat-brighten', [{ op: 'set', path: '/beatStyles/demo30a_08:single0', value: white }]);
  assert.deepEqual(failed(result), []);
  assert.equal(result.pass, true);
  assert.equal(result.usage.calls, 2);
});

test('a brighten that goes the wrong way is caught', async () => {
  const result = await run('beat-brighten', [{ op: 'set', path: '/beatStyles/demo30a_08:single0', value: black }]);
  assert.equal(result.pass, false);
  assert.ok(failed(result).includes('luminance up'));
});

test('writing outside the scope is caught', async () => {
  const result = await run('beat-brighten', [
    { op: 'set', path: '/beatStyles/demo30a_08:single0', value: white },
    { op: 'set', path: '/beatStyles/demo30a_07:single0', value: white },
  ]);
  assert.equal(result.pass, false);
  assert.ok(failed(result).includes('scope'));
  assert.ok(failed(result).some((n) => n.startsWith('unchanged')));
});

test('changing the lyrics is caught', async () => {
  const result = await run('beat-brighten', [{ op: 'set', path: '/script/cues/7/text', value: 'changed' }]);
  assert.equal(result.pass, false);
  assert.ok(failed(result).includes('lyrics'));
});

test('an off-task request passes only when nothing is touched', async () => {
  assert.equal((await run('off-task-translate', null)).pass, true);
  const touched = await run('off-task-translate', [{ op: 'set', path: '/script/cues/0/text', value: 'Hello' }]);
  assert.equal(touched.pass, false);
});

test('a rejected patch is not scored as applied', async () => {
  const result = await run('beat-brighten', [{ op: 'set', path: '/version', value: 1 }]);
  assert.equal(result.ops.length, 0);
  assert.equal(result.pass, false); // nothing brightened
  assert.ok(!failed(result).includes('protected'));
});
