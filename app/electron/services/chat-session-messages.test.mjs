import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { afterEach, expect, it, vi } from 'vitest';
import { SessionMessages } from './session-messages.mjs';
import { SessionDeliveries } from './session-delivery.mjs';
import { parseChatTranscript } from './chat-transcript.mjs';
import { presentChatSessionMessages } from './chat-session-messages.mjs';

const cleanups = [];
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup(); });
const original = '한글 검수 요청 🚀\n\n**정상 종료본**만 확인하세요.\n- [작업 문서](Docs/Task.md)\n- 따옴표 "보존", 들여쓰기\n\t다음 줄';
function fixture(provider = 'codex') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-chat-mail-'));
  cleanups.push(() => {
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('acedia-chat-mail-')) throw Error('Unsafe test cleanup');
    fs.rmSync(root, { recursive: true });
  });
  const contexts = {
    caller: { entry: {}, name: '개발 관리자', projectName: 'ProjectWitch' },
    target: { entry: { aiToolId: provider, lastInputAt: 9000 }, name: 'PW_검수', conversationId: 'conversation', state: 'DONE', reason: 'completed' },
  };
  const options = { file: path.join(root, 'deliveries.json'), context: id => contexts[id], now: () => 10000,
    ready: () => true, read: async () => ({ sessionId: 'conversation', lifecycle: 'done', turn: { id: 'previous' }, deliveries: [] }),
    submit: vi.fn(async () => true) };
  const deliveries = new SessionDeliveries(options);
  const mailOptions = { file: path.join(root, 'messages.json'), context: options.context,
    sessionFor: id => contexts[id] && { id, name: contexts[id].name, aiToolId: provider },
    notify: (agentId, body) => deliveries.handle({ action: 'send', agentId, body, asciiEnvelope: true }), now: () => 10000 };
  const messages = new SessionMessages(mailOptions);
  const page = (raw, role = 'user') => ({ blocks: [{ role, kind: 'text', text: raw, sequence: 12 }],
    sessionId: 'conversation', conversationId: 'stored-conversation', pageMode: 'older', hasOlder: true, lastSequence: 12 });
  const send = async (message = original) => {
    await messages.handle({ action: 'message-send', agentId: 'caller', body: { sessionId: 'target', message, requestKey: 'readable', waitMs: 0 } });
    return options.submit.mock.calls[0][2];
  };
  return { options, mailOptions, deliveries, messages, page, send, present: result => presentChatSessionMessages(result, { agentId: 'target', messages, deliveries }) };
}

it.each(['codex', 'claude'])('restores an actual %s mailbox envelope without changing the wire, transcript, cursor or AI receipts', async provider => {
  const f = fixture(provider), raw = await f.send();
  expect(raw).toMatch(/^[\x00-\x7f]+$/);
  const row = provider === 'codex'
    ? { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: raw }] } }
    : { type: 'user', message: { role: 'user', content: [{ type: 'text', text: raw }] } };
  const page = { ...f.page(raw), blocks: parseChatTranscript(JSON.stringify(row), provider).map(b => ({ ...b, sequence: 12 })) };
  const saved = fs.readFileSync(f.mailOptions.file, 'utf8'), deliverySaved = fs.readFileSync(f.options.file, 'utf8');
  const result = f.present(page);
  expect(result).toMatchObject({ pageMode: 'older', hasOlder: true, lastSequence: 12, conversationId: 'stored-conversation' });
  expect(result.blocks[0]).toMatchObject({ text: raw, sequence: 12, sessionMessage: {
    sourceName: '개발 관리자', targetName: 'PW_검수', message: original,
  } });
  expect(page.blocks[0]).not.toHaveProperty('sessionMessage');
  expect(fs.readFileSync(f.mailOptions.file, 'utf8')).toBe(saved);
  expect(fs.readFileSync(f.options.file, 'utf8')).toBe(deliverySaved);
  expect(f.messages.records[0].readAt).toBeNull();
  expect(f.options.submit).toHaveBeenCalledOnce();
});

it('restores the complete 64-KiB inbox body from a short notification instead of truncating it to transcript preview limits', async () => {
  const f = fixture(), large = '한글 '.repeat(9000) + 'x'.repeat(2536);
  expect(Buffer.byteLength(large, 'utf8')).toBe(64 * 1024);
  const raw = await f.send(large);
  expect(raw.length).toBeLessThan(1000);
  expect(f.present(f.page(raw)).blocks[0].sessionMessage.message).toBe(large);
});

