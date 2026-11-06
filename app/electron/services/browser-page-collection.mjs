import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { setImmediate as yieldLoop } from 'node:timers/promises';
import { sanitizeBrowserText, sanitizeBrowserUrl } from './browser-context.mjs';
import { captureBrowserPng } from './browser-capture.mjs';

const active = new WeakSet();
const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

export function normalizePageCollection(body = {}) {
  const integer = (key, fallback, min, max) => {
    if (body[key] === undefined) return fallback;
    if (!Number.isInteger(body[key]) || body[key] < min || body[key] > max) throw new Error(`Invalid ${key}`);
    return body[key];
  };
  if (body.selector !== undefined && (typeof body.selector !== 'string' || body.selector.length > 500)) throw new Error('Invalid selector');
  if (body.saveArchive !== undefined && typeof body.saveArchive !== 'boolean') throw new Error('Invalid saveArchive');
  if (body.expandCode !== undefined && typeof body.expandCode !== 'boolean') throw new Error('Invalid expandCode');
  return { selector: body.selector || '', saveArchive: body.saveArchive !== false, expandCode: body.expandCode === true,
    maxScrolls: integer('maxScrolls', 60, 0, 100), maxText: integer('maxText', 24000, 1000, 60000),
    imageOffset: integer('imageOffset', 0, 0, 10000), maxImages: integer('maxImages', 12, 1, 40) };
}

// Runs inside the already rendered tab. Cookie/storage APIs, arbitrary script
// execution, login interaction and form editing are not exposed to callers.
// Raw DOM is stored locally; only bounded text/metadata is returned to MCP.
async function collectRenderedPage(options) {
  const initialUrl = location.href, scroll = { x: scrollX, y: scrollY };
  const selectors = options.selector ? [options.selector] : ['.Post-RichText', '.Post-RichTextContainer', 'article .RichText', 'article', '[role="main"]', 'main', 'body'];
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  let root, selector;
  for (let attempt = 0; attempt < 30; attempt++) {
    for (const candidate of selectors) {
      const matches = [...document.querySelectorAll(candidate)];
      if (options.selector && matches.length !== 1) throw new Error('Selector must match exactly one content element');
      if (matches.length) { root = matches[0]; selector = candidate; break; }
    }
    if (!root) throw new Error('Page content not found');
    if (options.selector || selector !== 'body' || (root.innerText || '').trim().length >= 200) break;
    await pause(100);
  }
  const deadline = Date.now() + 15000;
  let reachedEnd = root.getBoundingClientRect().bottom <= innerHeight, steps = 0;
  try {
    const originalHtml = '<!doctype html>\n' + document.documentElement.outerHTML;
    const codeExpanders = () => [...root.querySelectorAll('button, [role="button"]')].filter(node =>
      /^(?:Expand(?:\s+code)?|Show (?:more|all)(?:\s+code)?|展开(?:全部|代码)?|코드\s*펼치기)$/i.test((node.innerText || '').trim()) && node.parentElement?.querySelector('pre, code'));
    let expandedCode = 0;
    if (options.expandCode) {
      for (const node of codeExpanders().slice(0, 40)) { node.click(); expandedCode++; await pause(50); }
    }
    if (options.saveArchive && options.maxScrolls) {
      for (; steps < options.maxScrolls && Date.now() < deadline; steps++) {
        if (location.href !== initialUrl || !root.isConnected) throw new Error('Page changed during collection');
        const bounds = root.getBoundingClientRect();
        const end = Math.max(0, scrollY + bounds.bottom - innerHeight);
        const next = Math.min(end, Math.max(0, scrollY + bounds.top) + steps * Math.max(200, innerHeight * .8));
        window.scrollTo({ top: next, left: scroll.x, behavior: 'instant' });
        await pause(100);
        if (scrollY + innerHeight >= root.getBoundingClientRect().bottom + scrollY - 2) { reachedEnd = true; break; }
      }
    }
    const images = [...root.querySelectorAll('img')];
    if (options.saveArchive) {
      const until = Date.now() + 1800;
      while (images.some(node => !node.complete) && Date.now() < until) await pause(75);
    }
    if (location.href !== initialUrl) throw new Error('Page changed during collection');
    const text = root.innerText || '';
    const responseStatus = performance.getEntriesByType('navigation')[0]?.responseStatus || 0;
    const accessError = responseStatus >= 400 || selector === 'body' && text.length < 2000 && /access denied|forbidden|安全验证|captcha|just a moment|checking your browser|访问受限|请求.*异常/i.test(document.title + '\n' + text);
    const contentStatus = accessError ? 'blocked' : selector === 'body' && !options.selector && text.trim().length < 200 ? 'unverified' : 'ready';
    const html = '<!doctype html>\n' + document.documentElement.outerHTML;
    const articleHtml = root.outerHTML;
    const structure = Object.fromEntries(['img', 'pre', 'code', 'table', 'ol', 'ul', 'a'].map(tag => [tag, root.querySelectorAll(tag).length]));
    let inlineBytes = 0;
    return { url: initialUrl, title: document.title, selector, contentStatus, responseStatus, text: text.slice(0, 3000000), textLength: text.length,
      textTruncated: text.length > 3000000, reachedEnd, scrollSteps: steps, scroll,
      html: originalHtml.length <= 3000000 ? originalHtml : '', expandedHtml: html.length <= 3000000 ? html : '', articleHtml: articleHtml.length <= 3000000 ? articleHtml : '',
      htmlTruncated: originalHtml.length > 3000000 || html.length > 3000000 || articleHtml.length > 3000000, structure,
      expandedCode, remainingCodeExpanders: codeExpanders().length,
      images: images.slice(0, 1000).map((node, index) => {
        let src = node.currentSrc || node.src || '';
        if (src.startsWith('data:')) { inlineBytes += src.length; if (inlineBytes > 8 * 1024 * 1024) src = ''; }
        const resolve = value => { try { return value ? new URL(value, location.href).href : ''; } catch { return ''; } };
        const originalCandidate = resolve(node.getAttribute('data-original') || node.getAttribute('data-actualsrc'));
        const gif = node.classList.contains('ztext-gif') || node.getAttribute('data-actualtype') === 'gif';
        return { index, src, originalCandidate,
          originalGif: gif ? (/\.gif(?:\?|$)/i.test(originalCandidate) ? originalCandidate : (originalCandidate || src).replace(/(?:_[^/.?]+)?\.(?:jpe?g|png|webp)(?=\?|$)/i, '.gif')) : '',
          alt: (node.alt || '').slice(0, 500), caption: (node.closest('figure')?.querySelector('figcaption')?.innerText || '').slice(0, 1000),
          width: node.naturalWidth, height: node.naturalHeight, loaded: node.complete && node.naturalWidth > 0 };
      }), imageLimitReached: images.length > 1000 };
  } finally {
    if (location.href === initialUrl) window.scrollTo({ left: scroll.x, top: scroll.y, behavior: 'instant' });
  }
}

