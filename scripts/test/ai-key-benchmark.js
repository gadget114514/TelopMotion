'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { performance } = require('node:perf_hooks');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-key-bench-'));
const testFile = path.join(tmpDir, 'ai-key.bin');
const dummyKeyData = Buffer.from('mock-encrypted-key-bytes-for-benchmark-testing-1234567890');

async function benchmarkSync(iterations) {
  let eventLoopTicks = 0;
  const interval = setInterval(() => {
    eventLoopTicks++;
  }, 1);

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    fs.writeFileSync(testFile, dummyKeyData, { mode: 0o600 });
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
    await fs.promises.writeFile(testFile, dummyKeyData, { mode: 0o600 });
  }
  const end = performance.now();

  clearInterval(interval);
  return {
    timeMs: end - start,
    eventLoopTicks,
  };
}

async function run() {
  const iterations = 200;
  console.log(`Running AI Key write benchmark (${iterations} iterations)...`);

  // Warmup
  fs.writeFileSync(testFile, dummyKeyData, { mode: 0o600 });
  await fs.promises.writeFile(testFile, dummyKeyData, { mode: 0o600 });

  const syncResult = await benchmarkSync(iterations);
  const asyncResult = await benchmarkAsync(iterations);

  console.log(`Sync (fs.writeFileSync): ${syncResult.timeMs.toFixed(2)} ms | Event Loop Ticks: ${syncResult.eventLoopTicks}`);
  console.log(`Async (fs.promises.writeFile): ${asyncResult.timeMs.toFixed(2)} ms | Event Loop Ticks: ${asyncResult.eventLoopTicks}`);

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
