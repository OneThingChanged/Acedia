// Module URLs retain the mount path, including on /login and in installed PWAs.
export function remoteBasePath(moduleUrl) { return /^https?:/.test(moduleUrl) ? new URL('../', moduleUrl).pathname : '/'; }
export const REMOTE_BASE_PATH = remoteBasePath(import.meta.url);
export function remotePath(value, base = REMOTE_BASE_PATH) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || base === '/') return value;
  return base + value.slice(1);
}
export function remoteLocalPath(value, base = REMOTE_BASE_PATH) {
  return base === '/' ? value : value.startsWith(base) ? '/' + value.slice(base.length) : null;
}
