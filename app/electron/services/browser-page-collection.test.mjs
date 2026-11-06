import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { collectBrowserPage, captureBrowserAsset, readBrowserCollection, decodeMhtmlResources, normalizePageCollection } from './browser-page-collection.mjs';

const roots = [];
afterEach(async () => { for (const root of roots.splice(0)) {
  if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('acedia-page-collection-')) throw new Error('Unexpected fixture');
  await fs.rm(root, { recursive: true });
} });

const imageBytes = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 255, 10]);
const mhtml = Buffer.from('MIME-Version: 1.0\r\nContent-Type: multipart/related;\r\n boundary="fixture-boundary"\r\n\r\n' +
  '--fixture-boundary\r\nContent-Type: image/gif\r\nContent-Transfer-Encoding: base64\r\nContent-Location: https://cdn.example.com/original.gif\r\n\r\n' + imageBytes.toString('base64') + '\r\n--fixture-boundary--\r\n');

async function fixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'acedia-page-collection-')); roots.push(directory);
  let url = 'https://example.com/article';
  const page = { url, title: '한글·中文 글', selector: 'article', contentStatus: 'ready', text: '본문입니다', textLength: 5, textTruncated: false, reachedEnd: true,
    html: '<html><article>본문입니다</article></html>', articleHtml: '<article>본문입니다</article>', htmlTruncated: false, remainingCodeExpanders: 0,
    images: [{ index: 0, src: 'https://cdn.example.com/original.gif', alt: '그림', originalCandidate: '', loaded: true, width: 300, height: 200 }] };
  const contents = { getURL: () => url, isDestroyed: () => false, executeJavaScript: vi.fn(async () => page),
    savePage: vi.fn(async (file, kind) => fs.writeFile(file, kind === 'MHTML' ? mhtml : Buffer.from('<article>본문입니다</article>'))) };
  return { contents, page, directory, capture: vi.fn(async () => Buffer.from('PNG fixture')), navigate: next => { url = next; } };
}

