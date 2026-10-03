import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { SessionNotifications } from './session-notifications.mjs';
import { LocalDashboardService, RemoteDashboardService } from './web-services.mjs';
import { RemoteDeviceMonitorService } from './remote-device-monitor-service.mjs';

describe.each(['dashboard', 'remote'])('%s session interaction API', channel => {
  it('shares revisioned preferences, validates answer identity, and blocks cross-origin changes', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-interactions-'));
    const store = new SessionNotifications(root); const answers = [];
    const providers = { sessionNotifications: (id, change) => change ? store.set(id, change.enabled, change.revision) : store.get(id),
      answerQuestion: (id, body) => { if (body.questionId !== 'current') throw new Error('Question changed'); answers.push(body); return { status: 'sent' }; } };
    const service = channel === 'dashboard' ? new LocalDashboardService({ title: 'Test', defaultPort: 0, baseDir: root, configName: 'dashboard.json', providers })
      : new RemoteDashboardService({ baseDir: root, ...providers });
    if (channel === 'remote') service.config.server_port = 0;
    try {
      const { url } = await service.start();
      const post = (route, body, origin = url.replace(/\/$/, '')) => fetch(`${url}${route}`, { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify(body) });
      expect(await (await fetch(`${url}/api/session/notifications?id=a`)).json()).toEqual({ enabled: true, revision: 0 });
      expect((await post('/api/session/notifications', { id: 'a', enabled: false, revision: 0 })).status).toBe(200);
      expect(store.get('a').enabled).toBe(false);
      expect((await post('/api/session/notifications', { id: 'a', enabled: true, revision: 0 })).status).toBe(409);
      expect((await post('/api/session/notifications', { id: 'a', enabled: true, revision: 1 }, 'https://other.invalid')).status).toBe(403);
      expect((await post('/api/session/answer', { id: 'a', questionId: 'old' })).status).toBe(409);
      expect((await post('/api/session/answer', { id: 'a', questionId: 'current' })).status).toBe(200);
      expect(answers).toHaveLength(1);
      expect((await fetch(`${url}/pwa/question-form.js`)).status).toBe(200);
    } finally { await service.stop(); fs.rmSync(root, { recursive: true }); }
  });
});

it('suppresses completion and question delivery before native or web push publication', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-muted-push-'));
  const events = [];
  const service = new RemoteDashboardService({ baseDir: root, notificationAllowed: () => false,
    deviceMonitorService: { publish: e => events.push(e) }, pushService: { notifyDone: e => events.push(e), notifyQuestion: e => events.push(e) } });
  try {
    await service.notifyAgentDone({ id: 'a', event: 'done' });
    await service.notifyAgentQuestion({ id: 'a', event: 'waiting', interactive_question: 'Choose?' });
    expect(events).toEqual([]);
  } finally { fs.rmSync(root, { recursive: true }); }
});

it('keeps two distinct questions close together while deduplicating the same question', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-question-events-'));
  try {
    const service = new RemoteDeviceMonitorService({ baseDir: root });
    const event = { type:'agent-question', agentId:'a', sessionId:'s', title:'Fixture' };
    expect(service.publish({ ...event, questionId:'one' })).not.toBeNull();
    expect(service.publish({ ...event, questionId:'one' })).toBeNull();
    expect(service.publish({ ...event, questionId:'two' })).not.toBeNull();
  } finally { fs.rmSync(root, { recursive: true }); }
});
