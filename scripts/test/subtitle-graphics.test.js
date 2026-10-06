'use strict';

// The subtitle track's frame-wide graphics sit on their own row: the track's
// graphicsHidden flag (data) and the subtitle-only view drop every frame post
// (light leaks, vignette, camera moves, the shape layer), while the posts that
// move with the letters (text posts, bgShape, edges, clones) stay with the
// lyrics. The engine cannot run without WebGL here, so the pure decision
// helpers plus the wiring are pinned.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const FX_DIR = path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects');
const fx = require(path.join(FX_DIR, 'registry.js'));
for (const name of ['post', 'camera', 'shape-layer']) {
  require(path.join(FX_DIR, `${name}.js`));
}
globalThis.window = globalThis;
globalThis.SA = globalThis.SA || {};
require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'engine.js'));
const project = require(path.join(ROOT, 'renderer', 'js', 'studio', 'project.js'));

test('postTarget resolves the instance, the defaults and the registry', () => {
  assert.equal(fx.postTarget({ type: 'vignette' }), 'frame');
  assert.equal(fx.postTarget({ type: 'sparkles' }), 'text');
  assert.equal(fx.postTarget({ type: 'vignette', target: 'text' }), 'text');
  assert.equal(fx.postTarget({ type: 'sparkles', defaults: { target: 'frame' } }), 'frame');
});

test('isGraphicsPost puts every frame post on the graphics row', () => {
  assert.equal(fx.isGraphicsPost({ type: 'vignette' }), true);
  assert.equal(fx.isGraphicsPost({ type: 'lightLeak' }), true);
  assert.equal(fx.isGraphicsPost({ type: 'camera' }), true);
  assert.equal(fx.isGraphicsPost({ type: 'crt' }), true);
  assert.equal(fx.isGraphicsPost({ type: 'shapeLayer' }), true);
  assert.equal(fx.isGraphicsPost({ type: 'shapeLayer', enabled: false }), false);
  assert.equal(fx.isGraphicsPost({ type: 'sparkles' }), false);
  assert.equal(fx.isGraphicsPost({ type: 'godRays' }), false);
  assert.equal(fx.isGraphicsPost({ type: 'vignette', enabled: false }), false);
  assert.equal(fx.isGraphicsPost(null), false);
});

test('subtitleGraphicsOn reads the track flag and the subtitle-only view', () => {
  const engine = globalThis.SA.lyricsEngine;
  assert.equal(engine.subtitleGraphicsOn({ graphicsHidden: true }, {}), false);
  assert.equal(engine.subtitleGraphicsOn({ graphicsHidden: false }, {}), true);
  assert.equal(engine.subtitleGraphicsOn({}, {}), true);
  assert.equal(engine.subtitleGraphicsOn({}, { subtitleOnly: true }), false);
  assert.equal(engine.subtitleGraphicsOn({ graphicsHidden: true }, { subtitleOnly: true }), false);
  assert.equal(engine.subtitleGraphicsOn(null, null), true);
});

test('migrate normalises graphicsHidden to a boolean and keeps it absent by default', () => {
  const doc = project.defaults({});
  doc.tracks = [
    { id: 'sub1', kind: 'subtitle', name: '字幕1', graphicsHidden: 1 },
    { id: 'sub2', kind: 'subtitle', name: '字幕2' },
    { id: 'mid', kind: 'backdrop', name: '後景' },
  ];
  const migrated = project.migrate(doc);
  assert.equal(migrated.ok, true);
  assert.equal(migrated.project.tracks.find((track) => track.id === 'sub1').graphicsHidden, true);
  assert.equal(migrated.project.tracks.find((track) => track.id === 'sub2').graphicsHidden, undefined);
});

test('the engine drops the track graphics and the timeline draws their row', () => {
  const engine = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'lyrics', 'engine.js'), 'utf8');
  assert.ok(engine.includes('graphicsHiddenTracks'), 'the graphicsHidden set is missing');
  assert.ok(engine.includes('subtitleGraphicsOn'), 'the decision helper is unused');
  assert.ok(engine.includes('graphicsHiddenTracks.has(active.trackId)'));
  assert.ok(engine.includes('isGraphicsPost'), 'the engine does not skip graphics posts');
  assert.ok(engine.includes('graphicsOn'), 'the per-beat graphics decision is missing');
  const timeline = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'timeline.js'), 'utf8');
  assert.ok(timeline.includes("'graphics-track'"), 'the graphics row is missing');
  assert.ok(timeline.includes("'track-graphics-check'"), 'the graphics checkbox is missing');
  assert.ok(timeline.includes('graphicsSpans'), 'the graphics spans are missing');
  const i18n = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'i18n.js'), 'utf8');
  for (const key of ['graphics', 'hideGraphics', 'showGraphics', 'graphicsTrackVisible']) {
    assert.ok(i18n.includes(key), `${key} missing from i18n`);
  }
});