describe('browser-native rendered page collection', () => {
  it('saves text, screen, complete HTML and original image bytes with hashes and an explicit preservation scope', async () => {
    const f = await fixture(); const result = await collectBrowserPage(f.contents, {}, f);
    expect(result).toMatchObject({ ok: true, complete: true, source: 'rendered-embedded-browser', imageCount: 1,
      preservation: { originalHttpResponseHtml: false }, images: [{ preserved: true, status: 'saved' }] });
    expect(f.contents.savePage.mock.calls.map(call => call[1])).toEqual(['MHTML', 'HTMLComplete']);
    expect(f.contents.executeJavaScript.mock.calls[0][0]).toContain('window.scrollTo');
    expect(f.contents.executeJavaScript.mock.calls[0][0]).not.toMatch(/document\.cookie|localStorage|sessionStorage/);
    expect(await fs.readFile(result.images[0].file.path)).toEqual(imageBytes);
    expect(result.images[0].file.sha256).toBe(createHash('sha256').update(imageBytes).digest('hex'));
    expect(JSON.parse(await fs.readFile(result.manifestPath, 'utf8')).complete).toBe(true);
    expect(await fs.readFile(result.textFile.path, 'utf8')).toBe('본문입니다');
  });
  it('returns explicit missing/partial states rather than claiming lossless completion', async () => {
    const f = await fixture(); f.page.reachedEnd = false;
    f.page.images.push({ index: 1, src: 'https://example.com/lazy.jpg', loaded: false });
    const result = await collectBrowserPage(f.contents, {}, f);
    expect(result.complete).toBe(false); expect(result.missingImageIndices).toEqual([1]);
    expect(result.warnings).toContain('scroll_limit_reached'); expect(result.warnings).toContain('images_incomplete');
  });
  it('pages image results while keeping the full inventory in the saved manifest', async () => {
    const f = await fixture(); f.page.images.push({ ...f.page.images[0], index: 1 });
    const result = await collectBrowserPage(f.contents, { maxImages: 1 }, f);
    expect(result.images).toHaveLength(1); expect(result.imageCount).toBe(2); expect(result.nextImageOffset).toBe(1);
    expect(JSON.parse(await fs.readFile(result.manifestPath, 'utf8')).images).toHaveLength(2);
    const second = await readBrowserCollection({ collectionId: result.id, imageOffset: 1, maxImages: 1 }, f);
    expect(second.images.map(image => image.index)).toEqual([1]); expect(second.nextImageOffset).toBe(null);
    expect(f.contents.executeJavaScript).toHaveBeenCalledOnce();
    await expect(readBrowserCollection({ collectionId: '../outside' }, f)).rejects.toThrow('collectionId');
  });
  it('bounds MCP text while preserving the full collected text, original DOM and exact asset-map keys on disk', async () => {
    const f = await fixture(); f.page.text = '한글 본문\n'.repeat(1000); f.page.textLength = f.page.text.length;
    f.page.expandedHtml = '<html><article><pre><code>full code</code></pre><table><tr><td>표</td></tr></table></article></html>';
    const result = await collectBrowserPage(f.contents, { maxText: 1000 }, f);
    expect(result.complete).toBe(true); expect(result.text).toHaveLength(1000); expect(result.returnedTextTruncated).toBe(true);
    expect(await fs.readFile(result.textFile.path, 'utf8')).toBe(f.page.text);
    expect(await fs.readFile(result.originalHtml.path, 'utf8')).toBe(f.page.html);
    expect(await fs.readFile(result.expandedHtml.path, 'utf8')).toBe(f.page.expandedHtml);
    expect(JSON.parse(await fs.readFile(result.assetMap.path, 'utf8'))[f.page.images[0].src]).toBe(result.images[0].file.path);
  });
  it('fetches the original GIF with the existing browser session instead of accepting a static thumbnail', async () => {
    const f = await fixture(); const gifUrl = 'https://cdn.example.com/animated.gif';
    f.page.images[0] = { ...f.page.images[0], src: 'https://cdn.example.com/animated_b.jpg', originalGif: gifUrl };
    f.contents.session = { fetch: vi.fn(async () => new Response(imageBytes, { headers: { 'content-type': 'image/gif' } })) };
    const result = await collectBrowserPage(f.contents, {}, f);
    expect(result.complete).toBe(true); expect(result.images[0].file.mime).toBe('image/gif');
    expect(await fs.readFile(result.images[0].file.path)).toEqual(imageBytes);
    expect(f.contents.session.fetch).toHaveBeenCalledWith(gifUrl, expect.objectContaining({ credentials: 'include', referrer: f.page.url }));
    f.contents.session.fetch.mockImplementation(async () => new Response('static thumbnail', { headers: { 'content-type': 'image/gif' } }));
    expect((await collectBrowserPage(f.contents, {}, f)).complete).toBe(false);
    f.contents.session.fetch.mockImplementation(async () => new Response('blocked', { status: 403 }));
    const failed = await collectBrowserPage(f.contents, {}, f);
    expect(failed.complete).toBe(false); expect(failed.missingImageIndices).toEqual([0]);
  });
  it('rejects nonreferenced URLs and invalid browser image responses without writing image files', async () => {
    const f = await fixture(); f.contents.executeJavaScript.mockResolvedValue(['https://example.com/asset.gif']);
    f.contents.session = { fetch: vi.fn(async () => new Response('<html>login</html>', { headers: { 'content-type': 'text/html' } })) };
    await expect(captureBrowserAsset(f.contents, { url: 'https://example.com/not-referenced.gif' }, f)).rejects.toThrow('not referenced');
    expect(f.contents.session.fetch).not.toHaveBeenCalled();
    await expect(captureBrowserAsset(f.contents, { url: 'https://example.com/asset.gif' }, f)).rejects.toThrow('supported image');
    expect(await fs.readdir(f.directory)).toEqual([]);
    f.contents.session.fetch.mockImplementation(async () => new Response(Buffer.alloc(16 * 1024 * 1024 + 1), { headers: { 'content-type': 'image/gif' } }));
    await expect(captureBrowserAsset(f.contents, { url: 'https://example.com/asset.gif' }, f)).rejects.toThrow('16 MiB');
  });
  it('keeps partial text/DOM evidence when native archive saving fails', async () => {
    const f = await fixture(); f.contents.savePage.mockRejectedValue(new Error('native page save failed'));
    const result = await collectBrowserPage(f.contents, {}, f);
    expect(result.complete).toBe(false); expect(result.warnings).toContain('mhtml_save_failed');
    expect(await fs.readFile(result.originalHtml.path, 'utf8')).toBe(f.page.html);
  });
  it('can capture text and screen without archiving or falsely reporting complete preservation', async () => {
    const f = await fixture(); const result = await collectBrowserPage(f.contents, { saveArchive: false }, f);
    expect(f.contents.savePage).not.toHaveBeenCalled(); expect(result.complete).toBe(false);
    expect(result.images[0].status).toBe('not_requested');
  });
  it('does not mistake an access-block page or truncated text for a complete article archive', async () => {
    const f = await fixture(); f.page.contentStatus = 'blocked'; f.page.textTruncated = true;
    const result = await collectBrowserPage(f.contents, {}, f);
    expect(result.complete).toBe(false); expect(result.warnings).toContain('page_access_blocked');
    expect(result.warnings).toContain('text_truncated');
  });
  it('aborts on navigation and releases the per-tab capture lock after failure', async () => {
    const f = await fixture(); f.contents.executeJavaScript.mockImplementationOnce(async () => { f.navigate('https://example.com/next'); return f.page; });
    await expect(collectBrowserPage(f.contents, {}, f)).rejects.toThrow('Page changed');
    f.navigate(f.page.url); await expect(collectBrowserPage(f.contents, {}, f)).resolves.toMatchObject({ ok: true });
  });
  it('rejects simultaneous collection in the same tab before touching its scroll state', async () => {
    const f = await fixture(); let release;
    f.contents.executeJavaScript.mockImplementationOnce(() => new Promise(resolve => { release = () => resolve(f.page); }));
    const first = collectBrowserPage(f.contents, {}, f);
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    await expect(collectBrowserPage(f.contents, {}, f)).rejects.toThrow('already in progress');
    release(); await first;
  });
  it('decodes quoted-printable image resources without re-encoding their pixels', () => {
    const bytes = Buffer.from('Content-Type: multipart/related; boundary=qp\r\n\r\n--qp\r\nContent-Type: image/png\r\nContent-Transfer-Encoding: quoted-printable\r\nContent-Location: https://example.com/image\r\n\r\n=89PNG=00=FF=\r\nA\r\n--qp--\r\n', 'latin1');
    expect(decodeMhtmlResources(bytes)[0].data).toEqual(Buffer.from([137, 80, 78, 71, 0, 255, 65]));
  });
  it('bounds options and rejects invalid archives and non-web pages', async () => {
    expect(() => normalizePageCollection({ maxScrolls: 101 })).toThrow();
    expect(() => normalizePageCollection({ imageOffset: -1 })).toThrow();
    expect(() => decodeMhtmlResources(Buffer.from('not MHTML'))).toThrow();
    const f = await fixture(); f.navigate('file:///secret.html');
    await expect(collectBrowserPage(f.contents, {}, f)).rejects.toThrow('HTTP(S)');
  });
});
