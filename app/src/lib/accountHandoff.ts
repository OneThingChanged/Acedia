import type { AccountHandoff, AgentActivity } from "../types";
import type { ChatBlock } from "../platform/ipcContract";

const MAX_EXCERPT_CHARS = 2_800;
const MAX_ITEM_CHARS = 900;
const MAX_ITEMS = 6;

function cleanText(value: unknown, limit = MAX_ITEM_CHARS): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function isEarlierHandoff(text: string): boolean {
  return /^\[(?:계정 전환 작업 인계|Account switch handoff)\]/i.test(text);
}

function recentConversation(
  blocks: ChatBlock[],
  activity?: AgentActivity,
): Array<{ role: "user" | "assistant"; text: string }> {
  const items = blocks.flatMap((block) => {
    if (block.kind !== "text" || (block.role !== "user" && block.role !== "assistant")) return [];
    const value = cleanText(block.text);
    return value && !isEarlierHandoff(value) ? [{ role: block.role, text: value }] : [];
  });

  if (!items.some((item) => item.role === "user")) {
    const prompt = cleanText(activity?.lastPrompt);
    if (prompt) items.push({ role: "user", text: prompt });
  }
  if (!items.some((item) => item.role === "assistant")) {
    const response = cleanText(activity?.lastAssistantMessage);
    if (response) items.push({ role: "assistant", text: response });
  }
  return items.slice(-MAX_ITEMS);
}

export function buildAccountHandoffPrompt({
  blocks,
  activity,
  folder,
  language,
}: {
  blocks: ChatBlock[];
  activity?: AgentActivity;
  folder?: string;
  language?: string;
}): string {
  const korean = String(language || "").toLowerCase().startsWith("ko");
  const conversation = recentConversation(blocks, activity);
  const lines = korean
    ? [
        "[계정 전환 작업 인계]",
        "다른 로그인 계정에서 새 대화를 시작했습니다. 같은 작업 폴더의 현재 파일과 Git 상태를 먼저 확인하고, 이미 완료된 작업을 반복하지 말고 이어서 진행하세요.",
      ]
    : [
        "[Account switch handoff]",
        "This is a fresh conversation under another login account. Inspect the current files and Git state in the same working folder first, then continue without repeating completed work.",
      ];
  const path = cleanText(folder, 500);
  if (path) lines.push(korean ? `작업 폴더: ${path}` : `Working folder: ${path}`);
  if (conversation.length) {
    lines.push(korean ? "최근 대화 핵심:" : "Recent conversation context:");
    for (const item of conversation) {
      const label = korean
        ? item.role === "user" ? "사용자" : "이전 응답"
        : item.role === "user" ? "User" : "Previous response";
      lines.push(`${label}: ${item.text}`);
    }
  } else {
    lines.push(korean
      ? "이전 대화 본문을 읽지 못했습니다. 작업 폴더의 변경 상태를 확인해 현재 작업을 복원하세요."
      : "The earlier conversation text was unavailable. Recover the current task from the working tree state.");
  }
  return lines.join("\n").slice(0, MAX_EXCERPT_CHARS);
}

export function makeAccountHandoff({
  id,
  fromAccountId,
  toAccountId,
  createdAt = Date.now(),
  ...promptInput
}: {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  createdAt?: number;
  blocks: ChatBlock[];
  activity?: AgentActivity;
  folder?: string;
  language?: string;
}): AccountHandoff {
  return {
    id,
    fromAccountId,
    toAccountId,
    createdAt,
    prompt: buildAccountHandoffPrompt(promptInput),
  };
}

export function handoffPromptForAccount(
  handoff: AccountHandoff | undefined,
  accountId: string,
): string | undefined {
  if (!handoff || handoff.toAccountId !== accountId) return undefined;
  const prompt = cleanText(handoff.prompt, MAX_EXCERPT_CHARS);
  return prompt || undefined;
}
