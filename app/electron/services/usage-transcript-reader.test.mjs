import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UsageService } from "./usage-service.mjs";
import { MAX_USAGE_LINE_BYTES, USAGE_READ_BYTES, readUsageBatches } from "./usage-transcript-reader.mjs";

const fixtures = [];
afterEach(async () => {
  for (const fixture of fixtures.splice(0)) {
    fixture.service.close();
    await Promise.allSettled([fixture.service.transcriptRefresh, ...fixture.service.fileIngests.values()].filter(Boolean));
    if (path.dirname(fixture.root) !== path.resolve(os.tmpdir()) || !path.basename(fixture.root).startsWith("acedia-usage-stream-")) {
      throw new Error("Unexpected transcript fixture path");
    }
    fs.rmSync(fixture.root, { recursive: true });
  }
  vi.restoreAllMocks();
});

const jsonl = item => `${JSON.stringify(item)}\n`;
const token = (total, cumulative = total) => ({
  timestamp: "2026-10-03T01:00:00Z", type: "event_msg", payload: {
    type: "token_count", info: {
      last_token_usage: { input_tokens: total - 1, output_tokens: 1, total_tokens: total },
      total_token_usage: { total_tokens: cumulative },
    },
  },
});

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "acedia-usage-stream-"));
  const file = path.join(root, "history.jsonl");
  const entry = { path: file, sessionId: "session", cwd: root };
  const sessions = { scan: async tool => tool === "codex" ? [entry] : [] };
  const database = path.join(root, "usage.db");
  const result = { root, file, entry, sessions, database, service: new UsageService(database, sessions) };
  fixtures.push(result);
  return result;
}

