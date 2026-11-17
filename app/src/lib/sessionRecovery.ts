export type RecoveryRow = { id: string; name: string; mode: 'working' | 'waiting' | 'idle'; state: string; reason: string | null };
export type RecoveryStatus = { checkpointId: string | null; decision: string | null; error: string | null; sessions: RecoveryRow[]; activeCount?: number; workingCount?: number };
type Request = (args: Record<string, unknown>) => Promise<any>;

/** Bounded restoration, exact resume identities, no replay after an uncertain claim. */
export async function restorePreviousSessions(checkpointId: string, ids: string[], request: Request,
  spawn: (id: string, options: { recovering: boolean; verifyActive: boolean; resumeSessionId?: string; freshSession?: boolean; poolResumeOwnerId?: string }) => Promise<{ ok: boolean }>) {
  let index = 0, requested = 0, attention = 0;
  const worker = async () => {
    for (;;) {
      const id = ids[index++]; if (!id) return;
      let claimed = false;
      try {
        const plan = await request({ action: 'claim', checkpointId, id });
        if (plan.state !== 'launching' || !plan.resumeSessionId && !plan.fresh) { if (plan.state === 'needs-attention') attention++; continue; }
        claimed = true;
        const result = await spawn(id, { recovering: true, verifyActive: true, ...(plan.fresh ? { freshSession: true } : { resumeSessionId: plan.resumeSessionId }),
          ...(plan.poolResumeOwnerId ? { poolResumeOwnerId: plan.poolResumeOwnerId } : {}) });
        const acknowledged = await request({ action: 'launched', checkpointId, id, failed: !result.ok });
        if (acknowledged.state === 'waiting-ready') requested++; else attention++;
      } catch {
        attention++;
        if (claimed) await request({ action: 'launched', checkpointId, id, failed: true }).catch(() => {});
      }
    }
  };
  await Promise.all([worker(), worker()]);
  return { requested, attention };
}
