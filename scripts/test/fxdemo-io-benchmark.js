'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

const demoFile = path.join(__dirname, '..', '..', 'demo', 'fx800-1.telopmotion.json');

async function benchmarkSync(iterations) {
  let eventLoopTicks = 0;
  const interval = setInterval(() => {
    eventLoopTicks++;
  }, 1);

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    const content = fs.readFileSync(demoFile, 'utf8');
    JSON.parse(content);
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
    const content = await fs.promises.readFile(demoFile, 'utf8');
    JSON.parse(content);
  }
  const end = performance.now();

  clearInterval(interval);
  return {
    timeMs: end - start,
    eventLoopTicks,
  };
}

async function run() {
  const iterations = 100;
  console.log(`Running demo file read benchmark on ${demoFile} (${iterations} iterations)...`);

  // Warmup
  JSON.parse(fs.readFileSync(demoFile, 'utf8'));
  JSON.parse(await fs.promises.readFile(demoFile, 'utf8'));

  const syncResult = await benchmarkSync(iterations);
  const asyncResult = await benchmarkAsync(iterations);

  console.log(`Sync (fs.readFileSync): ${syncResult.timeMs.toFixed(2)} ms | Event Loop Ticks: ${syncResult.eventLoopTicks}`);
  console.log(`Async (fs.promises.readFile): ${asyncResult.timeMs.toFixed(2)} ms | Event Loop Ticks: ${asyncResult.eventLoopTicks}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
