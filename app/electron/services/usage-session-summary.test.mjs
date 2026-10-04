import { afterEach, describe, expect, it } from 'vitest';
import { UsageService } from './usage-service.mjs';
import { sessionUsageSummary, sessionUsageOwners, sessionUsageRange } from './usage-session-summary.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const services = [];
const now = new Date(2026, 9, 5, 12).getTime();
afterEach(() => { for (const service of services.splice(0)) service.close(); });
function fixture() {
  const service = new UsageService(':memory:', { scan: async () => [] }); services.push(service);
  service.syncCatalog([{ id: 'p', name: 'Project', folder: 'C:/shared' }], [
    { id: 'a', name: 'Parent', projectId: 'p', folder: 'C:/shared', aiToolId: 'codex', lastSessionId: 'a-current', codexAccountSessions: { old: 'a-old' } },
    { id: 'b', name: 'Child', projectId: 'p', folder: 'C:/shared', aiToolId: 'codex', lastSessionId: 'b-current', sessionHierarchy: { parentId: 'a' } },
    { id: 'c', name: 'Claude child', projectId: 'p', aiToolId: 'claude', lastSessionId: 'c-current', sessionHierarchy: { parentId: 'a' }, deferredStart: true, resumeEligible: true },
  ]);
  let sequence = 0;
  const insert = service.db().prepare(`INSERT INTO usage_events (source_key,ts,project_id,project_name,agent_id,agent_name,session_id,tool,model,
    input_tokens,cache_read_tokens,cache_write_tokens,output_tokens,reasoning_output_tokens,total_tokens,raw_kind,owner_kind)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const add = (event = {}) => {
    const dims = [event.input ?? 100000, event.cache ?? 300000, event.cacheWrite ?? 0, event.output ?? 10000, event.reasoning ?? 2000];
    insert.run('event-' + sequence++, (event.ts ?? now) / 1000, event.projectId ?? 'p', 'Old project name',
      event.agentId ?? 'a', event.agentName ?? 'Old agent name', event.sessionId ?? 'a-current',
      event.tool ?? 'codex', event.model ?? 'gpt-5.5', ...dims, dims.reduce((a, b) => a + b, 0),
      event.rawKind ?? 'codex_token_count_v2', event.ownerKind ?? null);
  };
  const read = (selection = {}, options = {}) => sessionUsageSummary(service.db(), service.catalog, selection, { now, ...options });
  return { service, add, read };
}

describe('session usage accounting', () => {
  it('corrects folder-only legacy ownership by exact conversation ID and preserves unknown history', () => {
    const { service, add, read } = fixture();
    add({ sessionId: 'b-current', agentId: 'a' });
    add({ sessionId: 'orphan', agentId: 'a' });
    const result = read();
    expect(result.sessions.find(row => row.agentId === 'a').totals.events).toBe(0);
    expect(result.sessions.find(row => row.agentId === 'b')).toMatchObject({ parentId: 'agent:a', name: 'Child', totals: { events: 1 } });
    expect(result.sessions.find(row => !row.registered)).toMatchObject({ agentId: null, name: 'orphan', totals: { events: 1 } });
    expect(result.totals).toMatchObject({ events: 2, totalTokens: 824000 });
    expect(service.ownerFor({ sessionId: 'another-orphan', cwd: 'C:/shared' }, 'codex').agent.id).toBe('codex:another-orphan');
  });
  it('combines known account conversations and durable hook ownership using each recorded model', () => {
    const { add, read } = fixture();
    add({ sessionId: 'a-old' });
    add({ sessionId: 'after-reset', ownerKind: 'hook', model: 'gpt-5.4', cacheWrite: 8000 });
    const parent = read().sessions.find(row => row.agentId === 'a');
    expect(parent.conversationCount).toBe(2);
    expect(parent.totals).toMatchObject({ events: 2, totalTokens: 832000, pricedEvents: 2, unpricedEvents: 0 });
    expect(parent.totals.baselineUsd).toBeCloseTo(1.515);
    expect(parent.models.map(row => row.model).sort()).toEqual(['gpt-5.4', 'gpt-5.5']);
  });
  it('keeps removed sessions, unpriced records and known zero costs distinct', () => {
    const { add, read } = fixture();
    add({ agentId: 'removed', sessionId: 'old', ownerKind: 'session', model: 'unsupported' });
    add({ sessionId: 'c-current', tool: 'claude', model: 'claude-model', rawKind: 'claude_message_usage' });
    add({ input: 0, cache: 0, output: 0, reasoning: 0 });
    const result = read();
    expect(result.sessions.find(row => row.agentId === 'removed')).toMatchObject({ registered: false, status: 'past', totals: { unpricedEvents: 1, pricedEvents: 0 } });
    expect(result.sessions.find(row => row.agentId === 'c')).toMatchObject({ status: 'sleeping', totals: { unpricedEvents: 1 } });
    expect(result.sessions.find(row => row.agentId === 'a').totals).toMatchObject({ events: 1, pricedEvents: 1, baselineUsd: 0 });
    expect(result.totals).toMatchObject({ events: 3, pricedEvents: 1, unpricedEvents: 2, baselineUsd: 0 });
  });
  it('does not guess an owner when two sessions claim the same provider conversation', () => {
    const { service, add, read } = fixture();
    service.catalog.agents[1].lastSessionId = 'a-current';
    expect(sessionUsageOwners(service.catalog.agents).get(JSON.stringify(['codex', 'a-current']))).toBeNull();
    add();
    expect(read().sessions.filter(row => row.registered).every(row => row.totals.events === 0)).toBe(true);
  });
  it('uses local midnight boundaries, ignores future records and gives seven separate recent days', () => {
    const { add, read } = fixture(), todayStart = new Date(2026, 9, 5).getTime();
    add({ ts: todayStart - 1000 }); add({ ts: todayStart });
    add({ ts: new Date(2026, 9, 6).getTime() });
    expect(read().totals.events).toBe(1);
    expect(read({ range: 'week' }).totals.events).toBe(2);
    const parent = read().sessions.find(row => row.agentId === 'a');
    expect(parent.daily).toHaveLength(7);
    expect(parent.daily.reduce((sum, day) => sum + day.events, 0)).toBe(2);
    expect(parent.daily.at(-1).events).toBe(1);
  });
  it('filters providers before aggregation while keeping cross-provider parents out of the totals', () => {
    const { add, read } = fixture(); add(); add({ tool: 'claude', sessionId: 'c-current', model: 'claude', rawKind: 'claude_message_usage' });
    const result = read({ provider: 'claude' });
    expect(result.totals.events).toBe(1);
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]).toMatchObject({ agentId: 'c', parentId: null });
  });
  it('invalidates stored aggregate caches on new events and reads current catalog names and lifecycle', () => {
    const { service, add, read } = fixture(), cache = new Map(); add();
    expect(read({}, { cache }).totals.events).toBe(1);
    service.catalog.agents[0].name = 'Renamed';
    expect(read({}, { cache, activeIds: ['a'] }).sessions.find(row => row.agentId === 'a')).toMatchObject({ name: 'Renamed', status: 'active' });
    add(); expect(read({}, { cache }).totals.events).toBe(2);
  });
  it('breaks malformed parent cycles and never exposes transcript paths', () => {
    const { service, add, read } = fixture();
    service.catalog.agents[0].sessionHierarchy = { parentId: 'b' };
    add(); const result = read();
    const byId = new Map(result.sessions.map(row => [row.id, row]));
    for (const row of result.sessions) { const seen = new Set([row.id]); let parent = row.parentId;
      while (parent) { expect(seen.has(parent)).toBe(false); seen.add(parent); parent = byId.get(parent)?.parentId; } }
    expect(JSON.stringify(result)).not.toContain('C:/shared');
  });
  it('rejects unsupported range and provider selections', () => {
    const { read } = fixture();
    expect(() => read({ provider: 'wrong' })).toThrow(RangeError);
    expect(() => sessionUsageRange('wrong')).toThrow(RangeError);
  });
  it('aggregates the whole period beyond a recent-event limit', () => {
    const { add, read } = fixture();
    for (let index = 0; index < 620; index++) add({ sessionId: index % 2 ? 'a-current' : 'b-current' });
    const result = read();
    expect(result.totals).toMatchObject({ events: 620, totalTokens: 255440000, pricedEvents: 620 });
    expect(result.totals.baselineUsd).toBeCloseTo(626.2);
    expect(result.sessions.find(row => row.agentId === 'b').totals.events).toBe(310);
  });
  it('adds ownership metadata to an existing database while retaining legacy events', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-usage-migration-'));
    const file = path.join(directory, 'usage.db');
    const oldService = new UsageService(file, { scan: async () => [] });
    let next;
    try {
      oldService.db().prepare(`INSERT INTO usage_events (source_key,ts,agent_id,session_id,tool,total_tokens,raw_kind) VALUES ('legacy',?,'old-owner','unlinked','codex',17,'legacy')`).run(now / 1000);
      oldService.db().exec('ALTER TABLE usage_events DROP COLUMN owner_kind'); oldService.close();
      next = new UsageService(file, { scan: async () => [] });
      const result = sessionUsageSummary(next.db(), next.catalog, {}, { now });
      expect(result.totals).toMatchObject({ events: 1, totalTokens: 17, unpricedEvents: 1 });
      expect(result.sessions[0]).toMatchObject({ registered: false, agentId: null });
      expect(next.db().prepare('SELECT owner_kind FROM usage_events').get().owner_kind).toBeNull();
    } finally {
      oldService.close(); next?.close();
      if (path.dirname(directory) !== path.resolve(os.tmpdir())) throw new Error('Unexpected fixture directory');
      fs.rmSync(directory, { recursive: true });
    }
  });
  it('persists an exact hook link for already indexed records without counting them again', async () => {
    const { service, read } = fixture();
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-usage-owner-'));
    const file = path.join(directory, 'conversation.jsonl');
    try {
      fs.writeFileSync(file, [
        { type: 'session_meta', payload: { id: 'new-child-chat', cwd: 'C:/shared' } },
        { timestamp: new Date(now).toISOString(), type: 'event_msg', payload: { type: 'token_count', info: {
          last_token_usage: { input_tokens: 10, cached_input_tokens: 3, output_tokens: 2, total_tokens: 12 },
          total_token_usage: { total_tokens: 12 },
        } } },
      ].map(row => JSON.stringify(row)).join('\n') + '\n');
      await service.ingestFile({ path: file, sessionId: 'new-child-chat', cwd: 'C:/shared' }, 'codex');
      expect(read().sessions.find(row => !row.registered).totals.events).toBe(1);
      expect(await service.ingestHook('b', file, 'new-child-chat', 'C:/shared')).toBe(0);
      service.catalog.agents[1].lastSessionId = 'later-chat';
      expect(read().sessions.find(row => row.agentId === 'b').totals).toMatchObject({ events: 1, totalTokens: 12 });
      expect(read().totals.events).toBe(1);
      expect(service.db().prepare('SELECT owner_kind ownerKind FROM usage_events').get().ownerKind).toBe('hook');
    } finally {
      if (path.dirname(directory) !== path.resolve(os.tmpdir())) throw new Error('Unexpected fixture directory');
      fs.rmSync(directory, { recursive: true });
    }
  });
});
