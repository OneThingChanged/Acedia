import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { crc32 } from "node:zlib";
import { afterEach, expect, it } from "vitest";
import { LocalDashboardService, RemoteDashboardService } from "./web-services.mjs";
import { remoteAttachmentMessage, shouldAttachPastedText } from "../shared/remote-attachments.mjs";

const services = [], roots = [];
afterEach(async () => {
  await Promise.all(services.splice(0).map(service => service.stop()));
  for (const root of roots.splice(0)) {
    if (path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir())
      || !path.basename(root).startsWith("acedia-doc-upload-")) throw Error("Unsafe upload test cleanup path");
    fs.rmSync(root, { recursive: true, maxRetries: 5, retryDelay: 100 });
  }
});

async function fixture(kind) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "acedia-doc-upload-")); roots.push(root);
  const submissions = [];
  const submitPty = async (id, message) => { submissions.push({ id, message }); return true; };
  const service = kind === "Remote" ? new RemoteDashboardService({ baseDir: root, submitPty })
    : new LocalDashboardService({ baseDir: root, defaultPort: 0, configName: "upload.json", providers: { submitPty } });
  if (kind === "Remote") { service.config.server_port = 0; service.config.owner = "upload-fixture"; }
  services.push(service);
  const { url } = await service.start();
  const auth = kind === "Remote" ? { "cf-connecting-ip": "203.0.113.10", cookie: `multiagent_remote=${service.sign("upload-fixture")}` } : {};
  const post = (route, body, origin = url) => fetch(url + route, { method: "POST",
    headers: { "content-type": "application/json", origin, ...auth }, body: JSON.stringify(body) });
  const upload = (name, bytes, type, dataType = type) => post("/api/attachment", {
    id: "fixture", name, type, data: `data:${dataType};base64,${bytes.toString("base64")}`,
  });
  return { root, url, service, post, upload, submissions };
}

// A real uncompressed ZIP, including central directory and CRC, larger than
// the image/document limit. No archiver process or browser UI is required.
function largeZip() {
  const name = Buffer.from("data.txt"), content = Buffer.alloc(9 * 1024 * 1024, 65);
  const local = Buffer.alloc(30), central = Buffer.alloc(46), end = Buffer.alloc(22);
  local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4);
  central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
  for (const [header, offset] of [[local, 14], [central, 16]]) {
    header.writeUInt32LE(crc32(content), offset);
    header.writeUInt32LE(content.length, offset + 4); header.writeUInt32LE(content.length, offset + 8);
    header.writeUInt16LE(name.length, offset + 12);
  }
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12); end.writeUInt32LE(local.length + name.length + content.length, 16);
  return Buffer.concat([local, name, content, central, name, end]);
}

it.each(["Remote", "Dashboard"])("%s uploads TXT, MD, HTML and a 9 MiB ZIP and delivers their original bytes to the session", async kind => {
  const f = await fixture(kind), uploaded = [];
  for (const [name, bytes, type, dataType] of [
    ["pasted-text.txt", Buffer.from("  한글🙂\r\n".repeat(1800) + "  끝\r\n"), "text/plain", "text/plain;charset=utf-8"],
    ["한글 보고서.md", Buffer.from("# 작업 보고서\n한글·이모지 ✅\r\n"), "text/plain", "text/plain;charset=utf-8"],
    ["미리 보기.HTML", Buffer.from('<!doctype html><meta charset="utf-8"><h1>결과</h1><script>throw new Error("must not execute")</script>'), ""],
    ["자료 묶음.zip", largeZip(), "application/octet-stream"],
  ]) {
    const response = await f.upload(name, bytes, type, dataType);
    expect(response.status).toBe(201);
    const item = await response.json();
    expect(item.name).toBe(name); expect(item.size).toBe(bytes.length);
    expect(path.dirname(item.path)).toBe(path.join(f.root, "remote-attachments"));
    expect(fs.readFileSync(item.path).equals(bytes)).toBe(true);
    uploaded.push(item);
  }
  expect(uploaded.map(item => item.type)).toEqual(["text/plain", "text/markdown", "text/html", "application/zip"]);
  const message = remoteAttachmentMessage("확인해줘", uploaded);
  expect(message.length).toBeLessThan(8192);
  expect(message).not.toContain("한글🙂");
  expect(message).not.toContain("첨부 이미지:");
  const request = { id: "fixture", requestId: `${Date.now()}-0123456789abcdef`, message };
  expect((await f.post("/api/session/submit", request)).status).toBe(200);
  expect((await f.post("/api/session/submit", request)).status).toBe(200);
  expect(f.submissions).toEqual([{ id: "fixture", message }]);
  for (const item of uploaded) expect(message).toContain(`"${item.path}"`);
}, 30000);

