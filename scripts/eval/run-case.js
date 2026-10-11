'use strict';

// Node-side harness for the AI Assistant evaluation: loads the same modules the
// Studio uses (tools, agent loop, effect registry, fx axes, project) and runs
// one case through them with an injected `request` - the real API in
// scripts/ai-eval.js, a scripted fake in the tests.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

function loadEnv() {
  globalThis.window = globalThis;
  const effectsDir = path.join(ROOT, 'renderer/js/lyrics/effects');
  const fx = require(path.join(effectsDir, 'registry.js'));
  for (const file of fs.readdirSync(effectsDir)) {
    if (file !== 'registry.js' && file.endsWith('.js')) require(path.join(effectsDir, file));
  }
  return {
    fx,
    project: require(path.join(ROOT, 'renderer/js/studio/project.js')),
    fxAxes: require(path.join(ROOT, 'renderer/js/lyrics/fx-axes.js')),
    aiTools: require(path.join(ROOT, 'renderer/js/studio/ai-tools.js')),
    aiAgent: require(path.join(ROOT, 'renderer/js/studio/ai-agent.js')),
    aiEval: require(path.join(ROOT, 'renderer/js/studio/ai-eval.js')),
  };
}

function loadFixture(env, relPath) {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, relPath), 'utf8'));
  const migrated = env.project.migrate(raw);
  if (!migrated.ok) throw new Error(`fixture ${relPath}: ${migrated.error}`);
  return migrated.project;
}

// Resolve a case's `view` against the project: the playhead and the selection
// the model is told about, exactly like the dialog does.
function viewFor(caseDef, doc) {
  const spec = caseDef.view || {};
  const cues = (doc.script && doc.script.cues) || [];
  const cue = spec.cue ? cues.find((c) => c.id === spec.cue) : null;
  const playhead = cue ? cue.start + Math.min(0.1, (cue.end - cue.start) / 2) : Number(spec.playhead) || 0;
  const selection = [];
  if (cue && spec.select) {
    const beat = ((doc.beats && doc.beats[cue.id]) || [])[0];
    selection.push(spec.select === 'beat' && beat ? `cue:${cue.id}/beat:${beat.id}` : `cue:${cue.id}`);
  }
  return { playhead, selection, cueId: cue ? cue.id : null };
}

// -> { id, pass, results, changed, text, usage, trace, ops }
async function runCase(env, caseDef, options) {
  const doc = options.project || loadFixture(env, caseDef.fixture);
  const before = JSON.parse(JSON.stringify(doc));
  const view = viewFor(caseDef, doc);
  const session = env.aiTools.createSession(doc, { migrate: env.project.migrate, fx: env.fx, resolveStyle: env.project.resolveStyle });
  session.setView({ playhead: view.playhead, selection: view.selection });
  const history = [{ role: 'user', content: `[view] ${JSON.stringify(session.focus())}\n\n${caseDef.prompt}` }];
  let outcome;
  let error = null;
  try {
    outcome = await env.aiAgent.run({ request: options.request, model: options.model, history, session, maxTurns: options.maxTurns });
  } catch (err) {
    error = err;
  }
  const after = session.work();
  const scored = env.aiEval.evaluate(caseDef, {
    before,
    after,
    ops: session.ops(),
    text: outcome && outcome.text,
    resolveStyle: env.project.resolveStyle,
    fxAxes: env.fxAxes,
    migrate: env.project.migrate,
    view,
  });
  if (error) {
    scored.results.unshift({ name: 'run', pass: false, detail: error.message });
    scored.pass = false;
  } else if (outcome && outcome.truncated) {
    scored.results.unshift({ name: 'finished', pass: false, detail: 'stopped after too many steps' });
    scored.pass = false;
  }
  return {
    ...scored,
    prompt: caseDef.prompt,
    text: (outcome && outcome.text) || '',
    usage: (outcome && outcome.usage) || null,
    trace: (outcome && outcome.trace) || [],
    ops: session.ops(),
    summaries: session.summaries(),
  };
}

module.exports = { ROOT, loadEnv, loadFixture, viewFor, runCase };
