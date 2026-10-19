import { useEffect, useRef, useState } from 'react';
import { createTaskFlowView } from '../../electron/remote-pwa/task-flow.js';
import '../../electron/remote-pwa/task-flow.css';
import { invoke } from '../platform/runtime';
import { useNativeViewOcclusion } from '../hooks/useNativeViewOcclusion';

export function TaskFlow({ ownerId, onOpenSession }: { ownerId?: string; onOpenSession?: (id: string) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const openRef = useRef(onOpenSession); openRef.current = onOpenSession;
  useEffect(() => {
    if (!root.current) return;
    const view = createTaskFlowView(root.current, { ownerId,
      api: (action, body) => invoke('task_orchestration', { action, body }),
      openSession: id => openRef.current ? openRef.current(id) : window.dispatchEvent(new CustomEvent('acedia:open-task-session', { detail: id })),
    });
    view.enter(); return () => view.destroy();
  }, [ownerId]);
  return <div ref={root} style={{ height: '100%', minHeight: 0 }} />;
}

function TaskFlowDialog({ ownerId, onClose }: { ownerId: string; onClose: () => void }) {
  useNativeViewOcclusion();
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', key, true); return () => window.removeEventListener('keydown', key, true);
  }, [onClose]);
  return <section className="task-dialog" role="dialog" aria-label="작업 분담"><button className="task-dialog-close" onClick={onClose}>닫기</button><TaskFlow ownerId={ownerId}/></section>;
}

export function TaskFlowButton({ ownerId }: { ownerId: string }) {
  const [open, setOpen] = useState(false);
  return <><button type="button" className="chat-task-control" onClick={() => setOpen(true)}>작업 흐름</button>{open && <TaskFlowDialog ownerId={ownerId} onClose={() => setOpen(false)}/>}</>;
}
