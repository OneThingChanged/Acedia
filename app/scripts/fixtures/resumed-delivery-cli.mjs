// Deterministic native-PTY peer for the isolated development-app test. It never
// calls a model, touches an operational profile or executes received task text.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
const root = process.env.ACEDIA_WORKSPACE_MCP_FIXTURE, id = process.env.MULTIAGENT_AGENT_ID;
if (!root || !path.basename(root).startsWith('acedia-workspace-mcp-smoke-') || !id) throw Error('Isolated fixture required');
const stateFile = path.join(root, `resumed-${id}.json`);
const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile)) : { sessionId: randomUUID(), launches: 0, notifications: 0 };
state.launches++;
const save = () => fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
save();
process.stdin.setRawMode?.(true); process.stdin.resume();
if (state.launches === 1) {
  let selected = fs.existsSync(path.join(root, `hook-selected-${id}`)) ? 1 : 0;
  state.hookReview = { initialSelection: selected, down: 0, enters: 0, confirmed: false }; save();
  const paintReview = () => process.stdout.write('\x1b[2J\x1b[HHooks need review\r\n\r\n6 hooks are new or changed.\r\nHooks can run outside the sandbox after you trust them.\r\n\r\n'
    + ['Review hooks', 'Trust all and continue', "Continue without trusting (hooks won't run)"].map((label, i) => `${selected === i ? '›' : ' '} ${i + 1}. ${label}`).join('\r\n') + '\r\n\r\nenter confirm · esc skip');
  await new Promise(resolve => {
    const receive = chunk => {
      const keys = chunk.toString('utf8');
      if (keys.includes('\x1b[B')) { selected = Math.min(2, selected + 1); state.hookReview.down++; save(); paintReview(); }
      if (keys.includes('\r')) {
        state.hookReview.enters++; state.hookReview.confirmed = selected === 1; save();
        if (selected === 1) { process.stdin.off('data', receive); resolve(); }
      }
    };
    process.stdin.on('data', receive); paintReview();
  });
}
const folder = path.join(process.env.CODEX_HOME, 'sessions', '2026', '11', '16'); fs.mkdirSync(folder, { recursive: true });
const transcript = path.join(folder, `rollout-2026-11-16T00-00-00-${state.sessionId}.jsonl`);
const append = (type, payload) => fs.appendFileSync(transcript, JSON.stringify({ timestamp: new Date().toISOString(), type, payload }) + '\n');
const hook = async event => {
  const response = await fetch(`http://127.0.0.1:${process.env.MULTIAGENT_PORT}/event`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: process.env.MULTIAGENT_TOKEN, id, event, hook_event_name: event === 'session-start' ? 'SessionStart' : 'Stop', session_id: state.sessionId, cwd: process.cwd(), transcript_path: transcript }) });
  if (!response.ok) throw Error('Fixture hook failed: ' + response.status);
};
const resumeIndex = process.argv.indexOf('resume');
if (state.launches === 1) {
  append('session_meta', { id: state.sessionId, cwd: process.cwd(), originator: 'codex_cli_rs' });
  append('event_msg', { type: 'task_complete', turn_id: 'prior-fixture-turn' });
  await hook('session-start'); await hook('done');
} else if (resumeIndex < 0 || process.argv[resumeIndex + 1] !== state.sessionId) {
  throw Error('Existing conversation was not resumed exactly');
}
state.transcript = transcript; state.argv = process.argv.slice(2); state.cwd = process.cwd(); save();
let draft = fs.existsSync(path.join(root, `draft-${id}`)), input = '', handling = false, staged = false;
const paint = () => process.stdout.write('\x1b[2J\x1b[H\x1b[?25h› ' + (draft ? 'DO NOT SEND: existing draft' : '\x1b[90mAsk Codex to do anything\x1b[0m') + '\x1b[1;3H');
process.stdin.setRawMode?.(true); process.stdin.resume(); paint();
process.stdin.on('data', async chunk => {
  input += chunk.toString('utf8');
  state.lastInput = input.slice(-2400); save();
  // A real multiline TUI repaints a staged paste before Enter. ConPTY may
  // coalesce cursor-only writes, so visibly redraw a separate status row.
  if (!staged && input.includes('\x1b[201~')) { staged = true; process.stdout.write('\x1b[2;1H\x1b[2m[paste staged]\x1b[0m\x1b[1;3H'); }
  if (draft && input.includes('\x0c')) { draft = false; input = ''; paint(); return; }
  const delivery = input.match(/\[Acedia handoff: ([0-9a-f-]{36})\]/), notification = input.match(/Acedia session message ([0-9a-f-]{36})\. Read[^\r\n\x1b]+/);
  if (handling || !delivery || !notification || !/[\r\n]$/.test(input)) return;
  handling = true;
  try {
    if (draft) throw Error('Notification was written into a draft');
    const messageId = notification[1], wire = input.slice(delivery.index).trimEnd();
    append('event_msg', { type: 'task_started', turn_id: 'resumed-fixture-turn' });
    append('response_item', { type: 'message', role: 'user', content: [{ type: 'input_text', text: wire }] });
    const response = await fetch(`http://127.0.0.1:${process.env.MULTIAGENT_PORT}/integration/v1/workspace/messages/receive`, { method: 'POST',
      headers: { authorization: 'Bearer ' + process.env.MULTIAGENT_TOKEN, 'x-acedia-agent-id': id, 'content-type': 'application/json' }, body: JSON.stringify({ messageId }) });
    if (!response.ok) throw Error('Fixture body receive failed: ' + response.status);
    const received = await response.json(); state.original = received.messages[0].message; state.messageId = messageId; state.notifications++; save();
    append('event_msg', { type: 'task_complete', turn_id: 'resumed-fixture-turn' }); await hook('done');
    input = ''; staged = false; paint();
  } catch (error) { state.error = error.message; save(); process.exitCode = 1; }
  finally { handling = false; }
});
