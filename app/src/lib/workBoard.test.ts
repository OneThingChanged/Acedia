import { describe, expect, it } from 'vitest';
import { boardLayout, boardViewedAgent, type BoardSnapshot, type BoardSession } from './workBoard';
const session = (id: string, parentId: string | null, state = 'working') => ({ id, name: id, projectId: 'p', parentId, state, folder: 'D:/child', needsAttention: state === 'review' } as BoardSession);
const snapshot = { projects: [{ id: 'p', name: 'Project', folder: 'G:/root' }], sessions: [session('a', null), session('b', 'a', 'review'), session('c', 'b', 'completed')] } as BoardSnapshot;
describe('Work board node projection', () => {
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
