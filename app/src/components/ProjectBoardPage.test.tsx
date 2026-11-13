import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ProjectBoardPage } from './ProjectBoardPage';
import { AppLanguageProvider } from '../lib/appLanguage';
import type { BoardSnapshot } from '../lib/workBoard';
describe('Board-only renderer without GUI automation', () => {
  it('shows the native background count and orbit separately from earlier unreviewed results', () => {
    const data: BoardSnapshot = { revision: 'r', preferences: {}, storageError: null, projects: [{ id: 'p', name: 'Project', folder: 'D:/Project' }],
      sessions: [{ id: 'a', projectId: 'p', name: 'Claude worker', runtime: 'running', state: 'background', provider: 'claude', parentId: null, backgroundCount: 3,
        folder: 'D:/Project', updatedAt: 2000, summary: '', reason: '', fingerprint: 'a', needsAttention: true, task: null }],
      devices: [], items: [{ id: 'result', sessionId: 'a', kind: 'result', createdAt: 1000, summary: 'Earlier result', fingerprint: 'result' }] };
    const markup = renderToStaticMarkup(<ProjectBoardPage initialSnapshot={data}/>);
    expect(markup).toContain('has-background-work'); expect(markup).toContain('data-state="background"');
    expect(markup).toContain('백그라운드 3개 대기'); expect(markup).toContain('Earlier result');
    expect(markup).toContain('미확인 결과'); expect(markup).not.toContain('세션에서 답변하기');
  });
  it('renders projects, sleeping children, review inbox and the session using the computer with escaped text', () => {
    const data = { revision: 'a', preferences: { showSleeping: true }, storageError: null, projects: [{ id: 'p', name: 'RnDHub', folder: 'D:/RnDHub' }],
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
