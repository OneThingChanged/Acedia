import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, expect, it, vi } from 'vitest';
import { SessionService } from './session-service.mjs';
import { HookService } from './hook-service.mjs';
const { sessionEvent } = createRequire(import.meta.url)('./antigravity-statusline.cjs');
const roots = [];
const root = () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-agy-resume-')); roots.push(dir); return dir; };
afterEach(() => roots.splice(0).forEach(dir => fs.rmSync(dir, { recursive: true, force: true })));
const first = '11111111-1111-4111-8111-111111111111', second = '22222222-2222-4222-8222-222222222222';

it('persists independent session IDs in a shared folder and refuses latest-folder fallback', async () => {
  const directory = root(); const service = new SessionService(directory);
  for (const id of [first, second]) fs.writeFileSync(path.join(directory, `${id}.db`), 'fixture');
  await Promise.all([['a', first], ['b', second]].map(([id, session_id]) => service.noteHook({ id, session_id, cwd: directory,
    event: 'session-start', hook_event_name: 'AntigravitySession' })));
  const reopened = new SessionService(directory);
  for (const [agentId, expected] of [['a', first], ['b', second]]) {
    expect(await reopened.resolveAntigravity({ agentId, folder: directory, directory })).toBe(expected);
  }
  expect(await reopened.resolveAntigravity({ agentId: 'new', folder: directory, directory })).toBeNull();
  fs.unlinkSync(path.join(directory, `${first}.db`));
  await expect(reopened.resolveAntigravity({ agentId: 'a', folder: directory, directory })).rejects.toThrow('unavailable');
  await expect(reopened.resolveAntigravity({ agentId: 'b', folder: path.join(directory, 'changed'), directory })).rejects.toThrow('폴더');
  await expect(reopened.resolveAntigravity({ agentId: 'a', preferredSessionId: '../bad', directory })).rejects.toThrow('Invalid');
});

it('only reports a validated conversation ID to the owning local launcher', () => {
  const env = { MULTIAGENT_AGENT_ID: 'a', MULTIAGENT_AGY_LAUNCH_ID: 'launch', MULTIAGENT_TOKEN: 'token' };
  const event = sessionEvent({ conversation_id: first, prompt: 'private', email: 'private', cwd: '/workspace' }, env);
  expect(event).toMatchObject({ id: 'a', session_id: first, launch_id: 'launch' });
  expect(JSON.stringify(event)).not.toContain('private');
  expect(sessionEvent({ conversation_id: first }, {})).toBeNull();
  expect(sessionEvent({ conversation_id: '../bad' }, env)).toBeNull();
});

it('rejects old launch generations and deduplicates repeated identity notifications', async () => {
  const service = new SessionService(root()); const sendEvent = vi.fn();
  const hook = new HookService({ baseDir: root(), sessionService: service, sendEvent,
    validateAntigravitySession: payload => payload.id === 'a' && payload.launch_id === 'new' });
  await hook.start();
  try {
    const post = launch_id => fetch(`http://127.0.0.1:${hook.port}/event`, { method: 'POST',
      body: JSON.stringify({ token: hook.token, id: 'a', event: 'session-start', hook_event_name: 'AntigravitySession', session_id: first, launch_id }) });
    expect((await post('old')).status).toBe(400);
    expect(service.notes.size).toBe(0);
    expect((await post('new')).status).toBe(200);
    expect((await post('new')).status).toBe(200);
    expect(sendEvent).toHaveBeenCalledTimes(1);
    expect(service.notes.get('a').sessionId).toBe(first);
  } finally { await hook.stop(); }
});
