import path from 'node:path';
import os from 'node:os';
import { isTranscriptInsideRoot } from './transcript-path.mjs';
import { isNoiseUserText } from './chat-noise.mjs';

export function qwenTranscriptRoots(env = process.env, home = os.homedir()) {
  const configured = String(env.QWEN_RUNTIME_DIR || env.QWEN_HOME || '').trim();
  const root = configured ? /^~(?:[\\/]|$)/.test(configured) ? path.join(home, configured.slice(1)) : path.resolve(configured)
    : path.join(home, '.qwen');
  return [path.join(root, 'projects')];
}

// Qwen Code 0.25 records Gemini-style parts in its own JSONL messages. Adapt
// one record at a time so the shared store retains original byte offsets.
export function normalizeQwenRecord(record) {
  if (!record || !['user', 'assistant', 'tool_result'].includes(record.type)) return record;
  const parts = Array.isArray(record.message?.parts) ? record.message.parts : [];
  const content = [];
  for (const part of parts) {
    if (!part || typeof part !== 'object') continue;
    if (typeof part.text === 'string') content.push(part.thought
      ? { type: 'thinking', thinking: part.text } : { type: 'text', text: part.text });
    if (part.functionCall) {
      const call = part.functionCall;
      content.push({ type: 'tool_use', id: call.id, name: call.name, input: call.args });
    }
    if (part.functionResponse) {
      const result = part.functionResponse, response = result.response ?? {};
      const output = response.output ?? response.error ?? response;
      content.push({ type: 'tool_result', tool_use_id: result.id,
        content: typeof output === 'string' ? output : JSON.stringify(output),
        is_error: !!response.error || ['error', 'cancelled'].includes(record.toolCallResult?.status) });
    }
    if (part.inlineData?.mimeType?.startsWith('image/')) content.push({ type: 'image',
      source: { type: 'base64', media_type: part.inlineData.mimeType, data: part.inlineData.data } });
    if (part.fileData?.mimeType?.startsWith('image/') && typeof part.fileData.fileUri === 'string') {
      content.push({ type: 'image', source: { type: 'url', url: part.fileData.fileUri } });
    }
  }
  const type = record.type === 'tool_result' ? 'user' : record.type;
  const stop_reason = type === 'assistant'
    ? content.some(part => part.type === 'tool_use') ? 'tool_use'
      : content.some(part => part.type === 'text' && part.text.trim()) ? 'end_turn' : null
    : undefined;
  return { ...record, type, message: { role: type, content, stop_reason } };
}

export function qwenLifecycle(record) {
  if (!record || typeof record !== 'object') return null;
  if (record.type === 'system') {
    const event = record.subtype === 'ui_telemetry' ? record.systemPayload?.uiEvent : null;
    if (event?.kind !== 'request' || event.subagentId || event.subagent_id) return null;
    if (event.phase === 'started') return { lifecycle: 'working' };
    // A successful model request can still be followed by tools or another
    // request. Only a final assistant message establishes completion.
    if (event.phase === 'ended' && event.outcome && event.outcome !== 'success') return { lifecycle: 'idle' };
    return null;
  }
  const normalized = normalizeQwenRecord(record), content = normalized.message?.content || [];
  if (record.type === 'user') {
    const text = content.filter(part => part.type === 'text').map(part => part.text).join('');
    if (/\[request interrupted/i.test(text)) return { lifecycle: 'idle' };
    return !isNoiseUserText(text) || content.some(part => part.type === 'image') ? { lifecycle: 'working' } : null;
  }
  if (record.type === 'tool_result') return { lifecycle: 'working' };
  if (record.type !== 'assistant') return null;
  return { lifecycle: normalized.message.stop_reason === 'end_turn' ? 'idle' : 'working',
    activeTool: content.findLast(part => part.type === 'tool_use')?.name };
}

// Restored Qwen sessions may not have lastSessionId in older renderer state.
// Use only the exact agent's hook note, never another session in the folder.
export function ownedQwenTranscript(note, { roots, folder, sessionId }) {
  if (!note?.sessionId || !note.transcriptPath || !note.cwd || !folder) return null;
  const id = String(note.sessionId);
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)
    || (sessionId && sessionId.toLowerCase() !== id.toLowerCase())) return null;
  const comparable = value => { const resolved = path.resolve(value); return process.platform === 'win32' ? resolved.toLowerCase() : resolved; };
  if (comparable(note.cwd) !== comparable(folder)
    || path.basename(note.transcriptPath).toLowerCase() !== `${id.toLowerCase()}.jsonl`
    || !roots.some(root => isTranscriptInsideRoot(root, note.transcriptPath))) return null;
  return { sessionId: id, path: note.transcriptPath, tool: 'qwen' };
}
