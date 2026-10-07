import type { ChatBlock } from '../platform/ipcContract';

export function viewedImagePaths(blocks: ChatBlock[], fileName: string) {
  const requested = fileName.split(/[\\/]/).pop()?.toLowerCase();
  const found = new Map<string, string>();
  for (const block of blocks) {
    if (block.kind !== 'tool-call' || !/(?:^|[.:_])view_image$/.test(block.name || '')) continue;
    let input = block.input;
    if (typeof input === 'string') { try { input = JSON.parse(input); } catch { continue; } }
    const candidate = input && typeof input === 'object' && 'path' in input ? String(input.path || '').trim() : '';
    if (candidate.split(/[\\/]/).pop()?.toLowerCase() === requested && candidate) found.set(candidate.replace(/\\/g, '/').toLowerCase(), candidate);
  }
  return [...found.values()];
}
