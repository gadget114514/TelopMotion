(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(null, require('./looks'), require('./effects/registry'));
  else {
    root.SA = root.SA || {};
    root.SA.namedEffects = factory(root, root.SA.looks, root.SA.fx);
  }
})(typeof self !== 'undefined' ? self : this, function (runtime, looks, fx) {
  'use strict';

  // Named effects: the 120 motion-prompt entries (5 packs of 24), each paired
  // with a TelopMotion recipe. The build script (scripts/named-effects.js)
  // writes renderer/data/named-effects.json with every recipe stored as a
  // delta against the effect registry defaults; `styleOf` restores the full
  // style with SA.looks.expand at apply time.
  //
  // Names and meanings come from motion-prompt by @showheyohtaki (MIT).

  const SOURCE = 'data/named-effects.json';
  // the groups a recipe may touch: SA.looks knows the instance groups, the
  // engine itself expands `strike`
  const RECIPE_GROUPS = ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'background', 'bgShape', 'bgFill', 'bgEdge', 'bgMotion', 'ornShape', 'ornFill', 'ornEdge', 'ornMotion', 'repeat', 'strike'];

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function pickLang(lang) {
    return lang === 'ja' ? 'ja' : 'en';
  }

  function textOf(field, lang) {
    if (!field) return '';
    const want = pickLang(lang);
    return field[want] || field.en || field.ja || '';
  }

  function labelOf(entry, lang) {
    if (!entry) return '';
    const id = String(entry.id || '').padStart(3, '0');
    const name = textOf(entry.name, lang);
    return name ? `#${id} ${name}` : `#${id}`;
  }

  function meaningOf(entry, lang) {
    return textOf(entry && entry.meaning, lang);
  }

  function describeOf(entry, lang) {
    const label = labelOf(entry, lang);
    const meaning = meaningOf(entry, lang);
    return meaning ? `${label} — ${meaning}` : label;
  }

  // the recipe as a full style (registry defaults filled in); `strike` is
  // expanded through the registry directly because SA.looks does not know it
  function styleOf(entry) {
    if (!entry || !entry.style) return {};
    const style = looks && typeof looks.expand === 'function' ? looks.expand(entry.style) : clone(entry.style);
    if (entry.style.strike && fx && typeof fx.withDefaults === 'function') {
      style.strike = fx.withDefaults(entry.style.strike, 'strike');
    }
    return style;
  }

  function groupsOf(entry) {
    if (!entry) return [];
    if (Array.isArray(entry.groups) && entry.groups.length) return entry.groups.slice();
    return Object.keys(styleOf(entry)).filter((key) => RECIPE_GROUPS.includes(key));
  }

  // the named effect attached to a cue / beat bag: the beat's own wins over
  // the cue's. Returns { meta, level } with meta = { id, pack, groups, name? }
  function metaFor(doc, cueId, beatId) {
    const beatBag = doc && doc.beatStyles && beatId ? doc.beatStyles[beatId] : null;
    if (beatBag && beatBag.namedEffect && beatBag.namedEffect.id) return { meta: beatBag.namedEffect, level: 'beat' };
    const cueBag = doc && doc.cueStyles && cueId ? doc.cueStyles[cueId] : null;
    if (cueBag && cueBag.namedEffect && cueBag.namedEffect.id) return { meta: cueBag.namedEffect, level: 'cue' };
    return null;
  }

  function searchTerms(query) {
    return String(query == null ? '' : query).trim().toLowerCase().split(/\s+/).filter(Boolean);
  }

  function haystack(entry) {
    return [
      entry.id,
      `#${entry.id}`,
      entry.pack,
      entry.slug,
      entry.category,
      entry.name && entry.name.ja,
      entry.name && entry.name.en,
      entry.meaning && entry.meaning.ja,
      entry.meaning && entry.meaning.en,
    ].concat(entry.tags || []).filter(Boolean).join(' ').toLowerCase();
  }

  function create(data) {
    const effects = (data && data.effects) || [];
    const packs = (data && data.packs) || [];
    const byId = new Map(effects.map((entry) => [entry.id, entry]));
    return {
      data,
      count: () => effects.length,
      list: () => effects,
      packs: () => packs,
      get(id) {
        const key = String(id == null ? '' : id).padStart(3, '0');
        return byId.get(key) || null;
      },
      nameOf: (entry, lang) => textOf(entry && entry.name, lang),
      meaningOf,
      labelOf,
      describeOf,
      styleOf,
      groupsOf,
      // same filtering as the motion dialog: every whitespace-separated term
      // must appear somewhere in id / pack / slug / names / meanings / tags
      search(query, options) {
        const opts = options || {};
        const terms = searchTerms(query);
        const pack = opts.pack && opts.pack !== 'all' ? opts.pack : null;
        return effects.filter((entry) => {
          if (opts.packs && Array.isArray(opts.packs) && !opts.packs.includes(entry.pack)) return false;
          if (pack && entry.pack !== pack) return false;
          if (!terms.length) return true;
          const text = haystack(entry);
          return terms.every((term) => text.includes(term));
        });
      },
    };
  }

  let loaded = null;
  let loading = null;

  async function readSource() {
    const platform = runtime && runtime.SA && runtime.SA.platform;
    if (platform && typeof platform.readAsset === 'function') {
      const buffer = await platform.readAsset(SOURCE);
      return new TextDecoder('utf-8').decode(new Uint8Array(buffer));
    }
    const response = await fetch(SOURCE);
    if (!response.ok) throw Object.assign(new Error(`named-effects-http-${response.status}`), { code: 'named-effects-fetch-failed' });
    return await response.text();
  }

  async function load(options) {
    const opts = options || {};
    if (loaded && !opts.force) return loaded;
    if (loading && !opts.force) return loading;
    loading = (async () => {
      try {
        const text = await readSource();
        loaded = create(JSON.parse(text));
        return loaded;
      } catch (error) {
        loaded = null;
        return null;
      } finally {
        loading = null;
      }
    })();
    return loading;
  }

  function current() {
    return loaded;
  }

  // install an instance directly (e.g. from an embedded catalog): the same
  // shape `load()` resolves to
  function use(instance) {
    loaded = instance || null;
    loading = null;
    return loaded;
  }

  function requireLoaded() {
    if (!loaded) throw Object.assign(new Error('named-effects-not-loaded'), { code: 'named-effects-not-loaded' });
    return loaded;
  }

  return {
    SOURCE,
    RECIPE_GROUPS,
    create,
    load,
    current,
    use,
    textOf,
    labelOf,
    meaningOf,
    describeOf,
    styleOf,
    groupsOf,
    metaFor,
    haystack,
    count: () => requireLoaded().count(),
    list: () => requireLoaded().list(),
    packs: () => requireLoaded().packs(),
    get: (id) => requireLoaded().get(id),
    search: (query, options) => requireLoaded().search(query, options),
    nameOf: (entry, lang) => requireLoaded().nameOf(entry, lang),
  };
});
