export function parseRemoteAddress(value: unknown): { origin: string; hostname: string; basePath: string; url: string } | null;
export function remotePath(path: string, basePath?: string): string;
export function remoteRequestPath(pathname: string, basePath?: string): string | null;
