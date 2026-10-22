export type SessionNote = { id: string; text: string; revision: number; updatedAt: number | null };
export type NoteState = {
  id: string; text: string; note: SessionNote | null; conflict: SessionNote | null;
  status: 'loading' | 'saved' | 'dirty' | 'saving' | 'conflict' | 'error' | 'too-large';
  error: string | null; backupFailed: boolean;
};
export const MAX_NOTE_BYTES: number;
export const NOTE_DRAFT_PREFIX: string;
export class SessionNoteClient {
  constructor(options: { read: (id: string, revision?: number) => Promise<SessionNote | { unchanged: true }>;
    save: (args: { id: string; text: string; revision: number }) => Promise<{ saved: boolean; note: SessionNote }>;
    storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null; debounce?: number });
  snapshot(id: string): NoteState;
  subscribe(id: string, listener: () => void): () => void;
  load(id: string): Promise<unknown>;
  edit(id: string, text: string): void;
  setComposing(id: string, composing: boolean): void;
  flush(id: string): Promise<unknown>;
  flushAll(): Promise<void>;
  retry(id: string): Promise<void>;
  resolve(id: string, choice: 'local' | 'latest'): Promise<void>;
}
