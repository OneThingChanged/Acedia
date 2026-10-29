import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { PixelOffice } from './PixelOffice';
import type { Agent, Project } from '../types';

const projects = [{ id: 'p', name: 'RnDHub', folder: 'C:/RnDHub', createdAt: 1 }] as Project[];
const root = { id: 'root', name: 'Manager', aiToolId: 'codex', projectId: 'p', folder: 'C:/RnDHub', status: 'running', createdAt: 1 } as Agent;
const sleeping = { ...root, id: 'sleep', name: 'Sleeping child', deferredStart: true, resumeEligible: true, sessionHierarchy: { parentId: root.id } };

it('exposes real keyboard-selectable sessions and separate explicit conversation opening in both placements', () => {
  const parent = { ...root, deferredStart: true, resumeEligible: true };
  const child = { ...root, id: 'live', name: 'Active child', sessionHierarchy: { parentId: root.id } };
  for (const mode of ['board', 'sidebar'] as const) {
    const html = renderToStaticMarkup(<PixelOffice mode={mode} agents={[parent, child]} projects={projects} activeProjectId="p" selectedId="live" onOpenSession={() => {}}/>);
    expect(html).toContain(`po-${mode}`);
    expect(html).toContain('data-office-agent="live"');
    expect(html).toContain('data-office-state="sleeping"');
    expect(html).toContain('data-office-role="lead"');
    expect(html).toContain('data-office-role="member"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('대화 열기');
    expect(html).toContain('Manager');
    expect(html).toContain('Pixel Agents · MIT');
    expect(html).not.toContain('spawn_pty');
  }
});
it('restricts the dock to active sessions across projects while preserving the board controls and full catalog', () => {
  const other = { ...root, id: 'other', projectId: 'q' };
  const catalog = [...projects, { ...projects[0], id: 'q', name: 'Other', folder: 'C:/Other' }];
  const agents = [root, sleeping, other];
  const sidebar = renderToStaticMarkup(<PixelOffice mode="sidebar" agents={agents} projects={catalog} activeProjectId="p" onOpenSession={() => {}}/>);
  expect(sidebar).toContain('data-office-agent="root"');
  expect(sidebar).toContain('data-office-agent="other"');
  expect(sidebar).not.toContain('data-office-agent="sleep"');
  expect(sidebar).toContain('<option value="all" selected="">');
  expect(sidebar).toContain('po-active-scope');
  expect(sidebar).not.toContain('type="checkbox"');
  const board = renderToStaticMarkup(<PixelOffice agents={agents} projects={catalog} activeProjectId="p" onOpenSession={() => {}}/>);
  expect(board).toContain('data-office-agent="sleep"');
  expect(board).toContain('type="checkbox"');
});
it('renders duplicate project folders as one team and distinguishes same-name sessions without renaming them', () => {
  const aliases = [...projects, { ...projects[0], id: 'alias', folder: 'c:\\rndhub\\' }];
  const agents = [root, { ...root, id: 'other', projectId: 'alias' }];
  const html = renderToStaticMarkup(<PixelOffice agents={agents} projects={aliases} activeProjectId="alias" mode="sidebar" onOpenSession={() => {}}/>);
  expect((html.match(/data-office-project=/g) || []).length).toBe(1);
  expect((html.match(/data-office-role="independent"/g) || []).length).toBe(2);
  expect(html).toContain('Manager #1'); expect(html).toContain('Manager #2');
  expect(agents.map(a => a.name)).toEqual(['Manager', 'Manager']);
});
it('keeps all employees in one continuous scene with fit, zoom and department navigation', () => {
  const agents = Array.from({ length: 70 }, (_, n) => ({ ...root, id: `session-${n}` }));
  const html = renderToStaticMarkup(<PixelOffice agents={agents} projects={projects} activeProjectId="p" onOpenSession={() => {}}/>);
  expect((html.match(/data-office-agent=/g) || []).length).toBe(70);
  expect((html.match(/<canvas/g) || []).length).toBe(1);
  expect(html).toContain('data-office-fit'); expect(html).toContain('data-office-readable');
  expect(html).toContain('po-world'); expect(html).not.toContain('po-room-stage'); expect(agents).toHaveLength(70);
});
it('uses one canvas for multiple named departments instead of overlapping room articles', () => {
  const html = renderToStaticMarkup(<PixelOffice agents={[root, { ...root, id: 'other', projectId: 'q' }]} projects={[...projects, { ...projects[0], id: 'q', folder: 'C:/Other', name: 'Other' }]} activeProjectId="p" onOpenSession={() => {}}/>);
  expect((html.match(/<canvas/g) || []).length).toBe(1);
  expect((html.match(/data-office-project=/g) || []).length).toBe(2);
  expect(html).not.toContain('<article');
});
it('renders a useful empty state without manufacturing demo sessions', () => {
  const html = renderToStaticMarkup(<PixelOffice agents={[]} projects={[]} activeProjectId={null} onOpenSession={() => {}}/>);
  expect(html).toContain('표시할 세션이 없습니다'); expect(html).not.toContain('data-office-agent=');
});
