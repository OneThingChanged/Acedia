import { accountBlockMessage, isAccountBlockReason } from './sessionLaunchAccount';

export type SessionDelivery = {
  deliveryId: string;
  requestKey: string;
  sourceId: string;
  sourceName: string;
  targetId: string;
  targetName: string;
  conversationId: string;
  status: 'saved' | 'queued' | 'notifying' | 'sending' | 'sent' | 'received' | 'started' | 'failed' | 'unconfirmed';
  savedAt?: number; readAt?: number | null; isMessage?: boolean;
  createdAt: number;
  updatedAt: number;
  sentAt?: number;
  receivedAt?: number;
  startedAt?: number;
  reason?: string;
  retryAt?: number;
};

export function isDeliveryWarning(record: SessionDelivery) {
  return ['failed', 'unconfirmed'].includes(record.status) && !(record.isMessage && record.readAt);
}

export function isMailboxConversationChanged(record: SessionDelivery) {
  return record.isMessage === true && record.status === 'failed' && record.reason === 'session-or-conversation-changed';
}

export function takeDeliveryWarning(record: SessionDelivery, recentTargets: Map<string, number>, now = Date.now()) {
  if (!isDeliveryWarning(record)) return false;
  if (!isMailboxConversationChanged(record) && !isAccountBlockReason(record.reason)) return true;
  const key = isMailboxConversationChanged(record) ? record.targetId : `${record.targetId}:${record.reason}`;
  for (const [target, shownAt] of recentTargets) {
    if (now - shownAt >= 60_000) recentTargets.delete(target);
  }
  if (recentTargets.has(key)) return false;
  recentTargets.set(key, now);
  return true;
}

export function deliveryStatusMessage(record: SessionDelivery, english: boolean) {
  const messages = {
    saved: ['메시지함에 저장됨', 'Saved in inbox'],
    queued: ['저장됨 · 입력 가능한 상태가 되면 자동 전달', 'Saved · will notify when input is ready'],
    notifying: ['저장됨 · 알림 전달 중', 'Saved · sending notification'],
    sending: ['전달 중…', 'Sending…'],
    sent: ['전송됨 · 수신 확인 중', 'Sent · waiting for receipt'],
    received: ['수신됨 · 작업 시작 확인 중', 'Received · waiting for task start'],
    started: ['작업 시작됨', 'Task started'],
    failed: ['전달하지 못했습니다. 받는 세션 상태를 확인하세요.', 'Nothing sent. Check the receiving session.'],
    unconfirmed: ['전송 여부 확인 필요 · 중복 실행 방지를 위해 자동 재전송하지 않습니다.', 'Delivery outcome uncertain · no automatic replay to prevent duplicate execution.'],
  };
  if (record.isMessage && record.status === 'started') return (record.readAt ? ['원문 읽음 · 응답 시작 확인', 'Original text read · response started'] : ['알림 처리 시작 · 원문 읽음은 아직 미확인', 'Notification turn started · original text not yet read'])[english ? 1 : 0];
  if (record.isMessage && record.readAt) return (record.status === 'unconfirmed'
    ? ['원문 읽음 · 자동 알림 확인은 미완료', 'Original text read · automatic notification unconfirmed']
    : ['원문 읽음', 'Original text read'])[english ? 1 : 0];
  if (isMailboxConversationChanged(record)) return english
    ? 'The receiving conversation changed. The original is still in its inbox.'
    : '받는 세션의 대화가 바뀌었습니다. 원문은 해당 세션의 수신함에 남아 있습니다.';
  if (['queued', 'failed'].includes(record.status) && isAccountBlockReason(record.reason)) {
    const saved = english ? 'Saved in inbox' : '메시지함에 저장됨';
    return `${saved} · ${accountBlockMessage(record.reason, record.retryAt, english)}`;
  }
  if (record.isMessage && record.status === 'queued') return english
    ? 'Saved in inbox · automatic notification pending'
    : '수신함에 저장됨 · 자동 알림 대기 중';
  if (record.isMessage && record.status === 'unconfirmed') return english
    ? 'Saved in inbox · CLI submission unconfirmed'
    : '수신함에 저장됨 · CLI 입력 제출 미확인';
  return messages[record.status][english ? 1 : 0];
}
