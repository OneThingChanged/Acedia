import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatSessionMessage } from './ChatSessionMessage';
import type { ChatBlock } from '../platform/ipcContract';

const block: ChatBlock = { role: 'user', kind: 'text', text: '[Acedia handoff: test]\nInternal notification',
  sessionMessage: { deliveryId: 'test', sourceId: 'manager', sourceName: 'PW_관리자 <script>bad</script>',
    targetId: 'qa', targetName: 'PW_검수', createdAt: 10000,
    message: '**정상 종료본**만 확인하세요.\n\n| 항목 | 상태 |\n| --- | --- |\n| 해시 | 통과 |\n\n[문서](Docs/Task.md)' } };

it('shows the sender, target and formatted original with a body copy action and collapsed transport details', () => {
  const html = renderToStaticMarkup(<ChatSessionMessage block={block} folder="G:/Project" onOpenPath={() => {}} />);
  expect(html).toContain('PW_검수');
  expect(html).toContain('PW_관리자 &lt;script&gt;bad&lt;/script&gt;');
  expect(html).not.toContain('<script>');
  expect(html).toContain('<strong>정상 종료본</strong>');
  expect(html).toContain('<table>');
  expect(html).toContain('title="Docs/Task.md"');
  expect(html).toContain('전달 본문 복사');
  expect(html).toContain('<details class="chat-session-message-details">');
  expect(html).not.toContain('<details open');
});

it('does not offer an empty copy or pretend the original was recovered when it is unavailable', () => {
  const html = renderToStaticMarkup(<ChatSessionMessage block={{ ...block, sessionMessage: { ...block.sessionMessage!, message: null } }} />);
  expect(html).toContain('보관된 전달 원문을 찾을 수 없습니다.');
  expect(html).not.toContain('전달 본문 복사');
  expect(html).toContain('Internal notification');
});
