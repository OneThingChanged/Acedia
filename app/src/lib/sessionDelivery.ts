export type SessionDelivery = {
  deliveryId: string;
  requestKey: string;
  sourceId: string;
  sourceName: string;
  targetId: string;
  targetName: string;
  conversationId: string;
  status: 'sending' | 'sent' | 'received' | 'started' | 'failed' | 'unconfirmed';
  createdAt: number;
  updatedAt: number;
  sentAt?: number;
  receivedAt?: number;
  startedAt?: number;
  reason?: string;
};

export function deliveryStatusMessage(record: SessionDelivery, english: boolean) {
  const messages = {
    sending: ['전달 중…', 'Sending…'],
    sent: ['전송됨 · 수신 확인 중', 'Sent · waiting for receipt'],
    received: ['수신됨 · 작업 시작 확인 중', 'Received · waiting for task start'],
    started: ['작업 시작됨', 'Task started'],
    failed: ['전달하지 못했습니다. 받는 세션 상태를 확인하세요.', 'Nothing sent. Check the receiving session.'],
    unconfirmed: ['작업 시작 미확인 · 받는 세션을 확인하세요. 자동으로 다시 보내지 않습니다.', 'Task start unconfirmed · check the receiving session. Nothing will be resent automatically.'],
  };
  return messages[record.status][english ? 1 : 0];
}
