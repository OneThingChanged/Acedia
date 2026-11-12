import { describe, expect, it } from 'vitest';
import { BOARD_CARD, boardCounts, boardLayout, boardViewedAgent, type BoardSnapshot, type BoardSession, type BoardItem } from './workBoard';
const session = (id: string, parentId: string | null, state = 'working') => ({ id, name: id, projectId: 'p', parentId, state, folder: 'D:/child', needsAttention: state === 'review' } as BoardSession);
const snapshot = { projects: [{ id: 'p', name: 'Project', folder: 'G:/root' }], sessions: [session('a', null), session('b', 'a', 'review'), session('c', 'b', 'completed')] } as BoardSnapshot;
describe('Work board node projection', () => {
  it('branches actual project folders like the supplied HTML, retaining an empty ancestor card', () => {
    const projects = ['master', 'automation', 'movie', 'max', 'unity'].map((id, i) => ({ id, name: id, folder: i ? `G:/Master/${id}` : 'G:/Master' }));
    const data = { ...snapshot, projects, sessions: projects.slice(1).map(p => ({ ...session(p.id, null), projectId: p.id })) };
    const layout = boardLayout(data, {}), [master, automation, movie, max, unity] = layout.groups;
    expect(layout.projectEdges).toEqual(['automation', 'movie', 'max', 'unity'].map(to => ({ from: 'master', to })));
    expect(master.y + master.height).toBeLessThan(automation.y);
    expect(automation.y).toBe(movie.y); expect(automation.x + automation.width).toBeLessThan(movie.x);
    expect(max.y).toBe(unity.y); expect(max.y).toBeGreaterThan(automation.y + automation.height);
    expect(master.x + master.width / 2).toBe((automation.x + movie.x + movie.width) / 2);
    for (const a of layout.groups) for (const b of layout.groups) if (a !== b) {
      expect(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y).toBe(true);
    }
  });
  it('bounds a 36-session project card without losing any sleeping child, result, or hierarchy', () => {
    const sessions = Array.from({ length: 36 }, (_, i) => ({ ...session(`s${i}`, i ? 's0' : null, i ? 'idle' : 'working'), runtime: i ? 'sleeping' : 'running' }));
    const layout = boardLayout({ ...snapshot, sessions }, {}), group = layout.groups[0];
    expect(group.width).toBe(320); expect(group.height).toBeLessThan(700);
    expect(group.rows).toBe(36); expect(group.bodyHeight).toBe(BOARD_CARD.visibleRows * BOARD_CARD.row + BOARD_CARD.padding * 2);
    expect(layout.nodes).toHaveLength(36); expect(layout.edges).toHaveLength(35);
    expect(layout.nodes[layout.nodes.length - 1].y).toBeGreaterThan(group.y + group.height);
    expect(boardLayout({ ...snapshot, sessions: sessions.map(s => ({ ...s, state: 'failed' })) }, {}).groups).toEqual(layout.groups);
  });
  it('uses explicit project parents without connecting unrelated projects or separate SSH hosts', () => {
    const projects = [{ id: 'p', name: 'p', folder: 'G:/Root' },
      { id: 'explicit', name: 'explicit', folder: 'D:/Other', hierarchy: { parentId: 'p' } },
      { id: 'unrelated', name: 'unrelated', folder: 'D:/Separate' },
      { id: 'ssh', name: 'ssh', folder: 'G:/Root/child', sshHostId: 'remote', remoteFolder: '/work' }];
    const data = { ...snapshot, projects, sessions: projects.map(p => ({ ...session(p.id, null), projectId: p.id })) };
    expect(boardLayout(data, {}).projectEdges).toEqual([{ from: 'p', to: 'explicit' }]);
    const all = boardLayout(data, {}), filtered = boardLayout(data, { projectId: 'explicit' });
    expect(filtered.groups[0]).toEqual(all.groups.find(g => g.id === 'explicit'));
    expect(boardLayout({ ...data, projects: projects.map(p => ({ ...p, hierarchy: { parentId: p.id === 'p' ? 'explicit' : 'p' } })) }, {}).groups).toHaveLength(4);
  });
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
