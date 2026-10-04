import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { LocalDashboardService, RemoteDashboardService } from "./web-services.mjs";

const MiB = 1024 * 1024;
const fixtures = [];
afterEach(async () => {
  for (const { service, root } of fixtures.splice(0)) {
    await service.stop();
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith("acedia-remote-html-")) {
      throw new Error("Unexpected fixture cleanup path");
    }
    fs.rmSync(root, { recursive: true });
  }
});

async function fixture(channel = "remote") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "acedia-remote-html-"));
  const project = path.join(root, "project");
  const docs = path.join(project, "docs");
  fs.mkdirSync(docs, { recursive: true });
  const view = {
    projects: [{ id: "p1", name: "Roadmap", folder: project }],
    agents: [{ id: "a1", projectId: "p1", folder: docs }],
  };
  const service = channel === "local"
    ? new LocalDashboardService({ title: "HTML test", defaultPort: 0, baseDir: root, configName: "dashboard.json", providers: {} })
    : new RemoteDashboardService({ baseDir: root });
  fixtures.push({ root, service });
  if (channel === "local") service.sync({ view });
  else { service.config.server_port = 0; service.syncView(view); }
  const { url } = await service.start();
  const issue = (file, options) => fetch(`${url}/api/docs/preview?${new URLSearchParams({
    projectId: "p1", agentId: "a1", path: file, format: "json",
  })}`, options);
  return { project, docs, url, issue };
}

function wireRequest(url, headers = {}, method = "GET") {
  return new Promise((resolve, reject) => {
    const request = http.request(url, { headers, method }, response => {
      const chunks = [];
      response.on("data", chunk => chunks.push(chunk));
      response.once("end", () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }));
      response.once("error", reject);
    });
    request.once("error", reject);
    request.end();
  });
}

