(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.SA = root.SA || {};
    root.SA.aiEval = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Scoring of one AI Assistant run. Pure and deterministic: it looks only at
  // the project before / after, the ops the model made and what it said. The
  // checks are structural (what was touched, what must stay) plus two measured
  // directions: the fill luminance of an element and its fx-axes vector.
  //
  // A case file entry (scripts/eval/cases.json):
  //   { id, prompt, fixture, view: { cue | playhead, select: 'beat' | 'cue' },
  //     scope: { cue | beat | project }, allowTextChange, expect: [ ... ] }
  //
  // expect items:
  //   { type: 'luminance', dir: 'up' | 'down', element? }   fill luminance moves
  //   { type: 'axis', axis, dir, element? }                  fx-axes value moves
  //   { type: 'unchanged', element }                         resolved look is identical
  //   { type: 'noOps' }                                      the model changed nothing
  //   { type: 'maxOps', n }                                  no sprawling patches
  //   { type: 'written', prefix }                            something was written under prefix
  // `element` defaults to the element in scope.

  const PROTECTED = ['format', 'version', 'media', 'dataset'];

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // JSON-pointer paths of the leaves that differ (an added / removed subtree is
  // reported at its root)
  function diffPaths(a, b, base, out) {
    const paths = out || [];
    const prefix = base || '';
    const isObj = (v) => v && typeof v === 'object';
    if (!isObj(a) || !isObj(b) || Array.isArray(a) !== Array.isArray(b)) {
      if (!same(a, b)) paths.push(prefix || '/');
      return paths;
    }
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      const next = `${prefix}/${String(key).replace(/~/g, '~0').replace(/\//g, '~1')}`;
      if (!(key in a) || !(key in b)) paths.push(next);
      else diffPaths(a[key], b[key], next, paths);
    }
    return paths;
  }

  function hexLuminance(hex) {
    const m = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(String(hex || ''));
    if (!m) return null;
    const n = parseInt(m[1], 16);
    const lin = (c) => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  }

  // Relative luminance of the text fill of a resolved style (a solid colour, a
  // palette entry, or the mean of a gradient's stops). null when unknown.
  function fillLuminance(style) {
    const fill = style && style.color && style.color.fill;
    if (!fill) return null;
    const palette = (style.palette && style.palette.colors) || [];
    const one = (value) => {
      if (!value) return null;
      if (typeof value === 'string') return hexLuminance(value);
      if (value.kind === 'palette') return hexLuminance(palette[Math.abs(Math.floor(value.index || 0)) % (palette.length || 1)]);
      if (value.kind === 'solid') return hexLuminance(value.value);
      if (value.kind === 'gradient' && Array.isArray(value.stops)) {
        const list = value.stops.map((s) => one(s && s.color !== undefined ? s.color : s)).filter((v) => v != null);
        return list.length ? list.reduce((x, y) => x + y, 0) / list.length : null;
      }
      return null;
    };
    return one(fill);
  }

  function elementPath(caseDef, ctxView) {
    const scope = caseDef.scope || {};
    if (scope.beat) return `cue:${scope.cue || ctxView.cueId}/beat:${scope.beat}`;
    const cueId = scope.cue || ctxView.cueId;
    return cueId ? `cue:${cueId}` : null;
  }

  // The paths the model may write under for a scope. `project` scope = anything
  // except the protected keys and the lyric script.
  function allowedPrefixes(caseDef, before, view) {
    const scope = caseDef.scope || {};
    if (scope.project) return [''];
    const list = [];
    const cueId = scope.cue || view.cueId;
    if (scope.beat) {
      list.push(`/beatStyles/${scope.beat}`, `/overrides/cue:${cueId}/beat:${scope.beat}`);
    } else if (cueId) {
      list.push(`/cueStyles/${cueId}`, `/overrides/cue:${cueId}`, `/keyframes/${cueId}`);
      for (const beat of (before.beats && before.beats[cueId]) || []) list.push(`/beatStyles/${beat.id}`);
    }
    return list.concat(caseDef.allow || []);
  }

  function within(path, prefixes) {
    return prefixes.some((p) => p === '' || path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}:`));
  }

  function lyricsOf(project) {
    return ((project.script && project.script.cues) || []).map((c) => [c.id, c.start, c.end, c.text]);
  }

  // ctx: { before, after, ops, text, resolveStyle, fxAxes, migrate, view }
  function evaluate(caseDef, ctx) {
    const results = [];
    const add = (name, pass, detail) => results.push({ name, pass: !!pass, detail: detail || '' });
    const { before, after } = ctx;
    const view = ctx.view || {};
    const element = elementPath(caseDef, view);
    const changed = diffPaths(before, after);

    if (ctx.migrate) {
      const verdict = ctx.migrate(clone(after));
      add('valid', verdict && verdict.ok, verdict && verdict.ok ? '' : verdict && verdict.error);
    }
    const touchedProtected = changed.filter((p) => PROTECTED.some((k) => p === `/${k}` || p.startsWith(`/${k}/`)));
    add('protected', touchedProtected.length === 0, touchedProtected.join(', '));

    if (!caseDef.allowTextChange) add('lyrics', same(lyricsOf(before), lyricsOf(after)), 'cue text / timing changed');

    const prefixes = allowedPrefixes(caseDef, before, view);
    const outside = changed.filter((p) => !within(p, prefixes));
    add('scope', outside.length === 0, outside.slice(0, 5).join(', '));

    for (const item of caseDef.expect || []) {
      const el = item.element || element;
      const resolve = (project) => (ctx.resolveStyle && el ? ctx.resolveStyle(project, el) : null);
      if (item.type === 'noOps') add('noOps', (ctx.ops || []).length === 0, `${(ctx.ops || []).length} ops`);
      else if (item.type === 'maxOps') add(`maxOps<=${item.n}`, (ctx.ops || []).length <= item.n, `${(ctx.ops || []).length} ops`);
      else if (item.type === 'written') add(`written ${item.prefix}`, changed.some((p) => p.startsWith(item.prefix)), changed.slice(0, 3).join(', '));
      else if (item.type === 'unchanged') add(`unchanged ${el}`, same(resolve(before), resolve(after)));
      else if (item.type === 'luminance') {
        const a = fillLuminance(resolve(before));
        const b = fillLuminance(resolve(after));
        const ok = a != null && b != null && (item.dir === 'down' ? b < a : b > a);
        add(`luminance ${item.dir}`, ok, `${a == null ? '?' : a.toFixed(3)} -> ${b == null ? '?' : b.toFixed(3)}`);
      } else if (item.type === 'axis') {
        const get = (project) => {
          const style = resolve(project);
          return style && ctx.fxAxes ? ctx.fxAxes.ofStyle(style)[item.axis] : null;
        };
        const a = get(before);
        const b = get(after);
        const ok = a != null && b != null && (item.dir === 'down' ? b < a - 1e-9 : b > a + 1e-9);
        add(`${item.axis} ${item.dir}`, ok, `${a == null ? '?' : a.toFixed(3)} -> ${b == null ? '?' : b.toFixed(3)}`);
      } else add(`unknown expect ${item.type}`, false);
    }
    return { id: caseDef.id, pass: results.every((r) => r.pass), results, changed };
  }

  return { diffPaths, fillLuminance, hexLuminance, allowedPrefixes, evaluate };
});
