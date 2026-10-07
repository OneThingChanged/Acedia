import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatMarkdown } from './ChatMarkdown';

describe('Desktop chat file links', () => {
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
