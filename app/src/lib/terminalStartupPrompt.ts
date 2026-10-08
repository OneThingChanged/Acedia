import type { Terminal } from "@xterm/xterm";
import { promptSignature, type ChatPrompt } from "./chatPrompt";

export type TerminalStartupPrompt = ChatPrompt & {
  startupKind: "folder-trust" | "hook-review";
  selectedIndex?: number;
};

// Read the current TUI screen, never the user's scrolled-back viewport or the
// raw PTY history. Xterm has already applied ANSI erases and cursor movement.
export function readTerminalScreen(term: Pick<Terminal, "buffer" | "rows">): string {
  const buffer = term.buffer.active;
  const lines: string[] = [];
  for (let i = buffer.baseY; i < buffer.baseY + term.rows; i++) {
    const line = buffer.getLine(i);
    if (!line) break;
    const nextWrapped = i + 1 < buffer.baseY + term.rows && buffer.getLine(i + 1)?.isWrapped;
    const value = line.translateToString(!nextWrapped);
    if (line.isWrapped && lines.length) lines[lines.length - 1] += value;
    else lines.push(value);
  }
  return lines.join("\n").trim().slice(0, 12000);
}

// Startup questions precede SessionStart and the transcript. Recognize only
// these complete Codex dialogs; ordinary conversation text is not an approval.
export function parseTerminalStartupPrompt(screen: string, provider?: string): TerminalStartupPrompt | null {
  if (provider !== "codex") return null;
  const lines = screen.trim().split(/\r?\n/);
  const header = lines[0]?.trim();
  const startupKind = header === "Folder access" ? "folder-trust"
    : header === "Hooks need review" ? "hook-review" : null;
  if (!startupKind) return null;
  const footer = lines[lines.length - 1]?.trim();
  if (!/^enter\s+(?:continue|confirm)\s*[·•]\s*esc\s+(?:quit|skip)$/i.test(footer || "")) return null;
  if (startupKind === "folder-trust" && !screen.includes("Trust this folder?")) return null;
  if (startupKind === "hook-review" && !screen.includes("Hooks can run outside the sandbox after you trust them.")) return null;

  const choices = lines.flatMap((line, index) => {
    const match = /^\s*([›❯>])?\s*(\d+)\.\s+(.+?)\s*$/.exec(line);
    return match ? [{ line: index, selected: Boolean(match[1]), number: Number(match[2]), label: match[3] }] : [];
  });
  const expected = startupKind === "folder-trust"
    ? ["Trust and continue", "Quit"]
    : ["Review hooks", "Trust all and continue", "Continue without trusting (hooks won't run)"];
  if (choices.length !== expected.length || choices.some((choice, i) => choice.number !== i + 1 || choice.label.replace(/’/g, "'") !== expected[i])) return null;
  const selected = choices.flatMap((choice, i) => choice.selected ? [i] : []);
  const selectedIndex = selected.length === 1 ? selected[0] : undefined;
  return {
    startupKind,
    kind: "permission",
    answerStyle: selectedIndex === undefined ? "terminal" : "arrow",
    text: lines.slice(0, choices[0].line).join("\n").trim(),
    options: selectedIndex === undefined ? [] : choices.map(choice => ({ label: choice.label, send: String(choice.number) })),
    selectedIndex,
  };
}

// Selection may already be on option 2 (hook trust), or be changed directly in
// another terminal. Confirm each live selection before sending Enter.
export async function answerTerminalStartupPrompt(
  prompt: TerminalStartupPrompt,
  targetIndex: number,
  readCurrent: () => TerminalStartupPrompt | null,
  writeKey: (key: string) => Promise<unknown>,
  pause: () => Promise<void>,
): Promise<void> {
  if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= prompt.options.length) throw Error("Unknown startup choice");
  const signature = promptSignature(prompt);
  const current = () => {
    const live = readCurrent();
    if (!live || live.startupKind !== prompt.startupKind || promptSignature(live) !== signature || live.selectedIndex === undefined) {
      throw Error("Startup question changed; review it in the terminal");
    }
    return live;
  };
  for (let step = 0; step < prompt.options.length; step++) {
    const selectedIndex = current().selectedIndex!;
    if (selectedIndex === targetIndex) {
      await writeKey("\r");
      return;
    }
    await writeKey(selectedIndex < targetIndex ? "\x1b[B" : "\x1b[A");
    let moved = false;
    for (let attempt = 0; attempt < 10; attempt++) {
      await pause();
      if (current().selectedIndex !== selectedIndex) { moved = true; break; }
    }
    if (!moved) throw Error("Startup selection did not update; review it in the terminal");
  }
  throw Error("Could not select the requested startup choice");
}
