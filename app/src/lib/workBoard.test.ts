import { describe, expect, it } from 'vitest';
import { boardCounts, boardLayout, boardViewedAgent, type BoardSnapshot, type BoardSession, type BoardItem } from './workBoard';
const session = (id: string, parentId: string | null, state = 'working') => ({ id, name: id, projectId: 'p', parentId, state, folder: 'D:/child', needsAttention: state === 'review' } as BoardSession);
const snapshot = { projects: [{ id: 'p', name: 'Project', folder: 'G:/root' }], sessions: [session('a', null), session('b', 'a', 'review'), session('c', 'b', 'completed')] } as BoardSnapshot;
describe('Work board node projection', () => {
  it('counts background sessions separately from foreground work and review items', () => {
    expect(boardCounts([session('a', null), session('b', null, 'background')], [])).toEqual({ working: 1, background: 1, questions: 0, errors: 0, results: 0, attention: 0 });
  });
  it('keeps coordinates stable when changing a status or search filter', () => {
    const original = boardLayout(snapshot, {});
    for (const options of [{ filter: 'completed' }, { query: 'b' }, { filter: 'review' }]) {
      for (const node of boardLayout(snapshot, options).nodes) {
        const before = original.nodes.find(n => n.session.id === node.session.id)!;
        expect([node.x, node.y]).toEqual([before.x, before.y]);
      }
    }
  });
  it('counts three working sessions and four distinct attention items, including hidden results', () => {
    const sessions = ['a', 'b', 'c'].map(id => session(id, null));
    sessions.push(session('d', 'a', 'waiting'), session('e', 'a', 'failed'));
    const items = [{ id: 'q', sessionId: 'd', kind: 'question' }, { id: 'e', sessionId: 'e', kind: 'error' },
      { id: 'r1', sessionId: 'a', kind: 'result' }, { id: 'r2', sessionId: 'b', kind: 'result' }] as BoardItem[];
    expect(boardCounts([...sessions, sessions[0]], [...items, items[0]])).toEqual({ working: 3, background: 0, questions: 1, errors: 1, results: 2, attention: 4 });
    boardLayout({ ...snapshot, sessions }, { collapsed: new Set(['a']) });
    expect(boardCounts(sessions, items).attention).toBe(4);
  });
  it('keeps ancestors of search and status matches and never changes parent records', () => {
    const layout = boardLayout(snapshot, { filter: 'completed' });
    expect(layout.nodes.map(n => n.session.id).sort()).toEqual(['a', 'b', 'c']);
    expect(layout.edges).toEqual(expect.arrayContaining([{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }]));
    expect(boardLayout(snapshot, { query: 'D:/child', collapsed: new Set(['a']) }).nodes).toHaveLength(3);
    expect(snapshot.sessions[2].parentId).toBe('b');
  });
  it('collapses subtrees but expands matches and tolerates cycles', () => {
    expect(boardLayout(snapshot, { collapsed: new Set(['a']) }).nodes.map(n => n.session.id)).toEqual(['a']);
    expect(boardLayout({ ...snapshot, sessions: [session('a', 'b'), session('b', 'a')] }, {}).nodes).toHaveLength(2);
    expect(boardLayout(snapshot, { query: 'missing' }).nodes).toEqual([]);
  });
  it('opens stopped and sleeping records for viewing without changing their conversation or activating a CLI', () => {
    const agent = { id: 'a', lastSessionId: 'original', deferredStart: false, status: 'exited', modelSettings: { model: 'original-model' } };
    expect(boardViewedAgent(agent, false)).toEqual({ ...agent, deferredStart: true });
    expect(agent.deferredStart).toBe(false);
    expect(boardViewedAgent({ ...agent, deferredStart: true }, true)).toMatchObject({ deferredStart: undefined, lastSessionId: 'original' });
  });
});
