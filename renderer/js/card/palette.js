window.SA = window.SA || {};

SA.cardPalette = (() => {
  'use strict';

  const FONT_FAMILY = "'Segoe UI', 'Noto Sans', 'Yu Gothic UI', 'Hiragino Sans', Roboto, Arial, sans-serif";

  const base = {
    bg: '#0b0d12',
    bgSoft: '#10131b',
    card: '#151924',
    card2: '#1b2130',
    line: '#252c3d',
    lineSoft: '#1e2433',
    text: '#e9ecf4',
    muted: '#8d96ab',
    desc: '#c3cadb',
    accent: '#ff8a3d',
    accent2: '#ff4d8d',
    glowPink: 'rgba(255, 77, 141, 0.12)',
    glowViolet: 'rgba(124, 92, 255, 0.14)',
    ringTrack: '#232a3b',
    ringInner: '#12151d',
    barTrack: '#252c3d',
    lockedLevel: '#4a5164',
    lockedOpacity: 0.74,
    fontFamily: FONT_FAMILY,
  };

  const tiers = {
    white: '#eef1f8',
    bronze: '#cd7f32',
    silver: '#c3cad8',
    gold: '#ffc247',
  };

  const categories = {
    catalog: { tint: '#4d8dff', tint2: '#6f5bff' },
    plays: { tint: '#5fd44d', tint2: '#22c07a' },
    likes: { tint: '#ff5c8a', tint2: '#ff2d68' },
    tiers: { tint: '#ffc247', tint2: '#ff8a3d' },
    superlatives: { tint: '#b06bff', tint2: '#8a5cff' },
    time: { tint: '#4dc8ff', tint2: '#2f7cf6' },
    diversity: { tint: '#ff5cd0', tint2: '#b44dff' },
    community: { tint: '#7c8cff', tint2: '#5566ff' },
    gem: { tint: '#2ee6c0', tint2: '#0fb8b8' },
  };

  function theme(project) {
    const merged = {
      base: { ...base },
      tiers: { ...tiers },
      categories: Object.fromEntries(Object.entries(categories).map(([key, value]) => [key, { ...value }])),
    };
    const cardTheme = project && project.cardTheme;
    if (cardTheme) {
      for (const [key, value] of Object.entries(cardTheme)) {
        if (key === 'tiers') continue;
        if (value != null && typeof value !== 'object') merged.base[key] = value;
      }
      if (cardTheme.tiers) Object.assign(merged.tiers, cardTheme.tiers);
    }
    const categoryColors = project && project.categoryColors;
    if (categoryColors) {
      for (const [key, value] of Object.entries(categoryColors)) {
        if (!value) continue;
        merged.categories[key] = { ...(merged.categories[key] || {}), ...value };
      }
    }
    return merged;
  }

  return { base, tiers, categories, fontFamily: FONT_FAMILY, theme };
})();
