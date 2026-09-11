// Synchronous with respect to the main-process event loop: no new launch can
// interleave registry removal, generation invalidation and account binding reset.
export function removeProviderAccount({ provider, accountId, accounts, sessions, bindings, catalog = [], clearSession }) {
  const field = `${provider}AccountId`;
  const ids = new Set(catalog.filter(agent => !agent.sshHostId && agent.aiToolId === provider && agent[field] === accountId).map(agent => agent.id));
  for (const entry of sessions.values()) if (entry.aiToolId === provider && entry[field] === accountId) ids.add(entry.id);
  for (const [id, binding] of bindings) if (binding.toolId === provider && binding.accountId === accountId) ids.add(id);
  accounts.remove(accountId); // Failure leaves the registry, bindings and PTYs unchanged.
  for (const id of ids) {
    sessions.close(id, 'account-removed');
    bindings.set(id, { toolId: provider, accountId: 'default', sessionId: null });
    clearSession(id);
  }
  return [...ids];
}
