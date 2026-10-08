import fs from "node:fs/promises";
import { normalizeSessionModel } from "../shared/session-model.mjs";
import { deliveryComposerReady } from "./session-delivery.mjs";

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });

// Hook delivery can be absent when a Codex session is resumed. Only an empty
// native composer is positive fallback evidence; a transcript from an older
// turn or a merely live process cannot establish that it is safe to restart.
export function codexModelInputReady(entry, { blocked = false, now = Date.now() } = {}) {
  return !!entry && entry.aiToolId === "codex" && !blocked
    && now - Math.max(entry.startedAt || 0, entry.lastInputAt || 0) >= 500
    && deliveryComposerReady(entry);
}

export function modelRestartAllowed(agent, active, inputReady = false) {
  if (!active) return true;
  if (["starting", "recovering", "working", "tool-start", "tool-end", "attention", "waiting", "question", "blocked"].includes(agent?.status)
    || ["working", "tool-start", "tool-end", "waiting", "blocked"].includes(agent?.hook?.event)) return false;
  return ["done", "idle", "session-start"].includes(agent?.hook?.event)
    || (agent?.aiToolId === "codex" && inputReady);
}

export async function verifyModelSessionStart({ id, settings, entryFor, hookFor, inputReady = () => false, timeoutMs = 25000, now = Date.now }) {
  const expected = normalizeSessionModel(settings) ?? null;
  const entry = entryFor(id);
  if (!entry || JSON.stringify(normalizeSessionModel(entry.modelSettings) ?? null) !== JSON.stringify(expected)) {
    throw fail("새 CLI의 모델 설정을 확인하지 못했습니다. 설정은 저장되었습니다.", 409);
  }
  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    if (entryFor(id) !== entry) throw fail("새 CLI가 시작 중 종료되었습니다. 터미널 오류를 확인하세요. 설정은 저장되었습니다.", 409);
    const hook = hookFor(id);
    if (hook?.lastTs >= entry.startedAt && ["session-start", "working", "done", "tool-start", "tool-end"].includes(hook.event)) return;
    if (inputReady(entry)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw fail("새 CLI의 시작 hook을 확인하지 못했습니다. 세션 상태를 확인하세요. 설정은 저장되었습니다.", 409);
}

const modelReads = new Map();
const MODEL_CHUNK = 256 * 1024;
const MAX_MODEL_LINE = 1024 * 1024;

async function readModelRecord(file, provider, previous, since) {
  const handle = await fs.open(file, "r");
  try {
    const stat = await handle.stat();
    if (previous?.size === stat.size && previous.mtimeMs === stat.mtimeMs && previous.ino === stat.ino) return previous;
    const appended = previous && previous.ino === stat.ino && stat.size > previous.size;
    // A new record can straddle the old end. Re-read that boundary but retain
    // the last known model when appended tools/images contain no model record.
    const floor = appended ? Math.max(0, previous.size - MAX_MODEL_LINE) : 0;
    let end = stat.size, carry = Buffer.alloc(0), oversized = false, found = null;
    while (end > floor && !found) {
      const start = Math.max(floor, end - MODEL_CHUNK);
      const buffer = Buffer.alloc(end - start);
      await handle.read(buffer, 0, buffer.length, start);
      let lineEnd = buffer.length;
      for (let index = buffer.length - 1; index >= 0; index--) {
        if (buffer[index] !== 10) continue;
        const part = buffer.subarray(index + 1, lineEnd);
        const line = !oversized && part.length + carry.length <= MAX_MODEL_LINE ? Buffer.concat([part, carry]).toString("utf8") : "";
        if ((provider === "codex" ? /"type"\s*:\s*"turn_context"/ : /"type"\s*:\s*"assistant"/).test(line)) {
          try {
            const row = JSON.parse(line);
            const value = provider === "claude" && row.type === "assistant"
              ? { model: row.message?.model, effort: row.effort ?? row.message?.effort }
              : row.type === "turn_context" ? { model: row.payload?.model, effort: row.payload?.effort ?? row.payload?.reasoning_effort } : null;
            const model = normalizeSessionModel(value);
            if (model && (since == null || Date.parse(row.timestamp) >= since)) { found = { model, timestamp: Date.parse(row.timestamp) }; break; }
          } catch { /* A concurrently written final record may be incomplete. */ }
        }
        carry = Buffer.alloc(0); oversized = false; lineEnd = index;
      }
      const first = buffer.subarray(0, lineEnd);
      if (first.length + carry.length > MAX_MODEL_LINE) { oversized = true; carry = Buffer.alloc(0); }
      else if (!oversized) carry = Buffer.concat([first, carry]);
      end = start;
    }
    // The very first JSONL line need not have a leading newline.
    if (!found && floor === 0 && !oversized && carry.length) {
      try {
        const row = JSON.parse(carry.toString("utf8"));
        const value = provider === "claude" && row.type === "assistant" ? { model: row.message?.model, effort: row.effort ?? row.message?.effort }
          : row.type === "turn_context" ? { model: row.payload?.model, effort: row.payload?.effort ?? row.payload?.reasoning_effort } : null;
        const model = normalizeSessionModel(value);
        if (model && (since == null || Date.parse(row.timestamp) >= since)) found = { model, timestamp: Date.parse(row.timestamp) };
      } catch { /* Not a model record. */ }
    }
    return { size: stat.size, mtimeMs: stat.mtimeMs, ino: stat.ino, record: found || (appended ? previous.record : null) };
  } finally { await handle.close(); }
}

// Backward, bounded-memory reads find the last model even after large images
// or long tool runs. Cache only metadata/model, never conversation contents.
export async function lastTurnModel(file, provider = "codex", since) {
  if (!file) return null;
  const key = `${provider}:${file}:${since ?? "all"}`;
  let entry = modelReads.get(key);
  if (!entry) {
    entry = {}; modelReads.set(key, entry);
    if (modelReads.size > 64) modelReads.delete(modelReads.keys().next().value);
  }
  try {
    entry.pending ??= readModelRecord(file, provider, entry.value, since).then(value => { entry.value = value; return value; }).finally(() => { entry.pending = null; });
    const { record } = await entry.pending;
    return record && (since == null || record.timestamp >= since) ? record.model : null;
  } catch { /* the CLI may not have emitted its first turn yet */ }
  return null;
}

export class SessionModelService {
  constructor({ agentFor, active, catalog, update, inputReady = () => false }) {
    this.agentFor = agentFor; this.active = active; this.catalog = catalog; this.update = update;
    this.inputReady = inputReady;
  }
  agent(id) {
    if (typeof id !== "string" || !id || id.length > 200) throw fail("세션을 찾을 수 없습니다.", 404);
    const agent = this.agentFor(id);
    if (!agent) throw fail("세션을 찾을 수 없습니다.", 404);
    if (!["codex", "claude"].includes(agent.aiToolId) || agent.sshHostId) throw fail("로컬 Codex 또는 Claude 세션을 선택하세요.", 409);
    return agent;
  }
  canRestart(id) {
    return modelRestartAllowed(this.agent(id), this.active(id), this.inputReady(id));
  }
  async read(id) {
    const agent = this.agent(id);
    const result = await this.catalog(agent);
    return { ...result, saved: normalizeSessionModel(agent.modelSettings) ?? null,
      canRestart: this.canRestart(id) };
  }
  async save(body) {
    if (!body || !Object.hasOwn(body, "settings")) throw fail("Model settings are required.");
    const id = body?.id, agent = this.agent(id);
    if (body.restart != null && typeof body.restart !== "boolean") throw fail("Invalid restart option.");
    const settings = body.settings == null ? null : normalizeSessionModel(body.settings);
    if (body.settings != null && !settings) throw fail("Invalid model/effort settings.");
    if (settings) {
      const { models } = await this.catalog(agent);
      const selected = models.find(model => model.model === settings.model);
      if (!selected || (settings.effort && !selected.efforts.some(item => item.effort === settings.effort))) {
        throw fail("선택한 계정에서 지원하지 않는 모델 또는 effort입니다. 목록을 새로 확인하세요.");
      }
    }
    if (body.restart && !this.canRestart(id)) throw fail("작업이 끝난 뒤 재시작하세요. 다음 시작에 적용할 설정은 저장할 수 있습니다.", 409);
    return this.update({ id, settings, restart: body.restart === true });
  }
}
