import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ProjectBoardPage } from './ProjectBoardPage';
import type { BoardSnapshot } from '../lib/workBoard';
import { BOARD_CARD, boardLayout } from '../lib/workBoard';

// Exercise the component's actual event handlers and re-renders in Node. No
// browser, native window, model requests or changes to a user's sessions.
const hooks = vi.hoisted(() => ({ values: [] as unknown[], refs: [] as { current: unknown }[], effects: [] as { run: () => unknown; deps?: unknown[] }[], index: 0, refIndex: 0, invoke: vi.fn() }));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => {
    const index = hooks.index++;
    if (index >= hooks.values.length) hooks.values[index] = typeof initial === 'function' ? initial() : initial;
    return [hooks.values[index], (value: unknown) => { hooks.values[index] = typeof value === 'function' ? value(hooks.values[index]) : value; }];
  },
  useRef: (current: unknown) => { const index = hooks.refIndex++; return hooks.refs[index] ||= { current }; },
  useMemo: (compute: () => unknown) => compute(), useCallback: (callback: unknown) => callback,
  useEffect: (run: () => unknown, deps?: unknown[]) => { hooks.effects.push({ run, deps }); },
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
function render(data: BoardSnapshot) { hooks.index = 0; hooks.refIndex = 0; hooks.effects = []; return ProjectBoardPage({ initialSnapshot: data }); }
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
  hooks.values = []; hooks.refs = []; hooks.effects = []; hooks.index = 0; hooks.refIndex = 0; hooks.invoke.mockReset();
  hooks.invoke.mockImplementation(async (command, args) => {
    const data = hooks.values[0] as BoardSnapshot;
    if (command === 'project_board_ack') return { ...data, revision: 'read', items: data.items?.filter(i => i.id !== args.itemId) };
    if (command === 'project_board_ack_results') return { ...data, revision: 'read', items: data.items?.filter(i => !args.results.some((r: { id: string }) => r.id === i.id)) };
    return {};
  });
  vi.stubGlobal('window', { innerWidth: 1280, innerHeight: 900, requestAnimationFrame: (callback: () => void) => callback() });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function project(tree: ReactNode, id: string) { return elements(tree).find(e => e.props['data-project-id'] === id)!; }
function header(tree: ReactNode, id = 'p') { return elements(project(tree, id)).find(e => e.props.className === 'wb-project-header')!; }
function pointer(x: number, y: number, extra = {}) { return { button: 0, pointerId: 4, clientX: x, clientY: y, stopPropagation: vi.fn(), preventDefault: vi.fn(), currentTarget: { setPointerCapture: vi.fn() }, ...extra }; }

it('opens a conversation with only the result IDs captured at double-click, preserving later arrivals', async () => {
  const data = fixture(); let tree = render(data);
  hooks.invoke.mockImplementationOnce(async (command, args) => {
    expect(command).toBe('project_board_open_session');
    expect(args).toEqual({ id: 'a', compose: false, reviewResults: data.items!.filter(i => i.sessionId === 'a').map(i => ({ id: i.id, fingerprint: i.fingerprint })) });
    return { snapshot: { ...data, items: [{ ...data.items![0], id: '9'.repeat(64), summary: '새 결과' }, data.items![2]] } };
  });
  elements(tree).find(e => e.props['data-session-id'] === 'a')!.props.children.find((e: ReactElement<Props>) => e?.props?.className === 'wb-node-open').props.onDoubleClick();
  await Promise.resolve(); tree = render(data);
  expect(content(tree)).toContain('새 결과'); expect(elements(tree).filter(e => e.props['data-item-id'])).toHaveLength(2);
});

it('reviews captured session results from the context menu without acknowledging a later response or a question', async () => {
  const data = fixture(); let tree = render(data);
  elements(tree).find(e => e.props['data-session-id'] === 'a')!.props.onContextMenu({ preventDefault: vi.fn(), clientX: 500, clientY: 500 });
  data.items!.push({ ...data.items![0], id: '9'.repeat(64), summary: '나중에 도착' });
  tree = render(data);
  elements(tree).find(e => e.props.role === 'menuitem' && content(e).includes('현재 결과 확인완료'))!.props.onClick();
  await Promise.resolve(); tree = render(data);
  expect(hooks.invoke).toHaveBeenCalledExactlyOnceWith('project_board_ack_results', { id: 'a', results: [resultId, secondId].map(id => ({ id, fingerprint: id === resultId ? 'd'.repeat(64) : 'e'.repeat(64) })) });
  expect(elements(tree).filter(e => e.props['data-item-id']).map(e => e.props['data-item-id'])).toEqual([questionId, '9'.repeat(64)]);
});

