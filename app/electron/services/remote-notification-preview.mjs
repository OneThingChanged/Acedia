export const MAX_NOTIFICATION_PREVIEW_LENGTH = 2_000;

export function notificationPreview(value) {
  if (typeof value !== "string") return "";
  const text = value
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/```[^\n`]*\n?([\s\S]*?)```/g, "$1")
    .replace(/!?\[([^\]]*)\]\([^\n)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, (_, bold, underline) => bold ?? underline)
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[\t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const characters = Array.from(text);
  return characters.length > MAX_NOTIFICATION_PREVIEW_LENGTH
    ? `${characters.slice(0, MAX_NOTIFICATION_PREVIEW_LENGTH - 1).join("").trimEnd()}…`
    : text;
}

function lastAssistantReply(blocks) {
  if (!Array.isArray(blocks)) return "";
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index];
    // A new unanswered user turn must not reuse an older reply.
    if (block?.role === "user") return "";
    if (block?.role !== "assistant" || block.kind !== "text" || !block.text?.trim()) continue;
    const parts = [block.text];
    while (index > 0) {
      const previous = blocks[index - 1];
      if (previous?.role !== "assistant" || previous.kind !== "text") break;
      parts.unshift(previous.text || "");
      index -= 1;
    }
    return parts.join("\n\n");
  }
  return "";
}

export async function completionNotificationPreview(payload, readChat, { timeoutMs = 1_500 } = {}) {
  const direct = notificationPreview(payload?.assistant_message);
  if (direct) return direct;
  if (!payload?.id || !payload?.session_id || typeof readChat !== "function") return "";
  let timer;
  try {
    const chat = await Promise.race([
      Promise.resolve().then(() => readChat(payload.id, { limit: 24 })),
      new Promise((resolve) => { timer = setTimeout(() => resolve(null), timeoutMs); }),
    ]);
    if (chat?.sessionId !== payload.session_id) return "";
    return notificationPreview(lastAssistantReply(chat.blocks));
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}
