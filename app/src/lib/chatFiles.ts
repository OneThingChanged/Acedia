import type { ChatBlock, ConversationArtifact } from "../platform/ipcContract";

const fileKey = (file: ConversationArtifact) => /^[a-z]:[\\/]/i.test(file.path) ? file.path.replace(/\\/g, "/").toLowerCase() : file.path;
export function sameChatFiles(previous: ConversationArtifact[], next: ConversationArtifact[]) {
  return previous.length === next.length && previous.every((file, index) => {
    const other = next[index];
    return file.path === other.path && file.kind === other.kind && file.size === other.size && file.modifiedAt === other.modifiedAt
      && file.sourceSequence === other.sourceSequence && file.usage === other.usage;
  });
}

export function mergeChatFiles(previous: ConversationArtifact[], incoming: ConversationArtifact[], blocks: ChatBlock[]) {
  const sequences = new Set(blocks.map(block => block.sequence));
  const next = previous.filter(file => !sequences.has(file.sourceSequence)).concat(incoming)
    .filter(file => file.sourceSequence != null)
    .sort((a, b) => a.sourceSequence! - b.sourceSequence! || a.path.localeCompare(b.path));
  return sameChatFiles(previous, next) ? previous : next;
}

export function chatFilesForTurn(files: ConversationArtifact[], blocks: ChatBlock[]) {
  const sequences = new Set(blocks.map(block => block.sequence));
  const unique = new Map<string, ConversationArtifact>();
  for (const file of files) {
    if (file.sourceSequence == null || !sequences.has(file.sourceSequence)) continue;
    const key = fileKey(file);
    if (unique.get(key)?.usage === "output" && file.usage !== "output") continue;
    unique.set(key, file);
  }
  return [...unique.values()].sort((a, b) => Number(b.usage === "output") - Number(a.usage === "output"));
}