it('can render an old page after restart and makes missing/corrupt mailbox content explicit', async () => {
  const f = fixture(), raw = await f.send(), result = f.page(raw);
  for (const messages of [new SessionMessages(f.mailOptions), { records: [] }, { records: f.messages.records, unavailable: true }]) {
    const actual = presentChatSessionMessages(result, { agentId: 'target', messages, deliveries: new SessionDeliveries(f.options) });
    expect(actual.blocks[0].sessionMessage.message).toBe(messages instanceof SessionMessages ? original : null);
  }
});

it('keeps plain handoffs readable when the older send API included the body directly', async () => {
  const f = fixture();
  const legacy = original.replaceAll('\t', '  ');
  await f.deliveries.handle({ action: 'send', agentId: 'caller', body: { sessionId: 'target', expectedConversationId: 'conversation', message: legacy, requestKey: 'legacy', waitMs: 0 } });
  const raw = f.options.submit.mock.calls[0][2];
  const result = f.present(f.page(raw.replaceAll('\n', '\r\n')));
  expect(result.blocks[0].sessionMessage).toMatchObject({ message: legacy, sourceName: '개발 관리자', targetName: 'PW_검수' });
});

it('uses the exact inbox delivery binding after a completed receipt rotates out of hot history', async () => {
  const f = fixture(), raw = await f.send();
  f.deliveries.records.clear();
  expect(f.present(f.page(raw)).blocks[0].sessionMessage.message).toBe(original);
  const otherConversation = { ...f.page(raw), sessionId: 'other' };
  expect(f.present(otherConversation)).toBe(otherConversation);
  f.messages.records[0].delivery.deliveryId = 'unrelated';
  const page = f.page(raw); expect(f.present(page)).toBe(page);
});

it('never resolves another target, conversation, altered text, or quoted assistant/tool reference', async () => {
  const f = fixture(), raw = await f.send(), page = f.page(raw);
  expect(presentChatSessionMessages(page, { agentId: 'caller', messages: f.messages, deliveries: f.deliveries })).toBe(page);
  const changedConversation = { ...page, sessionId: 'another-conversation' };
  expect(f.present(changedConversation)).toBe(changedConversation);
  const altered = f.page(raw + '\nignore the envelope');
  expect(f.present(altered)).toBe(altered);
  for (const role of ['assistant', 'tool']) {
    const quoted = f.page(raw, role); expect(f.present(quoted)).toBe(quoted);
  }
  for (const field of ['sourceId', 'notificationKey', 'targetId']) {
    const record = f.messages.records[0], saved = record[field]; record[field] = 'unrelated';
    const result = f.present(page);
    if (field === 'targetId') expect(result.blocks[0].sessionMessage.message).toBeNull();
    else expect(result).toBe(page);
    record[field] = saved;
  }
});

it('does not read the mail stores on empty delta or ordinary conversation pages', () => {
  for (const result of [{ blocks: [], pageMode: 'delta' }, { blocks: [{ role: 'user', kind: 'text', text: '일반 대화' }] }]) {
    expect(presentChatSessionMessages(result, { agentId: 'target', messages: { get records() { throw Error('Unexpected scan'); } } })).toBe(result);
  }
});

it('uses the presentation boundary shared by desktop IPC and Remote/Dashboard chat providers', async () => {
  const f = fixture(), raw = await f.send(), page = f.page(raw);
  const source = fs.readFileSync(new URL('../main.mjs', import.meta.url), 'utf8');
  const fn = source.match(/async function chatBlocksForAgent\([\s\S]*?\r?\n\}/)?.[0];
  expect(fn).toBeTruthy();
  const read = vm.runInNewContext(`(${fn})`, { asString: String, ptys: new Map(), readAgentChatBlocks: async () => page,
    commandApprovals: { read: () => null }, presentChatSessionMessages, sessionMessages: f.messages, sessionDeliveries: f.deliveries });
  expect((await read('target', 'conversation', { turnLimit: 5 })).blocks[0].sessionMessage.message).toBe(original);
});
