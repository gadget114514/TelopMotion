'use strict';

// Named effects: the 120 motion-prompt entries as ready-made looks. The build
// script (scripts/named-effects.js) writes renderer/data/named-effects.json;
// these tests pin the data, the runtime resolver and the store / AI commands
// to one another.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const req = (relative) => require(path.join(ROOT, relative));

// the registry needs the same modules the build script loads, or the recipes
// cannot be validated / expanded
const fx = req('renderer/js/lyrics/effects/registry.js');
for (const name of ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'background', 'color', 'text-bg', 'vary', 'repeat', 'warp', 'animator', 'selector', 'camera', 'shape-layer', 'softbody', 'staged-presets', 'letter-strike', 'page', 'shader-fx']) {
  req(`renderer/js/lyrics/effects/${name}.js`);
}

const build = req('scripts/named-effects.js');
const looks = req('renderer/js/lyrics/looks.js');
const namedEffects = req('renderer/js/lyrics/named-effects.js');
const projectModule = req('renderer/js/studio/project.js');
const aiTools = req('renderer/js/studio/ai-tools.js');

globalThis.window = globalThis;
globalThis.SA = globalThis.SA || {};
SA.project = projectModule;
SA.moods = req('renderer/js/lyrics/moods.js');
SA.weird = req('renderer/js/lyrics/weird.js');
SA.genParams = req('renderer/js/lyrics/gen-params.js');
SA.paletteRoles = req('renderer/js/lyrics/palette-roles.js');
SA.rng = req('renderer/js/lyrics/rng.js');
SA.fillers = req('renderer/js/lyrics/fillers.js');
SA.credits = req('renderer/js/lyrics/credits.js');
SA.textflow = req('renderer/js/lyrics/textflow.js');
SA.random = req('renderer/js/lyrics/random.js');
SA.figures = req('renderer/js/lyrics/figures.js');
SA.keywords = req('renderer/js/lyrics/keywords.js');
SA.compositions = req('renderer/js/lyrics/compositions.js');
SA.direct = req('renderer/js/studio/direct.js');
req('renderer/js/studio/colors.js');
SA.namedEffects = namedEffects;
req('renderer/js/studio/store.js');
const store = globalThis.SA.store;

const DATA_FILE = path.join(ROOT, 'renderer', 'data', 'named-effects.json');
const DOC_FILE = path.join(ROOT, 'doc', 'named-effects.md');
const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
const runtime = namedEffects.use(namedEffects.create(data));

void fx;

function fixture() {
  return projectModule.defaults({
    styleMode: { order: 'cycle', seed: 12345, locked: [], axes: { speed: 0.5, energy: 0.5, softness: 0.5, density: 0.5, brightness: 0.5 } },
    script: {
      cues: [
        { id: 'c1', start: 0, end: 4, text: 'hello', trackId: 'sub1' },
        { id: 'c2', start: 7, end: 10, text: 'world', trackId: 'sub1' },
      ],
    },
    beats: { c1: [{ id: 'c1:page0', cueId: 'c1', start: 0, end: 4, kind: 'page', text: 'hello' }] },
  });
}

const snapshot = () => JSON.parse(JSON.stringify(store.state.project));

test('the data file and the index doc are what the build writes', () => {
  assert.deepEqual(data, build.buildData());
  assert.equal(fs.readFileSync(DOC_FILE, 'utf8'), build.catalogMarkdown(data));
});

test('all 120 catalog entries have a recipe that validates against the registry', () => {
  assert.equal(data.count, 120);
  assert.equal(data.effects.length, 120);
  assert.equal(data.packs.length, 5);
  for (const pack of data.packs) assert.equal(pack.count, 24);
  const ids = new Set(data.effects.map((entry) => entry.id));
  for (let n = 1; n <= 120; n += 1) {
    const id = String(n).padStart(3, '0');
    assert.ok(ids.has(id), `no catalog entry for #${id}`);
    assert.ok(build.RECIPES[id], `no recipe for #${id}`);
    build.validateRecipe(id, build.RECIPES[id]); // throws on unknown types / out-of-range params
  }
  assert.equal(Object.keys(build.RECIPES).length, 120);
});

