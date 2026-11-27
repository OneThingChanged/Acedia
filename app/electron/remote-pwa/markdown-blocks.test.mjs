import { describe, expect, it } from 'vitest';
import { mdToHtml } from './chat-markup.js';
import { renderMarkdownBlocks } from './markdown-blocks.js';

describe('shared Remote block Markdown', () => {
  const agent = { id: 'child', projectId: 'project' };
  it('keeps separate, scoped file links in table cells and scrolls only the table', () => {
    const html = mdToHtml('# 결과\n\n| 문서 | 패키지 |\n| --- | --- |\n| [보고서](docs/report.md) | [묶음](out/build.zip) |\n\n끝', agent);
    expect(html).toContain('<h1>결과</h1>');
    expect(html).toContain('<div class="markdown-table-scroll"><table>');
    expect(html).toContain('data-chat-file-path="docs/report.md"');
    expect(html).toContain('data-chat-file-path="out/build.zip"');
    expect(html.match(/data-chat-file-agent="child"/g)).toHaveLength(2);
    expect(html).toContain('</table></div><p>끝</p>');
  });
  it('preserves pipes in code and escaped text without creating extra columns', () => {
    const html = mdToHtml('| 명령 | 값 |\n| --- | --- |\n| `a | b` | x\\|y |', agent);
    expect(html.match(/<td>/g)).toHaveLength(2);
    expect(html).toContain('<code>a | b</code>');
    expect(html).toContain('<td>x|y</td>');
  });
  it('escapes HTML and fenced source, never activating file links inside code', () => {
    const html = mdToHtml('```html\n<img src=x onerror=alert(1)>\n[link](docs/report.md)\n```\n\n<script>alert(1)</script>', agent);
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<img'); expect(html).not.toContain('<script');
    expect(html).not.toContain('data-chat-file-path');
  });
  it('shares block structure while allowing the document viewer to own its link policy', () => {
    const html = renderMarkdownBlocks('1. 첫 번째\n2. 두 번째\n\n- [x] 완료\n\n> 한글\n> 인용\n\n---', line => line);
    expect(html).toContain('<ol><li>첫 번째</li><li>두 번째</li></ol>');
    expect(html).toContain('type="checkbox" disabled checked');
    expect(html).toContain('<blockquote>한글<br>인용</blockquote>');
    expect(html).toContain('<hr>');
  });
  it('numbers items in one list even with blank lines and an explanation inside each item', () => {
    const markdown = [
      '1. **클라이언트에서 전환 요청**', '', '   기존 작업 화면에서 요청합니다.', '',
      '1. **메인 서버에서 배정**', '', '   [관련 문서](docs/report.md)를 확인합니다.', '',
      '1. **팀 서버에서 생성**', '', '   - 입력을 확인합니다.', '',
      '1. **클라이언트에서 결과 확인**',
    ].join('\r\n');
    const html = mdToHtml(markdown, agent);
    expect(html.match(/<ol\b/g)).toHaveLength(1);
    expect(html.match(/<li>/g)).toHaveLength(5);
    expect(html).toContain('<li><p><strong>클라이언트에서 전환 요청</strong></p><p>기존 작업 화면에서 요청합니다.</p></li>');
    expect(html).toContain('data-chat-file-path="docs/report.md"');
    expect(html).toContain('<ul><li>입력을 확인합니다.</li></ul></li>');
    expect(html).toContain('<li><strong>클라이언트에서 결과 확인</strong></li></ol>');
  });
  it('keeps the specified start when paragraphs separate numbered steps into different lists', () => {
    const html = mdToHtml('1. **요청**\n\n설명 A\n\n2. **배정**\n\n설명 B\n\n3. **생성**\n\n설명 C\n\n4. **결과 확인**\n\n설명 D', agent);
    expect(html).toBe('<ol><li><strong>요청</strong></li></ol><p>설명 A</p><ol start="2"><li><strong>배정</strong></li></ol><p>설명 B</p><ol start="3"><li><strong>생성</strong></li></ol><p>설명 C</p><ol start="4"><li><strong>결과 확인</strong></li></ol><p>설명 D</p>');
  });
  it('preserves handoff report lines without changing normal Markdown, code, tables or scoped links', () => {
    const original = '중간 보고: 검사 완료\n남은 일: 최종 인계\n\n[근거](docs/report.md)\n검사 기록\n\n```text\nfirst\nsecond\n```\n\n| 항목 | 결과 |\n| --- | --- |\n| 검사 | 통과 |';
    const html = mdToHtml(original, agent, [], { preserveLineBreaks: true });
    expect(html).toContain('<p>중간 보고: 검사 완료<br>남은 일: 최종 인계</p>');
    expect(html).toContain('data-chat-file-path="docs/report.md"'); expect(html).toContain('<table>');
    expect(html).toContain('first\nsecond'); expect(html).not.toContain('first<br>');
    expect(mdToHtml('첫 줄\n다음 줄', agent)).toBe('<p>첫 줄 다음 줄</p>');
  });
});
