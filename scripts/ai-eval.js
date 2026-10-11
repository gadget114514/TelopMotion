'use strict';

// Evaluate the AI Assistant against a case file with the real API.
//
//   ANTHROPIC_API_KEY=... node scripts/ai-eval.js [--cases file] [--id a,b] [--model m] [--repeat n] [--list]
//
// Each case runs the same prompt, tools and loop as the Studio dialog on a
// fixture project and is scored by renderer/js/studio/ai-eval.js. The run is
// written to scripts/eval/results/<time>.json (git-ignored) so two runs - a
// prompt change, a new guide - can be compared. Exit code 1 when a case fails.
// This calls a paid API: it is not part of `npm test`.

const fs = require('node:fs');
const path = require('node:path');
const { ROOT, loadEnv, runCase } = require('./eval/run-case.js');

function parseArgs(argv) {
  const args = { cases: path.join(ROOT, 'scripts/eval/cases.json'), id: null, model: 'claude-sonnet-5-5', repeat: 1, list: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--cases') args.cases = path.resolve(argv[++i]);
    else if (a === '--id') args.id = new Set(argv[++i].split(','));
    else if (a === '--model') args.model = argv[++i];
    else if (a === '--repeat') args.repeat = Math.max(1, Number(argv[++i]) || 1);
    else if (a === '--list') args.list = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  return args;
}

function makeRequest(key) {
  return async (payload) => {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error((data && data.error && data.error.message) || `HTTP ${response.status}`);
    return data;
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const file = JSON.parse(fs.readFileSync(args.cases, 'utf8'));
  const cases = (file.cases || []).filter((c) => !args.id || args.id.has(c.id));
  if (args.list) {
    for (const c of cases) console.log(`${c.id.padEnd(22)} ${c.prompt}`);
    return 0;
  }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    console.error('ANTHROPIC_API_KEY is not set.');
    return 2;
  }
  const env = loadEnv();
  const request = makeRequest(key);
  const runs = [];
  let failed = 0;
  for (const caseDef of cases) {
    for (let n = 0; n < args.repeat; n += 1) {
      const started = Date.now();
      const result = await runCase(env, caseDef, { request, model: args.model });
      result.seconds = Math.round((Date.now() - started) / 100) / 10;
      runs.push(result);
      if (!result.pass) failed += 1;
      console.log(`${result.pass ? 'PASS' : 'FAIL'}  ${caseDef.id}  (${result.seconds}s, ${result.ops.length} ops, ${result.usage ? result.usage.input + result.usage.output : '?'} tokens)`);
      for (const r of result.results) if (!r.pass) console.log(`      x ${r.name}${r.detail ? `: ${r.detail}` : ''}`);
    }
  }
  const outDir = path.join(ROOT, 'scripts/eval/results');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const out = path.join(outDir, `${stamp}.json`);
  fs.writeFileSync(out, JSON.stringify({ model: args.model, at: new Date().toISOString(), runs }, null, 2));
  console.log(`\n${runs.length - failed}/${runs.length} passed -> ${path.relative(ROOT, out)}`);
  return failed ? 1 : 0;
}

main().then((code) => process.exit(code), (error) => {
  console.error(error.message);
  process.exit(2);
});
