import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import type { Agent, TerminalEntry } from '../types';
import { useSessionLifecycleActions } from './useSessionLifecycleActions';

const { invoke, saveScrollback } = vi.hoisted(() => ({ invoke: vi.fn(), saveScrollback: vi.fn() }));
vi.mock('../platform/runtime', () => ({ invoke }));
vi.mock('../platform/electronBridge', () => ({ isElectronRuntime: () => true }));
vi.mock('../lib/scrollback', () => ({ saveScrollback, clearScrollback: vi.fn() }));
beforeEach(() => { vi.clearAllMocks(); invoke.mockResolvedValue({ sessionId: 'original-conversation' }); });

function fixture(prepareRestart: (id: string) => Promise<boolean>) {
  const agentsRef = { current: [{ id: 'session', name: 'Work', aiToolId: 'codex', status: 'running', codexPoolAccountId: 'old' } as Agent] };
  const detachedAgentIdsRef = { current: new Set<string>() };
  const dispose = vi.fn();
  const terminal = { term: { dispose }, serialize: { serialize: () => 'saved output' } } as unknown as TerminalEntry;
  const termsRef = { current: new Map([['session', terminal]]) };
  const spawn = vi.fn(async () => ({ ok: true }));
  let actions!: ReturnType<typeof useSessionLifecycleActions>;
  function Harness() {
    actions = useSessionLifecycleActions({ agentsRef, detachedAgentIdsRef, removedAgentIdsRef: { current: new Set() }, termsRef,
      setAgents: vi.fn(), applyGroupOp: vi.fn(), pinnedSessionId: () => 'original-conversation', prepareRestart });
    return null;
  }
  renderToStaticMarkup(<Harness />);
  return { actions, agentsRef, detachedAgentIdsRef, termsRef, terminal, dispose, spawn };
}

it('leaves the running session, conversation and scrollback untouched when account selection is cancelled', async () => {
  const choose = vi.fn(async () => false), f = fixture(choose), original = f.agentsRef.current[0];
  expect(await f.actions.restartAgent('session', f.spawn)).toBe(false);
  expect(choose).toHaveBeenCalledWith('session');
  expect(invoke).not.toHaveBeenCalled(); expect(f.spawn).not.toHaveBeenCalled();
  expect(f.dispose).not.toHaveBeenCalled(); expect(saveScrollback).not.toHaveBeenCalled();
  expect(f.termsRef.current.get('session')).toBe(f.terminal); expect(f.agentsRef.current[0]).toBe(original);
});
it('waits for the account decision before stopping the CLI and spawns with the chosen account and original conversation', async () => {
  let choose!: (allow: boolean) => void;
  const f = fixture(() => new Promise(resolve => { choose = resolve; }));
  const restart = f.actions.restartAgent('session', f.spawn);
  expect(invoke).not.toHaveBeenCalled(); expect(f.dispose).not.toHaveBeenCalled();
  await expect(f.actions.restartAgent('session', f.spawn)).rejects.toThrow('already starting');
  f.agentsRef.current = [{ ...f.agentsRef.current[0], codexPoolAccountId: 'chosen' }];
  choose(true);
  expect(await restart).toBe(true);
  expect(invoke).toHaveBeenCalledExactlyOnceWith('restart_session_model', { id: 'session', expectedSessionId: 'original-conversation', interrupt: true, codexPoolAccountId: 'chosen' });
  expect(f.agentsRef.current[0]).toMatchObject({ codexPoolAccountId: 'chosen', lastSessionId: 'original-conversation', terminalEpoch: 1 });
  expect(f.spawn).toHaveBeenCalledExactlyOnceWith('session', { recovering: true, resumeSessionId: 'original-conversation', poolResumeOwnerId: undefined });
  expect(f.dispose).toHaveBeenCalledOnce();
});
it('does not stop a session removed or detached while its account choice was pending', async () => {
  for (const change of ['removed', 'detached']) {
    let allow!: (value: boolean) => void;
    const f = fixture(() => new Promise(resolve => { allow = resolve; }));
    const restart = f.actions.restartAgent('session', f.spawn);
    if (change === 'removed') f.agentsRef.current = [];
    else f.detachedAgentIdsRef.current.add('session');
    allow(true);
    await expect(restart).rejects.toThrow('Session changed');
    expect(invoke).not.toHaveBeenCalled(); expect(f.spawn).not.toHaveBeenCalled();
  }
});
it('releases the restart lock after cancellation so a later deliberate restart can proceed', async () => {
  const choose = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true), f = fixture(choose);
  expect(await f.actions.restartAgent('session', f.spawn)).toBe(false);
  expect(await f.actions.restartAgent('session', f.spawn)).toBe(true);
  expect(f.spawn).toHaveBeenCalledOnce();
});
it.each(['old', null])('restarts from Remote with the saved account preference (%s) without opening the desktop picker', async accountId => {
  const choose = vi.fn(async () => false), f = fixture(choose);
  f.agentsRef.current[0].codexPoolAccountId = accountId ?? undefined;
  const verify = vi.fn(async () => {});
  expect(await f.actions.restartAgent('session', f.spawn, verify)).toBe(true);
  expect(verify).toHaveBeenCalledOnce();
  expect(choose).not.toHaveBeenCalled();
  expect(invoke).toHaveBeenCalledExactlyOnceWith('restart_session_model', { id: 'session', expectedSessionId: 'original-conversation', interrupt: true, codexPoolAccountId: accountId });
  expect(f.agentsRef.current[0]).toMatchObject({ codexPoolAccountId: accountId ?? undefined, lastSessionId: 'original-conversation' });
  expect(f.spawn).toHaveBeenCalledExactlyOnceWith('session', { recovering: true, resumeSessionId: 'original-conversation', poolResumeOwnerId: undefined });
});

it('keeps the CLI running and reports the expired Remote request', async () => {
  const choose = vi.fn(async () => true), f = fixture(choose);
  const verify = vi.fn(async () => { throw new Error('The restart request expired.'); });
  await expect(f.actions.restartAgent('session', f.spawn, verify)).rejects.toThrow('The restart request expired.');
  expect(verify).toHaveBeenCalledOnce(); expect(invoke).not.toHaveBeenCalled();
  expect(choose).not.toHaveBeenCalled();
  expect(f.dispose).not.toHaveBeenCalled(); expect(f.spawn).not.toHaveBeenCalled();
});

it('reports an unavailable account before replacing the running Remote session', async () => {
  const f = fixture(async () => true), original = f.agentsRef.current[0];
  invoke.mockRejectedValueOnce(new Error('The current routed account is unavailable.'));
  await expect(f.actions.restartAgent('session', f.spawn, async () => {})).rejects.toThrow('The current routed account is unavailable.');
  expect(f.agentsRef.current[0]).toBe(original);
  expect(f.dispose).not.toHaveBeenCalled(); expect(f.spawn).not.toHaveBeenCalled();
});
