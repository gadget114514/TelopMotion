(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./ai-tools.js') : root.SA.aiTools);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.SA = root.SA || {};
    root.SA.aiAgent = api;
  }
})(typeof self !== 'undefined' ? self : this, function (aiTools) {
  'use strict';

  // The model loop, shared by the Studio dialog and the evaluation runner
  // (scripts/ai-eval.js): the same prompt, the same tools, the same stopping
  // rules - so what is measured is what ships. It knows nothing about the DOM
  // or the network; `request(payload)` is injected (IPC in the app, fetch in the
  // runner) and `captureFrame(t)` is optional.

  const MAX_TURNS = 10;

  const SYSTEM = [
    'You are the AI Assistant inside TelopMotion, a lyric-video / kinetic-typography studio.',
    'The user asks you to improve the motion design of their project. A project is one JSON document (script.cues = lyric lines with start/end seconds, style / cueStyles / beats / clips / tracks describe the look).',
    'Work like this: call get_overview first; read_json the exact subtree you want to change before editing it; call list_effects before you set an effect type or parameter, and only use types and parameter keys it returns.',
    'Each user message starts with a [view] block: the playhead time, the cue / beat under it and the current selection. "this beat", "here", "the selected line" refer to that. If a selection exists it wins over the playhead.',
    'Looks are layered: style -> cueStyles[cueId] -> beatKindStyle[kind] -> beatStyles[beatId] -> overrides. To change one beat, write only the differing keys under /beatStyles/<beatId>; for a whole cue use /cueStyles/<cueId>. Call resolved_style first to see what is in effect now, and change the keys that actually produce the result (e.g. colors, fill, brightness-related params).',
    'Edit with apply_patch using small, targeted ops (JSON pointer paths). Never invent paths you have not read. Do not touch format, version, media or dataset. Do not change lyric text or timing unless the user asks for it.',
    'Stay inside the scope the user named. A request about one beat must not change other beats or cues.',
    'If capture_frame is available, look at a frame to judge legibility, balance and colour before you reason about a change.',
    'The renderer is deterministic and seeded; do not try to add randomness.',
    'When you are done, reply with a short summary of what you changed and why, in the language of the user. If you changed nothing, say why.',
  ].join('\n');

  function toolList(canShoot) {
    const tools = aiTools.TOOLS.slice();
    if (canShoot) {
      tools.push({
        name: 'capture_frame',
        description: 'Render the CURRENT project (before your pending patch) at time t seconds and return it as an image.',
        input_schema: { type: 'object', properties: { t: { type: 'number' } }, required: ['t'] },
      });
    }
    return tools;
  }

  // One user request: model call -> tool results -> model call ... until the
  // model stops. `history` is extended in place.
  async function run(options) {
    const { request, model, history, session, captureFrame } = options;
    const hooks = options.hooks || {};
    const canShoot = typeof captureFrame === 'function';
    const tools = toolList(canShoot);
    const trace = [];
    const usage = { input: 0, output: 0, calls: 0 };
    const maxTurns = options.maxTurns || MAX_TURNS;
    for (let turn = 0; turn < maxTurns; turn += 1) {
      if (hooks.cancelled && hooks.cancelled()) return { cancelled: true, trace, usage };
      const reply = await request({ model, system: SYSTEM, messages: history, tools, max_tokens: 4096 });
      usage.calls += 1;
      if (reply.usage) {
        usage.input += reply.usage.input_tokens || 0;
        usage.output += reply.usage.output_tokens || 0;
      }
      history.push({ role: 'assistant', content: reply.content });
      let text = '';
      for (const block of reply.content || []) {
        if (block.type === 'text' && block.text) {
          text += block.text;
          if (hooks.say) hooks.say('assistant', block.text);
        }
      }
      const uses = (reply.content || []).filter((block) => block.type === 'tool_use');
      if (reply.stop_reason !== 'tool_use' || !uses.length) return { done: true, text, trace, usage };
      const results = [];
      for (const use of uses) {
        if (hooks.say) hooks.say('tool', use.name);
        let content;
        let ok = true;
        if (use.name === 'capture_frame') {
          let data = null;
          try {
            data = canShoot ? captureFrame(use.input && use.input.t) : null;
          } catch {
            data = null;
          }
          ok = !!data;
          content = data ? [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } }] : 'capture failed';
        } else {
          const out = session.run(use.name, use.input);
          ok = out.ok;
          content = JSON.stringify(out.ok ? out.result : { error: out.error });
          if (!out.ok && hooks.say) hooks.say('error', `${use.name}: ${out.error}`);
        }
        trace.push({ turn, name: use.name, ok });
        results.push({ type: 'tool_result', tool_use_id: use.id, content });
      }
      history.push({ role: 'user', content: results });
    }
    return { done: true, truncated: true, trace, usage };
  }

  return { SYSTEM, MAX_TURNS, toolList, run };
});
