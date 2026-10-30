import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { SessionMessages, sessionMessageText } from './session-messages.mjs';
import { WorkspaceManagement } from './workspace-management.mjs';
import { HookService } from './hook-service.mjs';

const cleanups = [], hash = value => createHash('sha256').update(value, 'utf8').digest('hex');
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
const text = '한글 명령: 폴더·세션을 확인해 주세요. 🚀\n\t들여쓰기와 줄바꿈, "따옴표", ${변수}도 그대로 보존합니다.';
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-session-text-'));
  cleanups.push(() => { if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('acedia-session-text-')) throw Error('Unexpected cleanup path'); fs.rmSync(root, { recursive: true }); });
  const agents = [{ id: 'sender', name: '한글 관리자', projectId: 'p', aiToolId: 'codex' }, { id: 'receiver', name: '수신자', projectId: 'p', aiToolId: 'codex' }, { id: 'other', name: 'Other', projectId: 'p', aiToolId: 'claude' }];
  const active = new Set(['sender', 'receiver', 'other']);
  const context = id => active.has(id) ? { entry: { aiToolId: 'codex' }, conversationId: 'conversation' } : null;
  let notified = false;
  const notify = vi.fn(async () => { notified = true; return { deliveryId: 'notification', status: 'started', turnId: 'turn' }; });
  const receipt = vi.fn(async () => notified ? { deliveryId: 'notification', status: 'started', turnId: 'turn' } : null);
  const options = { file: path.join(root, 'messages.json'), sessionFor: id => agents.find(a => a.id === id), context, notify, receipt, now: () => 1000 };
  const service = new SessionMessages(options), call = (action, body, agentId = 'sender') => service.handle({ action, body, agentId });
  return { root, options, service, call, active, agents, notify, receipt };
}
it('keeps Unicode verbatim in durable storage and sends only an ASCII reference to the native terminal', async () => {
  const f = fixture(), result = await f.call('message-send', { sessionId: 'receiver', message: text, requestKey: 'ko-1' });
  expect(result).toMatchObject({ saved: true, sha256: hash(text), bytes: Buffer.byteLength(text), readAt: null, delivery: { status: 'started' } });
  const [sourceId, notification] = f.notify.mock.calls[0];
  expect(sourceId).toBe('sender'); expect(notification.expectedConversationId).toBe('conversation');
  expect(notification.message).toMatch(/^[\x00-\x7f]+$/); expect(notification.message).not.toContain(text);
  expect(notification.message).toContain(result.messageId);
  expect(fs.readFileSync(f.options.file, 'utf8')).toContain('한글 명령');
  const peek = await f.call('message-receive', { messageId: result.messageId, markRead: false, includeBase64: true }, 'receiver');
  expect(peek.messages[0]).toMatchObject({ message: text, readAt: null });
  expect(Buffer.from(peek.messages[0].messageBase64, 'base64').toString('utf8')).toBe(text);
  const read = await f.call('message-receive', { messageId: result.messageId }, 'receiver');
  expect(read.messages[0].readAt).toBe(1000);
  expect((await f.call('message-receive', { direction: 'outbox' })).messages[0].readAt).toBe(1000);
  expect((await f.call('message-receive', {}, 'receiver')).messages).toEqual([]);
});
it('preserves the same message ID and one notification across concurrent sends, alternate encodings and app restart', async () => {
  const f = fixture(), body = { sessionId: 'receiver', message: text, requestKey: 'same' };
  const [a, b] = await Promise.all([f.call('message-send', body), f.call('message-send', body)]);
  expect(a.messageId).toBe(b.messageId); expect(f.notify).toHaveBeenCalledOnce();
  const restarted = new SessionMessages(f.options);
  const again = await restarted.handle({ action: 'message-send', agentId: 'sender', body: { sessionId: 'receiver', messageBase64: Buffer.from(text).toString('base64'), requestKey: 'same' } });
  expect(again.messageId).toBe(a.messageId); expect(f.notify).toHaveBeenCalledOnce();
  await expect(f.call('message-send', { ...body, message: '다른 본문' })).rejects.toMatchObject({ statusCode: 409 });
});
it('can notify a live pre-first-conversation session without guessing its conversation ID',async()=>{
  const f=fixture();f.service.context=id=>f.active.has(id)?{entry:{aiToolId:'codex'},conversationId:null}:null;
  const body={sessionId:'receiver',message:text,requestKey:'first'};
  const result=await f.call('message-send',body);
  expect(result).toMatchObject({saved:true,delivery:{status:'started'}});
  expect(f.notify.mock.calls[0][1]).toMatchObject({expectedConversationId:null});
  await f.call('message-send',body);expect(f.notify).toHaveBeenCalledOnce();
  await expect(f.call('message-send',{...body,requestKey:'stale',expectedConversationId:'old'})).rejects.toMatchObject({statusCode:409});
  f.active.delete('receiver');
  await expect(f.call('message-send',{...body,requestKey:'offline-first'})).rejects.toMatchObject({statusCode:409});
});
it('reconciles a crash between notification acceptance and mailbox receipt persistence without sending again', async () => {
  const f = fixture(), body = { sessionId: 'receiver', message: text, requestKey: 'crash' };
  await f.call('message-send', body);
  const records = JSON.parse(fs.readFileSync(f.options.file, 'utf8')); records[0].delivery = { status: 'notifying' }; fs.writeFileSync(f.options.file, JSON.stringify(records));
  const restarted = new SessionMessages(f.options);
  const restored = await restarted.handle({ action: 'message-send', agentId: 'sender', body });
  expect(restored.delivery.status).toBe('started'); expect(f.notify).toHaveBeenCalledOnce();
});
it('supports UTF-8 files, BOM, strict base64 and checksum verification before any notification', async () => {
  const f = fixture(), file = path.join(f.root, '본문.txt'); fs.writeFileSync(file, '\ufeff' + text, 'utf8');
  expect(sessionMessageText({ messageFile: file, expectedSha256: hash(text) })).toBe(text);
  await expect(f.call('message-send', { sessionId: 'receiver', messageBase64: Buffer.from(text).toString('base64'), expectedSha256: '0'.repeat(64), requestKey: 'bad-sha' })).rejects.toMatchObject({ statusCode: 409 });
  expect(f.notify).not.toHaveBeenCalled(); expect(fs.existsSync(f.options.file)).toBe(false);
  await f.call('message-send', { sessionId: 'receiver', messageFile: file, expectedSha256: hash(text), requestKey: 'file' });
});
it.each([{ message: '' }, { message: '\ud800' }, { message: 'a', messageBase64: 'YQ==' }, { messageBase64: '!!!!' }, { messageBase64: '/w==' }, { messageFile: '.' }, { message: 'a'.repeat(65537) }, {}])('rejects malformed or oversized input case %#', body => {
  expect(() => sessionMessageText(body)).toThrow();
});
it('stores for offline/other-provider inboxes without typing, permits replies, and isolates both participants', async () => {
  const f = fixture(); f.active.delete('receiver');
  const a = await f.call('message-send', { sessionId: 'receiver', message: text, requestKey: 'offline', notify: false });
  const b = await f.call('message-send', { sessionId: 'other', message: 'Claude 본문', requestKey: 'claude', notify: false });
  expect(f.notify).not.toHaveBeenCalled();
  await expect(f.call('message-receive', { messageId: a.messageId }, 'other')).rejects.toMatchObject({ statusCode: 404 });
  await expect(f.call('message-send', { sessionId: 'other', message: '누설', requestKey: 'wrong-reply', replyTo: a.messageId, notify: false }, 'receiver')).rejects.toMatchObject({ statusCode: 409 });
  await f.call('message-send', { sessionId: 'sender', message: '확인했습니다.', requestKey: 'reply', replyTo: a.messageId, notify: false }, 'receiver');
  const inbox = await f.call('message-receive', {});
  expect(inbox.messages[0]).toMatchObject({ message: '확인했습니다.', replyTo: a.messageId });
  expect((await f.call('message-receive', { messageId: b.messageId }, 'other')).messages[0].message).toBe('Claude 본문');
});
it('does not conflate notification start with body read, and does not replay uncertain notification failures', async () => {
  const f = fixture(); f.notify.mockRejectedValue(new Error('notification outcome unknown'));
  const body = { sessionId: 'receiver', message: text, requestKey: 'uncertain' };
  const result = await f.call('message-send', body);
  expect(result).toMatchObject({ saved: true, readAt: null, delivery: { status: 'notification-error' } });
  await f.call('message-send', body); expect(f.notify).toHaveBeenCalledOnce();
  const inbox = await f.call('message-receive', {}, 'receiver'); expect(inbox.messages[0].message).toBe(text);
});
it('pages without truncating Unicode bodies and rejects stale conversations, bad keys and cross-session sends', async () => {
  const f = fixture();
  for (const extra of [{ requestKey: ['bad'] }, { sessionId: 'sender' }, { expectedConversationId: 'old' }, { notify: 'false' }]) {
    await expect(f.call('message-send', { sessionId: 'receiver', message: text, requestKey: 'bad', ...extra })).rejects.toThrow();
  }
  const large = '한'.repeat(20000);
  for (let i = 0; i < 3; i++) await f.call('message-send', { sessionId: 'receiver', message: large, requestKey: 'large-' + i, notify: false });
  const first = await f.call('message-receive', {}, 'receiver'); expect(first.messages).toHaveLength(2); expect(first.hasMore).toBe(true);
  const next = await f.call('message-receive', { after: first.nextAfter }, 'receiver'); expect(next.messages).toHaveLength(1); expect(next.messages[0].message).toBe(large);
});
it('fails closed for corrupt stored content and after a persistence failure', async () => {
  const f = fixture(); await f.call('message-send', { sessionId: 'receiver', message: text, requestKey: 'one', notify: false });
  const records = JSON.parse(fs.readFileSync(f.options.file, 'utf8')); records[0].message = '변조'; fs.writeFileSync(f.options.file, JSON.stringify(records));
  expect(new SessionMessages(f.options).unavailable).toBe(true);
  const g = fixture(); fs.mkdirSync(g.options.file + '.tmp');
  await expect(g.call('message-send', { sessionId: 'receiver', message: text, requestKey: 'fail' })).rejects.toMatchObject({ statusCode: 503 });
  expect(g.notify).not.toHaveBeenCalled();
});

