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

const AUTOSAVE_MAX_BYTES = 20 * 1024 * 1024;

// Sync handler (Legacy baseline)
function handleAutosaveWriteSync(userDataPath, payload) {
  try {
    if (!payload || typeof payload.project !== 'object' || payload.project === null) {
      return fail(Object.assign(new Error('invalid-project'), { code: 'invalid-project' }));
    }
    const serialized = JSON.stringify(payload.project);
    if (serialized.length > AUTOSAVE_MAX_BYTES) {
      return fail(Object.assign(new Error('autosave-too-large'), { code: 'autosave-too-large' }));
    }
    const file = path.join(userDataPath, 'studio-autosave.json');
    fs.writeFileSync(file, serialized);
    return ok(true);
  } catch (error) {
    return fail(error);
  }
}

// Async handler (Current optimized version in main.js)
async function handleAutosaveWriteAsync(userDataPath, payload) {
  try {
    if (!payload || typeof payload.project !== 'object' || payload.project === null) {
      return fail(Object.assign(new Error('invalid-project'), { code: 'invalid-project' }));
    }
    const serialized = JSON.stringify(payload.project);
    if (serialized.length > AUTOSAVE_MAX_BYTES) {
      return fail(Object.assign(new Error('autosave-too-large'), { code: 'autosave-too-large' }));
    }
    const file = path.join(userDataPath, 'studio-autosave.json');
    await fs.promises.writeFile(file, serialized);
    return ok(true);
  } catch (error) {
    return fail(error);
  }
}

async function handleAutosaveReadAsync(userDataPath) {
  try {
    const file = path.join(userDataPath, 'studio-autosave.json');
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

test('verify main.js studio:autosave-write handler uses async fs.promises.writeFile', () => {
  const mainCode = fs.readFileSync(path.join(__dirname, '../../main.js'), 'utf8');
  assert.ok(mainCode.includes("ipcMain.handle('studio:autosave-write'"), 'studio:autosave-write handler should be registered');
  const autosaveWriteSection = mainCode.slice(mainCode.indexOf("ipcMain.handle('studio:autosave-write'"));
  const nextHandlerIndex = autosaveWriteSection.indexOf('ipcMain.handle', 20);
  const handlerBody = nextHandlerIndex !== -1 ? autosaveWriteSection.slice(0, nextHandlerIndex) : autosaveWriteSection;
  assert.ok(handlerBody.includes('await fs.promises.writeFile(file, serialized)'), 'studio:autosave-write must use async fs.promises.writeFile');
  assert.equal(handlerBody.includes('fs.writeFileSync('), false, 'studio:autosave-write must not use sync fs.writeFileSync');
});

test('autosave async handler matches sync behavior and validation', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autosave-test-'));
  try {
    // 1. Invalid payload
    const resInvalid = await handleAutosaveWriteAsync(tmpDir, null);
    assert.equal(resInvalid.ok, false);
    assert.equal(resInvalid.error.code, 'invalid-project');

    // 2. Valid write and read
    const sampleProject = { meta: { title: 'Benchmark Project' }, script: { cues: [] } };
    const resWrite = await handleAutosaveWriteAsync(tmpDir, { project: sampleProject });
    assert.equal(resWrite.ok, true);

    const resRead = await handleAutosaveReadAsync(tmpDir);
    assert.equal(resRead.ok, true);
    assert.deepEqual(resRead.data, sampleProject);

    // 3. Size limit exceeding
    const hugeProject = { meta: { title: 'X'.repeat(AUTOSAVE_MAX_BYTES + 100) } };
    const resHuge = await handleAutosaveWriteAsync(tmpDir, { project: hugeProject });
    assert.equal(resHuge.ok, false);
    assert.equal(resHuge.error.code, 'autosave-too-large');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('benchmark autosave sync vs async write operations', async () => {
  const tmpDirSync = fs.mkdtempSync(path.join(os.tmpdir(), 'autosave-bench-sync-'));
  const tmpDirAsync = fs.mkdtempSync(path.join(os.tmpdir(), 'autosave-bench-async-'));
  const iterations = 50;

  // Create realistic payload (~500KB project)
  const projectData = {
    meta: { title: 'Test Project' },
    script: { cues: Array.from({ length: 500 }, (_, i) => ({ id: `cue_${i}`, text: `Line ${i} of song text with some extra content` })) },
    extra: 'A'.repeat(400 * 1024),
  };
  const payload = { project: projectData };

  try {
    // Measure Sync write total time
    const startSync = performance.now();
    for (let i = 0; i < iterations; i++) {
      handleAutosaveWriteSync(tmpDirSync, payload);
    }
    const durationSync = performance.now() - startSync;

    // Measure Async write total time and event loop ticks
    let asyncTicks = 0;
    const interval = setInterval(() => { asyncTicks++; }, 1);

    const startAsync = performance.now();
    for (let i = 0; i < iterations; i++) {
      await handleAutosaveWriteAsync(tmpDirAsync, payload);
    }
    const durationAsync = performance.now() - startAsync;
    clearInterval(interval);

    console.log(`\nAutosave Benchmark Results (${iterations} iterations, payload ~${(JSON.stringify(projectData).length / 1024).toFixed(0)}KB):`);
    console.log(`Sync fs.writeFileSync duration  : ${durationSync.toFixed(2)} ms (${(durationSync / iterations).toFixed(3)} ms/op)`);
    console.log(`Async fs.promises.writeFile duration: ${durationAsync.toFixed(2)} ms (${(durationAsync / iterations).toFixed(3)} ms/op)`);
    console.log(`Event loop ticks allowed during Async writes: ${asyncTicks}`);
  } finally {
    fs.rmSync(tmpDirSync, { recursive: true, force: true });
    fs.rmSync(tmpDirAsync, { recursive: true, force: true });
  }
});
