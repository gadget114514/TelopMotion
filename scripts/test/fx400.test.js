'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const fx = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects', 'registry.js'));
for (const name of ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'background', 'color', 'text-bg', 'vary']) {
  require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects', `${name}.js`));
}
const project = require(path.join(ROOT, 'renderer', 'js', 'studio', 'project.js'));
const motion = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'motion.js'));
const fx400 = require(path.join(ROOT, 'scripts', 'fx400.js'));

function sceneFor(text, style) {
  const size = 96;
  const letters = [];
  let pen = 0;
  for (let i = 0; i < text.length; i += 1) {
    const width = size * 0.6;
    letters.push({
      path: `cue:c1/beat:c1:single0/line:0/word:${i}/letter:0`,
      cueId: 'c1',
      beatId: 'c1:single0',
      lineIdx: 0,
      wordIdx: i,
      letterIdx: 0,
      globalIdx: i,
      char: text[i],
      local: { x: pen, y: size, w: width, h: size, cx: pen + width / 2, cy: size * 0.7, penX: pen, penY: size },
      bbox: { x1: 0, y1: -size, x2: width, y2: 0 },
      outlineLength: 400 + i * 10,
    });
    pen += width;
  }
  return {
    cueId: 'c1',
    beatId: 'c1:single0',
    kind: 'single',
    start: 0,
    end: 10,
    text,
    style,
    letters,
    blockBBox: { x1: 0, y1: 0, x2: pen, y2: size },
    size,
    direction: 'horizontal',
  };
}

function catalogTypes() {
  const types = [];
  for (const group of fx400.GROUP_ORDER) {
    for (const descriptor of fx.list(group)) types.push(`${group}.${descriptor.type}`);
  }
  return types;
}

test('the catalog has 400 numbered effects and covers every registered type', () => {
  const catalog = fx400.buildCatalog();
  assert.equal(catalog.effects.length, 400);
  assert.equal(catalog.total, 400);
  const numbers = catalog.effects.map((entry) => entry.n);
  assert.deepEqual(numbers, Array.from({ length: 400 }, (_, index) => index + 1));
  const ids = new Set(catalog.effects.map((entry) => entry.id));
  assert.equal(ids.size, 400);
  const covered = new Set(catalog.effects.map((entry) => `${entry.group}.${entry.type}`));
  for (const type of catalogTypes()) {
    assert.ok(covered.has(type), `${type} is missing from the catalog`);
  }
  for (const entry of catalog.effects) {
    assert.ok(entry.label && entry.label.length > 0, `#${entry.n} label`);
    if (entry.apply === 'style') {
      assert.ok(entry.style && Object.keys(entry.style).length > 0, `#${entry.n} style`);
      assert.equal(entry.clip, undefined, `#${entry.n} has both style and clip`);
    } else {
      assert.equal(entry.apply, 'clip');
      assert.ok(entry.clip && entry.clip.type, `#${entry.n} clip`);
      assert.equal(entry.style, undefined, `#${entry.n} has both style and clip`);
    }
  }
  const clipEntries = catalog.effects.filter((entry) => entry.apply === 'clip');
  assert.ok(clipEntries.length >= fx.list('background').length, 'every background type has a clip entry');
  for (const entry of clipEntries) assert.equal(entry.group, 'background');
});

test('the catalog is deterministic', () => {
  const a = fx400.buildCatalog();
  const b = fx400.buildCatalog();
  assert.equal(fx400.catalogSignature(a), fx400.catalogSignature(b));
  assert.equal(JSON.stringify(a.groups), JSON.stringify(b.groups));
});

test('variants step away from the base form without disabling the effect', () => {
  const catalog = fx400.buildCatalog();
  const bases = new Map();
  for (const entry of catalog.effects) {
    if (entry.variant === 0) bases.set(`${entry.group}.${entry.type}`, entry);
  }
  for (const entry of catalog.effects) {
    if (entry.variant === 0) continue;
    assert.ok(entry.changes.length <= 3, `#${entry.n} changes ${entry.changes.length} params`);
    for (const change of entry.changes) {
      assert.notEqual(change.key, 'enabled', `#${entry.n} toggles enabled`);
    }
    const base = bases.get(`${entry.group}.${entry.type}`);
    assert.ok(base, `#${entry.n} has no base form`);
    const payload = (item) => JSON.stringify(item.apply === 'clip' ? item.clip : item.style);
    assert.notEqual(payload(entry), payload(base), `#${entry.n} is identical to the base form`);
    const instance = entry.apply === 'style' && Array.isArray(entry.style[entry.group]) ? entry.style[entry.group][0] : entry.style && entry.style[entry.group];
    if (instance && instance.params) assert.notEqual(instance.params.enabled, false, `#${entry.n} is disabled`);
  }
});

