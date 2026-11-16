import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { SessionTableView } from './SessionTableView';
import type { BoardSnapshot } from '../lib/workBoard';
vi.mock('../lib/appLanguage', () => ({ useAppLanguage: () => ({ text: (ko: string) => ko }) }));
function fixture() {
  const data = { projects: [{ id: 'p', name: 'Project', folder: 'D:/Project' }], sessions: [
    { id: 'parent', name: 'Organizational parent', projectId: 'p', parentId: null, state: 'idle' },
    { id: 'worker', name: 'Worker', projectId: 'p', parentId: 'parent', state: 'working' },
    { id: 'sender', name: '<actual sender>', projectId: 'p', parentId: null, state: 'idle' },
  ], transfers: [{ id: 'old', from: 'sender', to: 'worker', savedAt: 100, summary: 'Earlier request', status: 'inbox' },
    { id: 'new', from: 'sender', to: 'worker', savedAt: 200, summary: '<script>unsafe</script>', status: 'started', isMessage: true }] } as BoardSnapshot;
  return { data, mode: 'sessions' as const, projectId: '', query: '', visible: new Set(['worker']), filterSession: () => true,
    state: () => '작업 중', step: () => '진행 단계', onChoose: vi.fn(), onOpen: vi.fn() };
}
function elements(node: ReactNode): ReactElement<Record<string, any>>[] {
  if (!isValidElement<Record<string, any>>(node)) return [];
  return [node, ...Children.toArray(node.props.children).flatMap(elements)];
}
it('shows project rows, the required parent and a separately escaped actual request sender', () => {
  const markup = renderToStaticMarkup(<SessionTableView {...fixture()}/>);
  expect(markup).toContain('Organizational parent'); expect(markup).toContain('&lt;actual sender&gt;');
  expect(markup).toContain('&lt;script&gt;unsafe&lt;/script&gt;'); expect(markup).not.toContain('<script>');
  expect(markup).toContain('data-context="true"'); expect(markup).toContain('최근 요청 출처');
  expect(markup.match(/data-table-session-id=/g)).toHaveLength(2);
});
it('selects an exact historical transfer with one click and opens the existing receiver only on double-click', () => {
  const props = fixture(), tree = SessionTableView({ ...props, mode: 'transfers', query: 'Earlier' });
  const row = elements(tree).find(e => e.props['data-transfer-id'] === 'old')!;
  const trigger = {} as HTMLElement;
  row.props.onClick({ target: { closest: () => null }, currentTarget: trigger });
  expect(props.onChoose).toHaveBeenCalledExactlyOnceWith('worker', trigger, 'old');
  expect(props.onOpen).not.toHaveBeenCalled();
  row.props.onDoubleClick(); expect(props.onOpen).toHaveBeenCalledExactlyOnceWith('worker');
  expect(props.data.transfers?.[0].readAt).toBeUndefined();
});

it('distinguishes old direct handoffs and new summaries without replacing or merging their history rows', () => {
  const props = fixture();
  props.data.transfers = ['12345678-first', '87654321-second'].map((id, i) => ({ id, from: 'sender', to: 'worker', savedAt: 100 + i, status: 'started', reason: '' }));
  const markup = renderToStaticMarkup(<SessionTableView {...props} mode="transfers"/>);
  expect(markup).toContain('#12345678'); expect(markup).toContain('#87654321');
  expect(markup).toContain('&lt;actual sender&gt;의 직접 전달'); expect(markup).toContain('요약이 저장되지 않은 과거 기록');
  expect(markup).not.toContain('본문은 상세에서 확인'); expect(markup.match(/data-transfer-id=/g)).toHaveLength(2);
  expect(props.data.transfers.every(transfer => !transfer.summary)).toBe(true);
});
