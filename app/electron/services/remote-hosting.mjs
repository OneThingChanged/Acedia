import path from 'node:path';
import crypto from 'node:crypto';
import { PreferencesStore } from './preferences-store.mjs';
import { sendJson } from './remote-http.mjs';

export function hostingUrl(raw) {
  const url = new URL(String(raw));
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !url.port || url.username || url.password) throw new Error('Use an HTTP localhost URL with an explicit port.');
  url.hash = '';
  if (url.href.length > 4096) throw new Error('URL is too long.');
  return url;
}
const escape = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
export function rewriteHosting(source, target, prefix, html) {
  let result = source.split(target.origin + '/').join(prefix);
  result = result.replace(/\b(src|href|poster)\s*=\s*(["'])\/(?!\/)/gi, (_, attribute, quote) => `${attribute}=${quote}${prefix}`)
    .replace(/url\(\s*(["']?)\/(?!\/)/gi, (_, quote) => `url(${quote}${prefix}`);
  if (html) {
    result = result.replace(/<base\b[^>]*>/gi, '');
    const base = `<base href="${escape(prefix + target.pathname.slice(1) + target.search)}">`;
    result = /<head\b[^>]*>/i.test(result) ? result.replace(/<head\b[^>]*>/i, match => match + base) : base + result;
  }
  return result;
}
export class RemoteHosting {
  constructor(directory) {
    this.tickets = new Map();
    this.store = new PreferencesStore(path.join(directory, 'remote-hosting.json'), { revision: 0, entries: [] }, value => {
      if (!Array.isArray(value.entries) || value.entries.length > 64 || value.entries.some(e => !e || typeof e.id !== 'string' || typeof e.name !== 'string' || !e.name.trim() || e.name.length > 100)) throw new Error('Invalid Hosting settings.');
      for (const entry of value.entries) hostingUrl(entry.url);
      return value;
    });
  }
  async api(request, response, url, { readJson, allowed }) {
    if (url.pathname !== '/api/hosting') return false;
    try {
      if (!allowed()) { sendJson(response, 403, { error: 'Cross-origin request blocked.' }); return true; }
      const current = this.store.get();
      if (request.method === 'GET') { sendJson(response, 200, current); return true; }
      if (request.method !== 'POST') { sendJson(response, 405, { error: 'Method not allowed.' }); return true; }
      const body = await readJson(request, 8192);
      if (body.action === 'add') {
        const target = hostingUrl(body.url);
        if (Number(target.port) === request.socket.localPort) throw new Error('Choose a local website, not this Remote server.');
        const name = String(body.name || target.pathname).trim();
        if (!name || name.length > 100) throw new Error('Enter a name up to 100 characters.');
        if (current.entries.some(e => e.url === target.href)) throw new Error('This URL is already registered.');
        sendJson(response, 200, this.store.set({ entries: [...current.entries, { id: crypto.randomUUID(), name, url: target.href }] }, current.revision));
      } else if (body.action === 'remove') {
        if (!current.entries.some(e => e.id === body.id)) throw new Error('Hosting entry not found.');
        this.store.set({ entries: current.entries.filter(e => e.id !== body.id) }, current.revision);
        for (const [token, ticket] of this.tickets) if (ticket.id === body.id) this.tickets.delete(token);
        sendJson(response, 200, this.store.get());
      } else if (body.action === 'open') {
        const entry = current.entries.find(e => e.id === body.id);
        if (!entry) throw new Error('Hosting entry not found.');
        const target = hostingUrl(entry.url);
        if (Number(target.port) === request.socket.localPort) throw new Error('Cannot host the Remote server itself.');
        for (const [token, ticket] of this.tickets) if (ticket.expires <= Date.now()) this.tickets.delete(token);
        if (this.tickets.size >= 128) this.tickets.delete(this.tickets.keys().next().value);
        const token = crypto.randomBytes(32).toString('base64url');
        this.tickets.set(token, { id: entry.id, origin: target.origin, expires: Date.now() + 30 * 60_000 });
        sendJson(response, 200, { url: `/hosting-preview/${token}${target.pathname}${target.search}`, expiresIn: 1800 });
      } else throw new Error('Unknown Hosting action.');
    } catch (error) { sendJson(response, 400, { error: error.message }); }
    return true;
  }
  async preview(request, response, url) {
    if (!url.pathname.startsWith('/hosting-preview/')) return false;
    response.setHeader('cache-control', 'no-store');
    response.setHeader('referrer-policy', 'no-referrer');
    response.setHeader('x-content-type-options', 'nosniff');
    try {
      if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end(); return true; }
      const match = url.pathname.match(/^\/hosting-preview\/([A-Za-z0-9_-]{43})(\/.*)$/);
      const ticket = match && this.tickets.get(match[1]);
      if (!ticket || ticket.expires <= Date.now() || !this.store.get().entries.some(e => e.id === ticket.id)) { response.writeHead(410).end('Hosting link expired or removed. Reopen it from Hosting.'); return true; }
      const target = new URL(ticket.origin + match[2] + url.search);
      if (target.origin !== ticket.origin || Number(target.port) === request.socket.localPort) throw new Error('Invalid hosting target.');
      const prefix = `/hosting-preview/${match[1]}/`;
      const upstream = await fetch(target, { redirect: 'manual', signal: AbortSignal.timeout(10000), headers: { accept: '*/*' } });
      if ([301,302,303,307,308].includes(upstream.status)) {
        const destination = new URL(upstream.headers.get('location'), target);
        await upstream.body?.cancel();
        if (destination.origin !== target.origin) throw new Error('External redirects are not supported.');
        response.writeHead(upstream.status, { location: prefix + destination.pathname.slice(1) + destination.search }).end(); return true;
      }
      const type = (upstream.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!/^(text\/(html|css|plain|javascript)|application\/(javascript|json|wasm)|image\/[a-z0-9.+-]+|font\/[a-z0-9.+-]+)$/.test(type)) { await upstream.body?.cancel(); throw new Error('Unsupported preview content type.'); }
      let size = 0; const chunks = [];
      for await (const chunk of upstream.body || []) { size += chunk.length; if (size > 25 * 1024 * 1024) throw new Error('Hosting resource exceeds 25 MB.'); chunks.push(chunk); }
      let content = Buffer.concat(chunks);
      if (type === 'text/html' || type === 'text/css') content = Buffer.from(rewriteHosting(content.toString('utf8'), target, prefix, type === 'text/html'));
      // Opaque-origin sandbox keeps hosted scripts away from Remote's login and APIs.
      response.setHeader('content-security-policy', `sandbox allow-scripts; default-src 'none'; base-uri 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'none'; frame-src 'none'; form-action 'none'; frame-ancestors 'self'`);
      response.setHeader('access-control-allow-origin', '*');
      response.writeHead(upstream.status, { 'content-type': type + (type.startsWith('text/') ? '; charset=utf-8' : ''), 'content-length': content.length });
      response.end(request.method === 'HEAD' ? undefined : content);
    } catch { response.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' }).end('Cannot load this local page. Check that its server is running and the URL is correct.'); }
    return true;
  }
}
