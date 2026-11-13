import { afterEach, expect, it, vi } from 'vitest';
import { renderChatUser } from './chat-render.js';
import { setLanguage } from './i18n.js';

afterEach(() => { vi.unstubAllGlobals(); setLanguage('en'); });
class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.listeners = {}; this.attributes = {}; }
  append(...nodes) { this.children.push(...nodes); }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(key, value) { this.listeners[key] = value; }
}
it('renders and copies the Korean body on Remote/Dashboard without exposing technical instructions by default', async () => {
  setLanguage('ko');
  vi.stubGlobal('document', { createElement: tag => new Element(tag) });
  const writeText = vi.fn(async () => {});
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  const block = { text: '[Acedia handoff: internal]', sessionMessage: {
    sourceName: '<img onerror=bad>', targetName: 'PW_검수',
    message: '**검수 요청**\n\n[문서](Docs/Task.md)\n\n<script>bad()</script>',
  } };
  const node = renderChatUser(block.text, { id: 'qa', projectId: 'project' }, block);
  const [head, route, body, details] = node.children;
  expect(node.tagName).toBe('section');
  expect(route.children[0].textContent).toBe('<img onerror=bad>');
  expect(route.children[0].innerHTML).toBeUndefined();
  expect(body.innerHTML).toContain('<strong>검수 요청</strong>');
  expect(body.innerHTML).toContain('data-chat-file-path="Docs/Task.md"');
  expect(body.innerHTML).not.toContain('<script>');
  expect(details.tagName).toBe('details'); expect(details.open).toBeUndefined();
  const copy = head.children[2]; await copy.listeners.click();
  expect(writeText).toHaveBeenCalledExactlyOnceWith(block.sessionMessage.message);
  expect(copy.textContent).toBe('복사했습니다');
});

it('provides a clear fallback when the original mailbox record is unavailable', () => {
  vi.stubGlobal('document', { createElement: tag => new Element(tag) });
  const node = renderChatUser('original reference', {}, { text: 'original reference', sessionMessage: { sourceName: 'A', targetName: 'B', message: null } });
  expect(node.children[0].children).toHaveLength(2);
  expect(node.children[2].textContent).toBe('The stored message body is unavailable.');
  expect(node.children[3].children[2].textContent).toBe('original reference');
});
