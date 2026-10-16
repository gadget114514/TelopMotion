'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { performance } = require('node:perf_hooks');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'io-async-bench-'));
const sampleFile = path.join(tmpDir, 'sample-asset.png');
const sampleBuffer = Buffer.alloc(1024 * 1024, 0xaf); // 1 MB buffer

// Setup sample file
fs.writeFileSync(sampleFile, sampleBuffer);

async function runSyncOperations(iterations) {
  let eventLoopTicks = 0;
  const timer = setInterval(() => {
    eventLoopTicks++;
  }, 1);

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    const stat = fs.statSync(sampleFile);
    if (stat.size > 0) {
      const data = fs.readFileSync(sampleFile);
      fs.writeFileSync(path.join(tmpDir, `out-${i}.bin`), data);
      fs.rmSync(path.join(tmpDir, `out-${i}.bin`), { force: true });
    }
  }
  const duration = performance.now() - start;
  clearInterval(timer);
  return { durationMs: duration, eventLoopTicks };
}

async function runAsyncOperations(iterations) {
  let eventLoopTicks = 0;
  const timer = setInterval(() => {
    eventLoopTicks++;
  }, 1);

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    const stat = await fs.promises.stat(sampleFile);
    if (stat.size > 0) {
      const data = await fs.promises.readFile(sampleFile);
      const target = path.join(tmpDir, `out-async-${i}.bin`);
      await fs.promises.writeFile(target, data);
      await fs.promises.rm(target, { force: true });
    }
  }
  const duration = performance.now() - start;
  clearInterval(timer);
  return { durationMs: duration, eventLoopTicks };
}

async function main() {
  const iterations = 50;
  console.log(`Running File I/O Benchmark (${iterations} iterations of stat, read, write, rm)...`);

  // Warmup
  fs.statSync(sampleFile);
  await fs.promises.stat(sampleFile);

  const syncRes = await runSyncOperations(iterations);
  console.log(`Sync operations duration: ${syncRes.durationMs.toFixed(2)} ms | Event Loop Ticks: ${syncRes.eventLoopTicks}`);

  const asyncRes = await runAsyncOperations(iterations);
  console.log(`Async operations duration: ${asyncRes.durationMs.toFixed(2)} ms | Event Loop Ticks: ${asyncRes.eventLoopTicks}`);

  // Cleanup
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

main().catch(console.error);
