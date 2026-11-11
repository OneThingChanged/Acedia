import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ProjectBoardPage } from './ProjectBoardPage';
import type { BoardSnapshot } from '../lib/workBoard';

// Exercise the component's actual event handlers and re-renders in Node. No
// browser, native window, model requests or changes to a user's sessions.
const hooks = vi.hoisted(() => ({ values: [] as unknown[], refs: [] as { current: unknown }[], index: 0, refIndex: 0, invoke: vi.fn() }));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => {
    const index = hooks.index++;
    if (index >= hooks.values.length) hooks.values[index] = typeof initial === 'function' ? initial() : initial;
    return [hooks.values[index], (value: unknown) => { hooks.values[index] = typeof value === 'function' ? value(hooks.values[index]) : value; }];
  },
  useRef: (current: unknown) => { const index = hooks.refIndex++; return hooks.refs[index] ||= { current }; },
  useMemo: (compute: () => unknown) => compute(), useCallback: (callback: unknown) => callback, useEffect: () => {},
}));
vi.mock('../platform/runtime', () => ({ invoke: (...args: unknown[]) => hooks.invoke(...args) }));
vi.mock('../lib/appLanguage', () => ({ useAppLanguage: () => ({ text: (ko: string) => ko }) }));

type Props = Record<string, any>;
function elements(node: ReactNode): ReactElement<Props>[] {
  if (!isValidElement<Props>(node)) return [];
  return [node, ...Children.toArray(node.props.children).flatMap(elements)];
}
function content(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return isValidElement<Props>(node) ? Children.toArray(node.props.children).map(content).join('') : '';
}
function render(data: BoardSnapshot) { hooks.index = 0; hooks.refIndex = 0; return ProjectBoardPage({ initialSnapshot: data }); }
const resultId = 'a'.repeat(64), secondId = 'b'.repeat(64), questionId = 'c'.repeat(64);
function fixture(): BoardSnapshot {
  return { revision: 'r', sampledAt: 5000, storageError: null, preferences: {}, devices: [], references: [],
    projects: [{ id: 'p', name: 'RnDHub', folder: 'D:/RnDHub' }, { id: 'p2', name: 'Automation', folder: 'D:/Automation' }],
    sessions: ['a', 'b', 'c'].map((id, index) => ({ id, projectId: index === 2 ? 'p2' : 'p', name: `Session ${id}`, provider: 'codex',
      parentId: index === 1 ? 'a' : null, folder: `D:/${id}`, runtime: 'running', state: index === 2 ? 'waiting' : 'working',
      updatedAt: 4000, startedAt: 1000, lastActivityAt: 4000, summary: '', reason: '', fingerprint: id.repeat(64), needsAttention: true, task: null })),
    items: [{ id: resultId, sessionId: 'a', kind: 'result', createdAt: 2000, fingerprint: 'd'.repeat(64), summary: '이전 결과', scope: 'response' },
      { id: secondId, sessionId: 'a', kind: 'result', createdAt: 3000, fingerprint: 'e'.repeat(64), summary: '다음 결과', scope: 'task', artifacts: ['Saved/result.html'] },
      { id: questionId, sessionId: 'c', kind: 'question', createdAt: 4000, fingerprint: 'f'.repeat(64), summary: '사용자 선택 필요' }],
  };
}
beforeEach(() => {
  hooks.values = []; hooks.refs = []; hooks.index = 0; hooks.refIndex = 0; hooks.invoke.mockReset();
  vi.stubGlobal('window', { requestAnimationFrame: (callback: () => void) => callback() });
});
afterEach(() => vi.unstubAllGlobals());

it('opens an exact result without acknowledging, then reviews just that item and returns focus', async () => {
  const data = fixture(), focus = vi.fn(), trigger = { isConnected: true, focus };
  let tree = render(data);
  elements(tree).find(e => e.props['data-item-id'] === resultId)!.props.onClick({ currentTarget: trigger });
  tree = render(data);
  expect(content(tree)).toContain('이전 결과'); expect(content(tree)).toContain('응답 종료 결과');
  expect(hooks.invoke).not.toHaveBeenCalled();
  hooks.invoke.mockResolvedValueOnce({ ...data, revision: 'r2', items: data.items!.filter(i => i.id !== resultId) });
  await elements(tree).find(e => e.type === 'button' && content(e).includes('확인했어요'))!.props.onClick();
  // The JSX handler intentionally launches an async operation without returning it.
  await Promise.resolve(); await Promise.resolve();
  expect(hooks.invoke).toHaveBeenCalledExactlyOnceWith('project_board_ack', { id: 'a', itemId: resultId, fingerprint: 'd'.repeat(64) });
  tree = render(data);
  expect(elements(tree).filter(e => e.props['data-item-id']).map(e => e.props['data-item-id'])).toEqual([questionId, secondId]);
  expect(focus).toHaveBeenCalledWith({ preventScroll: true });
});

it('opens the selected question in its session composer without deciding or reviewing it', async () => {
  const data = fixture(); let tree = render(data);
  elements(tree).find(e => e.props['data-item-id'] === questionId)!.props.onClick({ currentTarget: { isConnected: false } });
  tree = render(data); expect(content(tree)).toContain('사용자 선택 필요');
  expect(elements(tree).some(e => e.type === 'button' && content(e).includes('확인했어요'))).toBe(false);
  hooks.invoke.mockResolvedValueOnce({});
  elements(tree).find(e => e.type === 'button' && content(e) === '세션에서 답변하기')!.props.onClick();
  await Promise.resolve();
  expect(hooks.invoke).toHaveBeenCalledExactlyOnceWith('project_board_open_session', { id: 'c', compose: true });
});

it('preserves totals and other project positions when folding a project and filtering results', () => {
  const data = fixture(); let tree = render(data);
  const other = elements(tree).find(e => e.props.className?.includes('wb-node ') && content(e).includes('Session c'))!;
  const position = other.props.style;
  const summary = content(elements(tree).find(e => e.props.className === 'wb-summary')!);
  elements(tree).find(e => e.props.className === 'wb-project-header')!.props.onClick();
  tree = render(data);
  expect(elements(tree).filter(e => e.props.className?.includes('wb-node '))).toHaveLength(1);
  expect(elements(tree).find(e => e.props.className?.includes('wb-node ') && content(e).includes('Session c'))!.props.style).toEqual(position);
  expect(content(elements(tree).find(e => e.props.className === 'wb-summary')!)).toBe(summary);
  const filters = elements(tree).find(e => e.props.className === 'wb-inbox-filters')!;
  elements(filters).find(e => e.type === 'button' && content(e).startsWith('결과'))!.props.onClick();
  tree = render(data);
  expect(elements(tree).filter(e => e.props['data-item-id'])).toHaveLength(2);
  expect(content(elements(tree).find(e => e.props.className === 'wb-summary')!)).toBe(summary);
});
