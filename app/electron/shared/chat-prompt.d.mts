export type ChatPromptOption = { label: string; send: string };
export type ChatQuestion = { id: string; text: string; multiSelect: boolean; options: Array<{ label: string; description: string }> };
export type ChatAnswer = { id: string; optionIndex: number | null; text?: string };
export type ChatPrompt = {
  kind: "question" | "permission";
  answerStyle: "arrow" | "digit" | "terminal" | "codex-form";
  text: string;
  options: ChatPromptOption[];
  questions?: ChatQuestion[];
};
export function isQuestionTool(name?: string | null, options?: { includeAsync?: boolean }): boolean;
export function questionDetails(raw: unknown): { text: string; questions: ChatQuestion[] };
export function parseChatPrompt(status: string, question?: string | null, assistantMessage?: string | null, provider?: string): ChatPrompt | null;
export function promptSignature(prompt?: ChatPrompt | null): string;
