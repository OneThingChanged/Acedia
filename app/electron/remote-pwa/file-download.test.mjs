import fs from 'node:fs';
import vm from 'node:vm';
import { expect, it, vi } from 'vitest';
import { chatFileKind, cleanChatFilePath } from './chat-markup.js';
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
