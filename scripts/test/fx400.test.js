'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const fx = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects', 'registry.js'));
for (const name of ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'background', 'color', 'text-bg', 'vary']) {
  require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects', `${name}.js`));
}
const project = require(path.join(ROOT, 'renderer', 'js', 'studio', 'project.js'));
const fx400 = require(path.join(ROOT, 'scripts', 'fx400.js'));

let cachedCatalog = null;
function catalog() {
  if (!cachedCatalog) cachedCatalog = fx400.buildCatalog();
  return cachedCatalog;
}

function allTypes() {
  const types = [];
  for (const group of fx400.GROUP_ORDER) {
    for (const descriptor of fx.list(group)) types.push(`${group}.${descriptor.type}`);
  }
  return types;
}

test('every registered type is either catalogued or explicitly excluded', () => {
  const built = catalog();
  assert.equal(built.effects.length, 400);
  const numbers = built.effects.map((entry) => entry.n);
  assert.deepEqual(numbers, Array.from({ length: 400 }, (_, index) => index + 1));
  assert.equal(new Set(built.effects.map((entry) => entry.id)).size, 400);
  const covered = new Set(built.effects.map((entry) => `${entry.group}.${entry.type}`));
  const excluded = new Set((built.excluded || []).map((item) => `${item.group}.${item.type}`));
  for (const type of allTypes()) {
    assert.ok(covered.has(type) || excluded.has(type), `${type} is neither catalogued nor excluded`);
  }
  for (const entry of built.effects) {
    assert.ok(entry.label && entry.label.length > 0, `#${entry.n} label`);
    assert.ok(['motion', 'static', 'engine'].includes(entry.verified), `#${entry.n} verified`);
    if (entry.apply === 'style') {
      assert.ok(entry.style && Object.keys(entry.style).length > 0, `#${entry.n} style`);
      assert.equal(entry.clip, undefined, `#${entry.n} has both style and clip`);
    } else {
      assert.equal(entry.apply, 'clip');
      assert.ok(entry.clip && entry.clip.type, `#${entry.n} clip`);
      assert.equal(entry.style, undefined, `#${entry.n} has both style and clip`);
      assert.equal(entry.group, 'background');
    }
    if (entry.verified === 'static') assert.equal(entry.score, null, `#${entry.n} static score`);
    if (entry.verified !== 'static') assert.ok(entry.score == null || entry.score >= fx400.THRESHOLD.plain, `#${entry.n} score ${entry.score}`);
  }
});

test('motion entries repeat their measured score and stay above the threshold', () => {
  const built = catalog();
  const scene = fx400.measureScene(built.sample || fx400.SAMPLE_TEXT);
  const plain = fx400.evalStates(scene, {}, [0, 0.1, 0.25, 0.5, 0.8, 1.1, 1.4, 1.7, 1.95]);
  let checked = 0;
  for (const entry of built.effects) {
    if (entry.verified !== 'motion') continue;
    const states = fx400.evalStates(scene, entry.style, [0, 0.1, 0.25, 0.5, 0.8, 1.1, 1.4, 1.7, 1.95]);
    const score = fx400.statesDistance(states, plain);
    assert.ok(Math.abs(score - entry.score) < 0.001, `#${entry.n} score ${entry.score} != ${score}`);
    assert.ok(score >= fx400.THRESHOLD.plain, `#${entry.n} below threshold (${score})`);
    for (const frame of states) {
      for (const state of frame) {
        for (const key of ['x', 'y', 'rot', 'scaleX', 'scaleY', 'opacity', 'visibleFrac']) {
          assert.ok(Number.isFinite(state[key]), `#${entry.n} ${key} is ${state[key]}`);
        }
      }
    }
    checked += 1;
  }
  assert.ok(checked >= 150, `checked ${checked} motion entries`);
});

test('the catalog matches the committed file (deterministic build)', () => {
  const built = catalog();
  const committed = JSON.parse(fs.readFileSync(path.join(ROOT, 'test', 'fx400.catalog.json'), 'utf8'));
  assert.equal(fx400.catalogSignature(built), fx400.catalogSignature(committed));
  assert.equal(JSON.stringify(built.groups), JSON.stringify(committed.groups));
  assert.equal(JSON.stringify(built.excluded), JSON.stringify(committed.excluded));
});

test('same-type entries step away from each other and never disable the effect', () => {
  const built = catalog();
  const byType = new Map();
  for (const entry of built.effects) {
    const key = `${entry.group}.${entry.type}`;
    if (!byType.has(key)) byType.set(key, []);
    byType.get(key).push(entry);
  }
  for (const [, list] of byType) {
    assert.ok(list.length >= 1 && list.length <= 8, `${list[0].group}.${list[0].type} has ${list.length} entries`);
    for (const entry of list) {
      assert.ok(entry.changes.length <= 4, `#${entry.n} changes ${entry.changes.length}`);
      for (const change of entry.changes) assert.notEqual(change.key, 'enabled', `#${entry.n} toggles enabled`);
      const instance = entry.apply === 'style' && Array.isArray(entry.style[entry.group]) ? entry.style[entry.group][0] : entry.style && entry.style[entry.group];
      if (instance && instance.params) assert.notEqual(instance.params.enabled, false, `#${entry.n} is disabled`);
    }
  }
});

