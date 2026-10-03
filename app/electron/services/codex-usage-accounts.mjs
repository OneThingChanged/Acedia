import { storedCodexAccountKey } from './account-identity.mjs';
import { codexUsageSnapshot } from './codex-usage.mjs';

// One display inventory for the desktop, Dashboard and Remote. The pool owns
// credentials and refresh locks; this adapter never decrypts or moves them.
export class CodexUsageAccounts {
  constructor(accounts, pool) {
    this.accounts = accounts;
    this.pool = pool;
    this.refreshFailedAt = 0;
  }

  snapshot(agents = []) {
    const pool = this.pool;
    const job = pool.quotaRefresh;
    const results = new Map(job?.results.map(item => [item.id, item]) ?? []);
    const accounts = pool.state.accounts.map(account => {
      const result = job?.running || (job?.finishedAt || 0) >= (account.limitsAt || 0) ? results.get(account.id) : null;
      const checking = job?.running && ['pending', 'running'].includes(result?.status);
      const loginRequired = !account.auth || account.status !== 'ready' || pool.jobs.has(account.id);
      const status = checking ? 'refreshing' : loginRequired ? 'login_required'
        : result?.status === 'failed' || this.refreshFailedAt > (account.limitsAt || 0) ? 'failed'
        : account.limits ? 'success' : 'unavailable';
      return {
        id: account.id, label: account.label, source: 'pool', aliases: [],
        routing: { enabled: account.enabled, available: pool.eligible(account) },
        current: agents.some(agent => !agent.sshHostId && agent.aiToolId === 'codex'
          && pool.state.sessions[agent.id]?.accountId === account.id),
        refresh: { status, checkedAt: Math.max(account.limitsAt || 0, job?.finishedAt || job?.startedAt || 0, this.refreshFailedAt) },
      };
    });
    const byId = new Map(accounts.map(account => [account.id, account]));
    for (const local of [{ id: 'default', label: 'Codex' }, ...this.accounts.accounts]) {
      let identity = null;
      if (this.accounts.login?.id !== local.id) {
        try { identity = storedCodexAccountKey(this.accounts.home(local.id)); } catch { /* unavailable home */ }
      }
      const matches = identity ? pool.state.accounts.filter(account => account.identity === identity) : [];
      // Ambiguous or incomplete identities remain separate, even for equal names.
      const canonical = matches.length === 1 ? byId.get(matches[0].id) : null;
      const current = local.id === 'default' || agents.some(agent => !agent.sshHostId && agent.aiToolId === 'codex'
        && (agent.codexAccountId || 'default') === local.id);
      if (canonical) {
        canonical.aliases.push(`codex:${local.id}`);
        canonical.current ||= current;
      } else accounts.push({ ...local, source: 'local', current });
    }
    const snapshots = pool.state.accounts.flatMap(account => {
      if (!account.limitsAt) return [];
      const snapshot = codexUsageSnapshot(account.limits, account, Math.floor(account.limitsAt / 1000));
      return snapshot ? [{ ...snapshot, planType: snapshot.planType || account.plan || null, sourcePath: 'codex:account-pool' }] : [];
    });
    return { accounts, snapshots, refreshing: this.refreshing };
  }

  get refreshing() { return Boolean(this.pool.quotaRefresh?.running); }

  localAccounts() { return this.snapshot().accounts.filter(account => account.source === 'local'); }

  refresh() {
    if (!this.pool.state.accounts.length) return;
    try { this.pool.refreshAll(); this.refreshFailedAt = 0; }
    catch { this.refreshFailedAt = Date.now(); }
  }
}
