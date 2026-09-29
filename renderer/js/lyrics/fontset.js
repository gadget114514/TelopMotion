(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.SA = root.SA || {};
    root.SA.fontSet = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // A font set is the project's own list of typefaces (bundled or loaded by
  // the user). Its first entry is the main typeface; the rest are tried in
  // order for glyphs the main one lacks. In exclusive mode every `fontId` a
  // theme, look, genre or random roll asks for is mapped onto the set, so the
  // project renders only with these typefaces (bundled Noto stays the last
  // resort for glyphs no set font has).
  //
  //   project.fontSet = { exclusive: true, fonts: [{ id, fontClass }] }
  //   project.media.fonts = [{ id, family, fileName, hash, weight, cjk }]
  //
  // `fontClass` is the perceptual class the repeat group's font variation
  // swaps between (see font.js); null means "use the bundled class, if any".

  const CLASSES = ['sans', 'sansBold', 'serif', 'display', 'round', 'hand', 'pop'];
  const USER_PREFIX = 'user:';

  function normalize(set) {
    const source = set && typeof set === 'object' ? set : {};
    const seen = new Set();
    const fonts = [];
    for (const raw of Array.isArray(source.fonts) ? source.fonts : []) {
      const id = typeof raw === 'string' ? raw : raw && raw.id;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const fontClass = raw && CLASSES.includes(raw.fontClass) ? raw.fontClass : null;
      fonts.push({ id: String(id), fontClass });
    }
    return { exclusive: fonts.length > 0 && source.exclusive !== false, fonts };
  }

  function isActive(set) {
    return !!set && Array.isArray(set.fonts) && set.fonts.length > 0;
  }

  function isExclusive(set) {
    return isActive(set) && set.exclusive !== false;
  }

  function isUserId(id) {
    return typeof id === 'string' && id.startsWith(USER_PREFIX);
  }

  function userId(hash) {
    return `${USER_PREFIX}${String(hash || '').slice(0, 16)}`;
  }

  function member(set, id) {
    if (!isActive(set) || !id) return null;
    return set.fonts.find((entry) => entry.id === id) || null;
  }

  // `info(id)` returns what is known about a typeface ({ fontClass, cjk }) or
  // null; it is how the pure module sees the bundled and user catalogs.
  function classOf(set, id, info) {
    const entry = member(set, id);
    if (entry && entry.fontClass) return entry.fontClass;
    if (isExclusive(set) && !entry) return null;
    const known = typeof info === 'function' ? info(id) : null;
    return (known && known.fontClass) || null;
  }

  // The typeface a style's `fontId` actually renders with.
  function resolveId(set, fontId, info) {
    if (!isExclusive(set)) return fontId || null;
    if (fontId && member(set, fontId)) return fontId;
    const known = fontId && typeof info === 'function' ? info(fontId) : null;
    const wanted = known && known.fontClass;
    if (wanted) {
      const sameClass = set.fonts.find((entry) => classOf(set, entry.id, info) === wanted);
      if (sameClass) return sameClass.id;
    }
    return set.fonts[0].id;
  }

  // Orders a loaded font list for layout: the resolved typeface first, then
  // the set in its own order, then everything else (bundled fallbacks).
  function order(list, fontId, set, info) {
    const fonts = Array.isArray(list) ? list.filter(Boolean) : [];
    const primary = resolveId(set, fontId, info);
    const rank = new Map();
    if (primary) rank.set(primary, 0);
    if (isActive(set)) set.fonts.forEach((entry, index) => { if (!rank.has(entry.id)) rank.set(entry.id, index + 1); });
    const base = rank.size + 1;
    return fonts
      .map((entry, index) => ({ entry, key: rank.has(entry.id) ? rank.get(entry.id) : base + index }))
      .sort((a, b) => a.key - b.key)
      .map((item) => item.entry);
  }

  // Typefaces a random roll may choose from. Japanese text prefers set fonts
  // that carry Japanese glyphs; an all-latin set is still returned so the
  // project keeps its look (missing glyphs fall back per character).
  function pool(set, cjk, info) {
    if (!isExclusive(set)) return [];
    const ids = set.fonts.map((entry) => entry.id);
    if (!cjk || typeof info !== 'function') return ids;
    const withCjk = ids.filter((id) => {
      const known = info(id);
      return known && known.cjk;
    });
    return withCjk.length ? withCjk : ids;
  }

  function fontIds(set) {
    return isActive(set) ? set.fonts.map((entry) => entry.id) : [];
  }

  return { CLASSES, USER_PREFIX, normalize, isActive, isExclusive, isUserId, userId, member, classOf, resolveId, order, pool, fontIds };
});
