import { useEffect, useRef } from 'react';
import { sessionNotes, useSessionNote } from '../lib/sessionNotes';
import { useAppLanguage } from '../lib/appLanguage';
import { invoke } from '../platform/runtime';
import { useNativeViewOcclusion } from '../hooks/useNativeViewOcclusion';
import { SessionToolbarIcon } from './SessionToolbarIcon';
import type { Agent } from '../types';
import './SessionNotes.css';

export function SessionNoteButton({ id, open, onClick }: { id: string; open: boolean; onClick: () => void }) {
  const { text } = useAppLanguage();
  const note = useSessionNote(id);
  return <button type="button" className={`pane-chat-toggle session-icon-button session-note-toggle${open ? ' on' : ''}`}
    aria-label={text('세션 메모', 'Session note')} data-tooltip={text('세션 메모', 'Session note')} aria-expanded={open} aria-pressed={open} onClick={onClick}>
    <SessionToolbarIcon name="note" />{(note.text.trim() || note.note?.text.trim()) && <span className="session-note-dot" />}
  </button>;
}

export function SessionNotePanel({ agent, onClose }: { agent: Pick<Agent, 'id' | 'name'>; onClose: () => void }) {
  const { text } = useAppLanguage();
  const note = useSessionNote(agent.id, true);
  const editor = useRef<HTMLTextAreaElement>(null);
  const copied = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyLabel = useRef<HTMLSpanElement>(null);
  const focused = useRef(false);
  useEffect(() => { editor.current?.focus(); return () => { if (copied.current) clearTimeout(copied.current); }; }, [agent.id]);
  useEffect(() => { if (note.note && !focused.current) { focused.current = true; editor.current?.focus(); } }, [note.note]);
  const status = note.status === 'loading' ? text('불러오는 중…', 'Loading…')
    : note.status === 'saving' ? text('저장 중…', 'Saving…')
    : note.status === 'dirty' ? text('저장 대기', 'Waiting to save')
    : note.status === 'conflict' ? text('다른 곳에서 수정됨', 'Edited elsewhere')
    : note.status === 'error' ? text('저장 상태를 확인하지 못했습니다.', 'Could not confirm save status.')
    : note.status === 'too-large' ? text('메모는 64 KB까지 저장할 수 있습니다.', 'Notes can contain up to 64 KB.')
    : note.note?.updatedAt ? text(`저장됨 · ${new Date(note.note.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, `Saved · ${new Date(note.note.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`)
    : text('입력하면 자동 저장됩니다.', 'Saves automatically as you type.');
  return <aside className="session-note-panel" aria-label={text(`${agent.name} 세션 메모`, `${agent.name} session note`)} onKeyDown={event => {
    // Keep editor shortcuts and IME input away from terminal/app handlers.
    event.stopPropagation();
    if (event.key === 'Escape' && !event.nativeEvent.isComposing) { event.preventDefault(); onClose(); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void sessionNotes.flush(agent.id); }
  }}>
    <header className="session-note-head"><h3><SessionToolbarIcon name="note" />{text('세션 메모', 'Session note')}</h3><div>
      <button type="button" className="session-note-icon" aria-label={text('메모 복사', 'Copy note')} title={text('메모 복사', 'Copy note')} disabled={!note.text} onClick={async () => {
        try { await invoke('clipboard_write_text', { text: note.text }); if (copyLabel.current) copyLabel.current.textContent = text('복사했습니다.', 'Copied.'); }
        catch { editor.current?.focus(); editor.current?.select(); if (copyLabel.current) copyLabel.current.textContent = text('선택한 내용을 복사해 주세요.', 'Copy the selected text.'); }
        if (copied.current) clearTimeout(copied.current);
        copied.current = setTimeout(() => { if (copyLabel.current) copyLabel.current.textContent = ''; }, 2200);
      }}>⧉</button><button type="button" className="session-note-icon" aria-label={text('메모 닫기', 'Close note')} onClick={onClose}>×</button>
    </div></header>
    <div className="session-note-owner"><span className="session-note-dot" /><strong title={agent.name}>{agent.name}</strong><span>{text('개인 메모', 'Personal note')}</span></div>
    <textarea ref={editor} className="session-note-editor" value={note.text} aria-label={text(`${agent.name} 개인 메모`, `${agent.name} personal note`)} spellCheck={false}
      disabled={!note.note && note.status === 'loading'} placeholder={text('다음에 이어서 할 일이나 기억할 내용을 적어 보세요.', 'Write down what to do next or things to remember.')}
      onChange={event => sessionNotes.edit(agent.id, event.target.value)}
      onCompositionStart={() => sessionNotes.setComposing(agent.id, true)} onCompositionEnd={() => sessionNotes.setComposing(agent.id, false)}
      onBlur={() => { sessionNotes.setComposing(agent.id, false); void sessionNotes.flush(agent.id); }} />
    {note.conflict && <div className="session-note-conflict" role="alert"><p>{text('다른 곳에서 수정했습니다. 내 입력은 보관했습니다.', 'This note changed elsewhere. Your draft is preserved.')}</p>
      <details><summary>{text('저장된 내용 보기', 'View saved note')}</summary><pre>{note.conflict.text || text('(빈 메모)', '(Empty note)')}</pre></details>
      <div><button type="button" onClick={() => { void sessionNotes.resolve(agent.id, 'latest'); }}>{text('저장된 내용 사용', 'Use saved note')}</button><button type="button" onClick={() => { void sessionNotes.resolve(agent.id, 'local'); }}>{text('내 메모로 저장', 'Save my draft')}</button></div></div>}
    <footer className="session-note-footer"><div role="status" aria-live="polite" className={`session-note-save ${note.status}`}><span>{status}</span>{note.status === 'error' && <button type="button" onClick={() => { void sessionNotes.retry(agent.id); }}>{text('다시 시도', 'Retry')}</button>}</div>
      <span ref={copyLabel} className="session-note-copy-status" role="status" />
      {note.backupFailed && <p role="alert">{text('이 기기에 임시 보관하지 못했습니다. 저장 상태를 확인해 주세요.', 'Could not back up this draft on this device. Check the save status.')}</p>}
      <p>{text('AI 대화에 자동으로 전달되지 않아요.', 'Not automatically shared with AI conversations.')}</p>
    </footer>
  </aside>;
}

export function SessionNoteOverlay(props: { agent: Pick<Agent, 'id' | 'name'>; onClose: () => void }) {
  useNativeViewOcclusion();
  return <div className="session-note-overlay" role="dialog" aria-modal="true" aria-label={props.agent.name}>
    <button className="session-note-backdrop" type="button" aria-label="Close note" onClick={props.onClose} /><SessionNotePanel {...props} />
  </div>;
}
