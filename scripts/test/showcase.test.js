'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const project = require(path.join(ROOT, 'renderer', 'js', 'studio', 'project.js'));
const showcase = require(path.join(ROOT, 'scripts', 'showcase.js'));

let cached = null;
function built() {
  if (!cached) cached = showcase.buildShowcase();
  return cached;
}

function filePath() {
  return path.join(ROOT, 'renderer', 'data', 'showcase.json');
}

test('the generated showcase migrates and keeps every cue', () => {
  const b = built();
  const migrated = project.migrate(JSON.parse(JSON.stringify(b.project)));
  assert.equal(migrated.ok, true, migrated.error);
  assert.equal(migrated.project.script.cues.length, b.project.script.cues.length);
  assert.equal(b.project.script.cues.length, b.effects.length + b.pages.length);
  assert.ok(b.effects.length >= 150, `effects ${b.effects.length}`);
  assert.equal(b.pages.length, 19);
  assert.equal(b.project.script.cues.length, b.effects.length + 19);
});

test('every cue carries a page style or an effect style/clip', () => {
  const b = built();
  const doc = b.project;
  const cueById = new Map(doc.script.cues.map((cue) => [cue.id, cue]));
  for (const { entry, cueId } of b.effects) {
    const cue = cueById.get(cueId);
    assert.ok(cue, `cue ${cueId} missing`);
    if (entry.apply === 'style') {
      const container = doc.cueStyles[cueId];
      assert.ok(container && container[entry.group], `cue ${cueId} lost ${entry.group}`);
      const instance = Array.isArray(container[entry.group]) ? container[entry.group][0] : container[entry.group];
      assert.equal(instance.type, entry.type, `cue ${cueId} ${entry.group}`);
    } else {
      assert.equal(entry.apply, 'clip');
      const start = Math.max(0, cue.start - 0.12);
      const clip = (doc.clips || []).find((item) => item.trackId === 'bg' && Math.abs(item.start - start) < 1e-4);
      assert.ok(clip, `cue ${cueId} has no background clip`);
      assert.equal(clip.spec.type, entry.type);
    }
  }
  for (const { type, cueId } of b.pages) {
    const container = doc.cueStyles[cueId];
    assert.ok(container && container.page, `page cue ${cueId} has no page style`);
    assert.equal(container.page.type, type, `page cue ${cueId} type`);
  }
});

test('every page preset but none is used', () => {
  const b = built();
  const registered = b.pageTypes.slice().sort();
  const used = [...new Set(b.pages.map((page) => page.type))].sort();
  assert.deepEqual(used, registered);
  assert.ok(!used.includes('none'));
  assert.equal(used.length, 19);
});

test('every page cue stays a single beat', () => {
  const b = built();
  for (const { cueId } of b.pages) {
    const beats = b.project.beats[cueId] || [];
    assert.equal(beats.length, 1, `page cue ${cueId} has ${beats.length} beats`);
  }
});

test('the catalogue contributes one variant-1 entry per type', () => {
  const b = built();
  const types = new Set(b.catalog.effects.filter((entry) => entry.variant === 1).map((entry) => `${entry.group}.${entry.type}`));
  // the `repeat` group is not part of the fx400 catalogue; the showcase adds one
  // entry per repeat type of its own
  assert.equal(b.effects.filter(({ entry }) => entry.group !== 'repeat').length, types.size);
  assert.deepEqual(new Set(b.effects.map(({ entry }) => entry.variant)), new Set([1]));
});

test('the --groups filter keeps only the named groups', () => {
  const b = showcase.buildShowcase({ groups: ['post'], pages: false });
  assert.ok(b.effects.length > 0);
  for (const { entry } of b.effects) assert.equal(entry.group, 'post');
  assert.equal(b.pages.length, 0);
});

test('every effect cue carries its i18n address for re-labelling', () => {
  const b = built();
  const cueById = new Map(b.project.script.cues.map((cue) => [cue.id, cue]));
  for (const { entry, cueId } of b.effects) {
    const cue = cueById.get(cueId);
    assert.ok(cue && cue.meta, `cue ${cueId} has no meta`);
    assert.equal(cue.meta.kind, 'showcase');
    assert.equal(cue.meta.group, entry.group);
    assert.equal(cue.meta.type, entry.type);
    if (entry.group === 'post') {
      const family = showcase.postFamilyOf(entry.type);
      assert.ok(family, `post ${entry.type} has no family`);
      assert.equal(cue.meta.family, family.id);
      assert.ok(cue.meta.target === 'text' || cue.meta.target === 'frame', `post ${entry.type} target`);
    } else {
      assert.ok(cue.meta.family == null, `non-post ${cueId} carries a family`);
    }
  }
});

