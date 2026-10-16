'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { performance } = require('node:perf_hooks');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-save-bench-'));
const testFile = path.join(tmpDir, 'test-save.bin');
// 10MB test file to simulate large project or video export / asset save
const data = Buffer.alloc(10 * 1024 * 1024, 0xaf);

async function benchmarkSync(iterations) {
  let eventLoopTicks = 0;
  const interval = setInterval(() => {
    eventLoopTicks++;
  }, 1);

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    fs.writeFileSync(testFile, data);
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
    await fs.promises.writeFile(testFile, data);
  }
  const end = performance.now();

  clearInterval(interval);
  return {
    timeMs: end - start,
    eventLoopTicks,
  };
}

async function run() {
  const iterations = 10;
  console.log(`Running file:save benchmark (10MB payload, ${iterations} iterations)...`);

  // Warmup
  fs.writeFileSync(testFile, data);
  await fs.promises.writeFile(testFile, data);

  const syncResult = await benchmarkSync(iterations);
  const asyncResult = await benchmarkAsync(iterations);

  console.log(`Sync (fs.writeFileSync): total ${syncResult.timeMs.toFixed(2)} ms | Event Loop Ticks: ${syncResult.eventLoopTicks}`);
  console.log(`Async (fs.promises.writeFile): total ${asyncResult.timeMs.toFixed(2)} ms | Event Loop Ticks: ${asyncResult.eventLoopTicks}`);

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
