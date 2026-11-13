import { createHash } from 'node:crypto';
import { sessionMessageNotification } from './session-messages.mjs';

const normalize = value => value.replace(/\r\n?/g, '\n').trim();
const hash = value => createHash('sha256').update(normalize(value)).digest('hex');
const envelope = /^\[Acedia handoff: ([0-9a-f-]{36})\]\nFrom: ([^\n]*)\n\n([\s\S]*)$/;
const reference = /^Acedia session message ([0-9a-f-]{36})\./;

/** Read-only presentation of a received envelope. Never call inbox.receive():
 * a person viewing Chat is not evidence that the receiving AI read or started.
 * Resolve only this page, and keep the stored/provider text and cursor intact.
 */
export function presentChatSessionMessages(result, { agentId, messages, deliveries }) {
  if (!result?.blocks?.some(b => b.role === 'user' && b.kind === 'text' && b.text?.trimStart().startsWith('[Acedia handoff: '))) return result;
  const incoming = new Map((messages?.unavailable ? [] : messages?.records || [])
    .filter(r => r.targetId === agentId).map(r => [r.messageId, r]));
  const receipts = new Map([...(deliveries?.unavailable ? [] : deliveries?.records?.values() || [])]
    .filter(r => r.targetId === agentId).map(r => [r.deliveryId, r]));
  let changed = false;
  const blocks = result.blocks.map(block => {
    if (block.role !== 'user' || block.kind !== 'text' || typeof block.text !== 'string') return block;
    const match = normalize(block.text).match(envelope);
    if (!match) return block;
    const [, deliveryId, from, body] = match;
    const id = body.match(reference)?.[1], record = id ? incoming.get(id) : null;
    let delivery = receipts.get(deliveryId);
    if (delivery && delivery.messageHash !== hash(block.text)) return block;
    // Completed delivery receipts rotate out of the hot history. The inbox
    // still pins the exact notification/delivery and conversation; no archive
    // scan or provider transcript mutation is needed for old chat pages.
    if (!delivery && from === 'Acedia session' && record?.notify && record.delivery?.deliveryId === deliveryId
      && record.notificationKey === 'text_' + id.replace(/-/g, '') && body === sessionMessageNotification(id)) {
      delivery = { ...record, conversationId: record.pinConversationId, requestKey: record.notificationKey };
    }
    if (!delivery
      || delivery.conversationId && result.sessionId && delivery.conversationId !== result.sessionId) return block;
    let message = body, messageId;
    if (id) {
      // A UUID in arbitrary prose is not an inbox reference. Check the entire
      // generated notification and its durable source/target/request binding.
      if (body !== sessionMessageNotification(id)) return block;
      if (record && (record.sourceId !== delivery.sourceId || record.notificationKey !== delivery.requestKey)) return block;
      message = record?.message ?? null;
      messageId = id;
    }
    changed = true;
    return { ...block, sessionMessage: {
      deliveryId, ...(messageId ? { messageId } : {}),
      sourceId: delivery.sourceId, sourceName: delivery.sourceName || delivery.sourceId,
      targetId: delivery.targetId, targetName: delivery.targetName || delivery.targetId,
      message, createdAt: delivery.createdAt,
    } };
  });
  return changed ? { ...result, blocks } : result;
}