it('keeps zero-count summary rings static and aligns explicitly without consuming attention items', async () => {
  const data = fixture(); data.sessions.forEach(s => { s.state = 'review'; });
  let tree = render(data); const summary = elements(tree).find(e => e.props.className === 'wb-summary')!;
  expect(elements(summary).filter(e => typeof e.type === 'function' && ['working', 'background'].includes(e.props.state)).every(e => e.props.active === false)).toBe(true);
  const original = structuredClone(data.items);
  elements(tree).find(e => e.props.className === 'wb-align')!.props.onClick();
  await Promise.resolve(); tree = render(data);
  expect(hooks.invoke).toHaveBeenCalledOnce(); expect(hooks.invoke.mock.calls[0][0]).toBe('project_board_preferences');
  expect(hooks.invoke.mock.calls[0][1].preferences.projectPositions).toHaveProperty('p');
  expect(data.items).toEqual(original);
});

it('defaults both visibility switches to hidden, retaining active children, their parent, and every attention item', async () => {
  const data = fixture(); data.sessions[0].runtime = 'sleeping'; data.sessions[0].state = 'idle';
  data.sessions[2].runtime = 'stopped'; data.sessions[2].state = 'interrupted';
  data.sessions.push({ ...data.sessions[0], id: 'sleep', name: 'Sleeping leaf', parentId: 'a' }, { ...data.sessions[2], id: 'idle', name: 'Idle leaf', runtime: 'running', state: 'idle' });
  data.references = [{ id: 'read', from: 'b', to: 'sleep', active: true, kind: 'message', source: 'inbox', startedAt: 0, endedAt: null }];
  hooks.invoke.mockResolvedValue({}); let tree = render(data);
  const ids = (node: ReactNode) => elements(node).filter(e => e.props['data-session-id']).map(e => e.props['data-session-id']);
  expect(ids(tree)).toEqual(['a', 'b']);
  const summary = content(elements(tree).find(e => e.props.className === 'wb-summary')!);
  expect(elements(tree).filter(e => e.props['data-item-id'])).toHaveLength(3);
  expect(elements(tree).some(e => e.props.className === 'wb-ref-line')).toBe(false);
  const sleepToggle = elements(tree).find(e => e.props['aria-label'] === 'Sleeping 세션 표시')!;
  expect(sleepToggle.props['aria-checked']).toBe(false); sleepToggle.props.onClick();
  await Promise.resolve(); tree = render(data); expect(ids(tree)).toEqual(['a', 'b', 'sleep']);
  expect(elements(tree).some(e => e.props.className === 'wb-ref-line')).toBe(true);
  const stoppedToggle = elements(tree).find(e => e.props['aria-label'] === '대기·정지 세션 표시')!;
  expect(stoppedToggle.props['aria-checked']).toBe(false); stoppedToggle.props.onClick();
  await Promise.resolve(); tree = render(data); expect(ids(tree)).toEqual(['a', 'b', 'sleep', 'c', 'idle']);
  expect(content(elements(tree).find(e => e.props.className === 'wb-summary')!)).toBe(summary);
  expect(hooks.invoke.mock.calls[1]).toEqual(['project_board_preferences', { preferences: { projectPositions: {}, sessionOrder: [], showSleeping: true, showStopped: true } }]);
  expect(hooks.invoke.mock.calls.every(([command]) => command === 'project_board_preferences')).toBe(true);
});

it('locates a hidden stopped result temporarily, then hides it again without changing the saved switches', () => {
  const data = fixture(); data.sessions[2].runtime = 'stopped';
  let tree = render(data);
  expect(elements(tree).some(e => e.props['data-session-id'] === 'c')).toBe(false);
  elements(tree).find(e => e.props['data-item-id'] === questionId)!.props.onClick({ currentTarget: { isConnected: false } });
  tree = render(data); elements(tree).find(e => e.props.className === 'wb-locate')!.props.onClick();
  tree = render(data); expect(elements(tree).some(e => e.props['data-session-id'] === 'c')).toBe(true);
  expect(content(tree)).toContain('보드에서 찾기로 임시 표시 중');
  expect(elements(tree).find(e => e.props['aria-label'] === '대기·정지 세션 표시')!.props['aria-checked']).toBe(false);
  elements(tree).find(e => e.type === 'button' && content(e) === '다시 숨기기')!.props.onClick();
  tree = render(data); expect(elements(tree).some(e => e.props['data-session-id'] === 'c')).toBe(false);
  expect(hooks.invoke).not.toHaveBeenCalled();
});

