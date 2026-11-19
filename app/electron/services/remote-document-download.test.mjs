import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalDashboardService, RemoteDashboardService } from "./web-services.mjs";

const services = [];
const roots = [];
afterEach(async () => {
  await Promise.all(services.splice(0).map(service => service.stop()));
  for (const root of roots.splice(0)) {
    expect(path.dirname(root)).toBe(path.resolve(os.tmpdir()));
    expect(path.basename(root)).toMatch(/^acedia-document-download-/);
    fs.rmSync(root, { recursive: true });
  }
});

async function fixture(channel = "remote", publicHostname = "") {
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
    service.config.public_hostname = publicHostname;
    service.syncView(view);
  }
  services.push(service);
  const { url } = await service.start();
  const download = (requestedPath, options, extra = {}) => fetch(`${url}/api/docs/download?${new URLSearchParams({ projectId: "p1", path: requestedPath, ...extra })}`, options);
  return { root, project, other, outside, source, name, url, download, service };
}

describe("Remote original document downloads", () => {
  it("previews recent JSONL lines and streams the full original for the Remote owner on a mounted address", async () => {
    const { project, outside, url, download, service } = await fixture("remote", "agent.example.com/acedia");
    service.config.owner = "owner";
    service.access.approved = ["guest"];
    const directory = path.join(outside, ".codex", "sessions");
    fs.mkdirSync(directory, { recursive: true });
    const file = path.join(directory, "rollout-작업.JSONL");
    const recent = '{"message":"최근 결과 <script>example()</script>"}\r\n{"message":"마지막 줄"}\r\n';
    const source = Buffer.from(`{"older":"${"x".repeat(27 * 1024 * 1024)}"}\r\n${recent}`);
    fs.writeFileSync(file, source);
    fs.writeFileSync(path.join(project, "docs", "small.jsonl"), recent);
    const headers = login => ({ "cf-connecting-ip": "203.0.113.5", ...(login ? { cookie: `${service.cookieName()}=${service.sign(login)}` } : {}) });
    const read = (filename, login) => fetch(`${url}/api/docs/read?${new URLSearchParams({ projectId: "p1", path: filename })}`, { headers: headers(login) });

    const preview = await read(file, "owner");
    expect(preview.status).toBe(200);
    expect(preview.headers.get("cache-control")).toBe("no-store");
    expect(await preview.json()).toMatchObject({ name: path.basename(file), kind: "text", truncated: true, content: recent, size: source.length });
    const small = await read("docs/small.jsonl", "owner");
    expect(await small.json()).toMatchObject({ truncated: false, content: recent });
    expect((await read(file, null)).status).toBe(401);
    expect((await read(file, "guest")).status).toBe(403);
    expect((await read("docs/small.jsonl", "guest")).status).toBe(403);
    for (const [login, kind] of [["owner", "text"], ["guest", null]]) {
      const folder = await fetch(`${url}/api/files/folder?projectId=p1&path=docs`, { headers: headers(login) });
      expect(folder.status).toBe(200);
      expect((await folder.json()).entries.find(item => item.name === "small.jsonl")).toMatchObject({ kind });
    }

    const head = await download(file, { method: "HEAD", headers: headers("owner") });
    expect(head.status).toBe(200);
    expect(head.headers.get("content-length")).toBe(String(source.length));
    expect(await head.text()).toBe("");
    const original = await download(file, { headers: headers("owner") });
    expect(original.status).toBe(200);
    expect(original.headers.get("content-disposition")).toBe(head.headers.get("content-disposition"));
    expect(Buffer.from(await original.arrayBuffer()).equals(source)).toBe(true);
    for (const method of ["GET", "HEAD"]) {
      expect((await download(file, { method, headers: headers(null) })).status).toBe(401);
      expect((await download(file, { method, headers: headers("guest") })).status).toBe(403);
      expect((await download("docs/small.jsonl", { method, headers: headers("guest") })).status).toBe(403);
    }
  });

  it.each(['remote', 'local', 'mounted'])('streams Office/PDF and document attachments with original names and bytes on %s', async channel => {
    const { project, url, download } = await fixture(channel === 'local' ? 'local' : 'remote', channel === 'mounted' ? 'agent.example.com/dddd' : '');
    const extensions = ['PPTX', 'ppt', 'pps', 'ppsx', 'potx', 'docx', 'doc', 'dotx', 'xlsx', 'xls', 'xltx', 'pdf', 'odt', 'ods', 'odp', 'rtf', 'hwp', 'hwpx'];
    const source = Buffer.from([0x50, 0x4b, 3, 4, 0, 255, 128, 0, 10, 13]);
    for (const extension of extensions) {
      const name = `주간 보고 ('최종').${extension}`;
      fs.writeFileSync(path.join(project, 'docs', name), source);
      const head = await download(`docs/${name}`, { method: 'HEAD' });
      expect(head.status, name).toBe(200); expect(await head.text()).toBe('');
      expect(head.headers.get('content-length')).toBe(String(source.length));
      expect(decodeURIComponent(head.headers.get('content-disposition').split("filename*=UTF-8''")[1])).toBe(name);
      const response = await download(name, undefined, { agentId: 'a1' });
      expect(response.status, name).toBe(200);
      expect(response.headers.get('content-type')).toBe('application/octet-stream');
      expect(response.headers.get('content-disposition')).toBe(head.headers.get('content-disposition'));
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(Buffer.from(await response.arrayBuffer())).toEqual(source);
      expect((await fetch(`${url}/api/docs/read?${new URLSearchParams({projectId:'p1',path:`docs/${name}`})}`)).status).toBe(415);
    }
    const folder = await fetch(`${url}/api/files/folder?projectId=p1&path=docs`).then(response => response.json());
    expect(folder.entries.filter(entry => extensions.some(extension => entry.name.endsWith('.' + extension))).map(entry => entry.kind)).toEqual(extensions.map(() => 'download'));
  });

  it('keeps authentication and owner/project boundaries for binary document downloads at a mounted address', async () => {
    const { project, outside, url, download, service } = await fixture('remote', 'agent.example.com/acedia');
    service.config.owner = 'owner'; service.access.approved = ['guest'];
    const source = Buffer.from([0x50, 0x4b, 0, 255]);
    fs.writeFileSync(path.join(project, 'docs', 'result.pptx'), source);
    fs.writeFileSync(path.join(project, 'docs', 'result.pptx.exe'), source);
    fs.writeFileSync(path.join(outside, 'result.pptx'), source);
    fs.symlinkSync(outside, path.join(project, 'docs', 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
    const headers = login => ({ 'cf-connecting-ip': '203.0.113.5', ...(login ? { cookie: `${service.cookieName()}=${service.sign(login)}` } : {}) });
    for (const method of ['GET', 'HEAD']) {
      expect((await download('docs/result.pptx', { method, headers: headers() })).status).toBe(401);
      for (const login of ['guest', 'owner']) {
        const result = await download('docs/result.pptx', { method, headers: headers(login) });
        expect(result.status).toBe(200); if (method === 'GET') expect(Buffer.from(await result.arrayBuffer())).toEqual(source);
        expect((await download('../outside/result.pptx', { method, headers: headers(login) })).status).toBe(403);
        expect((await download('docs/escape/result.pptx', { method, headers: headers(login) })).status).toBe(403);
        expect((await download('docs/result.pptx.exe', { method, headers: headers(login) })).status).toBe(415);
        expect((await download('docs/missing.pptx', { method, headers: headers(login) })).status).toBe(404);
      }
      expect((await download(path.join(outside, 'result.pptx'), { method, headers: headers('guest') })).status).toBe(403);
      expect((await download(path.join(outside, 'result.pptx'), { method, headers: headers('owner') })).status).toBe(200);
    }
  });

  it.each(['remote', 'local'])('downloads ZIP links and folder entries without treating the binary as text on %s', async channel => {
    const { project, outside, url, download } = await fixture(channel);
    const name = '연동 묶음 (공개키).ZIP', source = Buffer.from([0x50,0x4b,3,4,0,0,0,0,255,128,0,0]);
    fs.writeFileSync(path.join(project, 'docs', name), source);
    fs.writeFileSync(path.join(outside, 'owner-result.zip'), source);
    const folder = await fetch(`${url}/api/files/folder?${new URLSearchParams({ projectId:'p1', path:'docs' })}`).then(response => response.json());
    expect(folder.entries.find(file => file.name === name)).toMatchObject({ kind:'archive' });
    for (const [requested, extra] of [[`docs/${name}`, {}], [name, {agentId:'a1'}], [path.join(project,'docs',name), {}], [path.join(outside,'owner-result.zip'), {}]]) {
      const head = await download(requested, {method:'HEAD'}, extra);
      expect(head.status, requested).toBe(200);expect(await head.text()).toBe('');
      expect(head.headers.get('content-length')).toBe(String(source.length));
      expect(head.headers.get('content-disposition')).toMatch(/^attachment;/);
      const response = await download(requested, undefined, extra);
      expect(response.status, requested).toBe(200);
      expect(response.headers.get('content-type')).toBe('application/octet-stream');
      expect(Buffer.from(await response.arrayBuffer())).toEqual(source);
    }
    expect((await download('../outside/owner-result.zip')).status).toBe(403);
    if (channel === 'remote') for (const method of ['GET', 'HEAD']) {
      expect((await download('docs/'+name, {method,headers:{'cf-connecting-ip':'203.0.113.10'}})).status).toBe(401);
    }
    expect((await fetch(`${url}/api/docs/read?${new URLSearchParams({projectId:'p1',path:'docs/'+name})}`)).status).toBe(415);
  });
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
    fs.writeFileSync(path.join(project, "large.pptx"), source);
    fs.writeFileSync(path.join(project, "empty.md"), "");
    expect((await fetch(`${url}/api/docs/read?projectId=p1&path=large.md`)).status).toBe(413);
    const response = await download("large.md");
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer()).equals(source)).toBe(true);
    const presentation = await download('large.pptx');
    expect(presentation.status).toBe(200);
    expect(Buffer.from(await presentation.arrayBuffer()).equals(source)).toBe(true);
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
      ["docs/escape/outside.md", 403],
      ["blocked.exe", 415],
      ["missing.md", 404],
      ["docs", 404],
    ]) {
      const response = await download(requestedPath);
      expect(response.status, requestedPath).toBe(status);
      expect(response.headers.get("content-disposition")).toBeNull();
    }
    const ownerExternal = await download(path.join(outside, 'outside.md'));
    expect(ownerExternal.status).toBe(200);
    expect(await ownerExternal.text()).toBe('# Outside');
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
