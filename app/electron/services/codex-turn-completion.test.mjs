import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CodexTurnCompletion } from "./codex-turn-completion.mjs";

describe("CodexTurnCompletion", () => {
  it("recognizes a finished turn after a stale working hook and rejects a newer hook", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "acedia-turn-"));
    try {
      const sessionId = "01a09d62-9906-7000-b78c-b337ca6be9c2";
      const transcriptPath = path.join(root, `rollout-${sessionId}.jsonl`);
      const completion = new CodexTurnCompletion();
      fs.writeFileSync(transcriptPath, [
        JSON.stringify({ type: "event_msg", payload: { type: "task_started" } }),
        JSON.stringify({ type: "event_msg", payload: { type: "task_complete" } }),
        "",
      ].join("\n"));
      const modifiedAt = fs.statSync(transcriptPath).mtimeMs;
      expect(completion.isComplete({ root, transcriptPath, sessionId, lastHookAt: modifiedAt - 1000 })).toBe(true);
      expect(completion.isComplete({ root, transcriptPath, sessionId, lastHookAt: modifiedAt + 1000 })).toBe(false);
      fs.appendFileSync(transcriptPath, `${JSON.stringify({ type: "event_msg", payload: { type: "task_started" } })}\n`);
      expect(completion.isComplete({ root, transcriptPath, sessionId, lastHookAt: modifiedAt - 1000 })).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("ignores other accounts and files with no conclusive turn marker", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "acedia-turn-"));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "acedia-other-account-"));
    try {
      const sessionId = "01a09d62-9906-7000-b78c-b337ca6be9c2";
      const transcriptPath = path.join(outside, `rollout-${sessionId}.jsonl`);
      fs.writeFileSync(transcriptPath, `${JSON.stringify({ type: "event_msg", payload: { type: "task_complete" } })}\n`);
      const completion = new CodexTurnCompletion();
      expect(completion.isComplete({ root, transcriptPath, sessionId, lastHookAt: 1 })).toBe(false);
      const inside = path.join(root, `rollout-${sessionId}.jsonl`);
      fs.writeFileSync(inside, `${JSON.stringify({ type: "event_msg", payload: { type: "token_count" } })}\n`);
      expect(completion.isComplete({ root, transcriptPath: inside, sessionId, lastHookAt: 1 })).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});
