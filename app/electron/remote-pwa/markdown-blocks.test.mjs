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
});
