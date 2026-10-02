(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./registry'));
  else {
    root.SA = root.SA || {};
    factory(root.SA.fx);
  }
})(typeof self !== 'undefined' ? self : this, function (fx) {
  'use strict';

  if (!fx || typeof fx.register !== 'function') return;

  const P_MARGIN = { key: 'margin', kind: 'number', min: 0.02, max: 0.3, step: 0.01, default: 0.06 };
  const P_GUTTER = { key: 'gutter', kind: 'number', min: 0.01, max: 0.1, step: 0.005, default: 0.03 };
  const P_DECOR = { key: 'decor', kind: 'bool', default: true };
  const P_DECOR_LEAD = { key: 'decorLead', kind: 'number', min: 0, max: 0.5, step: 0.05, default: 0.15 };
  const P_RULE_STYLE = { key: 'ruleStyle', kind: 'select', options: ['solid', 'double', 'dotted', 'none'], default: 'solid' };
  const P_PAPER = { key: 'paper', kind: 'select', options: ['auto', 'none', 'accent'], default: 'auto' };

  const PRESETS = [
    {
      type: 'none',
      tags: ['basic'],
      params: [],
    },
    {
      type: 'flushLeft',
      tags: ['basic', 'editorial'],
      params: [P_MARGIN],
    },
    {
      type: 'center',
      tags: ['basic', 'editorial'],
      params: [P_MARGIN],
    },
    {
      type: 'flushRight',
      tags: ['basic', 'editorial'],
      params: [P_MARGIN],
    },
    {
      type: 'justify',
      tags: ['editorial'],
      params: [P_MARGIN],
    },
    {
      type: 'vertical',
      tags: ['japanese', 'traditional'],
      params: [
        P_MARGIN,
        { key: 'align', kind: 'select', options: ['top', 'center', 'bottom'], default: 'top' },
      ],
    },
    {
      type: 'grid',
      tags: ['mosaic', 'poster'],
      params: [
        { key: 'cols', kind: 'int', min: 2, max: 24, default: 8 },
        { key: 'gap', kind: 'number', min: 0, max: 40, step: 1, default: 8 },
        P_MARGIN,
      ],
    },
    {
      type: 'magazine',
      tags: ['editorial', 'magazine'],
      params: [P_MARGIN, P_GUTTER, P_DECOR, P_DECOR_LEAD, P_RULE_STYLE, P_PAPER],
    },
    {
      type: 'fashion',
      tags: ['minimal', 'fashion'],
      params: [P_MARGIN, P_DECOR, P_DECOR_LEAD],
    },
    {
      type: 'newspaper',
      tags: ['editorial', 'newspaper'],
      params: [
        P_MARGIN,
        P_GUTTER,
        { key: 'columns', kind: 'int', min: 1, max: 6, default: 3 },
        { key: 'dropCap', kind: 'bool', default: false },
        P_DECOR,
        P_DECOR_LEAD,
        P_RULE_STYLE,
      ],
    },
    {
      type: 'twoColumn',
      tags: ['editorial', 'columns'],
      params: [P_MARGIN, P_GUTTER, P_DECOR, P_DECOR_LEAD, P_RULE_STYLE],
    },
    {
      type: 'threeColumn',
      tags: ['editorial', 'columns'],
      params: [P_MARGIN, P_GUTTER, P_DECOR, P_DECOR_LEAD, P_RULE_STYLE],
    },
    {
      type: 'manuscript',
      tags: ['japanese', 'traditional', 'cells'],
      params: [
        { key: 'cols', kind: 'int', min: 5, max: 30, default: 20 },
        { key: 'rows', kind: 'int', min: 5, max: 30, default: 20 },
        { key: 'vertical', kind: 'bool', default: true },
        P_MARGIN,
        P_DECOR,
        P_DECOR_LEAD,
      ],
    },
    {
      type: 'xCard',
      tags: ['ui', 'social', 'card'],
      params: [P_DECOR, P_DECOR_LEAD, P_PAPER],
    },
    {
      type: 'chatBubble',
      tags: ['ui', 'chat', 'bubble'],
      params: [
        P_MARGIN,
        { key: 'typing', kind: 'bool', default: true },
        P_DECOR,
        P_DECOR_LEAD,
      ],
    },
    {
      type: 'cafeSign',
      tags: ['shop', 'cafe', 'retro'],
      params: [P_DECOR, P_DECOR_LEAD, P_PAPER],
    },
    {
      type: 'cafeMenu',
      tags: ['shop', 'menu', 'cafe'],
      params: [P_DECOR, P_DECOR_LEAD, P_RULE_STYLE],
    },
    {
      type: 'boutique',
      tags: ['shop', 'boutique', 'minimal'],
      params: [P_DECOR, P_DECOR_LEAD],
    },
    {
      type: 'score',
      tags: ['music', 'score', 'staves'],
      params: [P_MARGIN, P_DECOR, P_DECOR_LEAD],
    },
    {
      type: 'poster',
      tags: ['poster', 'artistic', 'pinterest'],
      params: [
        { key: 'overlap', kind: 'bool', default: true },
        P_MARGIN,
        P_DECOR,
        P_DECOR_LEAD,
        { key: 'seed', kind: 'int', min: 1, max: 99999, default: 12345 },
      ],
    },
  ];

  for (const preset of PRESETS) {
    fx.register({
      group: 'page',
      type: preset.type,
      tags: preset.tags || [],
      params: preset.params || [],
    });
  }
});
