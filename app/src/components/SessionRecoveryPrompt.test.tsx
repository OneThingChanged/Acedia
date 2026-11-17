import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { SessionRecoveryPrompt } from './SessionRecoveryPrompt';
const mock = vi.hoisted(() => ({ values: [] as any[], refs: [] as any[], index: 0, refIndex: 0, effects: [] as (() => any)[], invoke: vi.fn() }));
vi.mock('react', async original => ({ ...await original<typeof import('react')>(),
  useState: (initial: any) => { const i = mock.index++; if (i >= mock.values.length) mock.values[i] = initial; return [mock.values[i], (value: any) => { mock.values[i] = value; }]; },
  useRef: (initial: any) => mock.refs[mock.refIndex++] ||= { current: initial },
  useEffect: (run: () => any) => mock.effects.push(run),
}));
vi.mock('../platform/runtime', () => ({ invoke: (...args: any[]) => mock.invoke(...args) }));
vi.mock('../lib/appLanguage', () => ({ useAppLanguage: () => ({ text: (ko: string) => ko }) }));
vi.mock('../hooks/useNativeViewOcclusion', () => ({ useNativeViewOcclusion: () => {} }));
function nodes(node: ReactNode): ReactElement<any>[] { return !isValidElement(node) ? [] : [node, ...Children.toArray((node as ReactElement<any>).props.children).flatMap(nodes)]; }
function content(node: ReactNode): string { return typeof node === 'string' ? node : isValidElement(node) ? Children.toArray((node as ReactElement<any>).props.children).map(content).join('') : ''; }
function render(onRestore = vi.fn(async () => {}), enabled = true) {
  mock.index = mock.refIndex = 0; mock.effects = [];
  return SessionRecoveryPrompt({ enabled, onRestore, onOpenSession: vi.fn() });
}
const offer = { checkpointId: 'checkpoint', decision: 'pending', error: null, activeCount: 2, workingCount: 1,
  sessions: [{ id: 'a', name: 'worker', mode: 'working', state: 'pending', reason: null }] };
beforeEach(() => { mock.values = []; mock.refs = []; mock.effects = []; mock.invoke.mockReset(); mock.invoke.mockImplementation(async (_cmd, args) => args.action === 'offer' ? offer
  : args.action === 'decide' ? { ...offer, decision: args.restore ? 'accepted' : 'declined', sessionIds: args.restore ? ['a'] : [] } : { ...offer, decision: 'accepted' }); });
const settle = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
it('asks on startup without executing, and No leaves sessions dormant', async () => {
  const restore = vi.fn(async () => {}); render(restore); mock.effects[0](); await settle();
  let tree = render(restore); expect(content(tree)).toContain('이전 실행 세션을 복구할까요?');
  expect(restore).not.toHaveBeenCalled();
  nodes(tree).find(n => n.type === 'button' && content(n) === '아니오')!.props.onClick(); await settle();
  tree = render(restore); expect(content(tree)).not.toContain('이전 실행 세션을 복구할까요?');
  expect(mock.invoke).toHaveBeenCalledWith('session_recovery', { action: 'decide', checkpointId: 'checkpoint', restore: false });
  expect(restore).not.toHaveBeenCalled();
});
it('starts restoration only after an explicit Yes and rejects double-click submission', async () => {
  const restore = vi.fn(async () => {}); render(restore); mock.effects[0](); await settle();
  const tree = render(restore), yes = nodes(tree).find(n => n.type === 'button' && content(n) === '예, 복구')!;
  yes.props.onClick(); yes.props.onClick(); await settle();
  expect(restore).toHaveBeenCalledExactlyOnceWith('checkpoint', ['a']);
  expect(mock.invoke.mock.calls.filter(([, args]) => args.action === 'decide')).toHaveLength(1);
});
it('does not offer restoration in another workspace, or when the previous decision is already consumed', async () => {
  render(undefined, false); mock.effects[0](); await settle(); expect(mock.invoke).not.toHaveBeenCalled();
  mock.invoke.mockResolvedValue({ ...offer, activeCount: 0 }); render(); mock.effects[0](); await settle();
  expect(content(render())).not.toContain('이전 실행 세션을 복구할까요?');
});
