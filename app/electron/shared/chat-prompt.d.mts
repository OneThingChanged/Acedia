export type ChatPromptOption = { label: string; send: string };
export type ChatPrompt = {
  kind: "question" | "permission";
  answerStyle: "arrow" | "digit" | "terminal";
  text: string;
  options: ChatPromptOption[];
};
export function isQuestionTool(name?: string | null, options?: { includeAsync?: boolean }): boolean;
export function questionDetails(raw: unknown): { text: string; questions: Array<{ text: string; multiSelect: boolean; options: Array<{ label: string; description: string }> }> };
export function parseChatPrompt(status: string, question?: string | null, assistantMessage?: string | null, provider?: string): ChatPrompt | null;
export function promptSignature(prompt?: ChatPrompt | null): string;
