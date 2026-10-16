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

const FILE_READ_MAX_BYTES = 200 * 1024 * 1024;

// Sync baseline implementation of file:open handling
function handleFileOpenSync(result, payload) {
  try {
    if (result.canceled || !result.filePaths.length) return ok({ canceled: true });
    const readBounded = (filePath) => {
      const stat = fs.statSync(filePath);
      if (!stat.isFile() || stat.size > FILE_READ_MAX_BYTES) {
        throw Object.assign(new Error('file-too-large'), { code: 'file-too-large' });
      }
      return fs.readFileSync(filePath);
    };
    if (payload && payload.multiple) {
      const files = result.filePaths.map((filePath) => ({
        name: path.basename(filePath),
        type: '',
        bytes: new Uint8Array(readBounded(filePath)),
        path: filePath,
      }));
      return ok({ canceled: false, files });
    }
    const filePath = result.filePaths[0];
    const buffer = readBounded(filePath);
    return ok({
      canceled: false,
      name: path.basename(filePath),
      type: '',
      bytes: new Uint8Array(buffer),
      path: filePath,
    });
  } catch (error) {
    return fail(error);
  }
}

// Async optimized implementation of file:open handling
async function handleFileOpenAsync(result, payload) {
  try {
    if (result.canceled || !result.filePaths.length) return ok({ canceled: true });
    const readBounded = async (filePath) => {
      const stat = await fs.promises.stat(filePath);
      if (!stat.isFile() || stat.size > FILE_READ_MAX_BYTES) {
        throw Object.assign(new Error('file-too-large'), { code: 'file-too-large' });
      }
      return fs.promises.readFile(filePath);
    };
    if (payload && payload.multiple) {
      const files = await Promise.all(
        result.filePaths.map(async (filePath) => ({
          name: path.basename(filePath),
          type: '',
          bytes: new Uint8Array(await readBounded(filePath)),
          path: filePath,
        }))
      );
      return ok({ canceled: false, files });
    }
    const filePath = result.filePaths[0];
    const buffer = await readBounded(filePath);
    return ok({
      canceled: false,
      name: path.basename(filePath),
      type: '',
      bytes: new Uint8Array(buffer),
      path: filePath,
    });
  } catch (error) {
    return fail(error);
  }
}

test('file:open async implementation matches exact behavior and edge cases', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-open-test-'));
  try {
    const file1 = path.join(tmpDir, 'test1.txt');
    const file2 = path.join(tmpDir, 'test2.txt');
    const subDir = path.join(tmpDir, 'subdir');

    fs.writeFileSync(file1, Buffer.from('Hello World 1'));
    fs.writeFileSync(file2, Buffer.from('Hello World 2'));
    fs.mkdirSync(subDir);

    // 1. Canceled dialog
    const resCancel = await handleFileOpenAsync({ canceled: true, filePaths: [] }, {});
    assert.deepEqual(resCancel, { ok: true, data: { canceled: true } });

    // 2. Single file open
    const resSingle = await handleFileOpenAsync({ canceled: false, filePaths: [file1] }, {});
    assert.equal(resSingle.ok, true);
    assert.equal(resSingle.data.canceled, false);
    assert.equal(resSingle.data.name, 'test1.txt');
    assert.equal(resSingle.data.path, file1);
    assert.deepEqual(resSingle.data.bytes, new Uint8Array(Buffer.from('Hello World 1')));

    // Compare with sync version
    const resSingleSync = handleFileOpenSync({ canceled: false, filePaths: [file1] }, {});
    assert.deepEqual(resSingle, resSingleSync);

    // 3. Multiple files open
    const resMulti = await handleFileOpenAsync({ canceled: false, filePaths: [file1, file2] }, { multiple: true });
    assert.equal(resMulti.ok, true);
    assert.equal(resMulti.data.canceled, false);
    assert.equal(resMulti.data.files.length, 2);
    assert.equal(resMulti.data.files[0].name, 'test1.txt');
    assert.equal(resMulti.data.files[1].name, 'test2.txt');

    // Compare with sync version
    const resMultiSync = handleFileOpenSync({ canceled: false, filePaths: [file1, file2] }, { multiple: true });
    assert.deepEqual(resMulti, resMultiSync);

    // 4. Directory instead of file
    const resDir = await handleFileOpenAsync({ canceled: false, filePaths: [subDir] }, {});
    assert.equal(resDir.ok, false);
    assert.equal(resDir.error.code, 'file-too-large');

    const resDirSync = handleFileOpenSync({ canceled: false, filePaths: [subDir] }, {});
    assert.deepEqual(resDir, resDirSync);

    // 5. Non-existent file
    const resNonExistent = await handleFileOpenAsync({ canceled: false, filePaths: [path.join(tmpDir, 'missing.txt')] }, {});
    assert.equal(resNonExistent.ok, false);
    assert.equal(resNonExistent.error.code, 'ENOENT');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('benchmark sync vs async file:open performance and event loop impact', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-open-bench-'));
  const numFiles = 10;
  const fileSize = 5 * 1024 * 1024; // 5MB per file
  const filePaths = [];

  try {
    const dummyBuffer = Buffer.alloc(fileSize, 'a');
    for (let i = 0; i < numFiles; i++) {
      const fp = path.join(tmpDir, `bench_${i}.dat`);
      fs.writeFileSync(fp, dummyBuffer);
      filePaths.push(fp);
    }

    const iterations = 20;

    // Benchmark Sync
    const startSync = performance.now();
    for (let i = 0; i < iterations; i++) {
      handleFileOpenSync({ canceled: false, filePaths }, { multiple: true });
    }
    const endSync = performance.now();
    const durationSync = endSync - startSync;

    // Benchmark Async
    const startAsync = performance.now();
    for (let i = 0; i < iterations; i++) {
      await handleFileOpenAsync({ canceled: false, filePaths }, { multiple: true });
    }
    const endAsync = performance.now();
    const durationAsync = endAsync - startAsync;

    console.log(`\nBenchmark Results (${iterations} iterations of reading ${numFiles} x 5MB files):`);
    console.log(`Sync handleFileOpen duration : ${durationSync.toFixed(2)} ms (${(durationSync / iterations).toFixed(2)} ms/op)`);
    console.log(`Async handleFileOpen duration: ${durationAsync.toFixed(2)} ms (${(durationAsync / iterations).toFixed(2)} ms/op)`);
    console.log(`Speedup: ${(durationSync / durationAsync).toFixed(2)}x`);

    assert.ok(durationAsync < durationSync, 'Async file reading should be faster or comparable');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
