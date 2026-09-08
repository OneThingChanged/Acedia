import { readFileSync } from 'node:fs';
import { PRODUCT_ID, redact } from './store-release-core.mjs';

const API = 'https://manage.devcenter.microsoft.com/v1.0/my';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export class StoreApi {
  constructor(credentials, { fetchImpl = fetch, sleep = wait } = {}) {
    this.credentials = credentials; this.fetch = fetchImpl; this.sleep = sleep;
  }
  async token() {
    if (this.accessToken && Date.now() < this.expiresAt) return this.accessToken;
    const { tenantId, clientId, clientSecret } = this.credentials;
    if (!/^[\da-f-]{36}$/i.test(tenantId || '') || !/^[\da-f-]{36}$/i.test(clientId || '') || !clientSecret) {
      throw new Error('Store credentials missing. Run setup-store-release.ps1 -ConfigureCredentials in an interactive PowerShell.');
    }
    const response = await this.fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/token`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(60000),
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret, resource: 'https://manage.devcenter.microsoft.com' }),
    });
    if (!response.ok) throw new Error(`Store authentication failed (HTTP ${response.status}); check Entra app permissions and credential expiry.`);
    const data = await response.json();
    if (!data.access_token) throw new Error('Store authentication did not return an access token.');
    this.accessToken = data.access_token;
    this.expiresAt = Date.now() + (Number(data.expires_in || 3600) - 120) * 1000;
    return this.accessToken;
  }
  async request(method, path, body) {
    if (!/^\/applications\/9NVBSGNRTPLR(?:\/submissions(?:\/\d+(?:\/(?:status|commit))?)?)?$/.test(path)) throw new Error('Unexpected Store API path.');
    const attempts = method === 'GET' ? 4 : 1; // Never blindly retry creation/commit.
    for (let attempt = 0; attempt < attempts; attempt++) {
      const token = await this.token();
      let response;
      try {
        response = await this.fetch(API + path, { method, redirect: 'error', signal: AbortSignal.timeout(60000),
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      } catch {
        if (attempt + 1 < attempts) { await this.sleep(2000 * (attempt + 1)); continue; }
        throw new Error(`Store ${method} request interrupted; reconcile server state before retrying.`);
      }
      if ((response.status === 429 || response.status >= 500 || response.status === 401) && attempt + 1 < attempts) {
        if (response.status === 401) this.accessToken = null;
        const delay = Math.min(30000, Math.max(1000, Number(response.headers.get('retry-after') || 2) * 1000));
        await this.sleep(delay); continue;
      }
      if (!response.ok) {
        let code = ''; try { code = (await response.json()).code || ''; } catch {}
        throw new Error(`Store ${method} failed (HTTP ${response.status}, ${String(redact(code)).slice(0,100)}). No automatic deletion or cancellation was performed.`);
      }
      const content = await response.text(); return content ? JSON.parse(content) : null;
    }
  }
  app() { return this.request('GET', `/applications/${PRODUCT_ID}`); }
  submission(id) { return this.request('GET', `/applications/${PRODUCT_ID}/submissions/${id}`); }
  status(id) { return this.request('GET', `/applications/${PRODUCT_ID}/submissions/${id}/status`); }
  create() { return this.request('POST', `/applications/${PRODUCT_ID}/submissions`); }
  update(id, body) { return this.request('PUT', `/applications/${PRODUCT_ID}/submissions/${id}`, body); }
  commit(id) { return this.request('POST', `/applications/${PRODUCT_ID}/submissions/${id}/commit`); }
  async upload(sas, zipPath) {
    const url = new URL(sas);
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.blob.core.windows.net') || url.username || url.password) throw new Error('Unexpected Store upload endpoint.');
    const bytes = readFileSync(zipPath);
    const ids = [];
    // Block upload permits bounded retries and avoids the legacy single-PUT size limit.
    for (let offset = 0, i = 0; offset < bytes.length; offset += 4 * 1024 * 1024, i++) {
      const id = Buffer.from(String(i).padStart(8, '0')).toString('base64'); ids.push(id);
      const block = new URL(url); block.searchParams.set('comp', 'block'); block.searchParams.set('blockid', id);
      await this.putBlob(block, bytes.subarray(offset, offset + 4 * 1024 * 1024));
    }
    const commit = new URL(url); commit.searchParams.set('comp', 'blocklist');
    await this.putBlob(commit, Buffer.from(`<?xml version="1.0" encoding="utf-8"?><BlockList>${ids.map((id) => `<Latest>${id}</Latest>`).join('')}</BlockList>`));
  }
  async putBlob(url, body) {
    for (let i = 0; i < 4; i++) {
      let response;
      try { response = await this.fetch(url, { method: 'PUT', redirect: 'error', signal: AbortSignal.timeout(120000),
        headers: { 'x-ms-version': '2021-12-02', 'Content-Type': 'application/octet-stream' }, body }); } catch {}
      if (response?.ok) return;
      if (response && response.status < 500 && response.status !== 429) throw new Error(`Store blob upload failed (HTTP ${response.status}).`);
      if (i < 3) await this.sleep(2000 * (i + 1));
    }
    throw new Error('Store blob upload interrupted; resume to retry the same artifact.');
  }
}
