import type { ChatBlock, ConversationArtifact } from "../platform/ipcContract";

const fileKey = (file: ConversationArtifact) => /^[a-z]:[\\/]/i.test(file.path) ? file.path.replace(/\\/g, "/").toLowerCase() : file.path;
export function sameChatFiles(previous: ConversationArtifact[], next: ConversationArtifact[]) {
  return previous.length === next.length && previous.every((file, index) => {
    const other = next[index];
    return file.path === other.path && file.kind === other.kind && file.size === other.size && file.modifiedAt === other.modifiedAt
      && file.sourceSequence === other.sourceSequence && file.usage === other.usage
      && (file.change === other.change || JSON.stringify(file.change) === JSON.stringify(other.change));
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
    const previous = unique.get(key);
    if (previous?.usage === "output" && file.usage !== "output") continue;
    if (previous?.change && file.change) {
      const counted = previous.change.additions != null && file.change.additions != null;
      unique.set(key, { ...file, change: { ...file.change,
        additions: counted ? previous.change.additions! + file.change.additions! : undefined,
        deletions: counted ? previous.change.deletions! + file.change.deletions! : undefined,
        diff: [...previous.change.diff, { type: "meta" as const, text: "@@" }, ...file.change.diff].slice(0, 240),
        truncated: previous.change.truncated || file.change.truncated || previous.change.diff.length + file.change.diff.length >= 240 } });
    } else unique.set(key, previous?.change ? { ...file, change: { ...previous.change, additions: undefined, deletions: undefined } } : file);
  }
  return [...unique.values()].sort((a, b) => Number(b.usage === "output") - Number(a.usage === "output"));
}

const TEXT_FILE = /^(?:md|mdx|markdown|txt|rst|adoc|ts|tsx|js|jsx|mjs|cjs|py|pyi|rs|go|c|h|cpp|hpp|cc|cs|java|kt|swift|rb|php|lua|css|scss|sass|less|vue|svelte|json|jsonc|yaml|yml|toml|xml|ini|conf|cfg|sql|sh|bash|ps1|bat|cmd|cmake|gradle|gitignore|gitattributes)$/i;
export const isChangedDocument = (file: ConversationArtifact) => file.usage === "output" && (TEXT_FILE.test(file.kind) || /(?:^|[\\/])(?:Dockerfile|Makefile|\.gitignore|\.gitattributes|\.env(?:\.example)?)$/i.test(file.path));