it.each(["Remote", "Dashboard"])("%s preserves BOM/empty documents and rejects invalid text, oversize files and unauthorized uploads", async kind => {
  const f = await fixture(kind);
  for (const bytes of [Buffer.alloc(0), Buffer.from("\ufeff# UTF-8 한글"), Buffer.from("\ufeff# UTF-16 한글", "utf16le")]) {
    const response = await f.upload("자료.markdown", bytes, "application/octet-stream");
    expect(response.status).toBe(201);
    expect(fs.readFileSync((await response.json()).path)).toEqual(bytes);
  }
  for (const bytes of [Buffer.from([0xff, 0x80]), Buffer.from("MZ\0binary"), Buffer.from([0xff, 0xfe, 0x41])]) {
    expect((await f.upload("fake.md", bytes, "text/markdown")).status).toBe(415);
    expect((await f.upload("fake.txt", bytes, "text/plain")).status).toBe(415);
  }
  expect((await f.upload("large.html", Buffer.alloc(8 * 1024 * 1024 + 1, 65), "text/html")).status).toBe(413);
  expect((await f.upload("payload.exe", Buffer.from("payload"), "text/html")).status).toBe(415);
  expect((await f.upload("wrong.md", Buffer.from("# test"), "text/markdown", "text/html")).status).toBe(415);
  const body = { id: "fixture", name: "file.md", type: "text/markdown", data: "data:text/markdown;base64,IyB0ZXN0" };
  expect((await f.post("/api/attachment", body, "https://attacker.invalid")).status).toBe(403);
  if (kind === "Remote") {
    const response = await fetch(f.url + "/api/attachment", { method: "POST", headers: {
      "content-type": "application/json", origin: f.url, "cf-connecting-ip": "203.0.113.10",
    }, body: JSON.stringify(body) });
    expect(response.status).toBe(401);
  }
  expect(fs.readdirSync(path.join(f.root, "remote-attachments"))).toHaveLength(3);
}, 30000);

it("uses TXT for a UTF-8-heavy paste or a paste that would exceed the remaining draft length", () => {
  expect(shouldAttachPastedText("a".repeat(4000), 4000)).toBe(false);
  expect(shouldAttachPastedText("a".repeat(4001), 4000)).toBe(true);
  expect(shouldAttachPastedText("a".repeat(1000), 999)).toBe(true);
  expect(shouldAttachPastedText("가".repeat(1400), 4000)).toBe(true);
  expect(shouldAttachPastedText("a".repeat(4096))).toBe(true);
});

it("turns the full Remote paste into a TXT attachment before the textarea truncates it", async () => {
  const source = fs.readFileSync(new URL("../remote-pwa/app.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const handler = source.match(/^function handleComposerPaste\(event\) \{[\s\S]*?\n\}/m)?.[0];
  const text = "  한글🙂\r\n".repeat(1800) + "  끝\r\n";
  const attached = [];
  let prevented = false;
  const input = { maxLength: 4000, value: "원본 초안", selectionStart: 0, selectionEnd: 2 };
  const clipboard = { getData: () => text };
  const event = { currentTarget: input, clipboardData: clipboard, preventDefault() { prevented = true; } };
  vm.runInNewContext(`${handler}\nhandleComposerPaste(event);`, {
    event, File, shouldAttachPastedText,
    clipboardAttachmentFiles: () => [],
    addAttachments: files => attached.push(...files),
  });
  expect(prevented).toBe(true);
  expect(input.value).toBe("원본 초안");
  expect(attached).toHaveLength(1);
  expect(attached[0].name).toBe("pasted-text.txt");
  expect(attached[0].type).toBe("text/plain");
  expect(await attached[0].text()).toBe(text);
});
