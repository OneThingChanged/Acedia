import { invoke } from '../platform/runtime';

// These are already resolved local files. Open videos with the OS media
// association; other file types retain reveal-only behavior (including scripts).
export function openTerminalFile(path: string, reveal = false) {
  const video = /\.(?:mp4|webm|m4v|mov|mkv|avi|wmv|mpg|mpeg)$/i.test(path);
  return invoke(video && !reveal ? 'open_local_path' : 'reveal_local_path', { path });
}