describe("bounded transcript usage collection", () => {
  it("preserves UTF-8 records and byte offsets across chunks without consuming an unfinished tail", async () => {
    const { file } = fixture();
    const lines = [jsonl({ text: "한글🙂".repeat(USAGE_READ_BYTES / 2) }), jsonl(token(13)).replace(/\n$/, "\r\n")];
    const expectedEnd = Buffer.byteLength(lines.join(""));
    fs.writeFileSync(file, lines.join("") + '{"incomplete":');
    const batches = [];
    for await (const batch of readUsageBatches(file, 0, fs.statSync(file).size)) batches.push(batch);
    expect(batches.flatMap(batch => batch.records)).toEqual([
      { text: lines[0].slice(0, -1), offset: 0 },
      { text: lines[1].slice(0, -1), offset: Buffer.byteLength(lines[0]) },
    ]);
    expect(batches.at(-1).endOffset).toBe(expectedEnd);
  });

  it("resumes model, cumulative resets and an incomplete record after closing and reopening the index", async () => {
    const f = fixture();
    const header = jsonl({ type: "session_meta", payload: { id: "session", cwd: f.root } }) +
      jsonl({ type: "turn_context", payload: { model: "gpt-6-astra", cwd: f.root } });
    const content = header + jsonl({ type: "response_item", payload: { text: "🙂".repeat(USAGE_READ_BYTES) } }) + jsonl(token(13));
    const partial = jsonl(token(17, 30));
    fs.writeFileSync(f.file, content + partial.slice(0, -5));
    expect((await f.service.ingestAll()).events).toBe(1);
    expect(f.service.db().prepare("SELECT last_offset FROM usage_sources").get().last_offset).toBe(Buffer.byteLength(content));
    f.service.close();
    f.service = new UsageService(f.database, f.sessions);
    fs.appendFileSync(f.file, partial.slice(-5) + jsonl(token(17, 30)) + jsonl(token(5, 5)));
    expect((await f.service.ingestAll()).events).toBe(2);
    expect(f.service.dashboardSummary()).toMatchObject({ events: 3, totalTokens: 35 });
    const rows = f.service.db().prepare("SELECT model, source_offset FROM usage_events ORDER BY id").all();
    expect(rows.map(row => row.model)).toEqual(["gpt-6-astra", "gpt-6-astra", "gpt-6-astra"]);
    expect(rows[1].source_offset).toBe(Buffer.byteLength(content));
    expect(f.service.db().prepare("SELECT cumulative_segment FROM usage_sources").get().cumulative_segment).toBe(1);
    expect((await f.service.ingestAll()).events).toBe(0);
  });

  it("preserves Claude usage attached to a message larger than a read chunk", async () => {
    const { file, service, entry } = fixture();
    fs.writeFileSync(file, jsonl({
      type: "assistant", sessionId: "session", timestamp: "2026-10-03T01:00:00Z",
      message: { id: "message", model: "claude-opus-4-6", content: [{ type: "text", text: "a".repeat(USAGE_READ_BYTES * 3) }],
        usage: { input_tokens: 3, output_tokens: 7, cache_read_input_tokens: 11, cache_creation_input_tokens: 13 } },
    }));
    expect(await service.ingestFile(entry, "claude")).toBe(1);
    expect(service.dashboardSummary()).toMatchObject({ events: 1, totalTokens: 34, cacheReadTokens: 11, cacheWriteTokens: 13 });
    expect(await service.ingestFile(entry, "claude")).toBe(0);
  });

  it("shares a file import with completion hooks and handles truncation on the next scan", async () => {
    const { file, entry, service } = fixture();
    service.syncCatalog([], [{ id: "agent", name: "Active agent", aiToolId: "codex", lastSessionId: "session" }]);
    fs.writeFileSync(file, jsonl(token(13)) + jsonl({ padding: "x".repeat(USAGE_READ_BYTES * 2) }));
    const first = service.ingestFile(entry, "codex");
    expect(service.ingestFile(entry, "codex")).toBe(first);
    await Promise.all([first, service.ingestHook("agent", file, "session"), service.ingestAll()]);
    expect(service.dashboardSummary()).toMatchObject({ events: 1, totalTokens: 13 });
    fs.writeFileSync(file, jsonl(token(5)));
    expect((await service.ingestAll()).events).toBe(1);
    expect(service.dashboardSummary()).toMatchObject({ events: 2, totalTokens: 18 });
  });

  it("reads an 11 GiB reported backlog in bounded chunks while Dashboard remains available", async () => {
    const { file, service } = fixture();
    fs.writeFileSync(file, jsonl(token(13)) + (jsonl({ text: "x".repeat(1000) })).repeat(800));
    const stat = fs.promises.stat.bind(fs.promises);
    // Model a huge file without creating a multi-GB fixture on the developer's disk.
    vi.spyOn(fs.promises, "stat").mockImplementation(async target => target === file
      ? { size: 11 * 1024 ** 3, isFile: () => true }
      : stat(target));
    const open = fs.promises.open.bind(fs.promises);
    let release;
    let reading;
    const paused = new Promise(resolve => { reading = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    const lengths = [];
    let closed = false;
    vi.spyOn(fs.promises, "open").mockImplementation(async (...args) => {
      const handle = await open(...args);
      const read = handle.read.bind(handle);
      const close = handle.close.bind(handle);
      handle.read = async (...params) => {
        lengths.push(params[2]);
        if (lengths.length === 2) { reading(); await gate; }
        return read(...params);
      };
      handle.close = async () => { await close(); closed = true; };
      return handle;
    });
    const job = service.ingestAll();
    try {
      await paused;
      const summary = await service.browserSummary();
      expect(summary.tokensRefreshPending).toBe(true);
      expect(summary.tokens.totalTokens).toBe(13);
      expect(lengths).toEqual([USAGE_READ_BYTES, USAGE_READ_BYTES]);
      await new Promise(resolve => setImmediate(resolve));
    } finally {
      service.close();
      release();
      await job;
    }
    expect(closed).toBe(true);
    expect(service.database).toBeNull();
  });

  it("bounds an oversized record and preserves the last safe checkpoint without silently dropping usage", async () => {
    const { file, service } = fixture();
    const head = jsonl(token(13));
    const fd = fs.openSync(file, "w");
    try {
      fs.writeSync(fd, head);
      const chunk = Buffer.alloc(USAGE_READ_BYTES, 0x61);
      for (let offset = 0; offset <= MAX_USAGE_LINE_BYTES; offset += chunk.length) fs.writeSync(fd, chunk);
      fs.writeSync(fd, "\n" + jsonl(token(17, 30)));
    } finally { fs.closeSync(fd); }
    const summary = await service.ingestAll();
    expect(summary.errors).toHaveLength(1);
    expect(summary.errors[0]).toContain("exceeds 64 MiB");
    expect(service.dashboardSummary()).toMatchObject({ events: 1, totalTokens: 13 });
    expect(service.db().prepare("SELECT last_offset FROM usage_sources").get().last_offset).toBe(Buffer.byteLength(head));
    expect((await service.browserSummary()).tokensRefreshFailed).toBe(true);
    expect(service.transcriptUpdatedAt).toBe(0);
  });
});
