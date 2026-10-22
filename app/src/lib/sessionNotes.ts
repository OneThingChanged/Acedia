import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { SessionNoteClient, type SessionNote } from '../../electron/shared/session-notes-client.mjs';
import { invoke, listen } from '../platform/runtime';
import { isElectronRuntime } from '../platform/electronBridge';

let backup: Storage | null = null;
try { backup = localStorage; } catch { /* Draft backup is best effort. */ }
export const sessionNotes = new SessionNoteClient({
  storage: backup,
  read: id => invoke<SessionNote>('session_notes_get', { id }),
  save: args => invoke<{ saved: boolean; note: SessionNote }>('session_notes_save', args),
});

const openers = new Set<(id: string) => boolean>();
export function registerSessionNotesOpener(opener: (id: string) => boolean) { openers.add(opener); return () => { openers.delete(opener); }; }
// Human menu navigation only: opening a note never selects or starts a CLI.
export function openSessionNotes(id: string) { for (const opener of openers) if (opener(id)) return true; return false; }

export function useSessionNote(id: string, open = false) {
  const subscribe = useCallback((listener: () => void) => sessionNotes.subscribe(id, listener), [id]);
  const snapshot = useCallback(() => sessionNotes.snapshot(id), [id]);
  const state = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => { void sessionNotes.load(id); }, [id]);
  useEffect(() => {
    if (!open) return;
    const refresh = () => { if (!document.hidden) void sessionNotes.load(id); };
    const timer = window.setInterval(refresh, 10000);
    window.addEventListener('focus', refresh); window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', refresh);
    const unlisten = isElectronRuntime() ? listen<{id: string}>('session:notes', event => { if (event.payload.id === id) refresh(); }) : Promise.resolve(() => {});
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('online', refresh); document.removeEventListener('visibilitychange', refresh); void unlisten.then(off => off()); sessionNotes.setComposing(id, false); void sessionNotes.flush(id); };
  }, [id, open]);
  return state;
}
