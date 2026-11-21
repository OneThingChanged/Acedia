import { describe, expect, it } from 'vitest';
import { deliveryStatusMessage, isDeliveryWarning, type SessionDelivery } from './sessionDelivery';

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
});
