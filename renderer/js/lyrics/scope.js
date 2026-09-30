(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.SA = root.SA || {};
    root.SA.scope = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Partial decoration scopes: `style.scoped = [{ group, type, params, motion,
  // enabled, scope }]`. A scope selects which letters of a beat an entry
  // applies to:
  //
  //   { kind: 'range',   from, to }          code-point offsets (letter.textOffset)
  //   { kind: 'word',    words: [idx] }      word indices inside the beat
  //   { kind: 'keyword', match: 'text' }     substring occurrences inside a line
  //   { kind: 'span',    spanIndex }         one composition span
  //   { kind: 'all' } / null                 every letter
  //
  // `scopeMask` returns a Uint8Array with one flag per letter; the result is
  // cached on the scene (`scene.__scope`, keyed by the scope signature), so the
  // motion evaluator and the renderer can ask for the same mask cheaply.

  function scopeKey(scope) {
    if (scope == null) return 'all';
    if (typeof scope === 'string') return scope;
    try {
      return JSON.stringify(scope);
    } catch {
      return String(scope);
    }
  }

  function numOf(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  // the line text per line index, as code points, plus the letter offsets
  function lineDataOf(scene) {
    const lines = new Map();
    for (const letter of (scene && scene.letters) || []) {
      const lineIdx = letter.lineIdx == null ? 0 : letter.lineIdx;
      if (!lines.has(lineIdx)) lines.set(lineIdx, { text: [], letters: [] });
      const line = lines.get(lineIdx);
      line.text.push(letter.char);
      line.letters.push(letter);
    }
    return lines;
  }

  function markRange(mask, scene, scope) {
    const from = numOf(scope.from, 0);
    const to = scope.to == null ? Infinity : numOf(scope.to, Infinity);
    for (let i = 0; i < scene.letters.length; i += 1) {
      const offset = scene.letters[i].textOffset;
      if (offset == null) continue;
      if (offset >= from && offset < to) mask[i] = 1;
    }
  }

  function markWords(mask, scene, scope) {
    const words = Array.isArray(scope.words) ? new Set(scope.words.map((value) => numOf(value, -1))) : null;
    const from = scope.from == null ? null : numOf(scope.from, 0);
    const to = scope.to == null ? null : numOf(scope.to, 0);
    for (let i = 0; i < scene.letters.length; i += 1) {
      const letter = scene.letters[i];
      const word = letter.wordIdx == null ? 0 : letter.wordIdx;
      if (words ? words.has(word) : true) {
        if (from != null && to != null && (word < from || word >= to)) continue;
        mask[i] = 1;
      }
    }
  }

  function markKeyword(mask, scene, scope) {
    const needle = Array.isArray(scope.match) ? scope.match.map(String) : [String(scope.match || '')];
    const wanted = needle.filter((value) => value.length);
    if (!wanted.length) return;
    const lines = lineDataOf(scene);
    for (const line of lines.values()) {
      for (const word of wanted) {
        const target = Array.from(word);
        for (let start = 0; start + target.length <= line.text.length; start += 1) {
          let hit = true;
          for (let k = 0; k < target.length; k += 1) {
            if (line.text[start + k] !== target[k]) {
              hit = false;
              break;
            }
          }
          if (!hit) continue;
          for (let k = 0; k < target.length; k += 1) {
            const letter = line.letters[start + k];
            if (letter) mask[letter.globalIdx] = 1;
          }
        }
      }
    }
  }

  function markSpan(mask, scene, scope) {
    const index = numOf(scope.spanIndex, -1);
    if (!(index >= 0)) return;
    const spans = scene && scene.style && scene.style.text && scene.style.text.compose && scene.style.text.compose.spans;
    const target = spans && spans[index] ? spans[index] : null;
    for (let i = 0; i < scene.letters.length; i += 1) {
      const letter = scene.letters[i];
      if (target ? letter.span === target : letter.spanIndex === index) mask[i] = 1;
    }
  }

  function maskFor(scene, scope) {
    const letters = (scene && scene.letters) || [];
    const mask = new Uint8Array(letters.length);
    if (!scope || scope.kind === 'all' || scope.kind == null) {
      mask.fill(1);
      return mask;
    }
    if (scope.kind === 'range') markRange(mask, scene, scope);
    else if (scope.kind === 'word') markWords(mask, scene, scope);
    else if (scope.kind === 'keyword') markKeyword(mask, scene, scope);
    else if (scope.kind === 'span') markSpan(mask, scene, scope);
    else mask.fill(1);
    return mask;
  }

  function scopeMask(scene, scope) {
    if (!scene || !Array.isArray(scene.letters)) return null;
    const key = scopeKey(scope);
    if (!scene.__scope) scene.__scope = new Map();
    const cached = scene.__scope.get(key);
    if (cached && cached.length === scene.letters.length) return cached;
    const mask = maskFor(scene, scope);
    if (scene.__scope.size > 64) scene.__scope.clear();
    scene.__scope.set(key, mask);
    return mask;
  }

  function isCovered(mask, index) {
    return !!(mask && mask[index]);
  }

  return { scopeKey, scopeMask, maskFor, lineDataOf, isCovered };
});