test('styleOf restores the fully expanded style, strike included', () => {
  let strikeCount = 0;
  for (const entry of data.effects) {
    assert.deepEqual(namedEffects.styleOf(entry), build.stylePatchFor(entry), `#${entry.id}`);
    for (const group of entry.groups) assert.ok(group in namedEffects.styleOf(entry), `#${entry.id} lost group ${group}`);
    if (entry.style.strike) {
      strikeCount += 1;
      assert.deepEqual(namedEffects.styleOf(entry).strike, fx.withDefaults(entry.style.strike, 'strike'), `#${entry.id} strike`);
    }
  }
  assert.ok(strikeCount > 0, 'the catalog exercises strike');
});

test('the stored deltas round-trip through expand + stripDefaults', () => {
  for (const entry of data.effects) {
    const restored = looks.stripDefaults(namedEffects.styleOf(entry));
    // strike is not an instance group: expand keeps it whole (checked above)
    delete restored.strike;
    const expected = { ...entry.style };
    delete expected.strike;
    assert.deepEqual(restored, expected, `#${entry.id}`);
  }
});

test('the runtime searches by name, meaning, id and pack in both languages', () => {
  assert.equal(namedEffects.count(), 120);
  assert.equal(namedEffects.packs().length, 5);
  assert.equal(SA.namedEffects.current(), runtime);

  const ja = runtime.search('ポップ');
  assert.ok(ja.some((entry) => entry.id === '001'), 'ja name search finds #001');
  const en = runtime.search('bounce');
  assert.ok(en.some((entry) => entry.id === '001'), 'en meaning search finds #001');
  const id = runtime.search('#003');
  assert.ok(id.some((entry) => entry.id === '003'), 'id search finds #003');
  assert.equal(runtime.search('', { pack: 'camera' }).length, 24);
  assert.equal(runtime.search('strike', { pack: 'script' }).length, 0, 'unknown pack finds nothing');

  assert.equal(runtime.get(1).id, '001', 'get pads the id');
  assert.equal(runtime.get('001').name.ja, 'ポップイン');
  assert.equal(runtime.get('999'), null);
  assert.equal(namedEffects.labelOf(runtime.get('001'), 'ja'), '#001 ポップイン');
  assert.equal(namedEffects.labelOf(runtime.get('001'), 'en'), '#001 Pop-in');
  assert.match(namedEffects.describeOf(runtime.get('001'), 'ja'), /ポンと弾んで現れる/);
  assert.match(namedEffects.describeOf(runtime.get('001'), 'en'), /Pops into view/);
});

test('metaFor prefers the beat bag over the cue bag', () => {
  const doc = {
    cueStyles: { c1: { namedEffect: { id: '001' } } },
    beatStyles: { b1: { namedEffect: { id: '002' } }, b2: {} },
  };
  assert.deepEqual(namedEffects.metaFor(doc, 'c1', 'b1'), { meta: { id: '002' }, level: 'beat' });
  assert.deepEqual(namedEffects.metaFor(doc, 'c1', 'b2'), { meta: { id: '001' }, level: 'cue' });
  assert.equal(namedEffects.metaFor(doc, 'c9', 'b9'), null);
  assert.equal(namedEffects.metaFor(null, 'c1', 'b1'), null);
});

test('store: applying replaces the previous recipe\'s groups and is one undo step', () => {
  store.load(fixture());
  const before = snapshot();
  const e001 = runtime.get('001');
  const e062 = runtime.get('062');

  assert.equal(store.commands.applyNamedEffect({ cueId: 'c1' }, e001), true);
  const bag = store.state.project.cueStyles.c1;
  assert.equal(bag.namedEffect.id, '001');
  assert.deepEqual(bag.namedEffect.groups, e001.groups);
  assert.deepEqual(bag.namedEffect.name, e001.name);
  assert.deepEqual(bag, build.applyToBag({}, e001), 'the store bag matches the build helper');

  assert.equal(store.commands.applyNamedEffect({ cueId: 'c1' }, e062), true);
  const next = store.state.project.cueStyles.c1;
  assert.equal(next.namedEffect.id, '062');
  for (const group of e001.groups) {
    if (!e062.groups.includes(group)) assert.equal(group in next, false, `stale group ${group} removed`);
  }
  assert.ok(next.strike && next.strike.enabled !== false, 'strike came in expanded');

  assert.equal(store.undo(), true);
  assert.equal(store.state.project.cueStyles.c1.namedEffect.id, '001');
  assert.equal(store.undo(), true);
  assert.deepEqual(snapshot(), before, 'two undos return the project exactly');

  assert.equal(store.redo(), true);
  assert.equal(store.redo(), true);
  assert.equal(store.state.project.cueStyles.c1.namedEffect.id, '062');

  assert.equal(store.commands.clearNamedEffect({ cueId: 'c1' }), true);
  assert.equal('c1' in store.state.project.cueStyles, false, 'an emptied bag is removed');
  assert.equal(store.undo(), true);
  assert.equal(store.state.project.cueStyles.c1.namedEffect.id, '062');
});

