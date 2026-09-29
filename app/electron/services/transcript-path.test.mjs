import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isTranscriptInsideRoot, normalizeTranscriptPath } from "./transcript-path.mjs";

describe("normalizeTranscriptPath", () => {
  it("removes a Windows drive namespace prefix", () => {
    expect(
      normalizeTranscriptPath(
        "\\\\?\\G:\\Users\\AI\\.codex\\sessions\\rollout.jsonl",
        "win32",
      ),
    ).toBe("G:\\Users\\AI\\.codex\\sessions\\rollout.jsonl");
  });

  it("converts a Windows UNC namespace path", () => {
    expect(
      normalizeTranscriptPath(
        "\\\\?\\UNC\\server\\share\\.claude\\session.jsonl",
        "win32",
      ),
    ).toBe("\\\\server\\share\\.claude\\session.jsonl");
  });

  it("accepts forward-slash namespace paths and leaves ordinary paths alone", () => {
    expect(normalizeTranscriptPath("//?/G:/Users/AI/session.jsonl", "win32"))
      .toBe("G:/Users/AI/session.jsonl");
    expect(normalizeTranscriptPath("G:\\Users\\AI\\session.jsonl", "win32"))
      .toBe("G:\\Users\\AI\\session.jsonl");
    expect(normalizeTranscriptPath("/home/ai/session.jsonl", "linux"))
      .toBe("/home/ai/session.jsonl");
  });
});

it("accepts a transcript through a junction but rejects another account", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "acedia-transcript-root-"));
  try {
    const actual = path.join(directory, "actual");
    const alias = path.join(directory, "alias");
    const outside = path.join(directory, "outside");
    fs.mkdirSync(path.join(actual, "sessions"), { recursive: true });
    fs.mkdirSync(outside);
    fs.symlinkSync(actual, alias, process.platform === "win32" ? "junction" : "dir");
    const transcript = path.join(actual, "sessions", "rollout.jsonl");
    const unrelated = path.join(outside, "rollout.jsonl");
    fs.writeFileSync(transcript, "{}\n");
    fs.writeFileSync(unrelated, "{}\n");
    fs.symlinkSync(outside, path.join(actual, "sessions", "escape"), process.platform === "win32" ? "junction" : "dir");
    expect(isTranscriptInsideRoot(path.join(alias, "sessions"), transcript)).toBe(true);
    expect(isTranscriptInsideRoot(path.join(alias, "sessions"), path.join(actual, "sessions", "pending.jsonl"))).toBe(true);
    expect(isTranscriptInsideRoot(path.join(alias, "sessions"), unrelated)).toBe(false);
    expect(isTranscriptInsideRoot(path.join(alias, "sessions"), path.join(alias, "sessions", "escape", "rollout.jsonl"))).toBe(false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
