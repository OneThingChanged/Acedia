import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { normalizeSessionModel, sameSessionModel, mergeSessionModel } from "../shared/session-model.mjs";
import { selectedAccountId } from "./provider-accounts.mjs";

const supported = entry => entry && !entry.ssh && !entry.sshHostId && ["codex", "claude"].includes(entry.aiToolId);
const folderKey = value => {
  const folder = path.resolve(value || os.homedir());
  return process.platform === "win32" ? folder.toLowerCase() : folder;
};
const scopeFor = entry => `${entry.aiToolId}:${selectedAccountId(entry)}:${folderKey(entry.cwd)}`;

// Read the native footer after its composer, never model-looking assistant text.
// Fast is optional in configurable status lines: absence is unknown, not Off.
export function nativeCodexModel(entry) {
  if (entry?.aiToolId !== "codex" || entry.ssh) return undefined;
  const lines = entry.filter?.viewportText?.().split("\n") || [];
  const composer = lines.findLastIndex(line => /^\s*›(?:\s|$)/.test(line));
  if (composer < 0) return undefined;
  // Long drafts can contain model-looking lines. Prefer the bottom status
  // row over draft text immediately below the composer.
  for (const line of lines.slice(composer + 1).reverse()) {
    const match = line.match(/^\s*(?:[⚡✦]\s*)?([a-z0-9][a-z0-9._:/ -]*?)\s+(none|minimal|low|medium|high|xhigh|max|ultra)(?:\s+(?:\((fast|ultrafast|standard)\)|(fast|ultrafast|standard)))?\s*[·•]/i);
    if (!match) continue;
    const model = match[1].trim().toLowerCase().replace(/\s+/g, "-");
    // Only a dedicated status item can establish speed. A folder named Fast
    // or assistant content elsewhere in the viewport is not a tier indicator.
    const items = line.split(/[·•]/).slice(1).map(item => item.trim());
    const inline = (match[3] || match[4])?.toLowerCase();
    const tier = (inline === "standard" ? "default" : inline) || (items.some(item => /^(?:⚡\s*)?Ultrafast$/i.test(item)) ? "ultrafast"
      : items.some(item => /^(?:⚡\s*)?Fast$/i.test(item)) ? "fast" : items.some(item => /^Standard$/i.test(item)) ? "default" : undefined);
    return normalizeSessionModel({ model, effort: match[2].toLowerCase(), ...(tier ? { serviceTier: tier } : {}) });
  }
  return undefined;
}

export function updateNativeSessionModel(entry, settings) {
  const native = normalizeSessionModel(settings);
  if (!native) return;
  entry.runtimeModelSettings = native;
  // The notification can arrive before its TUI repaint. Remember the footer
  // that was already visible so it cannot undo the newly reported settings.
  entry.runtimeModelFooter = nativeCodexModel(entry) ?? null;
}

function rememberedModel(entry, previous, observed) {
  let native = normalizeSessionModel(entry.runtimeModelSettings);
  const footer = nativeCodexModel(entry);
  if (native && footer && Object.hasOwn(entry, "runtimeModelFooter") && !sameSessionModel(footer, entry.runtimeModelFooter)) {
    // /model can update the TUI before a new turn or settings notification.
    // A changed footer supersedes the older routed thread snapshot, and must
    // remain current even while a later popup hides the status line.
    native = mergeSessionModel(footer, native);
    // Codex displays the native priority tier as "fast". Preserve that exact
    // confirmed launch value when the footer only changes model or effort.
    if (footer.serviceTier === "fast" && entry.runtimeModelSettings.serviceTier === "priority") native.serviceTier = "priority";
    entry.runtimeModelSettings = native;
    entry.runtimeModelFooter = footer;
  }
  const settings = mergeSessionModel(native || footer || observed, previous);
  // Native thread settings are a complete snapshot. An unset effort must not
  // inherit the old explicit effort; it resumes with the model's default.
  if (!native || native.effort || !settings) return settings;
  const { effort: _oldEffort, ...defaultEffort } = settings;
  return defaultEffort;
}

