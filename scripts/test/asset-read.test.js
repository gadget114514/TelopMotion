'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ASSET_ROOTS = ['fonts', 'vendor', 'data'];
const BASE_DIR = path.resolve(__dirname, '..', '..');

function ok(data) {
  return { ok: true, data };
}

function fail(error) {
  const message = error && error.message ? error.message : String(error);
  const code = (error && error.code) || 'error';
  return { ok: false, error: { code, message } };
}

// Handler implementation: sync version (original)
function readAssetSync(payload) {
  try {
    const relative = String((payload && payload.path) || '').replace(/\\/g, '/');
    const normalized = path.posix.normalize(relative);
    if (!normalized || normalized.startsWith('..') || path.isAbsolute(normalized)) {
      throw Object.assign(new Error('blocked-asset'), { code: 'blocked-asset' });
    }
    const parts = normalized.split('/').filter(Boolean);
    const root = parts.shift();
    if (!ASSET_ROOTS.includes(root) || !parts.length) {
      throw Object.assign(new Error('blocked-asset'), { code: 'blocked-asset' });
    }
    const base = path.resolve(path.join(BASE_DIR, 'renderer', root));
    const file = path.resolve(base, ...parts);
    if (file !== base && !file.startsWith(`${base}${path.sep}`)) {
      throw Object.assign(new Error('blocked-asset'), { code: 'blocked-asset' });
    }
    return ok(new Uint8Array(fs.readFileSync(file)));
  } catch (error) {
    return fail(error);
  }
}

// Handler implementation: async version (proposed)
async function readAssetAsync(payload) {
  try {
    const relative = String((payload && payload.path) || '').replace(/\\/g, '/');
    const normalized = path.posix.normalize(relative);
    if (!normalized || normalized.startsWith('..') || path.isAbsolute(normalized)) {
      throw Object.assign(new Error('blocked-asset'), { code: 'blocked-asset' });
    }
    const parts = normalized.split('/').filter(Boolean);
    const root = parts.shift();
    if (!ASSET_ROOTS.includes(root) || !parts.length) {
      throw Object.assign(new Error('blocked-asset'), { code: 'blocked-asset' });
    }
    const base = path.resolve(path.join(BASE_DIR, 'renderer', root));
    const file = path.resolve(base, ...parts);
    if (file !== base && !file.startsWith(`${base}${path.sep}`)) {
      throw Object.assign(new Error('blocked-asset'), { code: 'blocked-asset' });
    }
    const buffer = await fs.promises.readFile(file);
    return ok(new Uint8Array(buffer));
  } catch (error) {
    return fail(error);
  }
}

test('readAssetSync validates assets correctly', () => {
  // Invalid assets
  assert.equal(readAssetSync({ path: '../main.js' }).ok, false);
  assert.equal(readAssetSync({ path: '/etc/passwd' }).ok, false);
  assert.equal(readAssetSync({ path: 'secret/file.txt' }).ok, false);
  assert.equal(readAssetSync({ path: 'fonts/../../main.js' }).ok, false);

  // Valid assets
  const valid = readAssetSync({ path: 'fonts/OFL.txt' });
  assert.equal(valid.ok, true);
  assert.ok(valid.data instanceof Uint8Array);
  assert.ok(valid.data.length > 0);
});

test('readAssetAsync validates assets correctly and produces identical result to sync', async () => {
  // Invalid assets
  assert.equal((await readAssetAsync({ path: '../main.js' })).ok, false);
  assert.equal((await readAssetAsync({ path: '/etc/passwd' })).ok, false);
  assert.equal((await readAssetAsync({ path: 'secret/file.txt' })).ok, false);
  assert.equal((await readAssetAsync({ path: 'fonts/../../main.js' })).ok, false);

  // Valid assets
  const validSync = readAssetSync({ path: 'fonts/OFL.txt' });
  const validAsync = await readAssetAsync({ path: 'fonts/OFL.txt' });

  assert.equal(validAsync.ok, true);
  assert.ok(validAsync.data instanceof Uint8Array);
  assert.deepEqual(validAsync.data, validSync.data);
});

test('performance comparison between sync and async asset reading', async () => {
  const assetPaths = [
    'fonts/OFL.txt',
    'fonts/BebasNeue-Regular.ttf',
    'fonts/NotoSans-Regular.ttf',
    'data/fx-axes.json',
    'data/palettes.json',
  ];

  const RUNS = 100;

  // Measure Sync
  const startSync = process.hrtime.bigint();
  for (let i = 0; i < RUNS; i++) {
    for (const p of assetPaths) {
      readAssetSync({ path: p });
    }
  }
  const durationSyncNs = Number(process.hrtime.bigint() - startSync);
  const durationSyncMs = durationSyncNs / 1e6;

  // Measure Async Concurrent (Promise.all)
  const startAsync = process.hrtime.bigint();
  for (let i = 0; i < RUNS; i++) {
    await Promise.all(assetPaths.map((p) => readAssetAsync({ path: p })));
  }
  const durationAsyncNs = Number(process.hrtime.bigint() - startAsync);
  const durationAsyncMs = durationAsyncNs / 1e6;

  console.log(`\n--- Asset Read Performance (100 runs x 5 files) ---`);
  console.log(`Sync Time:  ${durationSyncMs.toFixed(2)} ms`);
  console.log(`Async Time: ${durationAsyncMs.toFixed(2)} ms`);
});