test('the Studio re-labels the walk in all five languages', () => {
  const app = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'studio', 'app.js'), 'utf8');
  assert.match(app, /function localizeShowcase\(doc\)/);
  assert.match(app, /SA\.io\.loadFromObject\(localizeShowcase\(JSON\.parse\(text\)\)\)/);

  globalThis.window = globalThis;
  globalThis.SA = globalThis.SA || {};
  require(path.join(ROOT, 'renderer', 'js', 'i18n.js'));
  const STRINGS = require(path.join(ROOT, 'renderer', 'js', 'studio', 'fx-strings.js'));
  const i18n = globalThis.SA.i18n;
  // the browser registers fx-strings on script load; Node's module branch only
  // exports it, so register explicitly the same way studio.html ends up doing
  i18n.registerStrings(STRINGS);
  const lookup = (table, key) => String(key).split('.').reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), table);
  const FX_DIR = path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects');
  const fx = require(path.join(FX_DIR, 'registry.js'));
  for (const name of ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'background', 'color', 'text-bg', 'vary', 'repeat']) {
    require(path.join(FX_DIR, `${name}.js`));
  }
  // the walk scaffolding exists in every language
  for (const code of ['en', 'ja', 'es', 'fr', 'ru']) {
    i18n.set(code);
    assert.notEqual(i18n.t('studio.showcase.page'), 'studio.showcase.page', `${code} page`);
    for (const family of showcase.POST_FAMILIES) {
      assert.notEqual(i18n.t(`studio.showcase.family.${family.id}`), `studio.showcase.family.${family.id}`, `${code} family ${family.id}`);
    }
    for (const target of ['text', 'frame']) {
      assert.notEqual(i18n.t(`studio.showcase.target.${target}`), `studio.showcase.target.${target}`, `${code} target ${target}`);
    }
  }
  // the same formatter the Studio runs: group/type names in the language on
  // screen, `type` id as the stable tail
  const format = (code, meta) => {
    const table = STRINGS[code].studio.showcase;
    const groupLabel = table.group[meta.group] || meta.group;
    const base = fx.baseOf(meta.group);
    const typeName = (lookup(STRINGS[code], `fx.${base}.${meta.type}`) || meta.type);
    if (meta.group === 'post') {
      return `${groupLabel}［${table.family[meta.family]}/${table.target[meta.target]}］ ${typeName} / ${meta.type}`;
    }
    return `${groupLabel} / ${typeName} / ${meta.type}`;
  };
  const b = built();
  const cueById = new Map(b.project.script.cues.map((cue) => [cue.id, cue]));
  // Japanese re-labelling reproduces the generated file byte for byte
  for (const { cueId } of b.effects) {
    const cue = cueById.get(cueId);
    assert.equal(format('ja', cue.meta), cue.text, `ja round-trip ${cueId}`);
  }
  // English really is English (spot check the post headliners)
  const enOf = (type) => {
    const ref = b.effects.find(({ entry }) => entry.type === type);
    return format('en', cueById.get(ref.cueId).meta);
  };
  assert.equal(enOf('glitchBlocks'), 'Post［Glitch/Text］ Glitch blocks / glitchBlocks');
  assert.equal(enOf('noiseDissolve'), 'Post［Dissolve/Text］ Noise dissolve / noiseDissolve');
  assert.equal(enOf('shockwave'), 'Post［Blur & trails/Frame］ Shockwave / shockwave');
  assert.equal(enOf('kaleidoscope'), 'Post［Warp & mirror/Frame］ Kaleidoscope / kaleidoscope');
  assert.equal(enOf('bloom'), 'Post［Light/Frame］ Bloom / bloom');
  assert.equal(enOf('colorGrade'), 'Post［Color & texture/Frame］ Color grade / colorGrade');
});

