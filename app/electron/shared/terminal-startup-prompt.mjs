// Join wrapped native rows so a long folder path cannot become a different
// approval scope in a narrow background terminal.
export function readTerminalStartupScreen(term) {
  const buffer = term.buffer.active, lines = [], rows = [];
  for (let i = buffer.baseY; i < buffer.baseY + term.rows; i++) {
    const line = buffer.getLine(i); if (!line) break;
    const nextWrapped = i + 1 < buffer.baseY + term.rows && buffer.getLine(i + 1)?.isWrapped;
    const value = line.translateToString(!nextWrapped);
    rows.push(line.translateToString(true));
    if (line.isWrapped && lines.length) lines[lines.length - 1] += value;
    else lines.push(value);
  }
  const joined = lines.join('\n').trim().slice(0, 12000), raw = rows.join('\n').trim().slice(0, 12000);
  // Full-width TUI painting can leave wrapped flags on separately drawn rows.
  // Preserve a complete native dialog instead of joining its header/menu away.
  return !parseTerminalStartupPrompt(joined, 'codex') && parseTerminalStartupPrompt(raw, 'codex') ? raw : joined;
}

// Only complete native Codex startup dialogs, never transcript/tool prose.
export function parseTerminalStartupPrompt(screen, provider) {
  if (provider !== 'codex') return null;
  const lines = screen.trim().split(/\r?\n/), header = lines[0]?.trim();
  const startupKind = header === 'Folder access' ? 'folder-trust' : header === 'Hooks need review' ? 'hook-review' : null;
  if (!startupKind || !/^enter\s+(?:continue|confirm)\s*[·•]\s*esc\s+(?:quit|skip)$/i.test(lines.at(-1)?.trim() || '')) return null;
  if (startupKind === 'folder-trust' && !screen.includes('Trust this folder?')) return null;
  if (startupKind === 'hook-review' && !screen.includes('Hooks can run outside the sandbox after you trust them.')) return null;
  const choices = lines.flatMap((line, index) => {
    const m = /^\s*([›❯>])?\s*(\d+)\.\s+(.+?)\s*$/.exec(line);
    return m ? [{ line: index, selected: Boolean(m[1]), number: Number(m[2]), label: m[3] }] : [];
  });
  const expected = startupKind === 'folder-trust' ? ['Trust and continue', 'Quit']
    : ['Review hooks', 'Trust all and continue', "Continue without trusting (hooks won't run)"];
  if (choices.length !== expected.length || choices.some((c, i) => c.number !== i + 1 || c.label.replace(/’/g, "'") !== expected[i])) return null;
  const selected = choices.flatMap((c, i) => c.selected ? [i] : []), selectedIndex = selected.length === 1 ? selected[0] : undefined;
  const text = lines.slice(0, choices[0].line).join('\n').trim();
  const repository = /Trusting\s+will\s+apply\s+to\s+the\s+repository\s+root:\s*\n\s*([^\n]+)/.exec(text)?.[1]?.trim();
  return { startupKind, kind: 'permission', answerStyle: selectedIndex === undefined ? 'terminal' : 'arrow', text,
    options: selectedIndex === undefined ? [] : choices.map(c => ({ label: c.label, send: String(c.number) })), selectedIndex,
    ...(startupKind === 'folder-trust' ? { folder: lines[1]?.trim(), trustRoot: repository || (/repository root/i.test(text) ? null : lines[1]?.trim()) } : {}) };
}
