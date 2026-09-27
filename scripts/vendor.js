'use strict';

// Copies the vendored UMD builds into renderer/vendor and writes LICENSES.txt.
// Run with: npm run vendor

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'renderer', 'vendor');

const VENDORS = [
  { name: 'opentype.js', source: 'node_modules/opentype.js/dist/opentype.min.js', target: 'opentype.min.js', license: 'node_modules/opentype.js/LICENSE' },
  { name: 'earcut', source: 'node_modules/earcut/dist/earcut.min.js', target: 'earcut.min.js', license: 'node_modules/earcut/LICENSE' },
  { name: 'mp4-muxer', source: 'node_modules/mp4-muxer/build/mp4-muxer.js', target: 'mp4-muxer.js', license: 'node_modules/mp4-muxer/LICENSE' },
  { name: 'webm-muxer', source: 'node_modules/webm-muxer/build/webm-muxer.js', target: 'webm-muxer.js', license: 'node_modules/webm-muxer/LICENSE' },
];

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const licenses = [];
  for (const vendor of VENDORS) {
    const source = path.join(ROOT, vendor.source);
    const target = path.join(OUT_DIR, vendor.target);
    if (!fs.existsSync(source)) {
      throw new Error(`Missing ${vendor.source}. Run: npm install`);
    }
    fs.copyFileSync(source, target);
    const licensePath = path.join(ROOT, vendor.license);
    const license = fs.existsSync(licensePath) ? fs.readFileSync(licensePath, 'utf8') : 'License file not found.';
    licenses.push(`===== ${vendor.name} =====\n\n${license.trim()}\n`);
    console.log(`vendor: ${vendor.target} (${fs.statSync(target).size} bytes)`);
  }
  fs.writeFileSync(path.join(OUT_DIR, 'LICENSES.txt'), `${licenses.join('\n')}\n`);
  console.log(`vendor: LICENSES.txt (${VENDORS.length} entries)`);
}

main();
