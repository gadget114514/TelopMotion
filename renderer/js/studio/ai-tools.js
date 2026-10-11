(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.SA = root.SA || {};
    root.SA.aiTools = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // The AI Assistant's side of the project: a compact digest for the model, a
  // JSON-pointer patch applier, and the tool set the model works with. All of
  // it is pure - the model only ever edits a working copy; the Studio replays
  // the accepted ops onto the live project as one undo step.

  // what the model must not write: identity, version and the media / dataset
  // blobs (those point into the app's own storage)
  const PROTECTED = new Set(['format', 'version', 'media', 'dataset']);
  const BAD_SEGMENT = new Set(['__proto__', 'prototype', 'constructor']);
  const READ_MAX = 12000;

  const clone = (value) => JSON.parse(JSON.stringify(value));

  function parsePath(path) {
    if (typeof path !== 'string' || path[0] !== '/') throw new Error('path must start with "/"');
    const parts = path.split('/').slice(1).map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'));
    if (!parts.length || parts.some((part) => part === '' || BAD_SEGMENT.has(part))) throw new Error(`bad path: ${path}`);
    return parts;
  }

  function walk(doc, parts, create) {
    let node = doc;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const key = parts[i];
      let next = node != null && typeof node === 'object' ? node[key] : undefined;
      if (next === undefined || next === null) {
        if (!create) throw new Error(`no such path: /${parts.slice(0, i + 1).join('/')}`);
        next = /^\d+$/.test(parts[i + 1]) ? [] : {};
        node[key] = next;
      }
      if (typeof next !== 'object') throw new Error(`not a container: /${parts.slice(0, i + 1).join('/')}`);
      node = next;
    }
    return node;
  }

  // ops: { op: 'set' | 'remove' | 'insert', path, value }
  //   set     replaces (or creates) the value at path
  //   remove  deletes the key / array element
  //   insert  inserts into an array at the index in path (use "-" to append)
  function applyOps(doc, ops) {
    if (!Array.isArray(ops)) throw new Error('ops must be an array');
    for (const op of ops) {
      if (!op || typeof op !== 'object') throw new Error('bad op');
      const parts = parsePath(op.path);
      if (PROTECTED.has(parts[0])) throw new Error(`${parts[0]} is read-only`);
      const last = parts[parts.length - 1];
      const parent = walk(doc, parts, op.op !== 'remove');
      if (op.op === 'set') {
        if (!('value' in op)) throw new Error('set needs a value');
        if (Array.isArray(parent)) {
          const index = last === '-' ? parent.length : Number(last);
          if (!Number.isInteger(index) || index < 0 || index > parent.length) throw new Error(`bad index: ${op.path}`);
          parent[index] = clone(op.value);
        } else parent[last] = clone(op.value);
      } else if (op.op === 'remove') {
        if (Array.isArray(parent)) {
          const index = Number(last);
          if (!Number.isInteger(index) || index < 0 || index >= parent.length) throw new Error(`bad index: ${op.path}`);
          parent.splice(index, 1);
        } else {
          if (!(last in parent)) throw new Error(`no such key: ${op.path}`);
          delete parent[last];
        }
      } else if (op.op === 'insert') {
        if (!Array.isArray(parent)) throw new Error(`not an array: ${op.path}`);
        const index = last === '-' ? parent.length : Number(last);
        if (!Number.isInteger(index) || index < 0 || index > parent.length) throw new Error(`bad index: ${op.path}`);
        parent.splice(index, 0, clone(op.value));
      } else throw new Error(`unknown op: ${op.op}`);
    }
    return doc;
  }

  function readPath(doc, path) {
    if (path === '/' || path === '' || path == null) return doc;
    let node = doc;
    for (const part of parsePath(path)) {
      if (node == null || typeof node !== 'object' || !(part in node)) throw new Error(`no such path: ${path}`);
      node = node[part];
    }
    return node;
  }

  function digest(project) {
    const cues = (project.script && project.script.cues) || [];
    const round = (n) => Math.round(Number(n) * 100) / 100;
    return {
      meta: project.meta,
      output: project.output,
      cueCount: cues.length,
      cues: cues.slice(0, 200).map((cue) => ({ id: cue.id, start: round(cue.start), end: round(cue.end), text: String(cue.text || '').slice(0, 120) })),
      tracks: (project.tracks || []).map((track) => ({ id: track.id, kind: track.kind, name: track.name })),
      clips: (project.clips || []).slice(0, 200).map((clip) => ({
        id: clip.id, trackId: clip.trackId, start: round(clip.start), end: round(clip.end), type: clip.spec && clip.spec.type,
      })),
      style: project.style,
      styleMode: project.styleMode,
      credits: project.credits && { title: project.credits.title, artist: project.credits.artist },
      topLevelKeys: Object.keys(project),
    };
  }

  // Where the user is looking: the playhead and the selection, resolved to the
  // cue / beat they point at, so "this beat" / "the selected line" means
  // something to the model. Selection paths look like cue:<id>/beat:<id>/...
  function focus(project, view) {
    const time = Number(view && view.playhead) || 0;
    const cues = (project.script && project.script.cues) || [];
    const round = (n) => Math.round(Number(n) * 100) / 100;
    const brief = (cue) => (cue ? { id: cue.id, start: round(cue.start), end: round(cue.end), text: String(cue.text || '').slice(0, 120) } : null);
    const cue = cues.find((c) => time >= c.start && time < c.end) || null;
    let beat = null;
    if (cue) {
      const list = (project.beats && project.beats[cue.id]) || [];
      const hit = list.find((b) => time >= b.start && time < b.end) || list[0] || null;
      if (hit) beat = { id: hit.id, kind: hit.kind, start: round(hit.start), end: round(hit.end), text: String(hit.text || '').slice(0, 120) };
    }
    const selection = ((view && view.selection) || []).slice(0, 20).map((path) => {
      const cueId = (/cue:([^/]+)/.exec(path) || [])[1] || null;
      const beatId = (/beat:([^/]+)/.exec(path) || [])[1] || null;
      return { path, cueId, beatId };
    });
    return {
      playhead: round(time),
      cueAtPlayhead: brief(cue),
      beatAtPlayhead: beat,
      selection,
      where: {
        beatLook: beat ? `/beatStyles/${beat.id}` : null,
        cueLook: cue ? `/cueStyles/${cue.id}` : null,
        rootLook: '/style',
      },
    };
  }

  function listEffects(fx, group) {
    if (!fx || typeof fx.list !== 'function') return { error: 'effect registry unavailable' };
    const groups = group ? [group] : Array.from(fx.groups ? fx.groups.keys() : []);
    const out = {};
    for (const name of groups) {
      out[name] = fx.list(name).map((entry) => ({
        type: entry.type,
        params: (entry.params || []).map((p) => ({ key: p.key, default: p.default, min: p.min, max: p.max })),
      }));
    }
    return out;
  }

  const TOOLS = [
    {
      name: 'get_overview',
      description: 'Compact digest of the current project: meta, output, cues (id, time, text), tracks, clips, root style.',
      input_schema: { type: 'object', properties: {} },
    },
    {
      name: 'read_json',
      description: 'Read one subtree of the project JSON by JSON pointer (e.g. /cueStyles/<cueId>, /clips/3, /beats/<cueId>). Output is truncated.',
      input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    },
    {
      name: 'resolved_style',
      description: 'The effective (merged) look of one element, as the renderer sees it. element is a path like cue:<cueId>/beat:<beatId>. Read this before changing a look; layers merge as style -> cueStyles[cue] -> beatKindStyle[kind] -> beatStyles[beat] -> overrides.',
      input_schema: { type: 'object', properties: { element: { type: 'string' } }, required: ['element'] },
    },
    {
      name: 'list_effects',
      description: 'List the effect types and their parameters for a group (animation, layout, enter, exit, hold, location, fill, edge, post, background, color...). Omit group for all.',
      input_schema: { type: 'object', properties: { group: { type: 'string' } } },
    },
    {
      name: 'apply_patch',
      description: 'Edit the working copy of the project. Ops are applied in order and validated as a whole; on error nothing is changed. op: set | remove | insert; path is a JSON pointer ("-" appends to an array). format, version, media and dataset cannot be written.',
      input_schema: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'One sentence describing the change, in the language of the user.' },
          ops: {
            type: 'array',
            items: {
              type: 'object',
              properties: { op: { type: 'string', enum: ['set', 'remove', 'insert'] }, path: { type: 'string' }, value: {} },
              required: ['op', 'path'],
            },
          },
        },
        required: ['ops'],
      },
    },
  ];

  // A working session over one project. `migrate` is SA.project.migrate: every
  // patch has to survive the same pass the Studio applies when opening a file.
  function createSession(project, deps) {
    const migrate = deps && deps.migrate;
    const fx = deps && deps.fx;
    const resolveStyle = deps && deps.resolveStyle;
    let view = null;
    let work = clone(project);
    const applied = []; // every accepted op, in order
    const summaries = [];

    function run(name, input) {
      try {
        if (name === 'get_overview') return { ok: true, result: { focus: view ? focus(work, view) : null, ...digest(work) } };
        if (name === 'resolved_style') {
          if (typeof resolveStyle !== 'function') throw new Error('resolveStyle unavailable');
          return { ok: true, result: resolveStyle(work, String(input && input.element)) };
        }
        if (name === 'read_json') {
          const text = JSON.stringify(readPath(work, input && input.path));
          return { ok: true, result: text === undefined ? null : text.length > READ_MAX ? `${text.slice(0, READ_MAX)}...(truncated, ${text.length} chars)` : JSON.parse(text) };
        }
        if (name === 'list_effects') return { ok: true, result: listEffects(fx, input && input.group) };
        if (name === 'apply_patch') {
          const ops = input && input.ops;
          const next = applyOps(clone(work), ops);
          if (migrate) {
            const verdict = migrate(clone(next));
            if (!verdict || !verdict.ok) throw new Error(`project invalid after patch: ${(verdict && verdict.error) || 'unknown'}`);
          }
          work = next;
          applied.push(...ops);
          if (input.summary) summaries.push(String(input.summary).slice(0, 300));
          return { ok: true, result: { applied: ops.length } };
        }
        return { ok: false, error: `unknown tool: ${name}` };
      } catch (error) {
        return { ok: false, error: error.message };
      }
    }

    return {
      run,
      setView: (next) => { view = next || null; },
      focus: () => (view ? focus(work, view) : null),
      ops: () => applied.slice(),
      summaries: () => summaries.slice(),
      work: () => work,
    };
  }

  return { TOOLS, PROTECTED, applyOps, readPath, digest, focus, listEffects, createSession };
});
