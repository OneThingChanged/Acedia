import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { compareProductVersions } from './local-developer-update.mjs';

const REPO = 'OneThingChanged/Multiagent';
const ROOT = `https://github.com/${REPO}/releases/download/`;
export function selectExeRelease(releases, currentVersion) {
  return releases.filter(r => !r.draft && !r.prerelease && /^v\d+\.\d+\.\d+\.\d+$/.test(r.tag_name) &&
    r.assets?.some(a => a.name === 'latest-exe.json') && compareProductVersions(r.tag_name.slice(1), currentVersion) > 0)
    .sort((a,b) => compareProductVersions(b.tag_name.slice(1), a.tag_name.slice(1)))[0] || null;
}
export function validateExeManifest(data, release) {
  const version = release.tag_name.slice(1);
  const name = `Acedia-Setup-${version}-x64.exe`;
  const asset = release.assets.find(a => a.name === name);
  if (data.schemaVersion !== 1 || data.channel !== 'exe' || data.version !== version || data.fileName !== name ||
      !/^[a-f0-9]{64}$/i.test(data.sha256 || '') || !Number.isSafeInteger(data.size) || data.size <= 0 ||
      data.size > 1024 * 1024 * 1024 || asset?.size !== data.size ||
      asset.browser_download_url !== `${ROOT}${release.tag_name}/${name}`) throw new Error('Invalid EXE release manifest.');
  return { ...data, url: asset.browser_download_url, releaseDate: release.published_at, releaseName: release.name };
}
export class GithubExeUpdateService {
  constructor({ currentVersion, cacheDir, fetchImpl = fetch }) {
    this.currentVersion = currentVersion; this.cacheDir = cacheDir; this.fetch = fetchImpl;
    this.available = null; this.prepared = null; this.downloading = false;
  }
  async check() {
    const response = await this.fetch(`https://api.github.com/repos/${REPO}/releases?per_page=100`, {
      headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`GitHub update check failed (${response.status}).`);
    const release = selectExeRelease(await response.json(), this.currentVersion);
    if (!release) { this.available = null; return null; }
    const manifestAsset = release.assets.find(a => a.name === 'latest-exe.json');
    if (manifestAsset.browser_download_url !== `${ROOT}${release.tag_name}/latest-exe.json`) throw new Error('Unexpected update manifest URL.');
    const manifestResponse = await this.fetch(manifestAsset.browser_download_url, { signal: AbortSignal.timeout(30000) });
    if (!manifestResponse.ok) throw new Error(`Update manifest download failed (${manifestResponse.status}).`);
    this.available = validateExeManifest(await manifestResponse.json(), release);
    return { version: this.available.version, releaseDate: this.available.releaseDate, releaseName: this.available.releaseName };
  }
  async download(progress = () => {}) {
    if (this.downloading) throw new Error('An update download is already running.');
    if (!this.available) throw new Error('Check for an EXE update first.');
    this.downloading = true; this.prepared = null;
    const candidate = { ...this.available };
    fs.mkdirSync(this.cacheDir, { recursive: true });
    const target = path.join(this.cacheDir, candidate.fileName), partial = target + '.partial';
    let fd;
    try {
      const response = await this.fetch(candidate.url, { signal: AbortSignal.timeout(15 * 60000) });
      if (!response.ok || !response.body) throw new Error(`Installer download failed (${response.status}).`);
      fd = fs.openSync(partial, 'w'); const hash = createHash('sha256'); let size = 0;
      progress({ event:'Started', data:{ contentLength:candidate.size } });
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > candidate.size) throw new Error('Installer size exceeds release metadata.');
        fs.writeSync(fd, chunk); hash.update(chunk);
        progress({ event:'Progress', data:{ chunkLength:chunk.length } });
      }
      fs.closeSync(fd); fd = undefined;
      if (size !== candidate.size || hash.digest('hex') !== candidate.sha256.toLowerCase()) throw new Error('Installer SHA-256 or size mismatch.');
      fs.renameSync(partial, target); this.prepared = { ...candidate, path:target };
      progress({ event:'Finished', data:{} });
      return this.prepared;
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
      fs.rmSync(partial, { force:true }); this.downloading = false;
    }
  }
  validatedInstaller() {
    const p = this.prepared;
    if (!p || compareProductVersions(p.version, this.currentVersion) <= 0 ||
        path.dirname(p.path) !== this.cacheDir || fs.statSync(p.path).size !== p.size ||
        createHash('sha256').update(fs.readFileSync(p.path)).digest('hex') !== p.sha256.toLowerCase()) throw new Error('Prepared EXE update changed.');
    return p.path;
  }
}
