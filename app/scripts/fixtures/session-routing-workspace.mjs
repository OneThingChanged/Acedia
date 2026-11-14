import assert from 'node:assert/strict';
import { AccountPool } from '../../electron/services/account-pool.mjs';

// Account metadata is synthetic; all coordinator, storage, HTTP, stop/start and
// PTY launch paths are the real application. No login, network model call or UI
// input is performed. Capture the account pin passed to the next native launch.
export function installRoutingFixture() {
  const launches = [], firstAccount = '11111111-1111-4111-8111-111111111111', nextAccount = '22222222-2222-4222-8222-222222222222';
  const status = AccountPool.prototype.routingStatus, launch = AccountPool.prototype.launchNative;
  AccountPool.prototype.routingStatus = () => ({ enabled: false, writable: true, assignedAccountId: null,
    accounts: [{ id: firstAccount, label: '이전 계정', available: true }, { id: nextAccount, label: 'sub5tudio', available: true }] });
  AccountPool.prototype.launchNative = function (id, pin, ...args) { launches.push({ id, pin }); return launch.call(this, id, pin, ...args); };
  return { async exercise({ window, invoke, call, first }) {
    const { BrowserWindow } = await import('electron'), nativeCalls = [], restore = [];
    for (const win of BrowserWindow.getAllWindows()) for (const name of ['show', 'showInactive', 'focus', 'restore']) {
      const original = win[name]; restore.push(() => { win[name] = original; }); win[name] = () => { nativeCalls.push(name); };
    }
    try {
      const offline = await call('/sessions', { projectId: first.projectId, name: '꺼진 라우팅 대상', start: false, requestKey: 'routing-offline' });
      const ui = () => window.webContents.executeJavaScript(`({view:localStorage.getItem('multiagent.view.v1'),groups:localStorage.getItem('multiagent.groups.v1'),focus:document.activeElement?.id})`);
      const stored = async () => JSON.parse((await invoke('storage_snapshot_get')).values['multiagent.agents.v1']);
      const beforeUi = await ui(), beforeRecords = await stored(), beforeLaunches = launches.length;
      for (const id of [first.sessionId, offline.sessionId]) {
        const read = await call('/session-routing', { sessionId: id });
        assert.equal(read.preferredAccountId, null); assert.equal(read.accounts[1].label, 'sub5tudio');
        const saved = await call('/session-routing', { sessionId: id, accountId: nextAccount, expectedAccountId: read.preferredAccountId });
        assert.equal(saved.saved, true); assert.equal(saved.preferredAccountId, nextAccount);
        assert.equal(saved.active, id === first.sessionId); assert.equal(saved.runningAccountId, null);
        assert.equal((await call('/session-routing', { sessionId: id })).preferredAccountId, nextAccount);
      }
      assert.equal(launches.length, beforeLaunches, 'Saving routing started or restarted a CLI');
      assert.deepEqual(await ui(), beforeUi, 'Saving routing changed pane selection, layout or focus');
      const afterRecords = await stored();
      for (const id of [first.sessionId, offline.sessionId]) {
        const before = beforeRecords.find(a => a.id === id), after = afterRecords.find(a => a.id === id);
        assert.equal(after.codexPoolAccountId, nextAccount);
        for (const key of ['id', 'name', 'folder', 'lastSessionId', 'codexAccountId', 'codexAccountSessions', 'modelSettings', 'dangerous', 'sessionHierarchy', 'launchOptions']) {
          assert.deepEqual(after[key], before[key], `Routing changed ${key}`);
        }
      }
      await call('/stop', { sessionId: first.sessionId });
      assert.equal((await call('/start', { sessionId: first.sessionId })).active, true);
      assert.equal(launches.filter(a => a.id === first.sessionId).at(-1).pin, nextAccount);
      await call('/stop', { sessionId: first.sessionId });
      assert.equal((await call('/session-routing', { sessionId: first.sessionId, accountId: null, expectedAccountId: nextAccount })).preferredAccountId, null);
      await call('/start', { sessionId: first.sessionId });
      assert.equal(launches.filter(a => a.id === first.sessionId).at(-1).pin, null);
      assert.equal((await call('/projects')).sessions.find(a => a.id === offline.sessionId).active, false);
      assert.deepEqual(nativeCalls, [], 'Routing or explicit restart activated a window');
      await call('/stop', { sessionId: first.sessionId });
      console.log('ACEDIA_SESSION_ROUTING_DURABLE_OFFLINE_ACTIVE_NEXT_LAUNCH_AUTOMATIC_NO_FOCUS_OK');
    } finally {
      restore.forEach(fn => fn()); AccountPool.prototype.routingStatus = status; AccountPool.prototype.launchNative = launch;
    }
  } };
}
