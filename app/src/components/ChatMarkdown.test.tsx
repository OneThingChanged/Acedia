import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatMarkdown } from './ChatMarkdown';

describe('Desktop chat file links', () => {
  it('normalizes encoded Windows Markdown links and previews image links and raw image paths', () => {
    const html = renderToStaticMarkup(<ChatMarkdown folder="G:/Project" onOpenPath={() => {}}>{'[미리보기](/G:/My%20Project/%EC%9D%B4%EB%AF%B8%EC%A7%80%20%2520.png)\n\nG:/Project/literal%20.png\n\n![원본](./output/result.png)\n\n[문서](./docs/guide.md#L12)'}</ChatMarkdown>);
    expect(html).toContain('title="G:/My Project/이미지 %20.png"');
    expect(html).toContain('title="G:/Project/literal%20.png"');
    expect(html).toContain('title="./docs/guide.md#L12"');
    expect(html.match(/class="chat-image-preview/g)).toHaveLength(3);
  });
  it('makes relative inline image and folder paths clickable while preserving Windows Markdown targets', () => {
    const html = renderToStaticMarkup(<ChatMarkdown onOpenPath={() => {}}>{'`output/akari-parts-v1-2026-10-07/character-four-view.png`\n\n`output/akari-parts-v1-2026-10-07/reference-parts/`\n\n[결과](K:/Exports/SummerSix-20261007)'}</ChatMarkdown>);
    expect(html.match(/class="chat-path-link/g)).toHaveLength(3);
    expect(html).toContain('title="K:/Exports/SummerSix-20261007"');
  });
  it('keeps executable schemes blocked and fenced source as source', () => {
    const html = renderToStaticMarkup(<ChatMarkdown onOpenPath={() => {}}>{'[bad](javascript:alert)\n\n```\noutput/image.png\n```\n\n[web](https://example.com/image.png)'}</ChatMarkdown>);
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('chat-path-link');
    expect(html).toContain('href="https://example.com/image.png"');
  });
});
