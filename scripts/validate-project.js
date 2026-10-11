'use strict';

// Check that .telopmotion.json files load: run them through project.migrate,
// the same pass the Studio applies on File → Open project.
//
//   node scripts/validate-project.js <file> [<file> ...]
//
// Exit code is 1 when any file fails to parse or migrate.

const fs = require('node:fs');
const path = require('node:path');

const project = require(path.resolve(__dirname, '..', 'renderer/js/studio/project.js'));

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: node scripts/validate-project.js <file.telopmotion.json> ...');
  process.exit(2);
}

let failed = 0;
for (const file of files) {
  let result;
  try {
    result = project.migrate(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch (error) {
    result = { ok: false, error: `parse: ${error.message}` };
  }
  if (result.ok) {
    const cues = result.project.script && result.project.script.cues ? result.project.script.cues.length : 0;
    console.log(`ok    ${file} (version ${result.project.version}, ${cues} cues)`);
  } else {
    failed += 1;
    console.log(`FAIL  ${file}: ${result.error}`);
  }
}
process.exit(failed ? 1 : 0);
