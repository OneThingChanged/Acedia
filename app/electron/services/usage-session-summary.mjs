import { createHash } from 'node:crypto';
import { baselineCost, PRICE_BASIS } from '../usage-collector/pricing.mjs';
import { matchesSessionFilter, projectSessionRuntime } from '../shared/session-state.mjs';

export const SESSION_USAGE_FIELDS = ['events', 'inputTokens', 'cacheReadTokens', 'cacheWriteTokens',
  'outputTokens', 'reasoningOutputTokens', 'totalTokens', 'baselineUsd', 'pricedEvents', 'unpricedEvents'];
export function emptySessionUsage() { return Object.fromEntries(SESSION_USAGE_FIELDS.map(key => [key, 0])); }
export function addSessionUsage(target, source) {
  for (const key of SESSION_USAGE_FIELDS) target[key] += Number(source?.[key]) || 0;
  return target;
}

// A folder identifies a workspace, not a conversation. Keep ambiguous IDs
// unresolved rather than assigning a transcript to the first sibling session.
export function sessionUsageOwners(agents) {
  const owners = new Map();
  for (const agent of agents) {
    const accountSessions = agent.aiToolId === 'codex' ? agent.codexAccountSessions
      : agent.aiToolId === 'claude' ? agent.claudeAccountSessions : null;
    const ids = [agent.lastSessionId, agent.idleResumeSessionId,
      agent.sessionHierarchy?.resumeContext?.sessionId, ...Object.values(accountSessions || {})];
    for (const id of new Set(ids.filter(value => typeof value === 'string' && value))) {
      const key = JSON.stringify([agent.aiToolId, id]);
      if (!owners.has(key)) owners.set(key, agent);
      else if (owners.get(key)?.id !== agent.id) owners.set(key, null);
    }
  }
  return owners;
}

export function sessionUsageRange(value = 'today', now = Date.now()) {
  if (!['today', 'week', 'month', 'all'].includes(value)) throw new RangeError('Invalid session usage range');
  const end = new Date(now), start = new Date(now), recent = new Date(now);
  if (!Number.isFinite(end.getTime())) throw new RangeError('Invalid session usage date');
  start.setHours(0, 0, 0, 0); end.setHours(0, 0, 0, 0); end.setDate(end.getDate() + 1);
  recent.setHours(0, 0, 0, 0); recent.setDate(recent.getDate() - 6);
  if (value === 'week') start.setDate(start.getDate() - 6);
  if (value === 'month') start.setDate(1);
  const dateKey = date => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')].join('-');
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(recent); day.setDate(day.getDate() + index); return dateKey(day);
  });
  return { name: value, startAt: value === 'all' ? null : start.getTime(), endAt: end.getTime(),
    startDate: value === 'all' ? null : dateKey(start), endDate: dateKey(new Date(now)),
    recentStartAt: recent.getTime(), days };
}

