'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function ok(data) {
  return { ok: true, data };
}

function fail(error) {
  const message = error && error.message ? error.message : String(error);
  const code = (error && error.code) || 'error';
  return { ok: false, error: { code, message } };
}

const RECENT_ENTRY_MAX_BYTES = 16 * 1024;

// Sync version (Baseline)
function handleRecentAddSync(userDataPath, entry) {
  try {
    if (!entry || typeof entry !== 'object' || typeof entry.name !== 'string' || !entry.name) {
      return fail(Object.assign(new Error('invalid-entry'), { code: 'invalid-entry' }));
    }
    const clean = { name: String(entry.name).slice(0, 256) };
    if (typeof entry.path === 'string') clean.path = entry.path.slice(0, 1024);
    if (JSON.stringify(clean).length > RECENT_ENTRY_MAX_BYTES) {
      return fail(Object.assign(new Error('entry-too-large'), { code: 'entry-too-large' }));
    }
    const file = path.join(userDataPath, 'recent.json');
    let list = [];
    try {
      list = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      list = [];
    }
    if (!Array.isArray(list)) list = [];
    list = list.filter((item) => item && item.name !== clean.name);
    list.unshift(clean);
    fs.writeFileSync(file, JSON.stringify(list.slice(0, 8), null, 2));
    return ok(true);
  } catch (error) {
    return fail(error);
  }
}

// Async version (Optimized)
async function handleRecentAddAsync(userDataPath, entry) {
  try {
    if (!entry || typeof entry !== 'object' || typeof entry.name !== 'string' || !entry.name) {
      return fail(Object.assign(new Error('invalid-entry'), { code: 'invalid-entry' }));
    }
    const clean = { name: String(entry.name).slice(0, 256) };
    if (typeof entry.path === 'string') clean.path = entry.path.slice(0, 1024);
    if (JSON.stringify(clean).length > RECENT_ENTRY_MAX_BYTES) {
      return fail(Object.assign(new Error('entry-too-large'), { code: 'entry-too-large' }));
    }
    const file = path.join(userDataPath, 'recent.json');
    let list = [];
    try {
      const content = await fs.promises.readFile(file, 'utf8');
      list = JSON.parse(content);
    } catch {
      list = [];
    }
    if (!Array.isArray(list)) list = [];
    list = list.filter((item) => item && item.name !== clean.name);
    list.unshift(clean);
    await fs.promises.writeFile(file, JSON.stringify(list.slice(0, 8), null, 2));
    return ok(true);
  } catch (error) {
    return fail(error);
  }
}

async function handleRecentListAsync(userDataPath) {
  try {
    const file = path.join(userDataPath, 'recent.json');
    try {
      const content = await fs.promises.readFile(file, 'utf8');
      const list = JSON.parse(content);
      return ok(Array.isArray(list) ? list : []);
    } catch {
      return ok([]);
    }
  } catch {
    return ok([]);
  }
}

test('recent:add async implementation preserves exact behavior and edge cases', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recent-test-'));
  try {
    // 1. Invalid entry check
    const invalidRes = await handleRecentAddAsync(tmpDir, null);
    assert.equal(invalidRes.ok, false);
    assert.equal(invalidRes.error.code, 'invalid-entry');

    // 2. Add entries sequentially and verify max 8 kept
    for (let i = 0; i < 12; i++) {
      const res = await handleRecentAddAsync(tmpDir, { name: `Project ${i}`, path: `/path/${i}` });
      assert.equal(res.ok, true);
    }

    const listRes = await handleRecentListAsync(tmpDir);
    assert.equal(listRes.ok, true);
    assert.equal(listRes.data.length, 8);
    assert.equal(listRes.data[0].name, 'Project 11');
    assert.equal(listRes.data[7].name, 'Project 4');

    // 3. Duplicate entry deduplication and unshift to top
    await handleRecentAddAsync(tmpDir, { name: 'Project 5', path: '/path/5' });
    const listRes2 = await handleRecentListAsync(tmpDir);
    assert.equal(listRes2.data.length, 8);
    assert.equal(listRes2.data[0].name, 'Project 5');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('benchmark sync vs async file operations', async () => {
  const tmpDirSync = fs.mkdtempSync(path.join(os.tmpdir(), 'recent-bench-sync-'));
  const tmpDirAsync = fs.mkdtempSync(path.join(os.tmpdir(), 'recent-bench-async-'));
  const iterations = 100;

  try {
    const startSync = performance.now();
    for (let i = 0; i < iterations; i++) {
      handleRecentAddSync(tmpDirSync, { name: `Item ${i % 20}`, path: `/path/${i}` });
    }
    const endSync = performance.now();
    const durationSync = endSync - startSync;

    const startAsync = performance.now();
    for (let i = 0; i < iterations; i++) {
      await handleRecentAddAsync(tmpDirAsync, { name: `Item ${i % 20}`, path: `/path/${i}` });
    }
    const endAsync = performance.now();
    const durationAsync = endAsync - startAsync;

    console.log(`\nBenchmark Results (${iterations} iterations):`);
    console.log(`Sync recent:add duration : ${durationSync.toFixed(2)} ms (${(durationSync / iterations).toFixed(3)} ms/op)`);
    console.log(`Async recent:add duration: ${durationAsync.toFixed(2)} ms (${(durationAsync / iterations).toFixed(3)} ms/op)`);
  } finally {
    fs.rmSync(tmpDirSync, { recursive: true, force: true });
    fs.rmSync(tmpDirAsync, { recursive: true, force: true });
  }
});