it('drags a project in world coordinates, saves on release and suppresses the following fold click', async () => {
  const data = fixture(); data.references = [{ id: 'read', from: 'c', to: 'b', active: true, kind: 'message', source: 'inbox', startedAt: 0, endedAt: null }];
  hooks.invoke.mockResolvedValue({});
  let tree = render(data); const start = project(tree, 'p').props.style, other = project(tree, 'p2').props.style;
  const edge = elements(tree).find(e => e.props.className === 'wb-ref-line')!.props.d;
  header(tree).props.onPointerDown(pointer(200, 180));
  header(tree).props.onPointerMove(pointer(80, 460));
  tree = render(data);
  expect(project(tree, 'p').props.style).toMatchObject({ left: start.left - 150, top: start.top + 350 });
  expect(project(tree, 'p2').props.style).toEqual(other);
  expect(hooks.invoke).not.toHaveBeenCalled();
  header(tree).props.onPointerUp(pointer(80, 460));
  expect(hooks.invoke).toHaveBeenCalledExactlyOnceWith('project_board_preferences', { preferences: { projectPositions: { p: { x: start.left - 150, y: start.top + 350 } }, sessionOrder: [], showSleeping: false, showStopped: false } });
  tree = render(data); header(tree).props.onClick(); tree = render(data);
  expect(header(tree).props['aria-expanded']).toBe(true);
  expect(elements(tree).find(e => e.props.className === 'wb-ref-line')!.props.d).not.toBe(edge);
  await Promise.resolve(); tree = render(data);
  expect(content(elements(tree).find(e => e.props.role === 'status')!)).toBe('이 컴퓨터에 배치 저장');
  // A later ordinary click still folds the project.
  header(tree).props.onPointerDown(pointer(80, 460)); header(tree).props.onPointerUp(pointer(82, 462)); header(tree).props.onClick();
  expect(header(render(data)).props['aria-expanded']).toBe(false);
});

it.each(['cancel', 'escape'] as const)('cancels a project preview with %s without saving or collapsing', action => {
  const data = fixture(); let tree = render(data); const start = project(tree, 'p').props.style;
  header(tree).props.onPointerDown(pointer(200, 180)); header(tree).props.onPointerMove(pointer(80, 460));
  tree = render(data);
  if (action === 'cancel') header(tree).props.onPointerCancel();
  else tree.props.onKeyDown({ key: 'Escape', stopPropagation: vi.fn() });
  tree = render(data); expect(project(tree, 'p').props.style).toEqual(start);
  header(tree).props.onClick(); expect(header(render(data)).props['aria-expanded']).toBe(true);
  expect(hooks.invoke).not.toHaveBeenCalled();
});

