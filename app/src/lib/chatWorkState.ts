import type { AgentStatus } from "../types";

export function isChatWorking({ status, lifecycle, lifecycleAt, workStartedAt, dispatchAt, now, stopped, waiting }: {
  status: AgentStatus; lifecycle?: "working" | "idle"; lifecycleAt?: number; workStartedAt?: number;
  dispatchAt?: number; now: number; stopped?: boolean; waiting?: boolean;
}): boolean {
  if (["idle", "exited", "unreachable"].includes(status) || stopped || waiting) return false;
  if (status === "starting" || status === "recovering" || lifecycle === "working") return true;
  if (status === "working" && (lifecycle !== "idle" || (lifecycleAt !== undefined && (workStartedAt || 0) > lifecycleAt))) return true;
  // Show submission immediately while the PTY and transcript catch up. A new
  // completion ends it; a failed/missing update cannot keep it busy forever.
  return !!dispatchAt && now - dispatchAt < 10000 && (lifecycleAt === undefined || dispatchAt > lifecycleAt);
}
