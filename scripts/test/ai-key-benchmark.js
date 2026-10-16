'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { performance } = require('node:perf_hooks');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-key-bench-'));
const testFile = path.join(tmpDir, 'ai-key.bin');
const dummyKeyData = Buffer.from('mock-encrypted-key-bytes-for-benchmark-testing-1234567890');

// Write test file
fs.writeFileSync(testFile, dummyKeyData, { mode: 0o600 });

function syncReadKey() {
  try {
    if (fs.existsSync(testFile)) {
      return fs.readFileSync(testFile);
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function asyncReadKey() {
  try {
    return await fs.promises.readFile(testFile);
  } catch {
    /* ignore */
  }
  return null;
}

async function benchmarkSync(iterations) {
  let eventLoopTicks = 0;
  const interval = setInterval(() => {
    eventLoopTicks++;
  }, 1);

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    syncReadKey();
  }
  const end = performance.now();

  clearInterval(interval);
  return {
    timeMs: end - start,
    eventLoopTicks,
  };
}

async function benchmarkAsync(iterations) {
  let eventLoopTicks = 0;
  const interval = setInterval(() => {
    eventLoopTicks++;
  }, 1);

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    await asyncReadKey();
  }
  const end = performance.now();

  clearInterval(interval);
  return {
    timeMs: end - start,
    eventLoopTicks,
  };
}

async function run() {
  const iterations = 1000;
  console.log(`Running AI Key read benchmark (${iterations} iterations)...`);

  // Warmup
  syncReadKey();
  await asyncReadKey();

  const syncResult = await benchmarkSync(iterations);
  const asyncResult = await benchmarkAsync(iterations);

  console.log(`Sync (fs.existsSync + fs.readFileSync): ${syncResult.timeMs.toFixed(2)} ms | Event Loop Ticks: ${syncResult.eventLoopTicks}`);
  console.log(`Async (fs.promises.readFile): ${asyncResult.timeMs.toFixed(2)} ms | Event Loop Ticks: ${asyncResult.eventLoopTicks}`);

  // Cleanup
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
