// Reuse the isolated full-workspace fixture, wrapping only the note commands.
// Its terminal is fake; note persistence uses the real host service over IPC.
void import('./sidebar-workspace-renderer').then(() => {
  const bridge = window.multiAgentElectron!;
  const original = bridge.invoke.bind(bridge);
  const host = (window as unknown as { noteFixtureHost: { invoke: (command: string, args: unknown) => Promise<unknown> } }).noteFixtureHost;
  bridge.invoke = (async (command: string, args: Record<string, unknown>) => {
    if (command === 'session_notes_get' || command === 'session_notes_save') return host.invoke(command, args);
    return original(command as Parameters<typeof original>[0], args);
  }) as typeof bridge.invoke;
});
