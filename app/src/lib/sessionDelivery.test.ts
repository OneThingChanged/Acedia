import { describe, expect, it } from 'vitest';
import { deliveryStatusMessage, isDeliveryWarning, takeDeliveryWarning, type SessionDelivery } from './sessionDelivery';

const uncertain: SessionDelivery = {
  deliveryId: 'receipt', requestKey: 'message', sourceId: 'sender', sourceName: 'Planner',
  targetId: 'receiver', targetName: 'Developer', conversationId: 'conversation',
  status: 'unconfirmed', createdAt: 1, updatedAt: 2,
};

describe('delivery warnings', () => {
  it('keeps a durably read original visible without a warning or a false start', () => {
    const read = { ...uncertain, isMessage: true, readAt: 3 };
    expect(isDeliveryWarning(read)).toBe(false);
    expect(deliveryStatusMessage(read, true)).toBe('Original text read · automatic notification unconfirmed');
    expect(deliveryStatusMessage({ ...read, status: 'queued' }, true)).toBe('Original text read');
  });

  it('keeps actionable failures for direct transfers and unread mailbox messages', () => {
    expect(isDeliveryWarning(uncertain)).toBe(true);
    expect(isDeliveryWarning({ ...uncertain, isMessage: true, readAt: null })).toBe(true);
    expect(isDeliveryWarning({ ...uncertain, status: 'failed' })).toBe(true);
    expect(isDeliveryWarning({ ...uncertain, status: 'queued' })).toBe(false);
  });

  it('shows one conversation-change warning per recipient during a burst without hiding other failures', () => {
    const changed: SessionDelivery = { ...uncertain, isMessage: true, status: 'failed', reason: 'session-or-conversation-changed' };
    const recent = new Map<string, number>();
    expect(deliveryStatusMessage(changed, true)).toBe('The receiving conversation changed. The original is still in its inbox.');
    expect(takeDeliveryWarning(changed, recent, 10)).toBe(true);
    expect(takeDeliveryWarning({ ...changed, sourceId: 'second-sender', deliveryId: 'second-message' }, recent, 5000)).toBe(false);
    expect(takeDeliveryWarning({ ...changed, targetId: 'another-recipient' }, recent, 5000)).toBe(true);
    expect(takeDeliveryWarning({ ...changed, reason: 'retry-limit' }, recent, 5000)).toBe(true);
    expect(takeDeliveryWarning({ ...changed, readAt: 123 }, recent, 65000)).toBe(false);
    expect(takeDeliveryWarning(changed, recent, 65000)).toBe(true);
  });

  it('shows a retry time for queued rate limits and deduplicates account failures by recipient and reason', () => {
    const retryAt = Date.UTC(2026, 10, 24, 12);
    const queued: SessionDelivery = { ...uncertain, status: 'queued', reason: 'rate-limited', retryAt, isMessage: true };
    expect(deliveryStatusMessage(queued, true)).toMatch(/Saved in inbox.*Retry at/);
    expect(isDeliveryWarning(queued)).toBe(false);
    const failed: SessionDelivery = { ...queued, status: 'failed', reason: 'authentication-required', retryAt: undefined };
    const recent = new Map<string, number>();
    expect(takeDeliveryWarning(failed, recent, 100)).toBe(true);
    expect(takeDeliveryWarning({ ...failed, deliveryId: 'second', sourceId: 'another-sender' }, recent, 200)).toBe(false);
    expect(takeDeliveryWarning({ ...failed, reason: 'quota-exhausted' }, recent, 200)).toBe(true);
  });
});
