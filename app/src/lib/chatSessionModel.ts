import { useSyncExternalStore } from "react";
import type { SessionModel, SessionModelOption } from "../../electron/shared/session-model.mjs";
import { invoke } from "../platform/runtime";

// A terminal/chat toggle must not release the send lock while a replacement
// CLI is still starting. Keep it by agent rather than by mounted composer.
const changing = new Set<string>();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const publish = () => { for (const listener of listeners) listener(); };

export const isChatSessionModelChanging = (id: string) => changing.has(id);
export function useChatSessionModelChanging(id: string) {
  return useSyncExternalStore(subscribe, () => changing.has(id), () => false);
}

export async function applyChatSessionModel(id: string, settings: SessionModel) {
  if (changing.has(id)) throw new Error("세션 모델 설정을 변경 중입니다.");
  changing.add(id); publish();
  try {
    const result = await invoke("set_session_model", { id, settings, restart: true });
    if (!result.restarted) throw new Error("새 모델의 시작을 확인하지 못했습니다. 세션 상태를 확인하세요.");
    return result;
  } finally { changing.delete(id); publish(); }
}

export function settingsForChatModel(model: SessionModelOption, previous?: SessionModel | null): SessionModel {
  const effort = model.efforts.some(item => item.effort === previous?.effort) ? previous!.effort : model.defaultEffort;
  return { model: model.model, ...(effort ? { effort } : {}) };
}
