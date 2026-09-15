import { useCallback, useEffect, useRef, useState } from 'react';

export type RendererConfirmation = { title: string; message: string; confirmLabel?: string; hideCancel?: boolean };

/** Promise-based confirmation without Electron's blocking native dialog. */
export function useRendererConfirmation() {
  const [pending, setPending] = useState<RendererConfirmation | null>(null);
  const resolver = useRef<((accepted: boolean) => void) | null>(null);
  const confirm = useCallback((request: RendererConfirmation) => {
    if (resolver.current) return Promise.resolve(false);
    return new Promise<boolean>(resolve => { resolver.current = resolve; setPending(request); });
  }, []);
  const settle = useCallback((accepted: boolean) => {
    const resolve = resolver.current; resolver.current = null;
    setPending(null); resolve?.(accepted);
  }, []);
  useEffect(() => () => { resolver.current?.(false); resolver.current = null; }, []);
  return { pending, confirm, settle };
}