test('post cues walk family by family with family markers', () => {
  const b = built();
  const postRefs = b.effects.filter(({ entry }) => entry.group === 'post');
  assert.equal(postRefs.length, 36);
  // every family covers its members exactly once
  for (const family of showcase.POST_FAMILIES) {
    const got = postRefs.filter(({ entry }) => entry.type && family.members.includes(entry.type)).map(({ entry }) => entry.type).sort();
    assert.deepEqual(got, family.members.slice().sort(), `family ${family.id}`);
  }
  // the walk order is family by family, registration order inside each family
  let cursor = 0;
  for (const family of showcase.POST_FAMILIES) {
    const slice = postRefs.slice(cursor, cursor + family.members.length).map(({ entry }) => entry.type);
    assert.deepEqual(slice, family.members, `order ${family.id}`);
    cursor += family.members.length;
  }
  // one marker per post family, in walk order
  const familyMarkers = b.markers.filter((marker) => String(marker.label).startsWith('後処理［'));
  assert.equal(familyMarkers.length, showcase.POST_FAMILIES.length);
  assert.deepEqual(
    familyMarkers.map((marker) => marker.label),
    showcase.POST_FAMILIES.map((family) => `後処理［${family.label}］ (post/${family.id})`)
  );
  let lastT = -Infinity;
  for (const marker of familyMarkers) {
    assert.ok(marker.t >= lastT, `marker ${marker.label} out of order`);
    lastT = marker.t;
  }
});

test('every post cue text names its family and target', () => {
  const b = built();
  const cueById = new Map(b.project.script.cues.map((cue) => [cue.id, cue]));
  for (const { entry, cueId } of b.effects) {
    if (entry.group !== 'post') continue;
    const family = showcase.postFamilyOf(entry.type);
    assert.ok(family, `post ${entry.type} has no family`);
    const target = showcase.postTargetOf(entry.type) === 'frame' ? '画面' : '文字';
    const cue = cueById.get(cueId);
    assert.ok(cue.text.startsWith(`後処理［${family.label}/${target}］`), `cue ${cueId} text ${cue.text}`);
    assert.ok(cue.text.endsWith(`/ ${entry.type}`), `cue ${cueId} text ${cue.text}`);
  }
});

test('the post walk shares one gradient plate for frame-target readability', () => {
  const b = built();
  const plates = (b.project.clips || []).filter((clip) => clip.id === 'clip_post_plate');
  assert.equal(plates.length, 1);
  const plate = plates[0];
  assert.equal(plate.trackId, 'bg');
  assert.equal(plate.spec.type, 'gradient');
  const postCues = b.effects.filter(({ entry }) => entry.group === 'post').map(({ cueId }) => b.project.script.cues.find((cue) => cue.id === cueId));
  const start = Math.min(...postCues.map((cue) => cue.start));
  const end = Math.max(...postCues.map((cue) => cue.end));
  assert.equal(plate.start, start);
  assert.equal(plate.end, end);
});

test('weak post steps are boosted into the visible band', () => {
  const b = built();
  const styleOf = (type) => {
    const ref = b.effects.find(({ entry }) => entry.type === type);
    assert.ok(ref, `post ${type} missing`);
    const container = b.project.cueStyles[ref.cueId];
    const instances = Array.isArray(container.post) ? container.post : [container.post];
    return instances.find((instance) => instance && instance.type === type).params;
  };
  // colorGrade: the shader ignores duotone, so lift/saturation/posterize carry it
  const grade = styleOf('colorGrade');
  assert.ok(Math.abs(grade.saturation - 1) > 0.3, `colorGrade saturation ${grade.saturation}`);
  assert.ok(grade.posterize >= 4, `colorGrade posterize ${grade.posterize}`);
  // sub-pixel displacements become visible nudges
  assert.ok(styleOf('heatHaze').amount >= 0.6);
  assert.ok(styleOf('displacementMap').amount >= 0.6);
  assert.ok(styleOf('chromaticAberration').amount >= 0.6);
  assert.ok(styleOf('filmGrain').amount >= 0.5);
  // dissolve edges are drawn, not transparent
  assert.ok(styleOf('noiseDissolve').edgeColor, 'noiseDissolve edge');
  assert.ok(styleOf('burnDissolve').emberColor, 'burnDissolve ember');
  // the mirror seam sits off-centre so the flip reads as a flip
  assert.notEqual(styleOf('mirror').offset, 0);
});

test('the built showcase matches the committed file (deterministic build)', () => {
  const b = built();
  const text = fs.readFileSync(filePath(), 'utf8');
  assert.equal(text, showcase.serialize(b.project));
});
