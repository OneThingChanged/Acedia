import { useEffect, useState } from 'react';
import { invoke } from '../platform/runtime';
import { useAppLanguage } from '../lib/appLanguage';
import { boardTransferLabel, type BoardTransfer, type BoardTransferDetail } from '../lib/workBoard';
import { transferStages } from '../lib/sessionTable';

export function BoardRequestDetail({ transfer, sender, receiver }: { transfer: BoardTransfer; sender: string; receiver: string }) {
  const { text } = useAppLanguage();
  const [content, setContent] = useState<{ id: string; value?: BoardTransferDetail; error?: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void invoke<BoardTransferDetail>('project_board_transfer_detail', { id: transfer.id }).then(value => {
      if (!cancelled) setContent({ id: transfer.id, value });
    }).catch(reason => { if (!cancelled) setContent({ id: transfer.id, error: String(reason) }); });
    return () => { cancelled = true; };
  }, [transfer.id]);
  const loaded = content?.id === transfer.id ? content : null;
  return <section className="wb-request"><h3>{text('최근 수신 업무', 'Incoming request record')}</h3><p>{sender} → {receiver}</p>
    <small>{text('과거 기록일 수 있습니다. 현재 실행이나 전체 업무 완료를 뜻하지 않습니다.', 'This may be historical. It does not establish current execution or task completion.')}</small>
    <p>{text(...boardTransferLabel(transfer))}</p>{transfer.reason && <p className="wb-copy">{transfer.reason}</p>}
    <ol aria-label={text('업무 전달 확인 단계', 'Handoff evidence stages')}>{transferStages(transfer).map(stage => <li key={stage.label[1]} data-confirmed={!!stage.at}>
      <span aria-hidden="true">{stage.at ? '✓' : '○'}</span><span>{text(...stage.label)}</span>{stage.at ? <time dateTime={new Date(stage.at).toISOString()}>{new Date(stage.at).toLocaleString()}</time> : <time>{text('미확인', 'Unconfirmed')}</time>}
    </li>)}</ol><h4>{text('요청 원문', 'Original request')}</h4>
    {!loaded ? <p role="status">{text('원문을 불러오는 중…', 'Loading request…')}</p> : loaded.error ? <p role="alert">{loaded.error}</p> : loaded.value?.message == null ? <p>{text('이 전달 방식에는 원문 보관 기록이 없습니다.', 'No original text is retained for this handoff.')}</p> : <pre>{loaded.value.message}</pre>}
    <small>{text('이 상세 열람은 받는 세션의 읽음·착수 상태를 변경하지 않습니다.', 'Viewing these details does not mark the receiving session as having read or started the request.')}</small>
  </section>;
}
