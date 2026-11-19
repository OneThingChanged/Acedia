import fs from 'node:fs';
import vm from 'node:vm';
import { expect, it, vi } from 'vitest';
import { chatFileKind, cleanChatFilePath, isAbsoluteChatFilePath } from './chat-markup.js';
import { remotePath } from './base-path.js';

const source = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const functionText = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
function client() {
  const anchor = { click: vi.fn(), remove: vi.fn() };
  const scope = vm.createContext({ chatFileKind, cleanChatFilePath, URLSearchParams, AbortSignal,
    remotePath: path => remotePath(path, '/dddd/'), downloadingFiles: new Set(), syncFileDownloadButtons: vi.fn(),
    t: (text, args = []) => text.replace(/\{(\d+)\}/g, (_, index) => args[index]), showToast: vi.fn(),
    apiError: async response => `HTTP ${response.status}`, fetch: vi.fn(async () => ({ ok: true })),
    document: { createElement: vi.fn(() => anchor), body: { appendChild: vi.fn() } },
  });
  vm.runInContext(functionText('function remoteFileQuery(', 'function currentDocumentDownload(')
    + functionText('async function downloadRemoteFile(', 'const remoteImageZoom')
    + functionText('async function openChatFilePreview(', 'function renderDocuments('), scope);
  return { scope, anchor };
}

it('routes Office/PDF clicks to a scoped, browser-managed download without requesting a text preview', async () => {
  const { scope, anchor } = client();
  for (const [file, kind] of [['D:/AI/주간 보고.PPTX', 'text'], ['exports/report.docx', 'download'], ['exports/result.xlsx', 'download'], ['exports/result.pdf', 'download']]) {
    await scope.openChatFilePreview('worker', 'project', file, kind);
    const [url, options] = scope.fetch.mock.lastCall;
    expect(url).toMatch(/^\/dddd\/api\/docs\/download\?/);
    expect(Object.fromEntries(new URL(url, 'https://agent.example.com').searchParams)).toEqual({ projectId: 'project', path: file, agentId: 'worker' });
    expect(options).toMatchObject({ method: 'HEAD', credentials: 'same-origin', cache: 'no-store' });
    expect(anchor.href).toBe(url); expect(anchor.download).toBe(file.split('/').at(-1));
  }
  expect(scope.fetch).toHaveBeenCalledTimes(4); expect(anchor.click).toHaveBeenCalledTimes(4);
  expect(scope.downloadingFiles.size).toBe(0);
});

it('does not start a failed download and releases its lock for a same-file retry', async () => {
  const { scope, anchor } = client();
  scope.fetch.mockResolvedValueOnce({ ok: false, status: 403 });
  await scope.openChatFilePreview('worker', 'project', 'exports/result.pptx', 'text');
  expect(anchor.click).not.toHaveBeenCalled();
  expect(scope.showToast).toHaveBeenCalledWith('파일을 다운로드하지 못했습니다: HTTP 403');
  expect(scope.downloadingFiles.size).toBe(0);
  await scope.openChatFilePreview('worker', 'project', 'exports/result.pptx', 'text');
  expect(anchor.click).toHaveBeenCalledOnce(); expect(scope.downloadingFiles.size).toBe(0);
});

it('shows truncated JSONL as plain text and downloads from the original absolute path', async () => {
  const { scope, anchor } = client();
  const path = 'G:\\AI\\.codex\\sessions\\rollout.jsonl';
  const content = '{"message":"<script>example()</script>"}';
  const contents = [];
  Object.assign(scope, {
    filePreviewRequest: 0, isAbsoluteChatFilePath, text: value => value || '', resetFilePreviewContent: vi.fn(),
    ui: {
      filePreviewOverlay: { hidden: false }, filePreviewTitle: {}, filePreviewPath: {}, filePreviewKind: {},
      filePreviewMessage: {}, filePreviewClose: { focus: vi.fn() },
      filePreviewMarkdown: {
        replaceChildren: (...nodes) => contents.splice(0, contents.length, ...nodes),
        prepend: node => contents.unshift(node),
      },
    },
  });
  scope.document.documentElement = { classList: { add: vi.fn() } };
  scope.document.createElement.mockImplementation(tag => tag === 'a' ? anchor : { tag, setAttribute: vi.fn() });
  scope.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ path: 'rollout.jsonl', basePath: 'rollout.jsonl', kind: 'text', content, truncated: true }) });
  await scope.openChatFilePreview('worker', 'project', path, chatFileKind(path));
  expect(scope.fetch.mock.lastCall[0]).toMatch(/^\/dddd\/api\/docs\/read\?/);
  expect(contents).toMatchObject([{ tag: 'p', textContent: '파일의 마지막 부분을 표시합니다. 전체 원본은 다운로드할 수 있습니다.' }, { tag: 'pre', textContent: content }]);
  await scope.downloadRemoteFile(scope.filePreviewContext);
  const url = new URL(anchor.href, 'https://agent.example.com');
  expect(url.pathname).toBe('/dddd/api/docs/download');
  expect(url.searchParams.get('path')).toBe(path);
  expect(anchor.click).toHaveBeenCalledOnce();
});
