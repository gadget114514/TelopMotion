'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const DIRS = ['lib', 'scripts', 'renderer/js'];
const ROOT_FILES = ['main.js', 'preload.js'];
const SKIP_DIRS = new Set(['vendor', 'node_modules', '.git']);

function listJsFiles(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      listJsFiles(full, out);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

function collect(root = ROOT) {
  const files = [];
  for (const dir of DIRS) listJsFiles(path.join(root, dir), files);
  for (const file of ROOT_FILES) {
    const full = path.join(root, file);
    if (fs.existsSync(full)) files.push(full);
  }
  return files.sort();
}

function checkFile(file) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  return {
    file,
    ok: result.status === 0,
    output: `${result.stdout || ''}${result.stderr || ''}`.trim(),
  };
}

function main() {
  const files = collect();
  const failures = [];
  for (const file of files) {
    const result = checkFile(file);
    if (!result.ok) failures.push(result);
  }
  for (const failure of failures) console.error(failure.output);
  if (failures.length) {
    console.error(`check: ${failures.length} of ${files.length} files failed`);
    return 1;
  }
  console.log(`check: ${files.length} files ok`);
  return 0;
}

if (require.main === module) process.exit(main());

module.exports = { collect, checkFile, main };
