import { memo } from 'react';
import type { ChatBlock } from '../platform/ipcContract';
import type { ImagePathOpener } from '../lib/imageActions';
import { useAppLanguage } from '../lib/appLanguage';
import { ChatCopyButton } from './ChatCopyButton';
import { ChatMarkdown } from './ChatMarkdown';

export const ChatSessionMessage = memo(function ChatSessionMessage({ block, folder, onOpenPath }: {
  block: ChatBlock; folder?: string; onOpenPath?: ImagePathOpener;
}) {
  const { text } = useAppLanguage();
  const value = block.sessionMessage!;
  return <section className="chat-session-message" aria-label={text('세션 간 메시지', 'Session message')}>
    <header className="chat-session-message-head">
      <span>{text('세션 간 메시지', 'Session message')}</span>
      <span className="chat-session-message-received">{text('수신됨', 'Received')}</span>
      {value.message !== null && <ChatCopyButton value={value.message} label={text('전달 본문 복사', 'Copy message body')} />}
    </header>
    <div className="chat-session-message-route"><strong>{value.sourceName}</strong><span aria-hidden="true">→</span><strong>{value.targetName}</strong></div>
    <div className="chat-session-message-body chat-md">{value.message !== null
      ? <ChatMarkdown folder={folder} onOpenPath={onOpenPath}>{value.message}</ChatMarkdown>
      : <p>{text('보관된 전달 원문을 찾을 수 없습니다.', 'The stored message body is unavailable.')}</p>}</div>
    <details className="chat-session-message-details">
      <summary>{text('전달 정보', 'Delivery details')}</summary>
      <p>{text('채팅에 도착한 메시지입니다. AI의 읽음·작업 시작 상태와는 별개입니다.', 'This message reached the conversation. AI read and task-start receipts are tracked separately.')}</p>
      <pre>{block.text}</pre>
    </details>
  </section>;
});
