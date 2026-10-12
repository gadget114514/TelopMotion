'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT_PATH = path.join(__dirname, '..', 'validate-project.js');

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-validate-'));
  const validPath = path.join(dir, 'valid.telopmotion.json');
  const invalidPath = path.join(dir, 'invalid.json');

  const validProject = {
    format: 'telopmotion',
    version: 7,
    script: {
      cues: [
        { id: 'c1', start: 0, end: 3, text: 'Hello' },
        { id: 'c2', start: 3, end: 6, text: 'World' },
      ],
    },
  };

  fs.writeFileSync(validPath, JSON.stringify(validProject, null, 2));
  fs.writeFileSync(invalidPath, '{ invalid json syntax ...');

  return { dir, validPath, invalidPath };
}

test('validate-project exits with status 2 when no files are provided', () => {
  const res = spawnSync(process.execPath, [SCRIPT_PATH], { encoding: 'utf8' });
  assert.strictEqual(res.status, 2);
  assert.ok(res.stderr.includes('usage: node scripts/validate-project.js'));
});

test('validate-project validates valid project JSON file', () => {
  const { validPath } = fixture();
  const res = spawnSync(process.execPath, [SCRIPT_PATH, validPath], { encoding: 'utf8' });
  assert.strictEqual(res.status, 0);
  assert.ok(res.stdout.includes('ok'));
  assert.ok(res.stdout.includes('2 cues'));
});

test('validate-project fails on invalid JSON syntax', () => {
  const { invalidPath } = fixture();
  const res = spawnSync(process.execPath, [SCRIPT_PATH, invalidPath], { encoding: 'utf8' });
  assert.strictEqual(res.status, 1);
  assert.ok(res.stdout.includes('FAIL'));
  assert.ok(res.stdout.includes('parse:'));
});

test('validate-project accepts existing demo/test project file', () => {
  const testProject = path.join(__dirname, '..', '..', 'test', 'fx400.telopmotion.json');
  if (fs.existsSync(testProject)) {
    const res = spawnSync(process.execPath, [SCRIPT_PATH, testProject], { encoding: 'utf8' });
    assert.strictEqual(res.status, 0);
    assert.ok(res.stdout.includes('ok'));
  }
});
