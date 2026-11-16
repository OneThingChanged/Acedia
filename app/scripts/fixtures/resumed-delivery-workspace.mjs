import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

export async function exerciseResumedDelivery({ root, window, invoke, first, call, base, headers, wait }) {
  const executable = path.join(root, 'resumed-peer.cmd');
  const peer = fileURLToPath(new URL('./resumed-delivery-cli.mjs', import.meta.url));
  fs.writeFileSync(executable, `@echo off\r\n"${process.env.ACEDIA_FIXTURE_NODE}" "${peer}" %*\r\n`);
  await window.webContents.executeJavaScript(`localStorage.setItem('multiagent.agentDefaults.v1', ${JSON.stringify(JSON.stringify({ codex: { launchOptions: { executable }, dangerous: false } }))})`);
  const projectFolder = (await call('/projects')).projects.find(project => project.id === first.projectId).folder;
  const original = '검수 재개 테스트입니다.\n\n원문 띄어쓰기와 여러 줄을 보존하세요.';
  const message = async (operation, body) => {
    const response = await fetch(base + '/messages/' + operation, { method: 'POST', headers: { ...headers, 'x-acedia-agent-id': first.sessionId }, body: JSON.stringify(body) });
    const data = await response.json(); assert.equal(response.status, 200, JSON.stringify(data)); return data;
  };
  const cases = [];
  const until = async check => { for (let i = 0; i < 150; i++) { if (await check()) return; await wait(100); } throw Error('Resumed delivery condition timed out'); };
  for (const withDraft of [false, true]) {
    const target = await call('/sessions', { projectId: first.projectId, name: withDraft ? '재개 검수 · 초안 차단' : '재개 검수 · 기본', start: false, dangerous: false, requestKey: 'resumed-' + withDraft });
    if (withDraft) fs.writeFileSync(path.join(root, `hook-selected-${target.sessionId}`), 'selected');
    await invoke('spawn_pty', { id: target.sessionId, aiToolId: 'codex', cwd: projectFolder, initCommand: 'codex', launchOptions: { executable }, cols: 120, rows: 30 });
    const stateFile = path.join(root, `resumed-${target.sessionId}.json`), read = () => JSON.parse(fs.readFileSync(stateFile));
    await until(async () => fs.existsSync(stateFile) && (await call('/projects')).sessions.find(s => s.id === target.sessionId)?.conversationId === read().sessionId);
    const firstLaunch = read();
    assert.deepEqual(firstLaunch.hookReview, { initialSelection: withDraft ? 1 : 0, down: withDraft ? 0 : 1, enters: 1, confirmed: true });
    await call('/stop', { sessionId: target.sessionId });
    assert.equal((await call('/session-status', { sessionId: target.sessionId })).active, false);
    const old = Date.now() - 3600000; fs.utimesSync(firstLaunch.transcript, old / 1000, old / 1000);
    const beforeText = fs.readFileSync(firstLaunch.transcript, 'utf8'), beforeMtime = fs.statSync(firstLaunch.transcript).mtimeMs;
    if (withDraft) fs.writeFileSync(path.join(root, `draft-${target.sessionId}`), 'draft');
    // Set only this fixture session's executable through the renderer's public
    // storage API; start uses the actual coordinator's normal resume builder.
    const storage = await invoke('storage_snapshot_get');
    const records = JSON.parse(storage.values['multiagent.agents.v1']);
    const agent = records.find(a => a.id === target.sessionId);
    assert.ok(agent); assert.equal(agent.lastSessionId, firstLaunch.sessionId);
    // The dedicated fixture default is changed before the existing session is
    // registered, by the harness below. No operational data is in this profile.
    assert.equal(agent.launchOptions?.executable, executable);
    const request = { sessionId: target.sessionId, expectedConversationId: firstLaunch.sessionId, message: original, requestKey: 'existing-' + withDraft, startIfOffline: true, waitMs: 0 };
    const saved = await message('send', request); assert.equal(saved.saved, true);
    await until(async () => read().launches === 2);
    assert.ok(read().argv.includes(firstLaunch.sessionId));
    if (withDraft) {
      await wait(500);
      const status = await call('/session-status', { sessionId: target.sessionId }); assert.equal(status.ready, false);
      assert.equal(read().notifications, 0); assert.equal(fs.readFileSync(firstLaunch.transcript, 'utf8'), beforeText);
      assert.equal(fs.statSync(firstLaunch.transcript).mtimeMs, beforeMtime);
      await invoke('write_pty', { id: target.sessionId, data: '\x0c' });
    }
    try { await until(async () => read().notifications === 1 || !!read().error); }
    catch (error) {
      const status = await call('/session-status', { sessionId: target.sessionId });
      const outbox = await message('receive', { direction: 'outbox', messageId: saved.messageId, markRead: false });
      const terminal = await invoke('attach_terminal', { id: target.sessionId, afterSequence: 0 });
      console.error('RESUMED_FIXTURE_DIAGNOSTIC ' + JSON.stringify({ withDraft, status, state: read(), receipt: outbox.messages[0].delivery, terminal }));
      throw error;
    }
    assert.equal(read().error, undefined); assert.equal(read().original, original);
    const repeated = await message('send', request); assert.equal(repeated.messageId, saved.messageId);
    await until(async () => { const outbox = await message('receive', { direction: 'outbox', messageId: saved.messageId, markRead: false }); return outbox.messages[0].readAt && outbox.messages[0].delivery.status === 'started'; });
    assert.equal(read().launches, 2); assert.equal(read().notifications, 1);
    cases.push({ withDraft, startupHooks: firstLaunch.hookReview, sameSessionAndConversation: true, originalRead: true, started: true, oneRestart: true, noDuplicateNotification: true });
    await call('/stop', { sessionId: target.sessionId });
  }
  // The same native-looking prompt must stay blocked with an additional hook.
  const config = path.join(projectFolder, '.codex/config.toml'), beforeConfig = fs.readFileSync(config, 'utf8');
  const blocked = await call('/sessions', { projectId: first.projectId, name: '외부 후크 · 자동 확인 금지', start: false, dangerous: false, requestKey: 'foreign-hook' });
  try {
    fs.appendFileSync(config, '\n[[hooks.Stop]]\nmatcher=""\n[[hooks.Stop.hooks]]\ntype="command"\ncommand="unknown-hook-command"\n');
    await invoke('spawn_pty', { id: blocked.sessionId, aiToolId: 'codex', cwd: projectFolder, initCommand: 'codex', launchOptions: { executable }, cols: 120, rows: 30 });
    const stateFile = path.join(root, `resumed-${blocked.sessionId}.json`);
    await until(async () => fs.existsSync(stateFile)); await wait(1800);
    const state = JSON.parse(fs.readFileSync(stateFile));
    assert.equal(state.hookReview.confirmed, false); assert.equal(state.hookReview.down, 0); assert.equal(state.hookReview.enters, 0);
    const status = await call('/session-status', { sessionId: blocked.sessionId }); assert.equal(status.ready, false);
    cases.push({ foreignHooks: true, automaticKeys: 0, inputBlocked: true });
  } finally { await call('/stop', { sessionId: blocked.sessionId }); fs.writeFileSync(config, beforeConfig); }
  const output = process.env.ACEDIA_RESUMED_REPORT;
  if (output) fs.writeFileSync(output, JSON.stringify({ actualElectronDevelopmentApp: true, syntheticPtyPeer: true, modelCalls: 0, cases }, null, 2) + '\n');
  console.log('ACEDIA_RESUMED_DELIVERY_REAL_DEV_APP_READ_STARTED_ONCE_DRAFT_GUARD_OK');
}
