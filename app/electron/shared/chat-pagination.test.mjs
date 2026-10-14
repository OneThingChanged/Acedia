import { describe, it, expect } from 'vitest';
import { selectChatTurns, compactChatBlocks, touchChatCache, CHAT_CACHED_SESSIONS } from './chat-pagination.mjs';
describe('chat page windows', () => {
  it('preserves whole user/image/assistant runs in both directions', () => {
    const blocks = Array.from({length:8}, (_,i) => [
      {role:'user',kind:'text',text:'question '+i}, {role:'user',kind:'image'},
      {role:'assistant',kind:'text',text:'answer '+i}, {role:'tool',kind:'tool-result',output:'done'},
    ]).flat();
    expect(selectChatTurns(blocks,5).blocks).toEqual(blocks.slice(12));
    expect(selectChatTurns(blocks,5,'older').blocks).toEqual(blocks.slice(0,20));
    expect(selectChatTurns(blocks.slice(12),5).trimmed).toBe(false);
  });
  it('keeps work identity and errors while withholding large input/output/diff fields', () => {
    const block = {sequence:3,role:'tool',kind:'tool-result',isError:true,output:'x'.repeat(100000),diff:[{text:'diff'}],callId:'c'};
    const page = compactChatBlocks([block]);
    expect(page[0]).toMatchObject({sequence:3,isError:true,callId:'c',deferred:true});
    expect(page[0].output).toBeUndefined(); expect(page[0].diff).toBeUndefined();
    expect(block.output).toHaveLength(100000);
  });
  it('evicts inactive session caches and retains the recently reused conversation', () => {
    const cache = new Map(); for(let i=0;i<CHAT_CACHED_SESSIONS;i++)touchChatCache(cache,i,{i});
    touchChatCache(cache,0,{i:0}); touchChatCache(cache,99,{i:99});
    expect(cache.size).toBe(CHAT_CACHED_SESSIONS); expect(cache.has(0)).toBe(true); expect(cache.has(1)).toBe(false);
  });
});