// Main owns this small metadata file. No transcript bodies or credentials are
// saved, and window/coordinator lifetime cannot discard the last launch state.
export class SessionModelMemory {
  constructor(file, { onError = error => console.warn("[electron] session model memory", error.message), defaultSettings = () => undefined } = {}) {
    this.file = file; this.onError = onError; this.defaultSettings = defaultSettings; this.records = new Map();
    try {
      if (fs.statSync(file).size > 2 * 1024 * 1024) throw new Error("Session model memory is too large.");
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      if (data.version !== 1 || !Array.isArray(data.records) || data.records.length > 2000) throw new Error("Invalid session model memory.");
      for (const record of data.records) {
        if (typeof record.id !== "string" || record.id.length > 200 || typeof record.scope !== "string"
          || record.scope.length > 4000 || !Number.isFinite(record.updatedAt)
          || (record.settings != null && !normalizeSessionModel(record.settings))
          || (record.configured != null && !normalizeSessionModel(record.configured))
          || (Object.hasOwn(record, "next") && record.next != null && !normalizeSessionModel(record.next))) throw new Error("Invalid session model memory record.");
        this.records.set(record.id, record);
      }
    } catch (error) {
      if (error.code !== "ENOENT") { this.unavailable = true; this.onError(error); }
    }
  }
  #save() {
    if (this.unavailable) throw new Error("Session model memory is unavailable. Check its saved file.");
    while (this.records.size > 2000) this.records.delete(this.records.keys().next().value);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify({ version: 1, records: [...this.records.values()] }), { mode: 0o600 });
    fs.renameSync(temporary, this.file);
  }
  record(entry) {
    const record = this.records.get(entry?.id);
    return supported(entry) && record?.scope === scopeFor(entry) ? record : undefined;
  }
  lastSettings(entry) {
    return normalizeSessionModel(this.#accountRecord(entry)?.settings);
  }
  #accountRecord(entry) {
    const record = this.records.get(entry?.id);
    return supported(entry) && record?.scope.startsWith(`${entry.aiToolId}:${selectedAccountId(entry)}:`) ? record : undefined;
  }
  resolve(args) {
    if (this.unavailable && supported(args)) throw new Error("세션 실행 설정의 저장 파일을 읽지 못했습니다. session-model-memory.json을 확인하세요.");
    const requested = normalizeSessionModel(args.modelSettings);
    const record = this.record(args);
    // An explicit next selection belongs to this session/account. Its renderer
    // folder can be stale for a sleeping child which inherits its parent's cwd.
    const pending = this.#accountRecord(args);
    let settings = requested;
    if (pending && Object.hasOwn(pending, "next")) {
      settings = normalizeSessionModel(pending.next);
      if (settings && !Object.hasOwn(settings, "serviceTier") && Object.hasOwn(pending.settings || {}, "serviceTier")) {
        settings = { ...settings, serviceTier: pending.settings.serviceTier };
      }
    } else if (record) {
      if (sameSessionModel(requested, record.configured)) settings = normalizeSessionModel(record.settings);
      else if (requested && !Object.hasOwn(requested, "serviceTier") && Object.hasOwn(record.settings || {}, "serviceTier")) {
        settings = { ...requested, serviceTier: record.settings.serviceTier };
      }
    }
    const extra = args.launchOptions?.args || [];
    const overridesModel = extra.some(arg => /^(?:-m|--model|--effort)(?:=|$)|^-m[^-]|^(?:-c|--config=)?(?:model|model_reasoning_effort)\s*=/.test(arg));
    const overridesTier = extra.some((arg, index) => /^(?:-c|--config=)?(?:service_tier|features\.fast_mode)\s*=/.test(arg)
      || arg === "--disable=fast_mode"
      || (arg === "--disable" && extra[index + 1] === "fast_mode"));
    // Resolve app defaults only after the session's own remembered/next choice.
    // SSH hosts and explicit advanced model arguments keep their configuration.
    if (!settings && supported(args) && !overridesModel) settings = normalizeSessionModel(this.defaultSettings(args));
    if (!requested && overridesModel) settings = undefined;
    else if (settings && !Object.hasOwn(requested || {}, "serviceTier") && overridesTier) {
      const { serviceTier: _tier, ...withoutTier } = settings; settings = withoutTier;
    }
    return { settings, requested, token: pending?.nextToken };
  }
  started(entry) {
    if (!supported(entry)) return;
    const previous = this.#accountRecord(entry);
    const keepNext = previous && Object.hasOwn(previous, "next") && previous.nextToken !== entry.modelMemoryToken;
    this.records.set(entry.id, { id: entry.id, scope: scopeFor(entry), configured: entry.configuredModelSettings ?? null,
      settings: rememberedModel(entry, entry.modelSettings) ?? null, updatedAt: Date.now(),
      ...(keepNext ? { next: previous.next, nextToken: previous.nextToken } : {}) });
    this.#save();
  }
  remember(entry, observed) {
    if (!supported(entry)) return undefined;
    const previous = this.record(entry);
    const pending = this.#accountRecord(entry);
    const settings = rememberedModel(entry, previous?.settings || entry.modelSettings, observed);
    if (!settings && !previous) return undefined;
    const record = { ...previous, ...(pending && Object.hasOwn(pending, "next") ? { next: pending.next, nextToken: pending.nextToken } : {}),
      id: entry.id, scope: scopeFor(entry),
      configured: entry.configuredModelSettings ?? null, settings: settings ?? null, updatedAt: Date.now() };
    if (!previous || !sameSessionModel(previous.settings, settings) || !sameSessionModel(previous.configured, record.configured)) {
      this.records.delete(entry.id); this.records.set(entry.id, record); this.#save();
    }
    return settings;
  }
  stage(agent, settings) {
    if (!supported(agent)) return null;
    const context = { ...agent, cwd: agent.cwd || agent.folder };
    const previous = this.#accountRecord(context);
    const token = randomUUID();
    this.records.set(agent.id, { ...previous, id: agent.id, scope: scopeFor(context),
      settings: previous?.settings ?? null, configured: previous?.configured ?? normalizeSessionModel(agent.modelSettings) ?? null,
      next: normalizeSessionModel(settings) ?? null, nextToken: token, updatedAt: Date.now() });
    try { this.#save(); }
    catch (error) { previous ? this.records.set(agent.id, previous) : this.records.delete(agent.id); throw error; }
    return { id: agent.id, token, previous };
  }
  rollback(ticket) {
    if (!ticket || this.records.get(ticket.id)?.nextToken !== ticket.token) return;
    ticket.previous ? this.records.set(ticket.id, ticket.previous) : this.records.delete(ticket.id);
    this.#save();
  }
}
