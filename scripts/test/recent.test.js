'use strict';

const test = require('node:test');
const assert = require('node:assert');
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

// Synchronous implementation (from current main.js)
function recentListSync(filePath) {
  try {
    if (!fs.existsSync(filePath)) return ok([]);
    const list = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return ok(Array.isArray(list) ? list : []);
  } catch {
    return ok([]);
  }
}

// Asynchronous promise-based implementation (target optimization)
async function recentListAsync(filePath) {
  try {
    const data = await fs.promises.readFile(filePath, 'utf8');
    const list = JSON.parse(data);
    return ok(Array.isArray(list) ? list : []);
  } catch {
    return ok([]);
  }
}

async function recentAddAsync(filePath, entry) {
  try {
    if (!entry || typeof entry !== 'object' || typeof entry.name !== 'string' || !entry.name) {
      return fail(Object.assign(new Error('invalid-entry'), { code: 'invalid-entry' }));
    }
    const clean = { name: String(entry.name).slice(0, 256) };
    if (typeof entry.path === 'string') clean.path = entry.path.slice(0, 1024);
    if (JSON.stringify(clean).length > RECENT_ENTRY_MAX_BYTES) {
      return fail(Object.assign(new Error('entry-too-large'), { code: 'entry-too-large' }));
    }
    let list = [];
    try {
      const content = await fs.promises.readFile(filePath, 'utf8');
      list = JSON.parse(content);
    } catch {
      list = [];
    }
    if (!Array.isArray(list)) list = [];
    list = list.filter((item) => item && item.name !== clean.name);
    list.unshift(clean);
    await fs.promises.writeFile(filePath, JSON.stringify(list.slice(0, 8), null, 2));
    return ok(true);
  } catch (error) {
    return fail(error);
  }
}

test('recentListAsync returns empty array when file does not exist', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recent-test-'));
  const filePath = path.join(tmpDir, 'nonexistent.json');
  try {
    const resSync = recentListSync(filePath);
    const resAsync = await recentListAsync(filePath);
    assert.deepStrictEqual(resAsync, { ok: true, data: [] });
    assert.deepStrictEqual(resAsync, resSync);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('recentListAsync parses valid list from file', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recent-test-'));
  const filePath = path.join(tmpDir, 'recent.json');
  const items = [{ name: 'song1.lrc', path: '/path/song1.lrc' }, { name: 'song2.srt' }];
  fs.writeFileSync(filePath, JSON.stringify(items), 'utf8');
  try {
    const resSync = recentListSync(filePath);
    const resAsync = await recentListAsync(filePath);
    assert.deepStrictEqual(resAsync, { ok: true, data: items });
    assert.deepStrictEqual(resAsync, resSync);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('recentListAsync returns empty array on corrupt JSON or non-array JSON', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recent-test-'));
  const filePath = path.join(tmpDir, 'corrupt.json');
  fs.writeFileSync(filePath, '{ invalid json', 'utf8');
  try {
    const resAsync = await recentListAsync(filePath);
    assert.deepStrictEqual(resAsync, { ok: true, data: [] });

    fs.writeFileSync(filePath, JSON.stringify({ not: 'an array' }), 'utf8');
    const resObject = await recentListAsync(filePath);
    assert.deepStrictEqual(resObject, { ok: true, data: [] });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('recentAddAsync adds and deduplicates recent entries', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recent-test-'));
  const filePath = path.join(tmpDir, 'recent.json');
  try {
    assert.deepStrictEqual(await recentAddAsync(filePath, { name: 'a' }), { ok: true, data: true });
    assert.deepStrictEqual(await recentAddAsync(filePath, { name: 'b' }), { ok: true, data: true });
    assert.deepStrictEqual(await recentAddAsync(filePath, { name: 'a' }), { ok: true, data: true });

    const listRes = await recentListAsync(filePath);
    assert.strictEqual(listRes.ok, true);
    assert.deepStrictEqual(listRes.data, [{ name: 'a' }, { name: 'b' }]);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('recentAddAsync rejects invalid entries', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recent-test-'));
  const filePath = path.join(tmpDir, 'recent.json');
  try {
    assert.strictEqual((await recentAddAsync(filePath, null)).ok, false);
    assert.strictEqual((await recentAddAsync(filePath, { name: '' })).ok, false);
    assert.strictEqual((await recentAddAsync(filePath, { name: 123 })).ok, false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('benchmark: compare synchronous vs asynchronous file reading performance under concurrent loop', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recent-test-'));
  const filePath = path.join(tmpDir, 'recent.json');
  const sampleData = Array.from({ length: 8 }, (_, i) => ({ name: `song_${i}.lrc`, path: `/home/user/music/song_${i}.lrc` }));
  fs.writeFileSync(filePath, JSON.stringify(sampleData, null, 2), 'utf8');

  const ITERATIONS = 1000;

  // Measure sync execution time
  const t0Sync = performance.now();
  for (let i = 0; i < ITERATIONS; i += 1) {
    recentListSync(filePath);
  }
  const t1Sync = performance.now();
  const durSync = t1Sync - t0Sync;

  // Measure async execution time
  const t0Async = performance.now();
  const promises = [];
  for (let i = 0; i < ITERATIONS; i += 1) {
    promises.push(recentListAsync(filePath));
  }
  await Promise.all(promises);
  const t1Async = performance.now();
  const durAsync = t1Async - t0Async;

  console.log(`[Benchmark] Synchronous list (${ITERATIONS} ops): ${durSync.toFixed(2)} ms`);
  console.log(`[Benchmark] Asynchronous list (${ITERATIONS} ops parallel): ${durAsync.toFixed(2)} ms`);

  assert.ok(durAsync >= 0);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