test('the graphics switch covers every graphic: frame posts and text-attached extras', () => {
  const engine = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'lyrics', 'engine.js'), 'utf8');
  // no second foreground flag: the text-attached extras hide with graphicsOn
  assert.equal(engine.includes('fgHidden'), false, 'the fgHidden flag must be gone');
  assert.equal(engine.includes('subtitleForegroundOn'), false, 'the foreground helper must be gone');
  assert.ok(engine.includes('const ornActive = graphicsOn'), 'the ornament pass is not on the graphics switch');
  assert.ok(engine.includes('if (graphicsOn) drawPageDecor(active, t)'), 'the page decor is not on the graphics switch');
  assert.ok(engine.includes("type: 'solid', params: {}, motion: {}, enabled: true"), 'the solid fill fallback is missing');
  assert.ok(engine.includes('if (textOn && graphicsOn)'), 'repeats / clones are not on the graphics switch');
  assert.ok(engine.includes('textOn && graphicsOn ? buildStrike'), 'strike is not on the graphics switch');
  assert.ok(engine.includes('if (graphicsOn) drawScopedDecor'), 'scoped decor is not on the graphics switch');
  // edges paint on and around the glyphs, so they follow Text FG instead
  assert.equal(engine.includes('const edges = graphicsOn'), false, 'edges must not be on the graphics switch');
  // every post (frame-wide and text-target) is skipped when off
  assert.ok(engine.includes('if (!graphicsOn) continue;'), 'posts are not skipped when graphics are off');
  const timeline = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'timeline.js'), 'utf8');
  assert.equal(timeline.includes("'fg-track'"), false, 'the text graphics row must be gone');
  assert.equal(timeline.includes('foregroundSpans'), false, 'the foreground spans must be gone');
  assert.ok(timeline.includes('hasTextGraphics'), 'the graphics spans do not cover text-attached extras');
  const inspector = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'inspector.js'), 'utf8');
  assert.ok(inspector.includes('GRAPHICS_GROUPS'), 'GRAPHICS_GROUPS missing from inspector');
  assert.ok(inspector.includes('graphicsTrackVisible'), 'graphicsTrackVisible missing from inspector');
  assert.equal(inspector.includes('fgHidden'), false, 'the fgHidden flag must be gone from the inspector');
});

test('migrate folds the removed fgHidden flag into graphicsHidden', () => {
  const doc = project.defaults({});
  doc.tracks = [
    { id: 'sub1', kind: 'subtitle', name: '字幕1', fgHidden: 1 },
    { id: 'sub2', kind: 'subtitle', name: '字幕2', fgHidden: 1, graphicsHidden: false },
    { id: 'sub3', kind: 'subtitle', name: '字幕3' },
  ];
  const migrated = project.migrate(doc);
  assert.equal(migrated.ok, true);
  const byId = (id) => migrated.project.tracks.find((track) => track.id === id);
  assert.equal(byId('sub1').graphicsHidden, true);
  assert.equal('fgHidden' in byId('sub1'), false);
  assert.equal(byId('sub2').graphicsHidden, false, 'an explicit graphicsHidden wins');
  assert.equal('fgHidden' in byId('sub2'), false);
  assert.equal(byId('sub3').graphicsHidden, undefined);
});

test('graphicsPostsActive spots the frame graphics that need the text mask', () => {
  const engine = globalThis.SA.lyricsEngine;
  const previous = globalThis.SA.fx;
  globalThis.SA.fx = fx;
  try {
    const beat = (post, trackId) => ({ trackId: trackId || 'sub1', style: { post } });
    assert.equal(engine.graphicsPostsActive([beat([])], null), false);
    assert.equal(engine.graphicsPostsActive([beat([{ type: 'sparkles', enabled: true }])], null), false, 'text posts stay unmasked');
    assert.equal(engine.graphicsPostsActive([beat([{ type: 'vignette' }])], null), true);
    assert.equal(engine.graphicsPostsActive([beat([{ type: 'shapeLayer' }])], null), true);
    assert.equal(engine.graphicsPostsActive([beat([{ type: 'vignette', enabled: false }])], null), false);
    assert.equal(engine.graphicsPostsActive([beat([{ type: 'vignette' }], 'sub2')], new Set(['sub2'])), false, 'a hidden graphics row is skipped');
    assert.equal(engine.graphicsPostsActive([beat([{ type: 'vignette' }], 'sub2')], new Set(['sub1'])), true, 'another track still masks');
    assert.equal(engine.graphicsPostsActive(null, null), false);
  } finally {
    globalThis.SA.fx = previous;
  }
});

test('the frame posts composite with the text mask so the glyphs stay on top', () => {
  const shaders = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'lyrics', 'gl', 'shaders.js'), 'utf8');
  const post = shaders.slice(shaders.indexOf('const POST_FRAG'), shaders.indexOf('const BLOOM_BRIGHT_FRAG'));
  assert.ok(post.includes('uniform sampler2D u_mask'), 'POST_FRAG does not read the mask');
  assert.ok(post.includes('uniform float u_maskAmount'), 'POST_FRAG has no mask amount');
  assert.ok(post.includes('mix(color, src, keep)'), 'POST_FRAG does not restore the glyphs');
  const passes = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'lyrics', 'gl', 'passes.js'), 'utf8');
  assert.ok(passes.includes('function postFrame(uniforms, options)'), 'postFrame takes no mask option');
  assert.ok(passes.includes('opts.mask ? 1 : 0'), 'postFrame never switches the mask on');
  assert.ok(passes.includes('programs.post.uniforms.u_maskAmount'), 'the mask amount uniform is unset');
  const engine = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'lyrics', 'engine.js'), 'utf8');
  assert.ok(engine.includes('graphicsPostsActive(visibleBeats, graphicsHiddenTracks)'), 'the graphics do not request the mask');
  assert.ok(engine.includes('pipeline.postFrame(uniforms, { mask: maskOn })'), 'the engine does not mask the frame posts');
});