test('store: beat and project scopes, and clear only acts on its own bag', () => {
  store.load(fixture());
  const e001 = runtime.get('001');

  assert.equal(store.commands.clearNamedEffect({ cueId: 'c2' }), false, 'nothing to clear');
  assert.equal(store.commands.applyNamedEffect({ cueId: 'c1', beatId: 'c1:page0' }, e001), true);
  assert.equal(store.state.project.beatStyles['c1:page0'].namedEffect.id, '001');
  assert.equal(namedEffects.metaFor(store.state.project, 'c1', 'c1:page0').level, 'beat');
  assert.equal(store.commands.clearNamedEffect({ cueId: 'c1' }), false, 'the cue bag has no effect of its own');
  assert.equal(store.commands.clearNamedEffect({ cueId: 'c1', beatId: 'c1:page0' }), true);
  assert.equal('c1:page0' in store.state.project.beatStyles, false);

  assert.equal(store.commands.applyNamedEffect('project', e001), true);
  assert.equal(store.state.project.style.namedEffect.id, '001');
  assert.equal(store.commands.clearNamedEffect('project'), true);
  assert.equal('namedEffect' in store.state.project.style, false);
  assert.ok(store.state.project.style && typeof store.state.project.style === 'object', 'the project style bag stays');
});

test('AI tools: apply_named_effect builds the same bag as the store command', () => {
  const session = aiTools.createSession(fixture(), { migrate: projectModule.migrate, namedEffects });
  session.setView({ playhead: 1, selection: ['cue:c1/beat:c1:page0'] });

  const listed = session.run('list_named_effects', { query: 'ポップ', limit: 5 });
  assert.equal(listed.ok, true);
  assert.ok(listed.result.effects.some((entry) => entry.id === '001'));

  const applied = session.run('apply_named_effect', { id: '001' });
  assert.equal(applied.ok, true);
  assert.equal(applied.result.target, 'beat c1:page0');

  // replay the ops the way the assistant applies them and compare with the store
  const replayed = aiTools.applyOps(JSON.parse(JSON.stringify(fixture())), session.ops());
  store.load(fixture());
  store.commands.applyNamedEffect({ cueId: 'c1', beatId: 'c1:page0' }, runtime.get('001'));
  assert.deepEqual(replayed.beatStyles['c1:page0'], store.state.project.beatStyles['c1:page0']);

  // a second effect over the first replaces its groups in the working copy too
  const over = session.run('apply_named_effect', { id: '062', target: 'cue:c1' });
  assert.equal(over.ok, true);
  store.commands.applyNamedEffect({ cueId: 'c1' }, runtime.get('062'));
  const replayed2 = aiTools.applyOps(JSON.parse(JSON.stringify(fixture())), session.ops());
  assert.deepEqual(replayed2.cueStyles.c1, store.state.project.cueStyles.c1);
  assert.equal(replayed2.beatStyles['c1:page0'].namedEffect.id, '001', 'the beat effect stays');

  const unknown = session.run('apply_named_effect', { id: '999' });
  assert.equal(unknown.ok, false);
  assert.match(unknown.error, /unknown named effect/);
});

test('AI tools: named effect tools explain themselves when the catalog is missing', () => {
  const bare = aiTools.createSession(fixture(), { migrate: projectModule.migrate });
  const listed = bare.run('list_named_effects', {});
  assert.equal(listed.ok, true);
  assert.equal(listed.result.error, 'named effect catalog not loaded');
  const applied = bare.run('apply_named_effect', { id: '001' });
  assert.equal(applied.ok, false);
  assert.match(applied.error, /catalog not loaded/);
});
