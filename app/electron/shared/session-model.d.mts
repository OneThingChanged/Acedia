export type SessionModel = { model: string; effort?: string };
export type SessionModelOption = ReturnType<typeof normalizeModelCatalog>[number];
export type SessionModelCatalog = {
  models: SessionModelOption[];
  accountLabel: string;
  capabilitiesSource: "account" | "cli-help";
  current: SessionModel | null;
  currentSource: "last-turn" | "launch" | "unknown";
  saved: SessionModel | null;
  canRestart: boolean;
  canEdit: boolean;
};
export function normalizeSessionModel(value: unknown): SessionModel | undefined;
export function sessionModelArgs(value: unknown, launchOptions?: { args?: string[] }, provider?: string): string[];
export function claudeModelCatalog(help: string, known?: unknown[]): ReturnType<typeof normalizeModelCatalog>;
export function normalizeModelCatalog(data: unknown): Array<{ model: string; label: string; efforts: Array<{ effort: string; description: string }>; defaultEffort: string | null; isDefault: boolean }>;
export function readCodexModels(rpc: { call(method: string, params: unknown, timeout: number): Promise<unknown> }): Promise<ReturnType<typeof normalizeModelCatalog>>;
