#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { normalizeHandle, fetchAll } = require('../lib/suno-core');

function parseArgs(argv) {
  const args = { maxPages: undefined, pretty: true };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--handle' || arg === '-u') args.handle = argv[++i];
    else if (arg === '--out' || arg === '-o') args.out = argv[++i];
    else if (arg === '--max-pages') args.maxPages = Number(argv[++i]);
    else if (arg === '--compact') args.pretty = false;
    else if (arg === '--help' || arg === '-h') args.help = true;
  }
  return args;
}

function usage() {
  console.log(
    [
      'Usage: node scripts/scrape.js --handle <handle|url> [--out file.json] [--max-pages N] [--compact]',
      '',
      'Examples:',
      '  node scripts/scrape.js --handle @suno --out suno.json',
      '  node scripts/scrape.js --handle https://suno.com/@suno',
    ].join('\n')
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.handle) {
    usage();
    process.exitCode = args.help ? 0 : 1;
    return;
  }

  const handle = normalizeHandle(args.handle);
  if (!handle) {
    console.error(`Invalid handle: ${args.handle}`);
    process.exitCode = 1;
    return;
  }

  let lastLine = 0;
  const data = await fetchAll(handle, {
    maxPages: Number.isFinite(args.maxPages) ? args.maxPages : undefined,
    onProgress: (progress) => {
      const text = `page ${progress.page} · ${progress.songs} songs${progress.total ? ` / ${progress.total}` : ''}`;
      process.stderr.write(`\r${text.padEnd(lastLine)}`);
      lastLine = text.length;
    },
  });

  const outFile = path.resolve(args.out || `suno-${handle}.json`);
  fs.writeFileSync(outFile, JSON.stringify(data, null, args.pretty ? 2 : 0));
  console.log(`\nSaved ${data.songs.length} songs for @${handle} to ${outFile}`);
}

main().catch((error) => {
  console.error(`Failed: ${error.message || error.code || error}`);
  process.exitCode = 1;
});
