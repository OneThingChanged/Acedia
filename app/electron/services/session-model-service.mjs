import fs from "node:fs/promises";
import { normalizeSessionModel } from "../shared/session-model.mjs";

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });

export function modelRestartAllowed(agent, active) {
  if (!active) return true;
  return ["done", "idle", "session-start"].includes(agent?.hook?.event)
    && !["starting", "recovering", "working", "tool-start", "tool-end", "attention"].includes(agent?.status);
}

export async function verifyModelSessionStart({ id, settings, entryFor, hookFor, timeoutMs = 25000, now = Date.now }) {
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
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw fail("새 CLI의 시작 hook을 확인하지 못했습니다. 세션 상태를 확인하세요. 설정은 저장되었습니다.", 409);
}

// Read only a bounded transcript tail, never disclose conversation contents.
export async function lastTurnModel(file, provider = "codex", since) {
  if (!file) return null;
  let handle;
  try {
    handle = await fs.open(file, "r");
    const { size } = await handle.stat();
    const offset = Math.max(0, size - 512 * 1024);
    const buffer = Buffer.alloc(Math.min(size, 512 * 1024));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset);
    const lines = buffer.subarray(0, bytesRead).toString("utf8").split(/\r?\n/);
    for (let i = lines.length - 1; i >= (offset ? 1 : 0); i--) {
      try {
        const row = JSON.parse(lines[i]);
        if (since != null && !(Date.parse(row.timestamp) >= since)) continue;
        if (provider === "claude" && row.type === "assistant") {
          const result = normalizeSessionModel({ model: row.message?.model, effort: row.effort ?? row.message?.effort });
          if (result) return result;
        } else if (provider === "codex" && row.type === "turn_context") {
          const result = normalizeSessionModel({ model: row.payload?.model, effort: row.payload?.effort ?? row.payload?.reasoning_effort });
          if (result) return result;
        }
      } catch { /* a concurrent write can leave a partial final line */ }
    }
  } catch { /* the CLI may not have emitted its first turn yet */ }
  finally { await handle?.close(); }
  return null;
}

export class SessionModelService {
  constructor({ agentFor, active, catalog, update }) {
    this.agentFor = agentFor; this.active = active; this.catalog = catalog; this.update = update;
  }
  agent(id) {
    if (typeof id !== "string" || !id || id.length > 200) throw fail("세션을 찾을 수 없습니다.", 404);
    const agent = this.agentFor(id);
    if (!agent) throw fail("세션을 찾을 수 없습니다.", 404);
    if (!["codex", "claude"].includes(agent.aiToolId) || agent.sshHostId) throw fail("로컬 Codex 또는 Claude 세션을 선택하세요.", 409);
    return agent;
  }
  async read(id) {
    const agent = this.agent(id);
    const result = await this.catalog(agent);
    return { ...result, saved: normalizeSessionModel(agent.modelSettings) ?? null,
      canRestart: modelRestartAllowed(this.agent(id), this.active(id)) };
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
    if (body.restart && !modelRestartAllowed(this.agent(id), this.active(id))) throw fail("작업이 끝난 뒤 재시작하세요. 다음 시작에 적용할 설정은 저장할 수 있습니다.", 409);
    return this.update({ id, settings, restart: body.restart === true });
  }
}
