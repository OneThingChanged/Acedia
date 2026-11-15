import { Children, isValidElement, type ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { BoardRequestDetail } from './BoardRequestDetail';
import type { BoardTransfer } from '../lib/workBoard';

const hooks = vi.hoisted(() => ({ value: null as unknown, effect: null as (() => () => void) | null, invoke: vi.fn() }));
vi.mock('react', async original => ({ ...await original<typeof import('react')>(),
  useState: () => [hooks.value, (value: unknown) => { hooks.value = value; }],
  useEffect: (effect: () => () => void) => { hooks.effect = effect; },
}));
vi.mock('../lib/appLanguage', () => ({ useAppLanguage: () => ({ text: (ko: string) => ko }) }));
vi.mock('../platform/runtime', () => ({ invoke: (...args: unknown[]) => hooks.invoke(...args) }));
function content(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return isValidElement<{ children?: ReactNode }>(node) ? Children.toArray(node.props.children).map(content).join('') : '';
}
const transfer = { id: 'first', from: 'sender', to: 'worker', status: 'started', reason: '', isMessage: true, startedAt: 100 } as BoardTransfer;
const render = (t = transfer) => BoardRequestDetail({ transfer: t, sender: 'Sender', receiver: 'Worker' });
beforeEach(() => { hooks.value = null; hooks.effect = null; hooks.invoke.mockReset(); });

it('ignores a late original-text response after the user selects another record and keeps unobserved stages unconfirmed', async () => {
  let resolveFirst!: (value: unknown) => void, resolveSecond!: (value: unknown) => void;
  hooks.invoke.mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }))
    .mockImplementationOnce(() => new Promise(resolve => { resolveSecond = resolve; }));
  render(); const cancelFirst = hooks.effect!();
  const second = { ...transfer, id: 'second', readAt: 200 }; cancelFirst(); render(second); hooks.effect!();
  resolveFirst({ id: 'first', message: 'stale body' }); await Promise.resolve();
  expect(content(render(second))).not.toContain('stale body');
  resolveSecond({ id: 'second', from: 'sender', to: 'worker', message: '원문 <script> stays text' }); await Promise.resolve();
  const text = content(render(second)); expect(text).toContain('원문 <script> stays text'); expect(text).toContain('미확인');
  expect(hooks.invoke.mock.calls).toEqual([
    ['project_board_transfer_detail', { id: 'first' }], ['project_board_transfer_detail', { id: 'second' }],
  ]);
});
