'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function ok(data) {
  return { ok: true, data };
}

// Synchronous implementation (Baseline)
function recentListSync(filePath) {
  try {
    if (!fs.existsSync(filePath)) return ok([]);
    const list = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return ok(Array.isArray(list) ? list : []);
  } catch {
    return ok([]);
  }
}

// Asynchronous implementation (Optimized)
async function recentListAsync(filePath) {
  try {
    const content = await fs.promises.readFile(filePath, 'utf8');
    const list = JSON.parse(content);
    return ok(Array.isArray(list) ? list : []);
  } catch {
    return ok([]);
  }
}

test('recentList returns empty array when file does not exist', async () => {
  const tmpFile = path.join(os.tmpdir(), `nonexistent_${Date.now()}_recent.json`);
  try {
    const resSync = recentListSync(tmpFile);
    assert.deepStrictEqual(resSync, { ok: true, data: [] });

    const resAsync = await recentListAsync(tmpFile);
    assert.deepStrictEqual(resAsync, { ok: true, data: [] });
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
});

test('recentList returns list when valid JSON file exists', async () => {
  const tmpFile = path.join(os.tmpdir(), `valid_${Date.now()}_recent.json`);
  const mockData = [{ name: 'Project A', path: '/a.json' }, { name: 'Project B', path: '/b.json' }];
  try {
    fs.writeFileSync(tmpFile, JSON.stringify(mockData), 'utf8');

    const resSync = recentListSync(tmpFile);
    assert.deepStrictEqual(resSync, { ok: true, data: mockData });

    const resAsync = await recentListAsync(tmpFile);
    assert.deepStrictEqual(resAsync, { ok: true, data: mockData });
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
});

test('recentList handles corrupted or non-array JSON safely', async () => {
  const tmpFile = path.join(os.tmpdir(), `corrupt_${Date.now()}_recent.json`);
  try {
    fs.writeFileSync(tmpFile, 'invalid json content', 'utf8');

    const resSync = recentListSync(tmpFile);
    assert.deepStrictEqual(resSync, { ok: true, data: [] });

    const resAsync = await recentListAsync(tmpFile);
    assert.deepStrictEqual(resAsync, { ok: true, data: [] });

    fs.writeFileSync(tmpFile, JSON.stringify({ notAnArray: true }), 'utf8');

    const resSyncObject = recentListSync(tmpFile);
    assert.deepStrictEqual(resSyncObject, { ok: true, data: [] });

    const resAsyncObject = await recentListAsync(tmpFile);
    assert.deepStrictEqual(resAsyncObject, { ok: true, data: [] });
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
});

test('benchmark sync vs async file read performance and event loop impact', async () => {
  const tmpFile = path.join(os.tmpdir(), `bench_${Date.now()}_recent.json`);
  const mockData = Array.from({ length: 8 }, (_, i) => ({ name: `Recent File ${i}`, path: `/path/to/file_${i}.telopmotion.json` }));
  fs.writeFileSync(tmpFile, JSON.stringify(mockData, null, 2), 'utf8');

  try {
    const iterations = 500;

    // Benchmark 1: Measure synchronous total time and event loop delay
    let syncEventLoopTicks = 0;
    const syncInterval = setInterval(() => {
      syncEventLoopTicks++;
    }, 1);

    const syncStart = process.hrtime.bigint();
    for (let i = 0; i < iterations; i++) {
      recentListSync(tmpFile);
    }
    const syncEnd = process.hrtime.bigint();
    clearInterval(syncInterval);

    const syncTimeMs = Number(syncEnd - syncStart) / 1e6;

    // Benchmark 2: Measure asynchronous total time and event loop tick concurrency
    let asyncEventLoopTicks = 0;
    const asyncInterval = setInterval(() => {
      asyncEventLoopTicks++;
    }, 1);

    const asyncStart = process.hrtime.bigint();
    const asyncPromises = [];
    for (let i = 0; i < iterations; i++) {
      asyncPromises.push(recentListAsync(tmpFile));
    }
    await Promise.all(asyncPromises);
    const asyncEnd = process.hrtime.bigint();
    clearInterval(asyncInterval);

    const asyncTimeMs = Number(asyncEnd - asyncStart) / 1e6;

    console.log(`\n--- BENCHMARK RESULTS ---`);
    console.log(`Iterations: ${iterations}`);
    console.log(`Sync recentList time:  ${syncTimeMs.toFixed(2)} ms (Ticks during execution: ${syncEventLoopTicks})`);
    console.log(`Async recentList time: ${asyncTimeMs.toFixed(2)} ms (Ticks during execution: ${asyncEventLoopTicks})`);

    // Verify async results correctness
    const result = await recentListAsync(tmpFile);
    assert.strictEqual(result.data.length, 8);
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
});
