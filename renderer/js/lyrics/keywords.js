(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.SA = root.SA || {}; root.SA.keywords = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Words a weird look shouts. Japanese entries match as substrings (so 愛 hits
  // 愛してる), Latin entries as whole words with a plural / -ing tolerance.
  const PRESETS = {
    ja: [
      // love / heart
      '愛', '恋', '好き', '心', '君', 'キス', '抱きしめ', '会いたい',
      // dream / hope
      '夢', '希望', '未来', '奇跡', '運命', '約束', '自由', '翼', '願い',
      // tears / pain
      '涙', '泣', '痛', '傷', '孤独', '絶望', '嘘', 'さよなら', 'ごめん',
      // shout / move
      '叫', '走れ', '飛べ', '壊', '燃え', '震え', '生き', '死', '消え',
      // time
      '永遠', 'ずっと', '最後', '初めて', 'もう一度', '忘れない', '今夜',
      // light / dark / world
      '光', '輝', '闇', '星', '空', '夜', '月', '太陽', '炎', '嵐', '雨', '桜', '花', '世界', '命', '魂', 'ありがとう', '全部', '本当',
    ],
    en: [
      // love / heart
      'love', 'heart', 'kiss', 'baby', 'darling', 'hold',
      // dream / hope
      'dream', 'hope', 'wish', 'miracle', 'destiny', 'promise', 'free', 'freedom', 'wings', 'heaven', 'angel',
      // tears / pain
      'tears', 'cry', 'pain', 'hurt', 'broken', 'lonely', 'alone', 'lost', 'goodbye', 'sorry', 'lie',
      // shout / move
      'scream', 'shout', 'run', 'fly', 'fall', 'rise', 'break', 'burn', 'shine', 'dance', 'fight', 'alive', 'die', 'dead', 'wild', 'crazy',
      // time
      'forever', 'never', 'always', 'tonight', 'remember', 'again',
      // light / dark / world
      'light', 'dark', 'night', 'star', 'sky', 'fire', 'storm', 'rain', 'moon', 'sun', 'gold', 'blood', 'ghost', 'soul', 'world', 'everything', 'nothing',
    ],
  };

  const THRESHOLD = 0.3;

  function clamp01(v) { const n = Number(v); return !Number.isFinite(n) ? 0 : n < 0 ? 0 : n > 1 ? 1 : n; }

  // 0 below the threshold, 1 at weird = 1
  function strength(weird) { return clamp01((clamp01(weird) - THRESHOLD) / (1 - THRESHOLD)); }

  function cleanList(value) {
    const list = Array.isArray(value) ? value : String(value || '').split(/[,、\n]/);
    return list.map((w) => String(w).trim()).filter(Boolean);
  }

  // app-wide kill switch: SA.config.keywordEmphasis = false turns the feature
  // off everywhere (render + theme editor), whatever the project says
  function globallyEnabled() {
    const sa = typeof globalThis !== 'undefined' ? globalThis.SA : null;
    return !(sa && sa.config && sa.config.keywordEmphasis === false);
  }

  // presets ∪ extra − exclude; `enabled` defaults to true
  function listFor(styleMode) {
    const cfg = (styleMode && styleMode.keywords) || {};
    const exclude = new Set(cleanList(cfg.exclude).map((w) => w.toLowerCase()));
    const words = [...PRESETS.ja, ...PRESETS.en, ...cleanList(cfg.extra)].filter((w) => !exclude.has(w.toLowerCase()));
    return { enabled: globallyEnabled() && cfg.enabled !== false, words: [...new Set(words)] };
  }

  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const isLatin = (w) => /^[\x00-\x7f]+$/.test(w);

  // letters: [{ char, lineIdx, wordIdx }] in scene order. Returns an Int32Array
  // with the run index per letter (-1 = not a keyword) plus the run count.
  function mark(letters, words) {
    const runOf = new Int32Array(letters.length).fill(-1);
    const hit = new Uint8Array(letters.length);
    const byLine = new Map();
    letters.forEach((l, i) => { if (!byLine.has(l.lineIdx)) byLine.set(l.lineIdx, []); byLine.get(l.lineIdx).push(i); });
    const latin = words.filter(isLatin).map((w) => {
      const stem = escape(w.toLowerCase());
      const alt = w.endsWith('e') ? `|${escape(w.slice(0, -1).toLowerCase())}ing` : '';
      return `${stem}(?:s|es|d|ed|ing|in')?${alt}`;
    });
    const latinRe = latin.length ? new RegExp(`\\b(?:${latin.join('|')})\\b`, 'gi') : null;
    const cjk = words.filter((w) => !isLatin(w));
    for (const indices of byLine.values()) {
      // tight: CJK substring search; spaced: a space between layout words for \b
      let tight = ''; const tightMap = [];
      let spaced = ''; const spacedMap = [];
      indices.forEach((i, k) => {
        const ch = letters[i].char || '';
        if (k && letters[i].wordIdx !== letters[indices[k - 1]].wordIdx) { spaced += ' '; spacedMap.push(-1); }
        for (const c of ch) { tight += c; tightMap.push(i); spaced += c; spacedMap.push(i); }
      });
      for (const w of cjk) {
        let at = tight.indexOf(w);
        while (at >= 0) { for (let k = at; k < at + w.length; k += 1) hit[tightMap[k]] = 1; at = tight.indexOf(w, at + 1); }
      }
      if (latinRe) {
        latinRe.lastIndex = 0;
        let m;
        while ((m = latinRe.exec(spaced))) for (let k = m.index; k < m.index + m[0].length; k += 1) if (spacedMap[k] >= 0) hit[spacedMap[k]] = 1;
      }
    }
    // contiguous hits within a line form one run (one unit that pops together)
    let runs = 0;
    for (let i = 0; i < letters.length; i += 1) {
      if (!hit[i]) continue;
      const prev = i - 1;
      runOf[i] = prev >= 0 && hit[prev] && letters[prev].lineIdx === letters[i].lineIdx ? runOf[prev] : runs++;
    }
    return { runOf, runs };
  }

  return { PRESETS, THRESHOLD, strength, listFor, cleanList, mark, globallyEnabled };
});
