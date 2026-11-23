import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CodexContextUsage } from "./codex-context-usage.mjs";

const record = (type, payload) => JSON.stringify({ type, payload }) + "\n";
const tokens = input => record("event_msg", {
  type: "token_count",
  info: {
    last_token_usage: { input_tokens: input, cached_input_tokens: input - 1 },
    total_token_usage: { input_tokens: 1_000_000 },
  },
});

describe("Codex sidebar context usage", () => {
  let directory;
  afterEach(async () => {
    if (directory) await fs.rm(directory, { recursive: true });
    directory = undefined;
  });

  it("uses recent input including cache and clears pre-compaction usage before a new measurement", async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "acedia-context-usage-"));
    const file = path.join(directory, "rollout.jsonl");
    const usage = new CodexContextUsage();

    await fs.writeFile(file, tokens(320_000) + tokens(380_701));
    expect(await usage.read(file)).toBe(380_701);

    await fs.appendFile(file, record("event_msg", { type: "context_compacted" }));
    expect(await usage.read(file)).toBeNull();

    const next = tokens(23_799);
    await fs.appendFile(file, next.slice(0, -1));
    expect(await usage.read(file)).toBeNull();
    await fs.appendFile(file, "\n");
    expect(await usage.read(file)).toBe(23_799);
  });

  it("does not reuse a count after an unobserved transcript gap or file truncation", async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "acedia-context-usage-"));
    const file = path.join(directory, "rollout.jsonl");
    const usage = new CodexContextUsage();

    await fs.writeFile(file, tokens(400_000));
    expect(await usage.read(file)).toBe(400_000);
    await fs.appendFile(file, record("response_item", { output: "x".repeat(1024 * 1024) }));
    expect(await usage.read(file)).toBeNull();
    await fs.appendFile(file, tokens(410_000));
    expect(await usage.read(file)).toBe(410_000);
    await fs.truncate(file, 0);
    expect(await usage.read(file)).toBeNull();
  });
});
