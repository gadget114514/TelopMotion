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
  //   { kind: 'nth',     unit, every, offset }
  //                                           every Nth letter / word / line
  //   { kind: 'all' } / null                 every letter
  //
  // `scopeMask` returns a Uint8Array with one flag per letter; the result is
  // cached on the scene (`scene.__scope`, keyed by the scope signature), so the
  // motion evaluator and the renderer can ask for the same mask cheaply.
  //
  // `maskForText` is the layout-time twin: the same scope over the beat text as
  // code points, before any scene exists. The word / line units need the
  // wrapped layout, so they resolve to an all-zero mask there.

  // A space, a punctuation mark or a symbol. The background variation and the
  // `nth` letter scope must agree on what a letter is, so the rule lives here
  // and both read it (vary.js delegates).
  const SKIPPABLE = /[\s\u3000]|[\p{P}\p{S}]/u;

  function isSkippable(char) {
    const value = String(char == null ? '' : char);
    if (!value) return true;
    return SKIPPABLE.test(value);
  }

  // The index space the layout counts in: code points, with the line
  // separators left out. font.js splits the text into paragraphs and keeps one
  // running cursor across them, so a range never addresses a '\n'.
  function codePointsOf(text) {
    const out = [];
    for (const line of String(text == null ? '' : text).split(/\r\n|\r|\n/)) {
      for (const char of Array.from(line)) out.push(char);
    }
    return out;
  }

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
      // the identity match keeps a hand-made scene (tests) working; a built
      // scene carries the span index, because the layout copies every span
      if (target ? letter.span === target : letter.spanIndex === index) mask[i] = 1;
    }
  }

  // "every Nth": the running index of the unit, taken modulo `every`, must
  // match `offset`. The letter index counts the letters that are not
  // skippable (the same rule the background colour variation uses, so a
  // `nth` pair lines up with `vary: alternate`), the word index counts the
  // distinct `lineIdx:wordIdx` in order and the line index is `lineIdx`.
  // A skipped letter never joins the count and never gets the flag.
  function markNth(mask, scene, scope) {
    const unit = scope.unit === 'word' || scope.unit === 'line' ? scope.unit : 'letter';
    const every = Math.max(1, Math.floor(numOf(scope.every, 2)) || 2);
    const offset = Math.max(0, Math.floor(numOf(scope.offset, 0)) || 0) % every;
    const skip = scope.skipSpaces !== false;
    const letters = (scene && scene.letters) || [];
    const words = new Map();
    let running = 0;
    for (let i = 0; i < letters.length; i += 1) {
      const letter = letters[i] || {};
      if (skip && isSkippable(letter.char)) continue;
      let index = 0;
      if (unit === 'word') {
        const key = `${letter.lineIdx == null ? 0 : letter.lineIdx}:${letter.wordIdx == null ? 0 : letter.wordIdx}`;
        if (!words.has(key)) words.set(key, words.size);
        index = words.get(key);
      } else if (unit === 'line') {
        index = letter.lineIdx == null ? 0 : letter.lineIdx;
      } else {
        index = running;
        running += 1;
      }
      if (index % every === offset) mask[i] = 1;
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
    else if (scope.kind === 'nth') markNth(mask, scene, scope);
    else mask.fill(1);
    return mask;
  }

  // The layout-time twin of `maskFor`: one flag per code point of the beat
  // text, for the scopes that do not need the wrapped layout. `nth` counts the
  // same skippable letters vary.js skips, so the letters it flags are the ones
  // the scene mask flags; `word` / `line` need the layout (word indices count
  // space words, lines come from wrapping) and resolve to nothing here.
  function maskForText(text, scope, compose) {
    const chars = codePointsOf(text);
    const mask = new Uint8Array(chars.length);
    if (!scope || scope.kind === 'all' || scope.kind == null) {
      mask.fill(1);
      return mask;
    }
    if (scope.kind === 'range') {
      const from = numOf(scope.from, 0);
      const to = scope.to == null ? Infinity : numOf(scope.to, Infinity);
      for (let i = 0; i < chars.length; i += 1) {
        if (i >= from && i < to) mask[i] = 1;
      }
      return mask;
    }
    if (scope.kind === 'keyword') {
      const wanted = (Array.isArray(scope.match) ? scope.match.map(String) : [String(scope.match || '')]).filter((value) => value.length);
      // the same match as markKeyword, over the same line data the layout makes
      for (const word of wanted) {
        const target = codePointsOf(word);
        if (!target.length) continue;
        for (let start = 0; start + target.length <= chars.length; start += 1) {
          let hit = true;
          for (let k = 0; k < target.length; k += 1) {
            if (chars[start + k] !== target[k]) {
              hit = false;
              break;
            }
          }
          if (!hit) continue;
          for (let k = 0; k < target.length; k += 1) mask[start + k] = 1;
        }
      }
      return mask;
    }
    if (scope.kind === 'span') {
      const index = numOf(scope.spanIndex, -1);
      const spans = compose && Array.isArray(compose.spans) ? compose.spans : null;
      const target = spans && spans[index] ? spans[index] : null;
      if (!target) return mask;
      const from = Math.max(0, Math.floor(numOf(target.from, 0)));
      const to = Math.min(chars.length, Math.floor(numOf(target.to, chars.length)));
      for (let i = from; i < to; i += 1) mask[i] = 1;
      return mask;
    }
    if (scope.kind === 'nth') {
      // only the letter unit is decidable before the layout
      if (scope.unit && scope.unit !== 'letter') return mask;
      const every = Math.max(1, Math.floor(numOf(scope.every, 2)) || 2);
      const offset = Math.max(0, Math.floor(numOf(scope.offset, 0)) || 0) % every;
      const skip = scope.skipSpaces !== false;
      let running = 0;
      for (let i = 0; i < chars.length; i += 1) {
        if (skip && isSkippable(chars[i])) continue;
        if (running % every === offset) mask[i] = 1;
        running += 1;
      }
      return mask;
    }
    mask.fill(1);
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

  return { scopeKey, scopeMask, maskFor, maskForText, codePointsOf, lineDataOf, isSkippable, isCovered };
});
