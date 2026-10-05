import { useEffect, useState } from 'react';
import { invoke, listen } from '../platform/runtime';
import { useAppLanguage } from '../lib/appLanguage';
import { deliveryStatusMessage, type SessionDelivery } from '../lib/sessionDelivery';
import './SessionDeliveryNotice.css';

export function SessionDeliveryNotice({ agentId }: { agentId: string }) {
  const [records, setRecords] = useState<SessionDelivery[]>([]);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const { text } = useAppLanguage();
  useEffect(() => {
    setRecords([]);
    setDismissed(null);
    let cancelled = false, events = 0;
    let unsubscribe: (() => void) | undefined;
    void listen<SessionDelivery>('agent:session-delivery', event => {
      if (cancelled || ![event.payload.sourceId, event.payload.targetId].includes(agentId)) return;
      events++;
      setRecords(old => [event.payload, ...old.filter(r => r.deliveryId !== event.payload.deliveryId)]
        .sort((a, b) => b.createdAt - a.createdAt).slice(0, 20));
    }).then(async stop => {
      if (cancelled) { stop(); return; }
      unsubscribe = stop;
      const version = events;
      const current = await invoke<SessionDelivery[]>('session_deliveries_get', { id: agentId });
      if (!cancelled && events === version) setRecords(current);
    }).catch(() => {});
    return () => { cancelled = true; unsubscribe?.(); };
  }, [agentId]);
  const record = records[0];
  if (!record || dismissed === record.deliveryId + ':' + record.status) return null;
  const bad = ['failed', 'unconfirmed'].includes(record.status);
  const stages = [
    { ko: '전송됨', en: 'Sent', at: record.sentAt },
    { ko: '수신됨', en: 'Received', at: record.receivedAt },
    { ko: '작업 시작됨', en: 'Task started', at: record.startedAt },
  ];
  return <div className={`session-delivery-notice ${record.status}`} role={bad ? 'alert' : 'status'}>
    <div className='session-delivery-summary'>
      <strong>{record.sourceId === agentId
        ? text(`${record.targetName}에게 작업 전달`, `Task sent to ${record.targetName}`)
        : text(`${record.sourceName}에서 받은 작업`, `Task from ${record.sourceName}`)}</strong>
      <span>{text(deliveryStatusMessage(record, false), deliveryStatusMessage(record, true))}</span>
    </div>
    <ol aria-label={text('전달 진행 상태', 'Delivery progress')}>
      {stages.map(stage => <li key={stage.en} className={stage.at ? 'confirmed' : ''}>
        <span aria-hidden='true'>{stage.at ? '✓' : '○'}</span> {text(stage.ko, stage.en)}
      </li>)}
    </ol>
    <button type='button' aria-label={text('전달 안내 닫기', 'Dismiss delivery notice')}
      onClick={() => setDismissed(record.deliveryId + ':' + record.status)}>×</button>
  </div>;
}
