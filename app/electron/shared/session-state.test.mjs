import { describe, expect, it } from 'vitest';
import { isAgentRuntimeActive } from '../../src/lib/agentActivity';
import { isStandbySession } from '../../src/lib/sessionStandby';
import { isSleepingSession, matchesSessionFilter, normalizeSessionFilter, projectSessionRuntime, sessionFilterCounts } from './session-state.mjs';

describe('Remote session lifecycle filters', () => {
  const sessions = [
    { status: 'running' }, { status: 'working' }, { status: 'waiting' },
    { status: 'blocked' }, { status: 'running', runtimeStatus: 'recovering' },
    { status: 'starting' }, { status: 'done', runtimeStatus: 'running' },
    { status: 'idle', runtimeStatus: 'idle', deferredStart: true, resumeEligible: true },
    { status: 'idle', runtimeStatus: 'idle', deferredStart: true, resumeEligible: false },
    { status: 'idle', runtimeStatus: 'idle', resumeEligible: true },
    { status: 'exited' }, { status: 'unreachable' },
  ];

  it('matches the desktop Active/Sleeping classification and counts all configured sessions', () => {
    for (const session of sessions) {
      const sleeping = isStandbySession(session);
      expect(isSleepingSession(session)).toBe(sleeping);
      expect(matchesSessionFilter(session, 'sleeping')).toBe(sleeping);
      expect(matchesSessionFilter(session, 'active')).toBe(!sleeping && isAgentRuntimeActive(session));
      expect(matchesSessionFilter(session, 'all')).toBe(true);
    }
    expect(sessionFilterCounts(sessions)).toEqual({ all: 12, active: 7, sleeping: 1 });
  });

  it('keeps missing or offline states out of Active even if old hooks report work', () => {
    for (const session of [{}, { status: 'offline', hook: { event: 'working' } }, { status: 'working', runtimeStatus: 'idle' }]) {
      expect(matchesSessionFilter(session, 'active')).toBe(false);
      expect(matchesSessionFilter(session, 'sleeping')).toBe(false);
    }
  });

  it('migrates old status URLs and rejects unknown filter values', () => {
    for (const filter of ['working', 'attention', 'recovering', 'starting', 'done']) expect(normalizeSessionFilter(filter)).toBe('active');
    for (const filter of ['idle', 'offline', null, undefined, '<script>']) expect(normalizeSessionFilter(filter)).toBe('all');
    for (const filter of ['all', 'active', 'sleeping']) expect(normalizeSessionFilter(filter)).toBe(filter);
  });

  it('uses actual PTY presence over stale renderer metadata while preserving initialization and standby', () => {
    const dormant = { status: 'idle', runtimeStatus: 'idle', deferredStart: true, resumeEligible: true };
    const running = { ...dormant, ...projectSessionRuntime(dormant, true) };
    expect(matchesSessionFilter(running, 'active')).toBe(true);
    expect(isSleepingSession(running)).toBe(false);
    const disconnected = { status: 'working', runtimeStatus: 'running' };
    expect(matchesSessionFilter({ ...disconnected, ...projectSessionRuntime(disconnected, false) }, 'active')).toBe(false);
    expect(isSleepingSession({ ...dormant, ...projectSessionRuntime(dormant, false) })).toBe(true);
    for (const state of ['starting', 'recovering']) {
      const session = { status: state, runtimeStatus: state };
      expect(matchesSessionFilter({ ...session, ...projectSessionRuntime(session, false) }, 'active')).toBe(true);
    }
  });
});