describe("large isolated Remote HTML previews", () => {
  it.each(["remote", "local"])("serves an 8MiB session HTML over gzip with relative assets and the existing sandbox on %s", async channel => {
    const { docs, url, issue } = await fixture(channel);
    const source = '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/assets/root.css">'
      + '<script src="roadmap.js"></script><h1>로드맵</h1><!--' + "fixture data ".repeat(700_000) + "-->";
    expect(Buffer.byteLength(source)).toBeGreaterThan(8 * MiB);
    fs.writeFileSync(path.join(docs, "로드맵.html"), source);
    fs.writeFileSync(path.join(docs, "roadmap.js"), "document.title='Roadmap ready'");
    const issued = await issue("로드맵.html");
    expect(issued.status).toBe(200);
    const { url: location, expiresInSeconds } = await issued.json();
    expect(expiresInSeconds).toBe(900);
    expect(location).toMatch(/^\/preview\/[A-Za-z0-9_-]{43}\/docs\//);
    const preview = await wireRequest(new URL(location, url), { "accept-encoding": "gzip", "cf-connecting-ip": "203.0.113.10" });
    expect(preview.status).toBe(200);
    expect(preview.headers["content-encoding"]).toBe("gzip");
    expect(preview.headers["content-length"]).toBeUndefined();
    expect(preview.headers.vary).toBe("Accept-Encoding");
    expect(preview.headers["content-security-policy"]).toContain("sandbox allow-scripts allow-downloads");
    expect(preview.headers["content-security-policy"]).not.toContain("allow-same-origin");
    expect(preview.headers["cache-control"]).toBe("no-store");
    const expected = source.replace('href="/assets/', `href="/preview/${location.split("/")[2]}/assets/`);
    expect(gunzipSync(preview.body).toString("utf8") === expected).toBe(true);
    expect(preview.body.length).toBeLessThan(Buffer.byteLength(source) / 50);
    const script = await fetch(new URL("roadmap.js", new URL(location, url)));
    expect(script.status).toBe(200);
    expect(await script.text()).toBe("document.title='Roadmap ready'");
    const head = await wireRequest(new URL(location, url), { "accept-encoding": "gzip" }, "HEAD");
    expect(head.status).toBe(200);
    expect(head.headers["content-encoding"]).toBe("gzip");
    expect(head.headers["content-length"]).toBeUndefined();
    expect(head.body.length).toBe(0);
  });

  it.each([
    ["identity", false], ["gzip;q=0, *;q=1", false], ["br, gzip; q=0.5", true],
    ["GZip;Q=1", true], ["*;q=1", true], ["gzip;q=invalid", false],
  ])("honors Accept-Encoding %s", async (encoding, compressed) => {
    const { docs, url, issue } = await fixture();
    const source = "<!doctype html><h1>Encoding</h1>";
    fs.writeFileSync(path.join(docs, "encoding.htm"), source);
    const { url: location } = await issue("encoding.htm").then(response => response.json());
    const result = await wireRequest(new URL(location, url), { "accept-encoding": encoding });
    expect(result.status).toBe(200);
    expect(result.headers["content-encoding"]).toBe(compressed ? "gzip" : undefined);
    expect((compressed ? gunzipSync(result.body) : result.body).toString()).toBe(source);
    if (!compressed) expect(result.headers["content-length"]).toBe(String(Buffer.byteLength(source)));
  });

  it("allows exactly 32MiB and offers a full original download above the limit", async () => {
    const { docs, url, issue } = await fixture();
    const source = Buffer.alloc(32 * MiB, 32);
    fs.writeFileSync(path.join(docs, "boundary.html"), source);
    const boundary = await issue("boundary.html");
    expect(boundary.status).toBe(200);
    const { url: location } = await boundary.json();
    const preview = await wireRequest(new URL(location, url), { "accept-encoding": "gzip" });
    expect(preview.status).toBe(200);
    expect(gunzipSync(preview.body).equals(source)).toBe(true);
    fs.appendFileSync(path.join(docs, "boundary.html"), "x");
    const over = await issue("boundary.html");
    expect(over.status).toBe(413);
    expect(await over.json()).toMatchObject({ code: "HTML_PREVIEW_TOO_LARGE", limitBytes: 32 * MiB, sizeBytes: 32 * MiB + 1 });
    // A previously issued capability must recheck a file that has grown.
    const grown = await fetch(new URL(location, url));
    expect(grown.status).toBe(413);
    expect(await grown.json()).toMatchObject({ code: "HTML_PREVIEW_TOO_LARGE", limitBytes: 32 * MiB });
    const query = new URLSearchParams({ projectId: "p1", agentId: "a1", path: "boundary.html" });
    const download = await fetch(`${url}/api/docs/download?${query}`);
    expect(download.status).toBe(200);
    expect(download.headers.get("content-length")).toBe(String(32 * MiB + 1));
    expect(download.headers.get("content-disposition")).toContain('filename="boundary.html"');
    const expectedHash = crypto.createHash("sha256").update(source).update("x").digest("hex");
    expect(crypto.createHash("sha256").update(Buffer.from(await download.arrayBuffer())).digest("hex")).toBe(expectedHash);
    expect((await issue("boundary.html", { headers: { "cf-connecting-ip": "203.0.113.10" } })).status).toBe(401);
    expect((await fetch(`${url}/api/docs/download?${query}`, { headers: { "cf-connecting-ip": "203.0.113.10" } })).status).toBe(401);
  });

  it("keeps the normal document and text asset limits separate from HTML", async () => {
    const { docs, url, issue } = await fixture();
    fs.writeFileSync(path.join(docs, "small.html"), "<h1>Small</h1>");
    const source = Buffer.alloc(2 * MiB + 1, 32);
    for (const extension of ["md", "json", "css", "js"]) fs.writeFileSync(path.join(docs, `large.${extension}`), source);
    const { url: location } = await issue("small.html").then(response => response.json());
    for (const extension of ["md", "json", "css", "js"]) {
      expect((await fetch(new URL(`large.${extension}`, new URL(location, url)))).status).toBe(413);
    }
    for (const extension of ["md", "json"]) {
      expect((await fetch(`${url}/api/docs/read?projectId=p1&path=docs/large.${extension}`)).status).toBe(413);
    }
  });
});
