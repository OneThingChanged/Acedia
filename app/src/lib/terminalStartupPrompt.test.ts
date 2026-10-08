import { describe, expect, it } from "vitest";
import type { Terminal } from "@xterm/xterm";
import { promptSignature } from "./chatPrompt";
import { answerTerminalStartupPrompt, parseTerminalStartupPrompt, readTerminalScreen } from "./terminalStartupPrompt";

const trust = `Folder access
K:\\AI\\Nogari

Note: You're in a subdirectory of a Git project. Trusting will apply to the repository root:
k:\\ai\\nogari

Trust this folder? Codex can read, edit, and run files here, subject to your permission settings. Folder
settings can run code automatically, even without a model request. Continue only if you trust these files. Your
trust decision will be saved.

› 1. Trust and continue
  2. Quit

enter continue · esc quit`;
const hooks = `Hooks need review
6 hooks are new or changed.
Hooks can run outside the sandbox after you trust them.

  1. Review hooks
› 2. Trust all and continue
  3. Continue without trusting (hooks won't run)

enter confirm · esc skip`;
const parse = (screen: string) => parseTerminalStartupPrompt(screen, "codex");

describe("Codex terminal startup questions", () => {
  it("recognizes trust and hook dialogs before any session transcript or hook exists", () => {
    expect(parse(trust)).toMatchObject({ startupKind: "folder-trust", kind: "permission", answerStyle: "arrow", selectedIndex: 0, options: [{ send: "1" }, { send: "2" }] });
    expect(parse(hooks)).toMatchObject({ startupKind: "hook-review", selectedIndex: 1, options: [{ send: "1" }, { send: "2" }, { send: "3" }] });
    expect(parse(trust)?.text).toContain("K:\\AI\\Nogari");
    expect(parse(trust)?.text).toContain("Folder\nsettings can run code automatically");
  });

  it("ignores unsupported providers, conversation quotations, incomplete or departed screens", () => {
    expect(parseTerminalStartupPrompt(trust, "claude")).toBeNull();
    expect(parseTerminalStartupPrompt(trust)).toBeNull();
    expect(parse(`The terminal showed:\n${trust}`)).toBeNull();
    expect(parse(trust.replace("enter continue · esc quit", ""))).toBeNull();
    expect(parse(`${trust}\nCodex is ready`)).toBeNull();
    expect(parse(hooks.replace("3. Continue without trusting (hooks won't run)", "3. Launch something else"))).toBeNull();
  });

  it("requires one visible selection to provide clickable answers", () => {
    const noSelection = parse(hooks.replace("›", " "));
    expect(noSelection).toMatchObject({ answerStyle: "terminal", selectedIndex: undefined, options: [] });
    expect(parse(hooks.replace("  1.", "› 1."))?.options).toEqual([]);
    expect(promptSignature(parse(hooks))).toBe(promptSignature(parse(hooks.replace("  1.", "› 1.").replace("› 2.", "  2."))));
  });

  it("reads the live bottom screen and joins wrapped rows without reading scrollback", () => {
    const rows = [
      { value: "old trust dialog in scrollback", wrapped: false },
      { value: "Hooks need review", wrapped: false },
      { value: "Hooks can run outside ", wrapped: false },
      { value: "the sandbox after you trust them.", wrapped: true },
    ];
    const term = { rows: 3, buffer: { active: { baseY: 1, viewportY: 0, getLine: (i: number) => rows[i] && { isWrapped: rows[i].wrapped, translateToString: (trim: boolean) => trim ? rows[i].value.trimEnd() : rows[i].value } } } } as unknown as Pick<Terminal, "buffer" | "rows">;
    expect(readTerminalScreen(term)).toBe("Hooks need review\nHooks can run outside the sandbox after you trust them.");
  });

  function responder(screen: string) {
    let live = parse(screen)!;
    const writes: string[] = [];
    const write = async (key: string) => {
      writes.push(key);
      if (key === "\x1b[B") live = { ...live, selectedIndex: live.selectedIndex! + 1 };
      if (key === "\x1b[A") live = { ...live, selectedIndex: live.selectedIndex! - 1 };
    };
    return { initial: live, writes, read: () => live, write, pause: async () => {}, change: (next: typeof live) => { live = next; } };
  }

  it("moves from the current hook selection to the clicked choice before confirming", async () => {
    const decline = responder(hooks);
    await answerTerminalStartupPrompt(decline.initial, 2, decline.read, decline.write, decline.pause);
    expect(decline.writes).toEqual(["\x1b[B", "\r"]);
    const review = responder(hooks);
    await answerTerminalStartupPrompt(review.initial, 0, review.read, review.write, review.pause);
    expect(review.writes).toEqual(["\x1b[A", "\r"]);
    const quit = responder(trust);
    await answerTerminalStartupPrompt(quit.initial, 1, quit.read, quit.write, quit.pause);
    expect(quit.writes).toEqual(["\x1b[B", "\r"]);
  });

  it("uses a selection changed in the terminal and rejects stale questions or failed movement", async () => {
    const selected = responder(hooks);
    selected.change({ ...selected.initial, selectedIndex: 2 });
    await answerTerminalStartupPrompt(selected.initial, 2, selected.read, selected.write, selected.pause);
    expect(selected.writes).toEqual(["\r"]);
    const stale = responder(trust);
    const writeThenChange = async (key: string) => { await stale.write(key); stale.change(parse(hooks)!); };
    await expect(answerTerminalStartupPrompt(stale.initial, 1, stale.read, writeThenChange, stale.pause)).rejects.toThrow("changed");
    expect(stale.writes).toEqual(["\x1b[B"]);
    const stuck = responder(hooks);
    const stuckWrites: string[] = [];
    await expect(answerTerminalStartupPrompt(stuck.initial, 2, stuck.read, async key => { stuckWrites.push(key); }, stuck.pause)).rejects.toThrow("did not update");
    expect(stuckWrites).toEqual(["\x1b[B"]);
  });

  it("never sends Enter after a PTY failure or process exit", async () => {
    const failed = responder(hooks);
    const writes: string[] = [];
    await expect(answerTerminalStartupPrompt(failed.initial, 2, failed.read, async key => { writes.push(key); throw Error("write failed"); }, failed.pause)).rejects.toThrow("write failed");
    expect(writes).toEqual(["\x1b[B"]);
    await expect(answerTerminalStartupPrompt(failed.initial, 1, () => null, failed.write, failed.pause)).rejects.toThrow("changed");
    expect(failed.writes).toEqual([]);
  });
});
