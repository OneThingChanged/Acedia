import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ProjectBoardPage } from './ProjectBoardPage';
import { AppLanguageProvider } from '../lib/appLanguage';
import type { BoardSnapshot } from '../lib/workBoard';
describe('Board-only renderer without GUI automation', () => {
  it('automatically packs a hidden overview without replacing the saved full-board positions', () => {
    const data: BoardSnapshot = { revision: 'r', preferences: { viewMode: 'board', showSleeping: true, showStopped: true, zoom: .8,
      projectPositions: { p: { x: 9000, y: 8000 } } }, storageError: null, projects: [{ id: 'p', name: 'Project', folder: 'D:/Project' }],
      sessions: [{ id: 'a', projectId: 'p', name: 'Worker', runtime: 'running', state: 'working', provider: 'codex', parentId: null,
        folder: 'D:/Project', updatedAt: 2000, summary: '', reason: '', fingerprint: 'a', needsAttention: false, task: null }], devices: [] };
    const original = structuredClone(data);
    const full = renderToStaticMarkup(<ProjectBoardPage initialSnapshot={data}/>);
    expect(full).toContain('left:9000px;top:8000px');
    const hidden = renderToStaticMarkup(<ProjectBoardPage initialSnapshot={{ ...data, preferences: { ...data.preferences, showSleeping: false, showStopped: false, zoom: .47 } }}/>);
    expect(hidden).toContain('data-density="overview"'); expect(hidden).toContain('left:28px;top:38px;width:320px;height:84px');
    expect(hidden).toContain('보이는 항목 기준 자동 정렬'); expect(hidden).not.toContain('left:9000px');
    expect(renderToStaticMarkup(<ProjectBoardPage initialSnapshot={data}/>)).toContain('left:9000px;top:8000px');
    expect(data).toEqual(original);
  });
  it('shows actual child waiting on the leader while retaining its earlier result in the inbox', () => {
    const data: BoardSnapshot = { revision: 'r', preferences: { viewMode: 'board' }, storageError: null, projects: [{ id: 'p', name: 'Project', folder: 'D:/Project' }],
      sessions: [{ id: 'a', projectId: 'p', name: 'Leader', runtime: 'running', state: 'review', provider: 'codex', parentId: null,
        delegatedWait: { count: 2, childIds: ['b', 'c'], observedAt: 2000 }, folder: 'D:/Project', updatedAt: 2000, summary: '', reason: '', fingerprint: 'a', needsAttention: true, task: null }],
      devices: [], items: [{ id: 'result', sessionId: 'a', kind: 'result', createdAt: 1000, summary: 'Earlier leader result', fingerprint: 'result' }] };
    const markup = renderToStaticMarkup(<ProjectBoardPage initialSnapshot={data}/>);
    expect(markup).toContain('has-background-work'); expect(markup).toContain('자식 작업 2개 대기');
    expect(markup).toContain('data-state="background" data-child-wait="true"'); expect(markup).toContain('Earlier leader result');
  });
  it('shows the native background count and orbit separately from earlier unreviewed results', () => {
    const data: BoardSnapshot = { revision: 'r', preferences: { viewMode: 'board' }, storageError: null, projects: [{ id: 'p', name: 'Project', folder: 'D:/Project' }],
      sessions: [{ id: 'a', projectId: 'p', name: 'Claude worker', runtime: 'running', state: 'background', provider: 'claude', parentId: null, backgroundCount: 3,
        folder: 'D:/Project', updatedAt: 2000, summary: '', reason: '', fingerprint: 'a', needsAttention: true, task: null }],
      devices: [], items: [{ id: 'result', sessionId: 'a', kind: 'result', createdAt: 1000, summary: 'Earlier result', fingerprint: 'result' }] };
    const markup = renderToStaticMarkup(<ProjectBoardPage initialSnapshot={data}/>);
    expect(markup).toContain('has-background-work'); expect(markup).toContain('data-state="background"');
    expect(markup).not.toContain('data-child-wait');
    expect(markup).toContain('백그라운드 3개 대기'); expect(markup).toContain('Earlier result');
    expect(markup).toContain('미확인 결과'); expect(markup).not.toContain('세션에서 답변하기');
  });
  it('renders projects, sleeping children, review inbox and the session using the computer with escaped text', () => {
    const data = { revision: 'a', preferences: { viewMode: 'board', showSleeping: true }, storageError: null, projects: [{ id: 'p', name: 'RnDHub', folder: 'D:/RnDHub' }],
      sessions: [{ id: 'a', projectId: 'p', name: 'Manager', runtime: 'running', state: 'working', provider: 'codex', parentId: null },
        { id: 'b', projectId: 'p', name: '<img src=x onerror=unsafe>', runtime: 'sleeping', state: 'review', provider: 'claude', parentId: 'a', needsAttention: true }],
      devices: [{ sessionId: 'a', kind: 'desktop', state: 'active', tool: 'cua_repl', source: 'hook' }] } as BoardSnapshot;
    const markup = renderToStaticMarkup(<AppLanguageProvider><ProjectBoardPage initialSnapshot={data}/></AppLanguageProvider>);
    expect(markup).toContain('RnDHub'); expect(markup).toContain('Manager'); expect(markup).toContain('Sleeping');
    expect(markup).toContain('data-provider="codex"'); expect(markup).toContain('data-provider="claude"');
    expect(markup).toContain('cua_repl'); expect(markup).toContain('&lt;img'); expect(markup).not.toContain('<img');
    expect(markup).not.toContain('xterm'); expect(markup).not.toContain('textarea');
    expect(markup.match(/wb-node-open/g)).toHaveLength(2);
  });
});
