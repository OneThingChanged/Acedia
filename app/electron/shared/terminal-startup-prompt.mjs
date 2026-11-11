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
  return !['codex', 'claude'].some(p => parseTerminalStartupPrompt(joined, p))
    && ['codex', 'claude'].some(p => parseTerminalStartupPrompt(raw, p)) ? raw : joined;
}

// Only complete native Codex startup dialogs, never transcript/tool prose.
export function parseTerminalStartupPrompt(screen, provider) {
  if (provider === 'claude') {
    const lines = screen.trim().split(/\r?\n/).map(line => line.trim());
    const start = lines.findIndex(line => line === 'Accessing workspace:');
    if (start < 0 || lines.slice(0, start).some(line => line && !/^─+$/.test(line))
      || lines.at(-1) !== 'Enter to confirm · Esc to cancel'
      || !lines.some(line => line.startsWith('Quick safety check: Is this a project you created or one you trust?'))
      || !lines.includes("Claude Code'll be able to read, edit, and execute files here.")) return null;
    const choices = lines.filter(line => /^(?:❯\s*)?(?:No, exit|Yes, I trust this folder)$/.test(line));
    if (choices.length !== 2 || choices[0].replace(/^❯\s*/, '') !== 'No, exit'
      || choices[1].replace(/^❯\s*/, '') !== 'Yes, I trust this folder'
      || choices.filter(line => line.startsWith('❯')).length !== 1) return null;
    const folder = lines.slice(start + 1).find(Boolean);
    return { startupKind: 'folder-trust', kind: 'permission', answerStyle: 'arrow', text: lines.slice(start, lines.indexOf(choices[0])).join('\n'),
      options: choices.map((line, i) => ({ label: line.replace(/^❯\s*/, ''), send: String(i + 1) })),
      selectedIndex: choices.findIndex(line => line.startsWith('❯')), confirmIndex: 1, folder, trustRoot: folder };
  }
  if (provider !== 'codex') return null;
  const lines = screen.trim().split(/\r?\n/), header = lines[0]?.trim();
  const startupKind = header === 'Folder access' ? 'folder-trust' : header === 'Hooks need review' ? 'hook-review' : null;
  const footer = lines.at(-1)?.trim() || '';
  if (!startupKind || !/^enter\s+(?:continue|confirm)\s*[·•]\s*esc\s+(?:quit|back|skip)$/i.test(footer)) return null;
  if (startupKind === 'folder-trust' && !screen.includes('Trust this folder?')) return null;
  if (startupKind === 'hook-review' && !screen.includes('Hooks can run outside the sandbox after you trust them.')) return null;
  const choices = lines.flatMap((line, index) => {
    const m = /^\s*([›❯>])?\s*(\d+)\.\s+(.+?)\s*$/.exec(line);
    return m ? [{ line: index, selected: Boolean(m[1]), number: Number(m[2]), label: m[3] }] : [];
  });
  const expected = startupKind === 'folder-trust' ? ['Trust and continue', /esc\s+back$/i.test(footer) ? 'Back to Agent Command Center' : 'Quit']
    : ['Review hooks', 'Trust all and continue', "Continue without trusting (hooks won't run)"];
  if (choices.length !== expected.length || choices.some((c, i) => c.number !== i + 1 || c.label.replace(/’/g, "'") !== expected[i])) return null;
  const selected = choices.flatMap((c, i) => c.selected ? [i] : []), selectedIndex = selected.length === 1 ? selected[0] : undefined;
  const text = lines.slice(0, choices[0].line).join('\n').trim();
  const repository = /Trusting\s+will\s+apply\s+to\s+the\s+repository\s+root:\s*\n\s*([^\n]+)/.exec(text)?.[1]?.trim();
  return { startupKind, kind: 'permission', answerStyle: selectedIndex === undefined ? 'terminal' : 'arrow', text,
    options: selectedIndex === undefined ? [] : choices.map(c => ({ label: c.label, send: String(c.number) })), selectedIndex,
    ...(startupKind === 'folder-trust' ? { folder: lines[1]?.trim(), trustRoot: repository || (/repository root/i.test(text) ? null : lines[1]?.trim()) } : {}) };
}
