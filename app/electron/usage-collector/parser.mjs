// Reads usage metadata only; no prompt, response, tool input, cwd or credential is exported.
import { hash } from './protocol.mjs';
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
export function parseUsage(item, state, offset) {
  if (state.provider === 'codex') {
    if (item.type === 'session_meta') {
      if (state.sessionId && state.sessionId !== item.payload?.id) { state.cumulative = null; state.segment = (state.segment || 0) + 1; }
      state.sessionId = item.payload?.id || state.sessionId;
    }
    if (item.type === 'turn_context') {
      state.model = item.payload?.model || null;
      state.effort = item.payload?.effort || item.payload?.reasoning_effort || null;
      state.fast = typeof item.payload?.fast === 'boolean' ? item.payload.fast : item.payload?.service_tier === 'priority' ? true : item.payload?.service_tier === 'default' ? false : null;
    }
    const call = item.type === 'response_item' && item.payload;
    if (call && ['function_call', 'custom_tool_call'].includes(call.type) && ['exec', 'exec_command', 'functions.exec', 'functions.exec_command', 'read_file'].includes(call.name)) {
      let source = call.input || call.arguments || '';
      try { const args = JSON.parse(source); source = args.cmd || args.command || args.path || source; } catch {}
      // Only explicit read commands, never prose, installed lists or search results.
      const pattern = /(?:Get-Content|cat|read_file)\s+(?:-LiteralPath\s+|-Path\s+)?["']?([^"'\r\n;|]*?[\\/]([a-zA-Z0-9_.-]+)[\\/]SKILL\.md)\b/gi;
      for (const match of String(source).matchAll(pattern)) {
        const occurredAt = Date.parse(item.timestamp);
        if (!Number.isFinite(occurredAt) || !call.call_id) continue;
        state.skills ||= [];
        const observation = { id: hash(`${state.sessionId}:${call.call_id}:${match[2]}`), name: match[2], occurredAt, evidence: 'skill_read_request' };
        if (!state.skills.some(s => s.id === observation.id)) state.skills.push(observation);
      }
    }
    if (item.type !== 'event_msg' || item.payload?.type !== 'token_count') return null;
    const u = item.payload.info?.last_token_usage;
    if (!u || !state.sessionId) return null;
    const cumulative = count(item.payload.info?.total_token_usage?.total_tokens);
    if (cumulative !== null && cumulative === state.cumulative) return null;
    if (cumulative !== null && state.cumulative != null && cumulative < state.cumulative) state.segment = (state.segment || 0) + 1;
    state.cumulative = cumulative;
    const input = count(u.input_tokens), output = count(u.output_tokens), cacheRead = count(u.cached_input_tokens), reasoning = count(u.reasoning_output_tokens);
    if (input === null || output === null) return null;
    if ((cacheRead !== null && cacheRead > input) || (reasoning !== null && reasoning > output)) return null;
    const total = count(u.total_tokens) ?? input + output;
    return event(item, state, cumulative === null ? `${item.timestamp}:${offset}` : `${state.segment || 0}:${cumulative}`, {
      input: cacheRead === null ? null : Math.max(0, input - cacheRead),
      output: reasoning === null ? null : Math.max(0, output - reasoning),
      cacheRead, cacheWrite: null, reasoning, total,
    });
  }
  state.sessionId = item.sessionId || state.sessionId;
  const u = item.message?.usage;
  if (!u || !state.sessionId) return null;
  const input = count(u.input_tokens), output = count(u.output_tokens), cacheRead = count(u.cache_read_input_tokens), cacheWrite = count(u.cache_creation_input_tokens);
  if (input === null || output === null) return null;
  state.model = item.message?.model || state.model;
  return event(item, state, item.requestId || item.message?.id || item.uuid || offset, {
    input, output, cacheRead, cacheWrite, reasoning: null, total: input + output + (cacheRead || 0) + (cacheWrite || 0),
  });
}
function event(item, state, key, counts) {
  const occurredAt = Date.parse(item.timestamp);
  if (!Number.isFinite(occurredAt) || counts.total <= 0) return null;
  return { id: hash(`${state.provider}:${state.sessionId}:${key}`), provider: state.provider, sessionId: state.sessionId,
    model: state.model || null, effort: state.effort || null, fast: state.fast ?? null, skills: (state.skills || []).splice(0, 100), occurredAt, ...counts };
}
