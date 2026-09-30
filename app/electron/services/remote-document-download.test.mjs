import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalDashboardService, RemoteDashboardService } from "./web-services.mjs";

const services = [];
const roots = [];
afterEach(async () => {
  await Promise.all(services.splice(0).map(service => service.stop()));
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

async function fixture(channel = "remote") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "acedia-document-download-"));
  roots.push(root);
  const project = path.join(root, "project");
  const other = path.join(root, "other");
  const outside = path.join(root, "outside");
  for (const dir of [path.join(project, "docs"), other, outside]) fs.mkdirSync(dir, { recursive: true });
  const source = Buffer.from("\uFEFF# 원본 문서\r\n\r\n**내용** & <script>example()</script>\r\n");
  const name = "문서 가이드 ('v1').md";
  fs.writeFileSync(path.join(project, "docs", name), source);
  fs.writeFileSync(path.join(other, "other.md"), "# Other registered project");
  fs.writeFileSync(path.join(outside, "outside.md"), "# Outside");
  const view = {
    projects: [
      { id: "p1", name: "First", folder: project },
      { id: "p2", name: "Second", folder: other },
      { id: "ssh", name: "SSH", folder: project, sshHostId: "host" },
    ],
    agents: [{ id: "a1", projectId: "p1", folder: path.join(project, "docs") }],
  };
  let service;
  if (channel === "local") {
    service = new LocalDashboardService({ title: "Test", defaultPort: 0, baseDir: root, configName: "dashboard.json", providers: {} });
    service.sync({ view });
  } else {
    service = new RemoteDashboardService({ baseDir: root });
    service.config.server_port = 0;
    service.syncView(view);
  }
  services.push(service);
  const { url } = await service.start();
  const download = (requestedPath, options, extra = {}) => fetch(`${url}/api/docs/download?${new URLSearchParams({ projectId: "p1", path: requestedPath, ...extra })}`, options);
  return { root, project, other, outside, source, name, url, download };
}

describe("Remote original document downloads", () => {
  it.each(["remote", "local"])("downloads original bytes with UTF-8 filenames and body-free HEAD on %s", async channel => {
    const { download, source, name } = await fixture(channel);
    const response = await download(`docs/${name}`);
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(source);
    expect(response.headers.get("content-type")).toBe("application/octet-stream");
    expect(response.headers.get("content-length")).toBe(String(source.length));
    const disposition = response.headers.get("content-disposition");
    expect(disposition).toMatch(/^attachment; filename="[\x20-\x7e]+"; filename\*=UTF-8''/);
    expect(decodeURIComponent(disposition.split("filename*=UTF-8''")[1])).toBe(name);
    expect(disposition).toContain("%27v1%27");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    const head = await download(`docs/${name}`, { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(head.headers.get("content-disposition")).toBe(disposition);
    expect(head.headers.get("content-length")).toBe(String(source.length));
    expect(await head.text()).toBe("");
  });

  it("preserves original HTML, JSON, image and video files instead of rendered previews", async () => {
    const { project, download } = await fixture();
    for (const extension of ["html", "json", "png", "svg", "mp4", "webm"]) {
      const source = extension === "html" ? Buffer.from('<a href="/api/state">original</a><script>example()</script>') : Buffer.from([0, 1, 127, 128, 255]);
      fs.writeFileSync(path.join(project, `source.${extension}`), source);
      const response = await download(`source.${extension}`);
      expect(response.status).toBe(200);
      expect(Buffer.from(await response.arrayBuffer())).toEqual(source);
      expect(response.headers.get("content-disposition")).toContain(`filename="source.${extension}"`);
    }
  });

  it("downloads large and empty documents even when the preview size limit is exceeded", async () => {
    const { project, url, download } = await fixture();
    const source = Buffer.alloc(2 * 1024 * 1024 + 1, 65);
    fs.writeFileSync(path.join(project, "large.md"), source);
    fs.writeFileSync(path.join(project, "empty.md"), "");
    expect((await fetch(`${url}/api/docs/read?projectId=p1&path=large.md`)).status).toBe(413);
    const response = await download("large.md");
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer()).equals(source)).toBe(true);
    const empty = await download("empty.md");
    expect(empty.status).toBe(200);
    expect(empty.headers.get("content-length")).toBe("0");
    expect(await empty.text()).toBe("");
  });

  it("resolves session-relative and registered absolute paths to the same source", async () => {
    const { project, other, source, name, download } = await fixture();
    const session = await download(name, undefined, { agentId: "a1" });
    expect(Buffer.from(await session.arrayBuffer())).toEqual(source);
    const absolute = await download(path.join(project, "docs", name));
    expect(Buffer.from(await absolute.arrayBuffer())).toEqual(source);
    const anotherProject = await download(path.join(other, "other.md"));
    expect(anotherProject.status).toBe(200);
    expect(await anotherProject.text()).toBe("# Other registered project");
  });

  it("rejects traversal, external junctions, unsupported files, missing files and SSH projects", async () => {
    const { project, outside, download } = await fixture();
    fs.writeFileSync(path.join(project, "blocked.exe"), "blocked");
    fs.symlinkSync(outside, path.join(project, "docs", "escape"), process.platform === "win32" ? "junction" : "dir");
    for (const [requestedPath, status] of [
      ["../outside/outside.md", 403],
      [path.join(outside, "outside.md"), 403],
      ["docs/escape/outside.md", 403],
      ["blocked.exe", 415],
      ["missing.md", 404],
      ["docs", 404],
    ]) {
      const response = await download(requestedPath);
      expect(response.status, requestedPath).toBe(status);
      expect(response.headers.get("content-disposition")).toBeNull();
    }
    expect((await download("missing.md", undefined, { projectId: "ssh" })).status).toBe(409);
  });

  it("requires Remote authentication for both GET and HEAD downloads", async () => {
    const { name, download } = await fixture();
    for (const method of ["GET", "HEAD"]) {
      const response = await download(`docs/${name}`, { method, headers: { "cf-connecting-ip": "203.0.113.10" } });
      expect(response.status).toBe(401);
      expect(response.headers.get("content-disposition")).toBeNull();
    }
  });
});
