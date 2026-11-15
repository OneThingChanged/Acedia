/** Public Remote address, optionally including a mount path. No credentials or query. */
export function parseRemoteAddress(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const raw = value.trim();
  if (raw.length > 2048 || /[\s\\?#%]/.test(raw)) throw new TypeError('Enter a public HTTPS address, optionally with a path such as agent.example.com/acedia.');
  const input = /^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  const url = new URL(input);
  const segments = url.pathname.split('/').slice(1); if (segments.at(-1) === '') segments.pop();
  if (url.protocol !== 'https:' || url.username || url.password || !url.hostname
    || /(?:^|\/)\.{1,2}(?:\/|$)/.test(input.replace(/^https:\/\/[^/]+/i, ''))
    || segments.some(segment => !/^[A-Za-z0-9._~-]+$/.test(segment))) throw new TypeError('Enter a public HTTPS address without credentials, query or unsafe path segments.');
  const basePath = url.pathname === '/' ? '/' : url.pathname.replace(/\/+$/, '') + '/';
  return { origin: url.origin, hostname: url.host, basePath, url: url.origin + basePath };
}

export function remotePath(path, basePath = '/') {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || basePath === '/') return path;
  return basePath + path.slice(1);
}

export function remoteRequestPath(pathname, basePath = '/') {
  if (basePath === '/') return pathname;
  return pathname.startsWith(basePath) ? '/' + pathname.slice(basePath.length) : null;
}
