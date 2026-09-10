import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { RemoteSubmissions } from "./remote-submissions.mjs";
import { submitPtyMessage } from "./pty-submit.mjs";

const roots = [];
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "remote-submit-"));
  roots.push(root);
  const file = path.join(root, "requests.json");
  return { file, ledger: new RemoteSubmissions(file), id: `${Date.now()}-0123456789abcdef` };
}
it("coalesces simultaneous requests and remembers success after restart without storing message text", async () => {
  const { file, ledger, id } = fixture();
  let complete;
  const execute = vi.fn(() => new Promise(resolve => { complete = resolve; }));
  const first = ledger.submit(id, "a", "private message", execute);
  const second = ledger.submit(id, "a", "private message", execute);
  await Promise.resolve();
  expect(execute).toHaveBeenCalledTimes(1);
  complete(true);
  expect((await first).status).toBe(200);
  expect(await second).toEqual(await first);
  expect((await new RemoteSubmissions(file).submit(id, "a", "private message", execute)).status).toBe(200);
  expect(execute).toHaveBeenCalledTimes(1);
  expect(fs.readFileSync(file, "utf8")).not.toContain("private message");
});
it("does not replay uncertain outcomes or accept changed content under the same ID", async () => {
  const { file, ledger, id } = fixture();
  const execute = vi.fn(() => { throw new Error("response lost after PTY write"); });
  expect((await ledger.submit(id, "a", "hello", execute)).status).toBe(409);
  expect((await new RemoteSubmissions(file).submit(id, "a", "hello", execute)).status).toBe(409);
  expect((await ledger.submit(id, "a", "different", execute)).status).toBe(409);
  expect(execute).toHaveBeenCalledTimes(1);
});
it("fails closed for persisted pending work, corrupt history and expired requests", async () => {
  const { file, ledger, id } = fixture();
  let complete;
  const first = ledger.submit(id, "a", "hello", () => new Promise(resolve => { complete = resolve; }));
  await Promise.resolve();
  const execute = vi.fn();
  expect((await new RemoteSubmissions(file).submit(id, "a", "hello", execute)).status).toBe(409);
  complete(true); await first;
  fs.writeFileSync(file, "broken");
  expect((await new RemoteSubmissions(file).submit(id, "a", "hello", execute)).status).toBe(503);
  expect((await ledger.submit(`1000000000000-0123456789abcdef`, "a", "hello", execute)).status).toBe(409);
  expect(execute).not.toHaveBeenCalled();
});
it("does not replay image text after its PTY disappears between paste and Enter", async () => {
  const {file,ledger,id} = fixture();
  let current = true, clock = 0;
  const write = vi.fn();
  const execute = vi.fn(()=>submitPtyMessage({
    ptyProcess:{write},message:'image\npath',isCurrent:()=>current,now:()=>clock,
    wait:async ms=>{clock+=ms;current=false;},
  }));
  expect((await ledger.submit(id,'a','image\npath',execute)).status).toBe(409);
  expect((await new RemoteSubmissions(file).submit(id,'a','image\npath',execute)).status).toBe(409);
  expect(execute).toHaveBeenCalledOnce();
  expect(write).toHaveBeenCalledTimes(1);
});
