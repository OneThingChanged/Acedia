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
};

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
  return messages[record.status][english ? 1 : 0];
}