export const pageCollectionExpression = options => `(${collectRenderedPage.toString()})(${JSON.stringify(options)})`;

function headers(text) {
  const out = {};
  for (const line of text.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const colon = line.indexOf(':'); if (colon > 0) out[line.slice(0, colon).toLowerCase()] = line.slice(colon + 1).trim();
  }
  return out;
}

export function decodeMhtmlResources(bytes) {
  if (bytes.length > MAX_ARCHIVE_BYTES) throw new Error('Browser archive exceeds 64 MiB');
  const source = bytes.toString('latin1');
  const boundary = source.slice(0, source.indexOf('\r\n\r\n') > 0 ? source.indexOf('\r\n\r\n') : 10000)
    .match(/boundary\s*=\s*(?:"([^"]+)"|([^;\s]+))/i);
  if (!boundary) throw new Error('Invalid browser MHTML boundary');
  return source.split('--' + (boundary[1] || boundary[2])).slice(1).flatMap(part => {
    if (part.startsWith('--')) return [];
    const split = part.search(/\r?\n\r?\n/); if (split < 0) return [];
    const meta = headers(part.slice(0, split));
    const mime = (meta['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (!mime.startsWith('image/')) return [];
    let body = part.slice(split).replace(/^\r?\n\r?\n/, '').replace(/\r?\n$/, '');
    let data;
    if (meta['content-transfer-encoding'] === 'base64') data = Buffer.from(body.replace(/\s/g, ''), 'base64');
    else if (meta['content-transfer-encoding'] === 'quoted-printable') {
      body = body.replace(/=\r?\n/g, '');
      data = Buffer.from(body.replace(/=([\da-f]{2})/gi, (_all, hex) => String.fromCharCode(parseInt(hex, 16))), 'latin1');
    } else data = Buffer.from(body, 'latin1');
    return [{ url: meta['content-location'] || '', mime, data }];
  });
}

const extensions = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp', 'image/svg+xml': '.svg', 'image/avif': '.avif', 'image/bmp': '.bmp', 'image/x-icon': '.ico' };
const key = value => { try { const u = new URL(value); u.hash = ''; return u.href; } catch { return value; } };

async function savedFileInventory(folder) {
  const files = []; let total = 0;
  async function visit(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Unexpected archive symbolic link');
      if (entry.isDirectory()) { await visit(file); continue; }
      if (!entry.isFile()) continue;
      const stat = await fs.stat(file); total += stat.size;
      if (files.length >= 4000 || total > 256 * 1024 * 1024) throw new Error('Archive inventory exceeds limit');
      const digest = createHash('sha256');
      for await (const chunk of createReadStream(file)) digest.update(chunk);
      files.push({ path: file, relativePath: path.relative(folder, file), bytes: stat.size, sha256: digest.digest('hex') });
    }
  }
  await visit(folder); return files;
}

export async function collectBrowserPage(contents, body, { directory, capture = captureBrowserPng } = {}) {
  const options = normalizePageCollection(body);
  if (active.has(contents)) throw Object.assign(new Error('Page collection already in progress'), { statusCode: 409 });
  if (!/^https?:\/\//i.test(contents.getURL())) throw new Error('Open an HTTP(S) page in the embedded browser first');
  if (contents.isLoading?.()) throw new Error('Page is still loading; wait for the rendered tab before collection');
  active.add(contents);
  const id = randomUUID(), folder = path.join(directory, id), warnings = [];
  const originalUrl = contents.getURL();
  let page;
  const assertPage = () => { if (contents.isDestroyed() || contents.getURL() !== originalUrl) throw new Error('Page changed during collection'); };
  const write = async (name, data) => {
    const file = path.join(folder, name); await fs.writeFile(file, data);
    return { path: file, bytes: data.length, sha256: hash(data) };
  };
  try {
    await fs.mkdir(folder, { recursive: true });
    page = await contents.executeJavaScript(pageCollectionExpression(options), false); assertPage();
    const text = await write('content.txt', Buffer.from(page.text || '', 'utf8'));
    const originalHtml = page.html ? await write('index.html', Buffer.from(page.html, 'utf8')) : null;
    const expandedHtml = page.expandedHtml ? await write('expanded.html', Buffer.from(page.expandedHtml, 'utf8')) : null;
    const articleHtml = page.articleHtml ? await write('article.html', Buffer.from(page.articleHtml, 'utf8')) : null;
    let screenshot;
    try { screenshot = await write('viewport.png', await capture(contents)); }
    catch { warnings.push('viewport_capture_failed'); }
    const resources = new Map();
    let html, archive;
    if (options.saveArchive) {
      assertPage();
      const archivePath = path.join(folder, 'page.mhtml');
      try {
        await contents.savePage(archivePath, 'MHTML'); assertPage();
        const stat = await fs.stat(archivePath);
        if (stat.size > MAX_ARCHIVE_BYTES) throw new Error('Browser archive exceeds 64 MiB');
        const bytes = await fs.readFile(archivePath);
        archive = { path: archivePath, bytes: bytes.length, sha256: hash(bytes) };
        for (const [index, resource] of decodeMhtmlResources(bytes).entries()) {
          if (!resource.data.length) continue;
          const file = await write(`image-${String(index + 1).padStart(4, '0')}${extensions[resource.mime] || '.bin'}`, resource.data);
          resources.set(key(resource.url), { ...file, mime: resource.mime, source: sanitizeBrowserUrl(resource.url) });
          await yieldLoop();
        }
      } catch { warnings.push('mhtml_save_failed'); }
      assertPage();
      const htmlPath = path.join(folder, 'page.html');
      try {
        await contents.savePage(htmlPath, 'HTMLComplete'); assertPage();
        const bytes = await fs.readFile(htmlPath);
        html = { path: htmlPath, bytes: bytes.length, sha256: hash(bytes) };
      } catch { warnings.push('html_complete_save_failed'); }
      assertPage();
    }
    const images = [];
    const fetchDeadline = Date.now() + 20000;
    let fetchCount = 0;
    for (const image of page.images || []) {
      assertPage();
      const wanted = image.originalGif || image.originalCandidate || image.src;
      let file = resources.get(key(wanted));
      if (!file && options.saveArchive && /^data:image\/[a-z0-9.+-]+;base64,/i.test(wanted)) {
        const match = wanted.match(/^data:(image\/[a-z0-9.+-]+);base64,(.*)$/is);
        const bytes = Buffer.from(match[2], 'base64');
        file = { ...await write(`inline-${image.index}${extensions[match[1]] || '.bin'}`, bytes), mime: match[1] };
      }
      let assetError;
      if (options.saveArchive && (!file || image.originalGif && file.mime !== 'image/gif')) {
        try {
          if (fetchCount >= 40 || Date.now() >= fetchDeadline) throw new Error('asset_fetch_budget_exhausted');
          fetchCount++;
          const fetched = await captureBrowserAsset(contents, { url: wanted }, { directory: folder,
            allowedUrls: [image.src, image.originalCandidate, image.originalGif].filter(Boolean), timeoutMs: Math.min(10000, fetchDeadline - Date.now()) });
          file = fetched.file;
          resources.set(key(wanted), file);
        } catch (error) { assetError = error.message; }
      }
      assertPage();
      const preserved = Boolean(file) && (!image.originalGif || file.mime === 'image/gif');
      images.push({ ...image, src: image.src.startsWith('data:') ? '[inline image]' : sanitizeBrowserUrl(image.src),
        originalCandidate: sanitizeBrowserUrl(image.originalCandidate),
        originalGif: sanitizeBrowserUrl(image.originalGif),
        ...(file ? { file } : {}), ...(assetError ? { error: assetError } : {}), preserved,
        status: preserved ? 'saved' : !options.saveArchive ? 'not_requested' : image.originalGif && file ? 'original_gif_missing' : 'resource_missing' });
    }
    if (!page.reachedEnd && options.saveArchive) warnings.push('scroll_limit_reached');
    if (page.imageLimitReached) warnings.push('image_inventory_limit_reached');
    const missing = images.filter(image => !image.preserved);
    if (options.saveArchive && missing.length) warnings.push('images_incomplete');
    if (page.contentStatus !== 'ready') warnings.push(page.contentStatus === 'blocked' ? 'page_access_blocked' : 'content_unverified');
    if (page.textTruncated) warnings.push('text_truncated');
    if (page.htmlTruncated || !originalHtml || !articleHtml) warnings.push('dom_html_incomplete');
    if (page.remainingCodeExpanders) warnings.push('code_not_expanded');
    const assetMap = {};
    for (const [index, image] of images.entries()) if (image.file && image.preserved) {
      // Preserve exact signed URL keys on disk for downstream converters;
      // returned metadata remains sanitized and never contains raw HTML.
      const sourceImage = page.images[index];
      for (const url of [sourceImage.src, sourceImage.originalCandidate, sourceImage.originalGif]) if (url && !url.startsWith('data:')) assetMap[url] = image.file.path;
    }
    const assetMapFile = await write('asset-map.json', Buffer.from(JSON.stringify(assetMap, null, 2), 'utf8'));
    let artifacts = [];
    try { artifacts = await savedFileInventory(folder); }
    catch { warnings.push('archive_inventory_incomplete'); }
    const manifest = { schemaVersion: 1, id, source: 'rendered-embedded-browser', url: sanitizeBrowserUrl(page.url),
      title: sanitizeBrowserText(page.title, 500), selector: page.selector, collectedAt: new Date().toISOString(),
      contentStatus: page.contentStatus, responseStatus: page.responseStatus,
      structure: page.structure, expandedCode: page.expandedCode, remainingCodeExpanders: page.remainingCodeExpanders,
      preservation: { html: 'rendered DOM before expansion, expanded DOM and Chromium saved page', originalHttpResponseHtml: false, imageBytes: 'MHTML or same-session browser network, without image re-encoding' },
      complete: Boolean(options.saveArchive && html && archive && !warnings.length),
      text, originalHtml, expandedHtml, articleHtml, assetMap: assetMapFile, screenshot, html, archive, artifacts, textLength: page.textLength, textTruncated: page.textTruncated, images, missingImageIndices: missing.map(image => image.index), warnings };
    const manifestFile = await write('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'));
    const { artifacts: _artifacts, ...summary } = manifest;
    return { ok: true, ...summary, artifactCount: artifacts.length, manifestPath: manifestFile.path, text: (page.text || '').slice(0, options.maxText), returnedTextTruncated: (page.text || '').length > options.maxText, textFile: text,
      imageCount: images.length, imageOffset: options.imageOffset, images: images.slice(options.imageOffset, options.imageOffset + options.maxImages),
      nextImageOffset: options.imageOffset + options.maxImages < images.length ? options.imageOffset + options.maxImages : null };
  } finally { active.delete(contents); }
}

export async function captureBrowserAsset(contents, body, { directory, allowedUrls, timeoutMs = 10000 } = {}) {
  const pageUrl = contents.getURL();
  if (!/^https?:\/\//i.test(pageUrl)) throw new Error('Open an HTTP(S) page in the embedded browser first');
  if (typeof body.url !== 'string' || !body.url || body.url.length > 8192) throw new Error('Invalid image URL');
  const url = new URL(body.url);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid image URL');
  if (!allowedUrls) {
    allowedUrls = await contents.executeJavaScript(`(() => [...document.querySelectorAll('img')].flatMap(node => {
      const src = node.currentSrc || node.src || '', original = node.getAttribute('data-original') || node.getAttribute('data-actualsrc') || '';
      const gif = node.classList.contains('ztext-gif') || node.getAttribute('data-actualtype') === 'gif';
      const resolve = value => { try { return value ? new URL(value, location.href).href : ''; } catch { return ''; } };
      return [src, resolve(original), gif ? (/\\.gif(?:\\?|$)/i.test(original) ? resolve(original) : resolve(original || src).replace(/(?:_[^/.?]+)?\\.(?:jpe?g|png|webp)(?=\\?|$)/i, '.gif')) : ''];
    }).filter(Boolean))()`, false);
  }
  if (!allowedUrls.some(value => key(value) === key(url.href))) throw new Error('Image URL is not referenced by this rendered page');
  if (contents.isDestroyed() || contents.getURL() !== pageUrl) throw new Error('Page changed during asset capture');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Electron session.fetch uses the same Chromium session/cookies, rather
    // than a separate Node HTTP client or an exported authentication token.
    // Electron's main-process fetch does not consistently materialize the
    // RequestInit referrer as a Referer header. Use the document's origin for
    // cross-origin images and omit it on HTTPS downgrades (browser defaults).
    const documentUrl = new URL(pageUrl); documentUrl.hash = ''; documentUrl.username = ''; documentUrl.password = '';
    const referer = documentUrl.protocol === 'https:' && url.protocol === 'http:' ? ''
      : documentUrl.origin === url.origin ? documentUrl.href : documentUrl.origin + '/';
    const response = await contents.session.fetch(url.href, { credentials: 'include', referrer: pageUrl,
      headers: { ...(referer ? { Referer: referer } : {}), ...(contents.getUserAgent ? { 'User-Agent': contents.getUserAgent() } : {}) }, signal: controller.signal });
    const mime = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!response.ok || !extensions[mime]) throw new Error('Browser did not return a supported image resource');
    const chunks = []; let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length; if (size > 16 * 1024 * 1024) { controller.abort(); throw new Error('Image exceeds 16 MiB'); }
      chunks.push(Buffer.from(chunk));
    }
    if (!size) throw new Error('Empty browser image response');
    if (contents.isDestroyed() || contents.getURL() !== pageUrl) throw new Error('Page changed during asset capture');
    const bytes = Buffer.concat(chunks), name = 'asset-' + randomUUID() + extensions[mime];
    if (mime === 'image/gif' && !/^GIF8[79]a$/.test(bytes.subarray(0, 6).toString('ascii'))) throw new Error('Invalid GIF response bytes');
    await fs.mkdir(directory, { recursive: true }); const filePath = path.join(directory, name); await fs.writeFile(filePath, bytes);
    return { ok: true, source: sanitizeBrowserUrl(url.href), file: { path: filePath, bytes: size, mime, sha256: hash(bytes) } };
  } finally { clearTimeout(timeout); }
}

export async function readBrowserCollection(body, { directory } = {}) {
  if (!/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(body.collectionId || '')) throw new Error('Invalid collectionId');
  const options = normalizePageCollection(body);
  const folder = path.join(directory, body.collectionId);
  const manifestPath = path.join(folder, 'manifest.json');
  const { artifacts, ...manifest } = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const text = await fs.readFile(path.join(folder, 'content.txt'), 'utf8');
  return { ok: true, ...manifest, artifactCount: artifacts.length, manifestPath, textFile: manifest.text,
    text: text.slice(0, options.maxText), returnedTextTruncated: text.length > options.maxText,
    imageCount: manifest.images.length, imageOffset: options.imageOffset,
    images: manifest.images.slice(options.imageOffset, options.imageOffset + options.maxImages),
    nextImageOffset: options.imageOffset + options.maxImages < manifest.images.length ? options.imageOffset + options.maxImages : null };
}