export function sessionUsageSummary(database, catalog, selection = {}, options = {}) {
  const range = sessionUsageRange(selection.range, options.now);
  const provider = selection.provider || 'all';
  if (!['all', 'codex', 'claude'].includes(provider)) throw new RangeError('Invalid session usage provider');
  const agents = catalog.agents || [], projects = catalog.projects || [];
  const owners = sessionUsageOwners(agents), agentsById = new Map(agents.map(agent => [agent.id, agent]));
  const projectNames = new Map(projects.map(project => [project.id, project.name]));
  const liveIds = new Set(options.activeIds || []), rows = new Map();
  const historicalId = row => 'history:' + createHash('sha256').update(JSON.stringify([
    row.tool, row.sessionId || row.sourceIdentity || row.agentId || 'unknown',
  ])).digest('hex').slice(0, 24);
  const registeredRow = agent => {
    const runtime = projectSessionRuntime(agent, liveIds.has(agent.id));
    return { id: 'agent:' + agent.id, agentId: agent.id, name: agent.name || agent.id,
      projectId: agent.projectId || null, projectName: projectNames.get(agent.projectId) || '',
      provider: provider === 'all' ? agent.aiToolId : provider, registered: true,
      status: matchesSessionFilter(runtime, 'sleeping') ? 'sleeping'
        : matchesSessionFilter(runtime, 'active') ? 'active' : 'inactive',
      parentId: null, collectionSupported: !agent.sshHostId && ['codex', 'claude'].includes(agent.aiToolId),
      totals: emptySessionUsage(), models: new Map(), daily: new Map(), conversations: new Set() };
  };
  for (const agent of agents) {
    if (provider === 'all' || agent.aiToolId === provider) rows.set('agent:' + agent.id, registeredRow(agent));
  }
  function getRow(group) {
    const trusted = ['session', 'hook'].includes(group.ownerKind) && group.agentId;
    const current = owners.get(JSON.stringify([group.tool, group.sessionId]));
    const ownerId = trusted ? group.agentId : current?.id;
    const id = ownerId ? 'agent:' + ownerId : historicalId(group);
    if (!rows.has(id)) {
      const agent = ownerId && agentsById.get(ownerId);
      rows.set(id, agent ? registeredRow(agent) : {
        id, agentId: ownerId || null, name: ownerId ? group.agentName || ownerId : group.sessionId || 'Unknown conversation',
        projectId: group.projectId || null, projectName: projectNames.get(group.projectId) || group.projectName || '',
        provider: group.tool, registered: false, status: 'past', parentId: null,
        collectionSupported: true, totals: emptySessionUsage(), models: new Map(), daily: new Map(), conversations: new Set(),
      });
    }
    return rows.get(id);
  }
  function groupTotals(group) {
    const totals = emptySessionUsage();
    for (const key of SESSION_USAGE_FIELDS) if (group[key] != null) totals[key] = Number(group[key]) || 0;
    const cost = group.rawKind === 'codex_token_count_v2' ? baselineCost({ provider: group.tool,
      model: group.model, input: totals.inputTokens, cacheRead: totals.cacheReadTokens,
      output: totals.outputTokens, reasoning: totals.reasoningOutputTokens }) : null;
    if (cost == null) totals.unpricedEvents = totals.events;
    else { totals.baselineUsd = cost; totals.pricedEvents = totals.events; }
    return totals;
  }
  const revision = database.prepare('SELECT total_changes() revision').get().revision;
  const cacheKey = JSON.stringify([revision, provider, range.startAt, range.endAt, range.recentStartAt]);
  let groups = options.cache?.get(cacheKey);
  if (!groups) {
    const query = (startAt, daily) => {
      const parameters = [range.endAt / 1000];
      const clauses = ['ts < ?'];
      if (startAt != null) { clauses.push('ts >= ?'); parameters.push(startAt / 1000); }
      if (provider !== 'all') { clauses.push('tool = ?'); parameters.push(provider); }
      return database.prepare(`SELECT agent_id agentId, agent_name agentName, session_id sessionId,
        CASE WHEN session_id IS NULL THEN source_path ELSE NULL END sourceIdentity,
        project_id projectId, project_name projectName, tool, model, raw_kind rawKind, owner_kind ownerKind,
        ${daily ? "strftime('%Y-%m-%d',ts,'unixepoch','localtime')" : "''"} day,
        COUNT(*) events, SUM(input_tokens) inputTokens, SUM(cache_read_tokens) cacheReadTokens,
        SUM(cache_write_tokens) cacheWriteTokens, SUM(output_tokens) outputTokens,
        SUM(reasoning_output_tokens) reasoningOutputTokens, SUM(total_tokens) totalTokens
        FROM usage_events WHERE ${clauses.join(' AND ')}
        GROUP BY agent_id,session_id,sourceIdentity,project_id,tool,model,raw_kind,owner_kind,day`).all(...parameters);
    };
    groups = { totals: query(range.startAt, false), daily: query(range.recentStartAt, true) };
    if (options.cache) {
      if (options.cache.size >= 4) options.cache.clear();
      options.cache.set(cacheKey, groups);
    }
  }
  for (const group of groups.totals) {
    const row = getRow(group), totals = groupTotals(group);
    addSessionUsage(row.totals, totals);
    const modelKey = JSON.stringify([group.tool, group.model]);
    if (!row.models.has(modelKey)) row.models.set(modelKey, { provider: group.tool,
      model: group.model || null, ...emptySessionUsage() });
    addSessionUsage(row.models.get(modelKey), totals);
    if (group.sessionId) row.conversations.add(JSON.stringify([group.tool, group.sessionId]));
  }
  for (const group of groups.daily) {
    const row = getRow(group);
    if (!row.daily.has(group.day)) row.daily.set(group.day, emptySessionUsage());
    addSessionUsage(row.daily.get(group.day), groupTotals(group));
  }
  const visible = [...rows.values()].filter(row => row.registered || row.totals.events > 0);
  const visibleIds = new Set(visible.map(row => row.id));
  for (const row of visible) {
    const agent = row.registered && agentsById.get(row.agentId);
    const parent = agent && agentsById.get(agent.sessionHierarchy?.parentId);
    const parentId = parent && parent.projectId === agent.projectId ? 'agent:' + parent.id : null;
    if (parentId !== row.id && visibleIds.has(parentId)) row.parentId = parentId;
  }
  // Catalog data can come from older peers. Break cycles before exposing a tree.
  const visibleById = new Map(visible.map(row => [row.id, row]));
  for (const row of visible) {
    const visited = new Set([row.id]); let parent = row.parentId;
    while (parent) {
      if (visited.has(parent)) { row.parentId = null; break; }
      visited.add(parent); parent = visibleById.get(parent)?.parentId;
    }
  }
  const total = emptySessionUsage();
  const sessions = visible.map(row => {
    addSessionUsage(total, row.totals);
    return { ...row, models: [...row.models.values()], conversationCount: row.conversations.size,
      conversations: undefined, daily: range.days.map(day => ({ day, ...(row.daily.get(day) || emptySessionUsage()) })) };
  });
  return { range, pricing: PRICE_BASIS, projects: [...new Map([
    ...projects.map(project => [project.id, { id: project.id, name: project.name }]),
    ...sessions.filter(row => row.projectId).map(row => [row.projectId, { id: row.projectId, name: row.projectName }]),
  ]).values()], sessions, totals: total };
}
