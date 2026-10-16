'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const AUTOSAVE_MAX_BYTES = 20 * 1024 * 1024;

function ok(data) {
  return { ok: true, data };
}

function fail(error) {
  const message = error && error.message ? error.message : String(error);
  const code = (error && error.code) || 'error';
  return { ok: false, error: { code, message } };
}

// Synchronous implementation (Baseline)
function autosaveReadSync(file) {
  try {
    if (!fs.existsSync(file)) return ok(null);
    const stat = fs.statSync(file);
    if (stat.size > AUTOSAVE_MAX_BYTES) {
      return fail(Object.assign(new Error('autosave-too-large'), { code: 'autosave-too-large' }));
    }
    return ok(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch (error) {
    return fail(error);
  }
}

// Asynchronous implementation (Optimized / Refactored)
async function autosaveReadAsync(file) {
  try {
    try {
      const stat = await fs.promises.stat(file);
      if (stat.size > AUTOSAVE_MAX_BYTES) {
        return fail(Object.assign(new Error('autosave-too-large'), { code: 'autosave-too-large' }));
      }
    } catch {
      return ok(null);
    }
    const content = await fs.promises.readFile(file, 'utf8');
    return ok(JSON.parse(content));
  } catch (error) {
    return fail(error);
  }
}

test('autosaveRead returns ok(null) when file does not exist', async () => {
  const tmpFile = path.join(os.tmpdir(), `nonexistent_${Date.now()}_autosave.json`);
  try {
    const resSync = autosaveReadSync(tmpFile);
    assert.deepStrictEqual(resSync, { ok: true, data: null });

    const resAsync = await autosaveReadAsync(tmpFile);
    assert.deepStrictEqual(resAsync, { ok: true, data: null });
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
});

test('autosaveRead returns ok(data) when valid file exists', async () => {
  const tmpFile = path.join(os.tmpdir(), `valid_${Date.now()}_autosave.json`);
  const mockData = { project: { title: 'Test Autosave', cues: [{ id: 'c1', text: 'Hello' }] } };
  try {
    fs.writeFileSync(tmpFile, JSON.stringify(mockData), 'utf8');

    const resSync = autosaveReadSync(tmpFile);
    assert.deepStrictEqual(resSync, { ok: true, data: mockData });

    const resAsync = await autosaveReadAsync(tmpFile);
    assert.deepStrictEqual(resAsync, { ok: true, data: mockData });
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
});

test('autosaveRead fails with autosave-too-large when file exceeds max size', async () => {
  const tmpFile = path.join(os.tmpdir(), `oversized_${Date.now()}_autosave.json`);
  try {
    // Create a sparse file or stat-mocked file size testing
    const fd = fs.openSync(tmpFile, 'w');
    fs.ftruncateSync(fd, AUTOSAVE_MAX_BYTES + 100);
    fs.closeSync(fd);

    const resSync = autosaveReadSync(tmpFile);
    assert.strictEqual(resSync.ok, false);
    assert.strictEqual(resSync.error.code, 'autosave-too-large');

    const resAsync = await autosaveReadAsync(tmpFile);
    assert.strictEqual(resAsync.ok, false);
    assert.strictEqual(resAsync.error.code, 'autosave-too-large');
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
});

test('autosaveRead fails with error when file contains corrupt JSON', async () => {
  const tmpFile = path.join(os.tmpdir(), `corrupt_${Date.now()}_autosave.json`);
  try {
    fs.writeFileSync(tmpFile, '{ invalid json', 'utf8');

    const resSync = autosaveReadSync(tmpFile);
    assert.strictEqual(resSync.ok, false);

    const resAsync = await autosaveReadAsync(tmpFile);
    assert.strictEqual(resAsync.ok, false);
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
});

test('benchmark sync vs async file read performance and event loop responsiveness', async () => {
  const tmpFile = path.join(os.tmpdir(), `bench_${Date.now()}_autosave.json`);
  const mockData = { project: { title: 'Bench Autosave', cues: Array.from({ length: 500 }, (_, i) => ({ id: `cue_${i}`, text: `Line ${i}` })) } };
  fs.writeFileSync(tmpFile, JSON.stringify(mockData, null, 2), 'utf8');

  try {
    const iterations = 300;

    // Benchmark Sync
    let syncTicks = 0;
    const syncInterval = setInterval(() => { syncTicks++; }, 1);
    const syncStart = process.hrtime.bigint();
    for (let i = 0; i < iterations; i++) {
      autosaveReadSync(tmpFile);
    }
    const syncEnd = process.hrtime.bigint();
    clearInterval(syncInterval);
    const syncTimeMs = Number(syncEnd - syncStart) / 1e6;

    // Benchmark Async
    let asyncTicks = 0;
    const asyncInterval = setInterval(() => { asyncTicks++; }, 1);
    const asyncStart = process.hrtime.bigint();
    const promises = [];
    for (let i = 0; i < iterations; i++) {
      promises.push(autosaveReadAsync(tmpFile));
    }
    await Promise.all(promises);
    const asyncEnd = process.hrtime.bigint();
    clearInterval(asyncInterval);
    const asyncTimeMs = Number(asyncEnd - asyncStart) / 1e6;

    console.log(`\n--- AUTOSAVE READ BENCHMARK RESULTS ---`);
    console.log(`Iterations: ${iterations}`);
    console.log(`Sync time:  ${syncTimeMs.toFixed(2)} ms (Ticks during execution: ${syncTicks})`);
    console.log(`Async time: ${asyncTimeMs.toFixed(2)} ms (Ticks during execution: ${asyncTicks})`);

    const result = await autosaveReadAsync(tmpFile);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.data.project.cues.length, 500);
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
});
