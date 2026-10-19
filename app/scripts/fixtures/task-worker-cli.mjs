// Independent CLI fixture. It writes native-shaped Codex transcripts and talks
// only to the isolated host HTTP bridge. No credentials or model API calls.
import fs from 'node:fs';
import readline from 'node:readline';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
const [file, rawModel] = process.argv.slice(2), model = JSON.parse(rawModel), conversationId = path.basename(file, '.jsonl').slice(-36);
const row = (type, payload) => fs.appendFileSync(file, JSON.stringify({ type, timestamp: new Date().toISOString(), payload }) + '\n');
row('session_meta', { id: conversationId });
process.stdout.write(JSON.stringify({ ready: true, conversationId, model }) + '\n');
const api = async (action, body) => {
  const response = await fetch(`http://127.0.0.1:${process.env.MULTIAGENT_PORT}/integration/v1/workspace/tasks`, {
    method: 'POST', headers: { authorization: 'Bearer ' + process.env.MULTIAGENT_TOKEN, 'content-type': 'application/json', 'x-acedia-agent-id': process.env.MULTIAGENT_AGENT_ID }, body: JSON.stringify({ action, body }),
  });
  const data = await response.json(); if (!response.ok) throw Error(data.error); return data;
};
readline.createInterface({ input: process.stdin }).on('line', async line => {
  try {
    const message = JSON.parse(line).message, turnId = randomUUID();
    row('event_msg', { type: 'task_started', turn_id: turnId });
    row('response_item', { type: 'message', role: 'user', content: [{ type: 'input_text', text: message }] });
    row('turn_context', { turn_id: turnId, model: model.model, effort: model.effort, service_tier: model.serviceTier });
    const [, runId, taskId, attemptId] = message.match(/runId=(\S+) taskId=(\S+) attemptId=(\S+)/);
    // Leave enough time to observe running distinct from submitted/completed.
    await new Promise(resolve => setTimeout(resolve, 300));
    for (let n = 0; n < 100; n++) {
      const { run } = await api('get', { runId });
      if (run.tasks.find(t => t.id === taskId)?.attempts.at(-1)?.turnId === turnId) break;
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    await api('result', { runId, taskId, attemptId, conversationId, turnId, result: { summary: `CLI fixture result: ${taskId}`, changedFiles: [], artifacts: [], checks: [{ command: 'fixture independent-process identity check', passed: true, output: `process=${process.pid}; turn=${turnId}` }] } });
    row('event_msg', { type: 'task_complete', turn_id: turnId });
    process.stdout.write(JSON.stringify({ submitted: true, taskId }) + '\n');
  } catch (error) { process.stdout.write(JSON.stringify({ error: error.message }) + '\n'); }
});
