import { promptSignature } from "./chatPrompt";
import { parseTerminalStartupPrompt, type TerminalStartupPrompt } from '../../electron/shared/terminal-startup-prompt.mjs';
export { parseTerminalStartupPrompt, type TerminalStartupPrompt };
export { readTerminalStartupScreen as readTerminalScreen } from '../../electron/shared/terminal-startup-prompt.mjs';

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