test('the generated project applies effect n to cue n and migrates', () => {
  const built = catalog();
  const projectBuilt = fx400.buildProject(built, {});
  const doc = projectBuilt.project;
  assert.equal(doc.script.cues.length, 400);
  const migrated = project.migrate(JSON.parse(JSON.stringify(doc)));
  assert.equal(migrated.ok, true, migrated.error);
  assert.equal(migrated.project.script.cues.length, 400);
  for (let i = 0; i < 400; i += 1) {
    const entry = built.effects[i];
    const cue = doc.script.cues[i];
    assert.equal(cue.id, `fx_${String(i + 1).padStart(3, '0')}`);
    assert.ok(cue.text.startsWith(`${entry.n} `), `cue ${cue.id} text ${cue.text}`);
    const beats = doc.beats[cue.id];
    assert.equal(beats.length, 1, `cue ${cue.id} has ${beats.length} beats`);
    assert.equal(beats[0].kind, 'single', `cue ${cue.id} beat kind ${beats[0].kind}`);
    if (entry.apply === 'style') {
      assert.ok(doc.cueStyles[cue.id], `cue ${cue.id} has no style`);
      const style = project.resolveStyle(doc, `cue:${cue.id}/beat:${beats[0].id}`);
      const value = style[entry.group];
      const instance = Array.isArray(value) ? value[0] : value;
      assert.ok(instance, `cue ${cue.id} lost ${entry.group}`);
      assert.equal(instance.type, entry.type, `cue ${cue.id} group ${entry.group}`);
      const source = Array.isArray(entry.style[entry.group]) ? entry.style[entry.group][0] : entry.style[entry.group];
      assert.equal(JSON.stringify(instance.params), JSON.stringify(source.params));
    } else {
      const clip = doc.clips.find((item) => item.trackId === 'bg' && item.start === cue.start && item.end === cue.end);
      assert.ok(clip, `cue ${cue.id} has no background clip`);
      assert.equal(clip.spec.type, entry.type);
    }
  }
});

test('applyEntry reproduces an effect on an arbitrary project', () => {
  const built = catalog();
  const doc = project.create({});
  doc.meta.lang = 'ja';
  doc.script.cues = [{ id: 'cueA', start: 0, end: 2, text: 'テスト', meta: { kind: 'custom' } }];
  const cue = doc.script.cues[0];
  const styleEntry = built.effects.find((entry) => entry.apply === 'style');
  fx400.applyEntry(doc, styleEntry, cue);
  const instance = doc.cueStyles.cueA[styleEntry.group];
  assert.equal(instance.type, styleEntry.type);
  const clipEntry = built.effects.find((entry) => entry.apply === 'clip' && entry.clip.type !== 'none');
  fx400.applyEntry(doc, clipEntry, cue);
  assert.equal(doc.clips.find((item) => item.trackId === 'bg').spec.type, clipEntry.type);
});

test('every fill/edge/post/background entry resolves to finite uniforms', () => {
  const built = catalog();
  let checked = 0;
  for (const entry of built.effects) {
    const value = entry.apply === 'clip' ? entry.clip : entry.style[entry.group];
    const instance = Array.isArray(value) ? value[0] : value;
    if (entry.group === 'fill' || entry.group === 'bgFill') {
      const uniforms = fx.fillUniforms(fx.withDefaults(instance, 'fill'), {
        colors: { fill: [1, 0.5, 0.2, 1], fill2: [0.2, 0.5, 1, 1], stroke: [1, 1, 1, 1] },
        time: 1,
        progress: 0.4,
      });
      assert.ok(Number.isFinite(uniforms.u_type), `#${entry.n} fill`);
      checked += 1;
    } else if (entry.group === 'edge' || entry.group === 'bgEdge') {
      const uniforms = fx.edgeUniforms(fx.withDefaults(instance, 'edge'), { colorSet: { stroke: [1, 1, 1, 1] }, maxDistance: 108, width: 1920, height: 1080, time: 1 });
      assert.ok(Number.isFinite(uniforms.u_type), `#${entry.n} edge`);
      checked += 1;
    } else if (entry.group === 'post') {
      const uniforms = fx.postUniforms(fx.withDefaults(instance, 'post'), { envelope: 0.8, progress: 0.5, time: 2 });
      assert.ok(Number.isFinite(uniforms.u_type), `#${entry.n} post`);
      checked += 1;
    } else if (entry.apply === 'clip') {
      const uniforms = fx.backgroundUniforms({ type: instance.type, params: instance.params }, { time: 1, theme: null });
      assert.ok(Number.isFinite(uniforms.u_type), `#${entry.n} background`);
      checked += 1;
    }
  }
  assert.ok(checked >= 80, `checked ${checked} uniform resolvers`);
});

test('the markdown index lists every effect and the excluded types', () => {
  const built = catalog();
  const md = fx400.catalogMarkdown(built);
  const rows = md.split('\n').filter((line) => /^\| \d+ \|/.test(line));
  assert.equal(rows.length, 400);
  assert.ok(md.includes('`test/fx400.telopmotion.json`'));
  if (built.excluded.length) {
    assert.ok(md.includes('## 収録しなかったタイプ'));
    for (const item of built.excluded) assert.ok(md.includes(`${item.group} | ${item.type}`), `${item.type} missing from md`);
  }
});
