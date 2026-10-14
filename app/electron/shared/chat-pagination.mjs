export const CHAT_TURNS_PER_PAGE = 5;
export const CHAT_CACHED_TURNS = 120;
export const CHAT_CACHED_SESSIONS = 8;
export function compactChatBlocks(blocks) {
  return blocks.map(block => ['tool-call', 'tool-result'].includes(block.kind) ? {
    sequence: block.sequence, role: block.role, kind: block.kind, name: block.name,
    summary: String(block.summary || '').slice(0, 500), callId: block.callId,
    isError: block.isError, deferred: true,
  } : block);
}

// A page begins with a user message and includes its entire assistant run.
// Images immediately following user text belong to that same message.
export function chatTurnStarts(blocks) {
  return blocks.flatMap((block, index) => block.role === 'user'
    && (block.kind === 'text' || (block.kind === 'image' && blocks[index - 1]?.role !== 'user')) ? [index] : []);
}
export function selectChatTurns(blocks, count = CHAT_TURNS_PER_PAGE, direction = 'latest') {
  const starts = chatTurnStarts(blocks);
  if (starts.length <= count) return { blocks, trimmed: false };
  return { blocks: direction === 'older' ? blocks.slice(0, starts[count]) : blocks.slice(starts[starts.length - count]), trimmed: true };
}
export function touchChatCache(cache, key, value) {
  cache.delete(key); cache.set(key, value);
  while (cache.size > CHAT_CACHED_SESSIONS) cache.delete(cache.keys().next().value);
}
