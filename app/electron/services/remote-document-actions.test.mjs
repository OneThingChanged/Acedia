import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { RemoteDashboardService } from "./web-services.mjs";

const services = [];
const roots = [];
afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.stop()));
  roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
});

it("shows only a listed document path and trashes it for an authenticated same-origin request", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "acedia-doc-actions-"));
  roots.push(root);
  const projectRoot = path.join(root, "project");
  fs.mkdirSync(path.join(projectRoot, "docs"), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, "node_modules"));
  const document = path.join(projectRoot, "docs", "report.md");
  const outside = path.join(root, "outside.md");
  fs.writeFileSync(document, "# Report");
  fs.writeFileSync(outside, "# Outside");
  fs.writeFileSync(path.join(projectRoot, "notes.txt"), "do not delete");
  fs.writeFileSync(path.join(projectRoot, "node_modules", "hidden.md"), "# Hidden");
  let linkCreated = false;
  try {
    fs.symlinkSync(outside, path.join(projectRoot, "docs", "linked.md"));
    linkCreated = true;
  } catch { /* Windows hosts without symlink privileges still test traversal. */ }

  const trashDocument = vi.fn(async (file) => fs.renameSync(file, path.join(root, "trashed.md")));
  const service = new RemoteDashboardService({ baseDir: root, trashDocument });
  services.push(service);
  service.config.server_port = 0;
  service.config.owner = "owner";
  service.syncView({ projects: [{ id: "project", name: "Project", folder: projectRoot }], agents: [] });
  const { url } = await service.start();
  const query = (file) => new URLSearchParams({ projectId: "project", path: file });
  const owner = { cookie: `multiagent_remote=${service.sign("owner")}`, "cf-connecting-ip": "203.0.113.10" };
  const deletion = (file, headers = owner) => fetch(`${url}/api/docs/file?${query(file)}`, {
    method: "DELETE", headers: { ...headers, origin: url },
  });

  expect((await fetch(`${url}/api/docs/path?${query("docs/report.md")}`, { headers: owner }).then((response) => response.json())))
    .toEqual({ path: document, relativePath: "docs/report.md" });
  expect((await fetch(`${url}/api/docs/path?${query("docs/report.md")}`, {
    headers: { "cf-connecting-ip": "203.0.113.10" },
  })).status).toBe(401);
  expect((await fetch(`${url}/api/docs/path?${query("../outside.md")}`, { headers: owner })).status).toBe(400);
  expect((await deletion("docs/report.md", { "cf-connecting-ip": "203.0.113.10" })).status).toBe(401);
  expect((await fetch(`${url}/api/docs/file?${query("docs/report.md")}`, {
    method: "DELETE", headers: { ...owner, origin: "https://other.example" },
  })).status).toBe(403);
  for (const file of ["../outside.md", outside, "notes.txt", "node_modules/hidden.md", "docs"]) {
    expect((await deletion(file)).ok).toBe(false);
  }
  if (linkCreated) expect((await deletion("docs/linked.md")).status).toBe(403);
  expect(trashDocument).not.toHaveBeenCalled();
  expect(fs.existsSync(outside)).toBe(true);

  const deleted = await deletion("docs/report.md");
  expect(deleted.status).toBe(200);
  expect(await deleted.json()).toEqual({ ok: true, path: "docs/report.md" });
  expect(trashDocument).toHaveBeenCalledOnce();
  expect(trashDocument).toHaveBeenCalledWith(document);
  expect(fs.existsSync(document)).toBe(false);
  expect(fs.readFileSync(path.join(root, "trashed.md"), "utf8")).toBe("# Report");
  expect((await fetch(`${url}/api/docs?projectId=project`, { headers: owner }).then((response) => response.json())).documents)
    .toEqual([]);
});
