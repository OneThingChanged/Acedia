export const CHAT_TURNS_PER_PAGE: number;
export const CHAT_CACHED_TURNS: number;
export const CHAT_CACHED_SESSIONS: number;
export function compactChatBlocks<T extends { role: string; kind: string }>(blocks: T[]): T[];
export function chatTurnStarts<T extends { role: string; kind: string }>(blocks: T[]): number[];
export function selectChatTurns<T extends { role: string; kind: string }>(blocks: T[], count?: number, direction?: 'latest' | 'older'): { blocks: T[]; trimmed: boolean };
export function touchChatCache<K, V>(cache: Map<K, V>, key: K, value: V): void;
