'use strict';

// A beat whose letters are all invisible (the seam between two pages) has an
// empty text mask. The SDF pass used to report "just outside" everywhere in
// that case, and an outline / glow edge then covered the whole frame — the
// flash the user sees between beats. The resolve pass now reports a no-shape
// sentinel and the edge pass skips the empty field. The GL cannot run here,
// so the shader wiring is pinned.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');

function loadShaders() {
  const sandbox = { window: {} };
  sandbox.SA = sandbox.window.SA = {};
  for (const file of ['renderer/js/lyrics/gl/sdf.js', 'renderer/js/lyrics/gl/shaders.js']) {
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sandbox);
  }
  return sandbox.SA;
}

test('an empty mask reports the no-shape sentinel from the resolve pass', () => {
  const SA = loadShaders();
  const resolve = SA.glSdf.RESOLVE_FRAG;
  assert.match(resolve, /seed\.x >= 0\.0/, 'the resolve pass lost its seed test');
  assert.match(resolve, /signed = -1000\.0 \* u_maxDistance;/, 'the no-seed branch no longer reports the sentinel');
  // with a seed the field keeps its signed distance, so real shapes are untouched
  assert.match(resolve, /signed = inside > 0\.5 \? -distance : distance;/);
});

test('the edge pass skips an empty distance field', () => {
  const SA = loadShaders();
  const edge = SA.glShaders.EDGE_FRAG;
  assert.match(edge, /if \(sdfAt\(v_uv\) < -900\.0\)/, 'the edge pass no longer guards the empty field');
  // the guard must run before the type branches, so every edge type is covered
  assert.ok(
    edge.indexOf('sdfAt(v_uv) < -900.0') < edge.indexOf('int type = u_type'),
    'the guard must come before the type dispatch'
  );
});
