import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { compactChatBlocks, selectChatTurns } from '../shared/chat-pagination.mjs';

describe('Chat cold source paging', () => {
  it('returns the compact recent tail without waiting for cold ingestion and preserves live questions on indexed pages', async () => {
    const root = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'acedia-chat-host-'));
    try {
      const transcript = path.join(root, 'one.jsonl');
      await fsPromises.writeFile(transcript, 'x'.repeat(300 * 1024));
      const source = await fsPromises.readFile(new URL('../main.mjs', import.meta.url), 'utf8');
      const fn = source.match(/async function readAgentChatBlocks\([\s\S]*?\r?\n\}/)?.[0];
      expect(fn).toBeTruthy();
      const tail = Array.from({ length: 7 }, (_, i) => [
        { role: 'user', kind: 'text', text: 'question ' + i },
        { role: 'assistant', kind: 'tool-result', output: 'x'.repeat(10000) },
        { role: 'assistant', kind: 'text', text: 'answer ' + i },
      ]).flat();
      const question = { id: 'q', question: 'A live question', async: true };
      let ingests = 0;
      const read = vm.runInNewContext(`(${fn})`, {
        asString: value => String(value || ''), fs, fsPromises, compactChatBlocks, selectChatTurns,
        conversationMetadataForAgent: () => ({ provider: 'codex', projectPath: root }),
        accountBindings: new Map(), accountsForTool: () => false, agentSessionIds: new Map(),
        normalizeTranscriptPath: value => value, agentTranscripts: new Map([['a', transcript]]),
        agentTranscriptTool: new Map(), transcriptMissUntil: new Map(), ensureChatWatch: () => {},
        readChatTranscript: async () => ({ blocks: tail, lifecycle: 'working', lifecycleAt: 123, activeTool: 'exec_command' }),
        currentQuestion: async () => ({ sessionId: 'one', question }), ptys: new Map(),
        capacityRetry: { isActive: () => false }, MAX_FOREGROUND_CONVERSATION_INGEST_BYTES: 16 * 1024 * 1024,
        conversationStoreManager: {
          sourceProgress: async () => ({ conversationId: 'c', lastOffset: 0 }),
          ingestTranscript: () => { ingests++; return new Promise(() => {}); },
        },
        storedChatBlocks: async () => ({ blocks: [], pageMode: 'delta', lastSequence: 10 }), console,
      });
      const initial = await read('a', 'one', { turnLimit: 5 });
      expect(initial).toMatchObject({ indexing: true, conversationId: 'c', pageMode: 'tail', hasOlder: false, pendingQuestion: question });
      expect(initial.blocks[0].text).toBe('question 2');
      expect(initial.blocks.filter(block => block.kind === 'tool-result').every(block => block.deferred && block.output === undefined)).toBe(true);
      const delta = await read('a', 'one', { turnLimit: 5, afterSequence: 10, conversationId: 'c' });
      expect(delta).toMatchObject({ blocks: [], pageMode: 'delta', lastSequence: 10, indexing: true,
        lifecycle: 'working', lifecycleAt: 123, activeTool: 'exec_command', pendingQuestion: question });
      expect(ingests).toBe(2);
    } finally {
      if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('acedia-chat-host-')) throw Error('Unsafe cleanup path');
      await fsPromises.rm(root, { recursive: true });
    }
  });
});
