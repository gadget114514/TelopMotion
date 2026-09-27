'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { collect, checkFile } = require('../check');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-check-'));
  const write = (rel, body) => {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
    return full;
  };
  const good = write('lib/good.js', "'use strict';\nmodule.exports = 1;\n");
  const goodRenderer = write('renderer/js/good.js', 'window.SA = window.SA || {};\n');
  const goodScript = write('scripts/tool.js', "'use strict';\n");
  const bad = write('lib/bad.js', 'const = ;\n');
  const vendor = write('renderer/js/vendor/ignored.js', 'const = ;\n');
  write('renderer/js/notes.txt', 'not javascript');
  return { root, good, goodRenderer, goodScript, bad, vendor };
}

test('collect finds js files under the checked directories', () => {
  const { root, good, goodRenderer, goodScript } = fixture();
  const files = collect(root);
  assert.ok(files.includes(good));
  assert.ok(files.includes(goodRenderer));
  assert.ok(files.includes(goodScript));
  assert.ok(files.every((file) => file.endsWith('.js')));
});

test('collect skips vendor and non-js files', () => {
  const { root, vendor } = fixture();
  const files = collect(root);
  assert.ok(!files.includes(vendor));
  assert.ok(files.every((file) => path.extname(file) === '.js'));
});

test('checkFile accepts valid syntax and rejects broken syntax', () => {
  const { good, bad } = fixture();
  assert.strictEqual(checkFile(good).ok, true);
  assert.strictEqual(checkFile(bad).ok, false);
});
