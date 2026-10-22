import type { ChatPrompt } from './chat-prompt.mjs';
import type { Terminal } from '@xterm/xterm';
export function readTerminalStartupScreen(term: Pick<Terminal, 'buffer' | 'rows'>): string;
export type TerminalStartupPrompt = ChatPrompt & {
  startupKind: 'folder-trust' | 'hook-review';
  selectedIndex?: number;
  folder?: string;
  trustRoot?: string | null;
};
export function parseTerminalStartupPrompt(screen: string, provider?: string): TerminalStartupPrompt | null;
