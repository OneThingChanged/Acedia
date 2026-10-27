import { describe, expect, it } from 'vitest';
import { layoutOfficeSeats, officeAvatar, officeRooms, officeState, officeTeamKey, officeRoles } from './pixelOffice';
import { AGENT_ACTIVITY_STALE_AFTER_MS } from './agentActivity';
import type { Agent, Project } from '../types';

const now = 100000000;
const agent = (id: string, patch: Partial<Agent> = {}): Agent => ({ id, name: id, aiToolId: 'codex', aiLabel: 'Codex', dangerous: false, projectId: 'p', folder: 'C:/RnDHub', createdAt: 1, status: 'running', ...patch });
const projects = [{ id: 'p', name: 'RnDHub', folder: 'C:/RnDHub', createdAt: 1 }, { id: 'q', name: 'Other', folder: 'C:/Other', createdAt: 2 }] as Project[];
const activity = (workStatus: NonNullable<Agent['activity']>['workStatus']) => ({ workStatus, receivedAt: now, stateStartedAt: now, source: 'hook' as const });

describe('Pixel Office host projection', () => {
  it('groups duplicate registrations of an exact project root without merging nested or same-name folders', () => {
    const aliases = [...projects, { ...projects[0], id: 'alias', folder: 'c:\\rndhub\\' },
      { ...projects[0], id: 'nested', folder: 'C:/RnDHub/child' }, { ...projects[0], id: 'same-name', folder: 'D:/RnDHub' }];
    const source = [agent('root'), agent('alias', { projectId: 'alias' }), agent('nested', { projectId: 'nested' }), agent('other-disk', { projectId: 'same-name' })];
    const original = structuredClone(source);
    const rooms = officeRooms(source, aliases);
    expect(rooms).toHaveLength(3);
    expect(rooms[0].projectIds).toEqual(['p', 'alias']);
    expect(rooms[0].total).toBe(2);
    expect(rooms[0].sessions.find(a => a.id === 'alias')!.projectId).toBe('alias');
    expect(officeRooms(source, aliases, { projectId: 'alias' })[0].total).toBe(2);
    expect(source).toEqual(original);
  });
  it('keeps remote hosts and POSIX case distinct while normalizing Windows UNC aliases', () => {
    const remote = { ...projects[0], sshHostId: 'host', remoteFolder: '/Project' };
    expect(officeTeamKey(remote)).not.toBe(officeTeamKey({ ...remote, sshHostId: 'other' }));
    expect(officeTeamKey(remote)).not.toBe(officeTeamKey({ ...remote, remoteFolder: '/project' }));
    expect(officeTeamKey({ ...projects[0], folder: '\\\\Server\\Share\\Game\\' })).toBe(officeTeamKey({ ...projects[0], folder: '//server/share/game' }));
    expect(officeTeamKey({ ...projects[0], folder: '' })).not.toBe(officeTeamKey({ ...projects[0], id: 'missing', folder: '' }));
  });
  it('derives leads, managers, members and independent employees from the full hierarchy regardless of state and filtering', () => {
    const source = [agent('lead'), agent('middle', { sessionHierarchy: { parentId: 'lead' }, status: 'exited' }),
      agent('member', { sessionHierarchy: { parentId: 'middle' }, deferredStart: true, resumeEligible: true }), agent('independent', { name: 'RnDHub' })];
    const room = officeRooms(source, projects)[0], roles = room.roles;
    expect([...roles.values()].map(info => info.role)).toEqual(['lead', 'manager', 'member', 'independent']);
    expect(roles.get('lead')!.reports).toBe(1); expect(roles.get('middle')!.reports).toBe(1);
    const filtered = officeRooms(source, projects, { activeOnly: true, query: 'middle' })[0];
    expect(filtered.sessions).toHaveLength(1);
    expect(filtered.roles.get('middle')!.role).toBe('manager');
    expect(filtered.roles.get('lead')!.reports).toBe(1);
    const page = layoutOfficeSeats([source[2]], 320, roles);
    expect(page.seats[0].role).toBe('member'); // Parent is on a different page.
  });
  it('does not invent a lead from the project name and permits multiple actual leads in a team', () => {
    const source = [agent('RnDHub'), agent('another-lead'), agent('child-a', { sessionHierarchy: { parentId: 'RnDHub' } }),
      agent('child-b', { sessionHierarchy: { parentId: 'another-lead' } }), agent('unrelated')];
    const roles = officeRooms(source, projects)[0].roles;
    expect([...roles.values()].filter(info => info.role === 'lead')).toHaveLength(2);
    expect(officeRoles([agent('RnDHub')]).get('RnDHub')!.role).toBe('independent');
  });
  it('keeps a child cwd inside its registered project team and places its manager on the preceding row', () => {
    const root = agent('root'), child = agent('child', { folder: 'C:/RnDHub/SwarmLab', sessionHierarchy: { parentId: 'root', folderOverride: 'C:/RnDHub/SwarmLab' } });
    const room = officeRooms([root, child], projects)[0];
    expect(room.total).toBe(2); expect(room.project.folder).toBe('C:/RnDHub');
    const layout = layoutOfficeSeats(room.sessions, 320, room.roles);
    expect(layout.seats[0].x).toBe((320 - 124) / 2);
    expect(layout.seats[0].y).toBeLessThan(layout.seats[1].y);
    expect(layout.seats[0].x).toBe(layout.seats[1].x);
  });
  it('does not confuse a live CLI, cancellation, stale tools, stopped processes or turn completion with active work', () => {
    expect(officeState(agent('live'), now)).toBe('idle');
    expect(officeState(agent('cancelled', { activity: undefined }), now)).toBe('idle');
    expect(officeState(agent('stale', { activity: { ...activity('working'), receivedAt: now - AGENT_ACTIVITY_STALE_AFTER_MS - 1 } }), now)).toBe('idle');
    expect(officeState(agent('working', { activity: activity('working') }), now)).toBe('working');
    expect(officeState(agent('question', { activity: activity('waiting') }), now)).toBe('waiting');
    expect(officeState(agent('approval', { activity: activity('blocked') }), now)).toBe('blocked');
    expect(officeState(agent('turn', { activity: activity('done') }), now)).toBe('done');
    expect(officeState(agent('exited', { status: 'exited', activity: activity('working') }), now)).toBe('stopped');
    expect(officeState(agent('sleeping', { deferredStart: true, resumeEligible: true, activity: activity('working') }), now)).toBe('sleeping');
    expect(officeState(agent('new', { deferredStart: true, resumeEligible: false }), now)).toBe('stopped');
    expect(officeState(agent('offline', { runtimeStatus: 'unreachable' }), now)).toBe('disconnected');
  });
  it('uses a current read/search tool start, not a tool name retained after completion', () => {
    const read = { ...activity('working'), toolName: 'Read', hookEventName: 'PreToolUse' };
    expect(officeState(agent('read', { activity: read }), now)).toBe('reading');
    expect(officeState(agent('read', { activity: { ...read, hookEventName: 'PostToolUse' } }), now)).toBe('working');
  });
  it('keeps inactive descendants under active parents and excludes unrelated inactive siblings of a contextual parent', () => {
    const source = [agent('parent'), agent('stopped', { status: 'exited', sessionHierarchy: { parentId: 'parent' } }),
      agent('sleeping', { deferredStart: true, resumeEligible: true, sessionHierarchy: { parentId: 'stopped' } }),
      agent('unrelated', { status: 'exited' }), agent('archived', { sidebarArchived: true }), agent('cross', { projectId: 'q', status: 'exited', sessionHierarchy: { parentId: 'parent' } })];
    const before = structuredClone(source);
    expect(officeRooms(source, projects, { activeOnly: true }).flatMap(r => r.sessions.map(a => a.id))).toEqual(['parent', 'stopped', 'sleeping']);
    expect(source).toEqual(before);
    source[0].status = 'exited'; source.push(agent('active-child', { sessionHierarchy: { parentId: 'parent' } }));
    expect(officeRooms(source, projects, { activeOnly: true }).flatMap(r => r.sessions.map(a => a.id))).toEqual(['parent', 'active-child']);
  });
  it('searches metadata and paths and groups by current project without fetching conversation history', () => {
    const source = [agent('SwarmLab', { folder: 'G:\\AI\\RnDHub\\SwarmLab' }), agent('Other', { projectId: 'q' })];
    expect(officeRooms(source, projects, { query: 'G:/AI/RnDHub/SwarmLab' }).map(r => r.project.id)).toEqual(['p']);
    expect(officeRooms(source, projects, { projectId: 'q' }).flatMap(r => r.sessions.map(a => a.id))).toEqual(['Other']);
  });
  it('keeps stable character/seat assignments across state changes and activity sorting', () => {
    const source = [agent('z'), agent('a', { sessionHierarchy: { parentId: 'z' } }), agent('b')];
    const before = officeRooms(source, projects)[0].sessions;
    const changed = source.map(a => ({ ...a, activity: activity('waiting'), lastOpenedAt: now }));
    const after = officeRooms(changed, projects)[0].sessions;
    const positions = (rows: Agent[]) => layoutOfficeSeats(rows, 320).seats.map(({ agent: a, ...seat }) => ({ id: a.id, avatar: officeAvatar(a.id), ...seat }));
    expect(positions(before)).toEqual(positions(after));
    expect(positions(before).map(a => a.id)).toEqual(['b', 'z', 'a']);
  });
  it.each([240, 320, 480, 950])('keeps every page hit target inside the %i px scene', width => {
    const layout = layoutOfficeSeats(Array.from({ length: 24 }, (_, n) => agent(String(n))), width);
    expect(layout.seats.every(seat => seat.x >= 0 && seat.x + 124 <= width && seat.y + 139 < layout.height)).toBe(true);
  });
});