it('restores host-saved placement on a fresh board and keeps it during polling, filtering, then resets only layout', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('window', { setInterval, requestAnimationFrame: (callback: () => void) => callback() });
  vi.stubGlobal('document', { hidden: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  const data = fixture(); data.preferences = { layoutVersion: 2, projectPositions: { p: { x: -580, y: 760 } }, sessionOrder: ['b', 'a', 'c'], showSleeping: true, showStopped: false };
  hooks.invoke.mockImplementation(async (command, args) => command === 'project_board_snapshot' ? data : Object.assign(data.preferences, args.preferences));
  let tree = render(data);
  const stop = hooks.effects[1].run() as () => void;
  await Promise.resolve(); await Promise.resolve(); tree = render(data);
  expect(project(tree, 'p').props.style).toMatchObject({ left: -580, top: 760 });
  expect(elements(tree).find(e => e.props['aria-label'] === 'Sleeping 세션 표시')!.props['aria-checked']).toBe(true);
  expect(elements(tree).find(e => e.props['aria-label'] === '대기·정지 세션 표시')!.props['aria-checked']).toBe(false);
  elements(tree).find(e => e.props.className === 'wb-refresh')!.props.onClick();
  await Promise.resolve(); tree = render(data);
  const filters = elements(tree).find(e => e.props.className === 'wb-inbox-filters')!;
  elements(filters).find(e => e.type === 'button' && content(e).startsWith('결과'))!.props.onClick();
  tree = render(data); expect(project(tree, 'p').props.style).toMatchObject({ left: -580, top: 760 });
  const saveView = hooks.effects[2].run() as () => void; await vi.advanceTimersByTimeAsync(500); saveView();
  expect(data.preferences.projectPositions).toEqual({ p: { x: -580, y: 760 } });
  elements(tree).find(e => e.type === 'button' && content(e) === '배치 초기화')!.props.onClick();
  await Promise.resolve(); tree = render(data);
  expect(project(tree, 'p').props.style).toMatchObject({ left: 28, top: 38 });
  expect(data.preferences).toMatchObject({ projectPositions: {}, sessionOrder: [], layoutVersion: 2 });
  expect(data.items).toHaveLength(3); stop();
});

it('drags sibling sessions by the handle, saving display order without changing parent or project', async () => {
  const data = fixture(); data.sessions.push({ ...data.sessions[1], id: 'd', name: 'Session d' });
  const before = structuredClone(data.sessions); hooks.invoke.mockResolvedValue({});
  let tree = render(data);
  const transfer = { setData: vi.fn(), effectAllowed: '', dropEffect: '' };
  elements(tree).find(e => e.props['aria-label'] === 'Session d · 세션 순서 이동')!.props.onDragStart({ stopPropagation: vi.fn(), dataTransfer: transfer });
  tree = render(data);
  const node = elements(tree).find(e => e.props['data-session-id'] === 'b')!;
  const event = { preventDefault: vi.fn(), stopPropagation: vi.fn(), clientY: 110, dataTransfer: transfer, currentTarget: { getBoundingClientRect: () => ({ top: 100, height: 80 }) } };
  node.props.onDragOver(event); expect(event.preventDefault).toHaveBeenCalledOnce();
  node.props.onDrop(event); await Promise.resolve(); tree = render(data);
  const positions = elements(tree).filter(e => e.props['data-session-id']).map(e => [e.props['data-session-id'], e.props.style.top]);
  expect(positions.find(([id]) => id === 'd')![1]).toBeLessThan(positions.find(([id]) => id === 'b')![1]);
  expect(hooks.invoke).toHaveBeenCalledExactlyOnceWith('project_board_preferences', { preferences: { projectPositions: {}, sessionOrder: ['a', 'd', 'b', 'c'], showSleeping: false, showStopped: false } });
  // Cross-project drops cannot reparent or move the session registration.
  elements(tree).find(e => e.props['aria-label'] === 'Session d · 세션 순서 이동')!.props.onDragStart({ stopPropagation: vi.fn(), dataTransfer: transfer });
  elements(tree).find(e => e.props['data-session-id'] === 'c')!.props.onDrop(event);
  expect(hooks.invoke).toHaveBeenCalledTimes(1);
  // Keyboard users can reach the same sibling ordering operation.
  elements(tree).find(e => e.props['aria-label'] === 'Session b · 세션 순서 이동')!.props.onKeyDown({ key: 'ArrowUp', stopPropagation: vi.fn(), preventDefault: vi.fn() });
  tree = render(data);
  const reordered = elements(tree).filter(e => e.props['data-session-id']).map(e => [e.props['data-session-id'], e.props.style.top]);
  expect(reordered.find(([id]) => id === 'b')![1]).toBeLessThan(reordered.find(([id]) => id === 'd')![1]);
  expect(data.sessions).toEqual(before);
});

it('reports a failed local layout write and can retry it without invoking session operations', async () => {
  const data = fixture(); hooks.invoke.mockRejectedValueOnce(Error('disk full'));
  let tree = render(data);
  header(tree).props.onPointerDown(pointer(200, 180)); header(tree).props.onPointerMove(pointer(80, 460)); header(tree).props.onPointerUp(pointer(80, 460));
  await Promise.resolve(); await Promise.resolve(); tree = render(data);
  expect(content(tree)).toContain('disk full'); expect(content(tree)).toContain('배치 저장 실패');
  hooks.invoke.mockResolvedValueOnce({});
  elements(tree).find(e => e.type === 'button' && content(e) === '다시 저장')!.props.onClick();
  await Promise.resolve(); tree = render(data);
  expect(content(tree)).not.toContain('disk full'); expect(content(tree)).not.toContain('배치 저장 실패');
  expect(hooks.invoke.mock.calls.every(([command]) => command === 'project_board_preferences')).toBe(true);
});

it('marks only the opened result read, keeps its detail visible, and preserves other results and questions', async () => {
  const data = fixture(), focus = vi.fn(), trigger = { isConnected: true, focus };
  let tree = render(data);
  elements(tree).find(e => e.props['data-item-id'] === resultId)!.props.onClick({ currentTarget: trigger });
  await Promise.resolve(); await Promise.resolve(); tree = render(data);
  expect(content(tree)).toContain('이전 결과'); expect(content(tree)).toContain('응답 종료 결과');
  expect(elements(tree).find(e => e.type === 'button' && content(e).includes('확인 완료'))!.props.disabled).toBe(true);
  expect(hooks.invoke).toHaveBeenCalledExactlyOnceWith('project_board_ack', { id: 'a', itemId: resultId, fingerprint: 'd'.repeat(64) });
  elements(tree).find(e => e.props.className === 'wb-back')!.props.onClick();
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

it('scrolls a dense project internally and locates an offscreen result without opening or launching its session', () => {
  const data = fixture(); data.projects = [data.projects[0]];
  data.sessions = Array.from({ length: 36 }, (_, index) => ({ ...data.sessions[0], id: `s${index}`, name: `Worker ${index}`, parentId: index ? 's0' : null }));
  data.items = [{ ...data.items![0], sessionId: 's35' }];
  data.references = [{ id: 'read', from: 's35', to: 's0', active: true, startedAt: 1, endedAt: null, kind: 'message-read', source: 'inbox' }];
  let tree = render(data);
  const body = elements(tree).find(e => e.props.className === 'wb-project-body')!;
  const dom = { scrollTop: 0 }; body.props.ref(dom);
  const canvas = elements(tree).find(e => e.props.className === 'wb-canvas')!;
  canvas.props.ref.current = { getBoundingClientRect: () => ({ width: 1000, height: 720 }) };
  const capture = vi.fn(), stopPropagation = vi.fn();
  canvas.props.onPointerDown({ button: 0, target: { closest: () => dom }, currentTarget: { setPointerCapture: capture } });
  expect(capture).not.toHaveBeenCalled();
  body.props.onWheel({ ctrlKey: false, stopPropagation }); expect(stopPropagation).toHaveBeenCalledOnce();
  body.props.onWheel({ ctrlKey: true, stopPropagation }); expect(stopPropagation).toHaveBeenCalledOnce();
  elements(tree).find(e => e.props['data-item-id'] === resultId)!.props.onClick({ currentTarget: { isConnected: false } });
  tree = render(data);
  elements(tree).find(e => e.props.className === 'wb-locate')!.props.onClick();
  tree = render(data);
  hooks.effects.find(e => e.deps?.[0] === 's35')!.run();
  expect(dom.scrollTop).toBeGreaterThan(2500);
  const layout = boardLayout(data, {}), group = layout.groups[0], node = layout.nodes.find(n => n.session.id === 's35')!;
  expect(node.y - group.y - BOARD_CARD.header - dom.scrollTop).toBeGreaterThanOrEqual(0);
  expect(node.y - group.y - BOARD_CARD.header - dom.scrollTop + node.height).toBeLessThanOrEqual(group.bodyHeight);
  tree = render(data);
  const reference = elements(tree).find(e => e.props.className === 'wb-ref-line')!;
  expect(reference.props.d).toContain(`M ${node.x} ${node.y - dom.scrollTop + node.height / 2}`);
  expect(reference.props.d).toMatch(new RegExp(`${group.x} ${group.y + BOARD_CARD.header / 2}$`));
  expect(hooks.invoke.mock.calls.every(([command]) => command === 'project_board_ack')).toBe(true);
});

it('keeps a detoured reference selectable by keyboard without starting either session', () => {
  const data = fixture(); data.references = [{ id: 'read', from: 'c', to: 'a', active: true, startedAt: 1, endedAt: null, kind: 'message-read', source: 'inbox' }];
  let tree = render(data);
  const line = elements(tree).find(e => e.type === 'g' && e.props.role === 'button')!;
  expect(line.props.children).toBeDefined();
  const preventDefault = vi.fn();
  line.props.onKeyDown({ key: 'Enter', preventDefault, currentTarget: { isConnected: false } });
  tree = render(data);
  expect(preventDefault).toHaveBeenCalledOnce();
  expect(content(tree)).toContain('Session c → Session a');
  expect(content(tree)).toContain('실제 수신함 읽기 진행 중');
  expect(hooks.invoke).not.toHaveBeenCalled();
});
