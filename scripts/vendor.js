'use strict';

// Copies the vendored builds into renderer/vendor, verifies integrity, and
// writes LICENSES.txt + SHA256SUMS.txt.
// Run with: npm run vendor
// Integrity: every copied file is hashed (sha256). If renderer/vendor/SHA256SUMS.txt
// already exists, hashes for tracked files must match; otherwise the copy aborts
// so a poisoned node_modules cannot silently flow into the shipped renderer.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'renderer', 'vendor');
const SUMS_FILE = path.join(OUT_DIR, 'SHA256SUMS.txt');

const VENDORS = [
  { name: 'opentype.js', source: 'node_modules/opentype.js/dist/opentype.min.js', target: 'opentype.min.js', license: 'node_modules/opentype.js/LICENSE' },
  { name: 'earcut', source: 'node_modules/earcut/dist/earcut.min.js', target: 'earcut.min.js', license: 'node_modules/earcut/LICENSE' },
  { name: 'mp4-muxer', source: 'node_modules/mp4-muxer/build/mp4-muxer.js', target: 'mp4-muxer.js', license: 'node_modules/mp4-muxer/LICENSE' },
  { name: 'webm-muxer', source: 'node_modules/webm-muxer/build/webm-muxer.js', target: 'webm-muxer.js', license: 'node_modules/webm-muxer/LICENSE' },
  // three is ESM-only: the module build is vendored beside the small module
  // loader (three-loader.js) that publishes window.SA.THREE.
  // NOTE: three.core.js was intentionally dropped (dead code, never referenced
  // from renderer/*.html; shipping it only widens attack surface).
  { name: 'three', source: 'node_modules/three/build/three.module.js', target: 'three.module.js', license: 'node_modules/three/LICENSE' },
];

// Hand-placed (non-npm) vendor file. Pinned by sha256 in SHA256SUMS.txt so
// tampering is detected on the next `npm run vendor`.
const HAND_PLACED = [
  {
    name: 'tiny-segmenter',
    target: 'tiny-segmenter.js',
    licenseText:
      'TinySegmenter 0.1 (c) 2008 Taku Kudo <taku@chasen.org>. Freely distributable under the terms of a new BSD licence. See http://chasen.org/~taku/software/TinySegmenter/LICENCE.txt',
  },
  { name: 'three-loader', target: 'three-loader.js', licenseText: 'TelopMotion project file (MIT, same as repository LICENSE). Tiny ESM loader: import * as THREE from ./three.module.js.' },
];

function sha256Of(file) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(file));
  return hash.digest('hex');
}

function loadExpectedSums() {
  const expected = new Map();
  if (!fs.existsSync(SUMS_FILE)) return expected;
  for (const line of fs.readFileSync(SUMS_FILE, 'utf8').split('\n')) {
    const match = /^([0-9a-f]{64})\s+(.+)$/.exec(line.trim());
    if (match) expected.set(match[2], match[1]);
  }
  return expected;
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const expected = loadExpectedSums();
  const actual = new Map();
  const licenses = [];

  for (const vendor of VENDORS) {
    const source = path.join(ROOT, vendor.source);
    const target = path.join(OUT_DIR, vendor.target);
    if (!fs.existsSync(source)) {
      throw new Error(`Missing ${vendor.source}. Run: npm install`);
    }
    const sourceHash = sha256Of(source);
    fs.copyFileSync(source, target);
    const targetHash = sha256Of(target);
    if (sourceHash !== targetHash) throw new Error(`Hash mismatch after copy: ${vendor.target}`);
    // If a sums file is committed, an attacker-swapped node_modules is detected here.
    if (expected.has(vendor.target) && expected.get(vendor.target) !== targetHash) {
      throw new Error(
        `Integrity failure for ${vendor.target}: expected ${expected.get(vendor.target)}, got ${targetHash}. Refusing to overwrite pinned vendor file.`
      );
    }
    actual.set(vendor.target, targetHash);
    const licensePath = path.join(ROOT, vendor.license);
    const license = fs.existsSync(licensePath) ? fs.readFileSync(licensePath, 'utf8') : 'License file not found.';
    licenses.push(`===== ${vendor.name} =====\n\n${license.trim()}\n`);
    console.log(`vendor: ${vendor.target} (${fs.statSync(target).size} bytes, sha256:${targetHash.slice(0, 12)}…)`);
  }

  for (const item of HAND_PLACED) {
    const target = path.join(OUT_DIR, item.target);
    if (!fs.existsSync(target)) throw new Error(`Missing hand-placed ${item.target}`);
    const hash = sha256Of(target);
    if (expected.has(item.target) && expected.get(item.target) !== hash) {
      throw new Error(`Integrity failure for hand-placed ${item.target}: expected ${expected.get(item.target)}, got ${hash}.`);
    }
    actual.set(item.target, hash);
    licenses.push(`===== ${item.name} =====\n\n${item.licenseText}\n`);
    console.log(`vendor (pinned): ${item.target} (${fs.statSync(target).size} bytes, sha256:${hash.slice(0, 12)}…)`);
  }

  // Drop dead code that only widens the shipped attack surface.
  for (const dead of ['three.core.js']) {
    const deadPath = path.join(OUT_DIR, dead);
    if (fs.existsSync(deadPath)) {
      fs.rmSync(deadPath, { force: true });
      console.log(`vendor: removed dead file ${dead}`);
    }
  }

  fs.writeFileSync(path.join(OUT_DIR, 'LICENSES.txt'), `${licenses.join('\n')}\n`);
  const sums = [...actual.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([name, hash]) => `${hash}  ${name}`);
  // three-loader.js is intentionally tiny; still pin it.
  fs.writeFileSync(`${SUMS_FILE}`, `${sums.join('\n')}\n`);
  console.log(`vendor: LICENSES.txt (${licenses.length} entries)`);
  console.log(`vendor: SHA256SUMS.txt (${sums.length} entries)`);
}

main();