test('the generated project applies effect n to cue n and migrates', () => {
  const catalog = fx400.buildCatalog();
  const built = fx400.buildProject(catalog, {});
  const doc = built.project;
  assert.equal(doc.script.cues.length, 400);
  const migrated = project.migrate(JSON.parse(JSON.stringify(doc)));
  assert.equal(migrated.ok, true, migrated.error);
  assert.equal(migrated.project.script.cues.length, 400);
  for (let i = 0; i < 400; i += 1) {
    const entry = catalog.effects[i];
    const cue = doc.script.cues[i];
    assert.equal(cue.id, `fx_${String(i + 1).padStart(3, '0')}`);
    if (entry.apply === 'style') {
      assert.ok(doc.cueStyles[cue.id], `cue ${cue.id} has no style`);
      const beat = doc.beats[cue.id][0];
      const style = project.resolveStyle(doc, `cue:${cue.id}/beat:${beat.id}`);
      const value = style[entry.group];
      const instance = Array.isArray(value) ? value[0] : value;
      assert.ok(instance, `cue ${cue.id} lost ${entry.group}`);
      assert.equal(instance.type, entry.type, `cue ${cue.id} group ${entry.group}`);
      const source = Array.isArray(entry.style[entry.group]) ? entry.style[entry.group][0] : entry.style[entry.group];
      assert.equal(JSON.stringify(instance.params), JSON.stringify(source.params));
    } else {
      const clip = doc.clips.find((item) => item.trackId === 'bg' && item.start === cue.start && item.end === cue.end);
      if (entry.clip.type === 'none') assert.equal(clip, undefined, `cue ${cue.id} should have no background`);
      else {
        assert.ok(clip, `cue ${cue.id} has no background clip`);
        assert.equal(clip.spec.type, entry.type);
      }
    }
  }
});

test('applyEntry reproduces an effect on an arbitrary project', () => {
  const catalog = fx400.buildCatalog();
  const doc = project.create({});
  doc.meta.lang = 'ja';
  doc.script.cues = [{ id: 'cueA', start: 0, end: 2, text: 'テスト', meta: { kind: 'custom' } }];
  const cue = doc.script.cues[0];
  const styleEntry = catalog.effects.find((entry) => entry.apply === 'style' && entry.variant === 1);
  fx400.applyEntry(doc, styleEntry, cue);
  const instance = doc.cueStyles.cueA[styleEntry.group];
  assert.equal(instance.type, styleEntry.type);
  const clipEntry = catalog.effects.find((entry) => entry.apply === 'clip' && entry.clip.type !== 'none');
  fx400.applyEntry(doc, clipEntry, cue);
  const clip = doc.clips.find((item) => item.trackId === 'bg');
  assert.ok(clip);
  assert.equal(clip.spec.type, clipEntry.type);
});

test('every fill/edge/post/background variant resolves to finite uniforms', () => {
  const catalog = fx400.buildCatalog();
  let checked = 0;
  for (const entry of catalog.effects) {
    const clipped = entry.apply === 'clip';
    const value = clipped ? entry.clip : entry.style[entry.group];
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
    } else if (clipped) {
      const uniforms = fx.backgroundUniforms({ type: instance.type, params: instance.params }, { time: 1, theme: null });
      assert.ok(Number.isFinite(uniforms.u_type), `#${entry.n} background`);
      checked += 1;
    }
  }
  assert.ok(checked >= 100, `checked ${checked} uniform resolvers`);
});

test('every style entry evaluates without NaN on a sample beat', () => {
  const catalog = fx400.buildCatalog();
  const times = [0, 0.15, 0.6, 1.2, 5, 9.9];
  let checked = 0;
  for (const entry of catalog.effects) {
    if (entry.apply !== 'style') continue;
    const scene = sceneFor('テストABC', entry.style);
    for (const time of times) {
      const result = motion.evaluateBeat(scene, time, {
        frame: { width: 1920, height: 1080 },
        seed: 42,
        beat: { id: 'c1:single0', cueId: 'c1', kind: 'single', start: 0, end: 10, text: scene.text },
      });
      for (const state of result.letters) {
        for (const key of ['x', 'y', 'rot', 'scaleX', 'scaleY', 'opacity', 'visibleFrac']) {
          assert.ok(Number.isFinite(state[key]), `#${entry.n} ${entry.group}.${entry.type} @${time}: ${key}`);
        }
      }
    }
    checked += 1;
  }
  assert.ok(checked >= 380, `checked ${checked} style entries`);
});

test('the markdown index lists every effect', () => {
  const catalog = fx400.buildCatalog();
  const md = fx400.catalogMarkdown(catalog);
  const rows = md.split('\n').filter((line) => /^\| \d+ \|/.test(line));
  assert.equal(rows.length, 400);
  assert.ok(md.includes('`test/fx400.telopmotion.json`'));
});