async function integration() {
  const f = fixture();
  const workspace = new WorkspaceManagement({ catalog: () => ({ projects: [{ id: 'p', name: 'Fixture', folder: f.root }], agents: f.agents }), isActive: id => f.active.has(id), messages: f.service });
  const hook = new HookService({ baseDir: path.join(f.root, 'hook'), workspaceProvider: request => workspace.handle(request) });
  await hook.start(); cleanups.push(() => new Promise(resolve => { hook.server.closeAllConnections(); hook.server.close(resolve); }));
  const headers = { authorization: 'Bearer ' + hook.token, 'x-acedia-agent-id': 'sender', 'content-type': 'application/json; charset=utf-8' };
  const base = `http://127.0.0.1:${hook.port}/integration/v1/workspace/messages`;
  const client = agentId => {
    const child = spawn(process.execPath, [path.resolve('electron/services/browser-mcp-server.mjs')], { windowsHide: true, env: { ...process.env, MULTIAGENT_PORT: String(hook.port), MULTIAGENT_TOKEN: hook.token, MULTIAGENT_AGENT_ID: agentId }, stdio: ['pipe', 'pipe', 'ignore'] });
    cleanups.push(() => { child.stdin.end(); child.kill(); });
    child.stdout.setEncoding('utf8'); let buffer = '', next = 0; const pending = new Map();
    child.stdout.on('data', chunk => { buffer += chunk; let end; while ((end = buffer.indexOf('\n')) >= 0) { const row = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1); pending.get(row.id)?.(row.result); pending.delete(row.id); } });
    return (method, params = {}, split = false) => new Promise(resolve => {
      const id = ++next; pending.set(id, resolve); const bytes = Buffer.from(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
      if (split) { for (const byte of bytes) child.stdin.write(Buffer.from([byte])); } else child.stdin.write(bytes);
    });
  };
  return { ...f, hook, headers, base, client };
}
it('round-trips split UTF-8 through real stdio MCP and HTTP, rejects origins/auth and invalid UTF-8, and exposes read receipts', async () => {
  const f = await integration(), sender = f.client('sender'), receiver = f.client('receiver');
  await sender('initialize'); await receiver('initialize');
  expect((await sender('tools/list')).tools.map(t => t.name)).toContain('acedia_session_message_receive');
  for (const endpoint of ['send', 'receive']) {
    expect((await fetch(f.base + '/' + endpoint, { method: 'POST', body: '{}' })).status).toBe(401);
    expect((await fetch(f.base + '/' + endpoint, { method: 'POST', headers: { ...f.headers, origin: 'https://elsewhere.invalid' }, body: '{}' })).status).toBe(403);
    expect((await fetch(f.base + '/' + endpoint, { method: 'POST', headers: { ...f.headers, 'x-acedia-agent-id': 'inactive' }, body: '{}' })).status).toBe(409);
  }
  const bad = Buffer.concat([Buffer.from('{"x":"'), Buffer.from([0xff]), Buffer.from('"}')]);
  expect((await fetch(f.base + '/send', { method: 'POST', headers: f.headers, body: bad })).status).toBe(400);
  const sent = await sender('tools/call', { name: 'acedia_session_message_send', arguments: { sessionId: 'receiver', message: text, requestKey: 'unicode', notify: false, expectedSha256: hash(text) } }, true);
  expect(sent.isError).not.toBe(true); expect(sent.structuredContent.sha256).toBe(hash(text));
  const received = await receiver('tools/call', { name: 'acedia_session_message_receive', arguments: { messageId: sent.structuredContent.messageId } });
  expect(received.structuredContent.messages[0]).toMatchObject({ message: text, sha256: hash(text), readAt: 1000 });
  expect((await sender('tools/call', { name: 'acedia_session_message_receive', arguments: { direction: 'outbox' } })).structuredContent.messages[0].readAt).toBe(1000);
}, 15000);
it.runIf(process.platform === 'win32')('verifies Windows PowerShell callers against SHA-256 and explicit UTF-8 byte bodies', async () => {
  const f = await integration();
  const payload = { sessionId: 'receiver', requestKey: 'powershell', message: text, expectedSha256: hash(text), notify: false };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64');
  const invoke = correct => new Promise((resolve, reject) => {
    const script = `[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false);$json=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}'));$headers=@{Authorization='Bearer ${f.hook.token}';'x-acedia-agent-id'='sender'};try{$result=Invoke-RestMethod -Uri '${f.base}/send' -Method Post -Headers $headers -ContentType '${correct ? 'application/json; charset=utf-8' : 'application/json'}' -Body ${correct ? '([Text.Encoding]::UTF8.GetBytes($json))' : '$json'};@{status=200;sha256=$result.sha256}|ConvertTo-Json -Compress}catch{@{status=[int]$_.Exception.Response.StatusCode}|ConvertTo-Json -Compress}`;
    const child = spawn(path.join(process.env.SystemRoot || 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe'), ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', error = ''; child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8'); child.stdout.on('data', c => { output += c; }); child.stderr.on('data', c => { error += c; });
    child.on('error', reject); child.on('exit', code => { try { if (code) throw Error(error); resolve(JSON.parse(output.trim())); } catch (e) { reject(e); } });
  });
  const legacy = await invoke(false), fixed = await invoke(true);
  expect(fixed).toEqual({ status: 200, sha256: hash(text) });
  expect((await f.call('message-receive', {}, 'receiver')).messages[0].message).toBe(text);
  console.log('POWERSHELL_SESSION_MESSAGE_UTF8', JSON.stringify({ legacyStatus: legacy.status, explicitUtf8Status: fixed.status, preserved: fixed.sha256 === hash(text) }));
}, 20000);
