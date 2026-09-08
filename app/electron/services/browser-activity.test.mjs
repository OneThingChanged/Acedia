import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { BrowserActivity } from "./browser-activity.mjs";

const roots = [];
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));
function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "browser-activity-"));
  roots.push(directory);
  const shell = { showItemInFolder: vi.fn() };
  const options = { directory, downloadsDirectory: directory, ownerOf: id => id === 1, shell };
  return { directory, shell, options, activity: new BrowserActivity(options) };
}
it("persists visits and title updates, excludes credentials, and removes history", () => {
  const { activity, options } = fixture();
  activity.visit({ id: 1 }, "https://example.com/page", "First");
  activity.visit({ id: 1 }, "https://example.com/page", "Final", { replace: true });
  activity.visit({ id: 1 }, "https://example.com/callback?code=secret", "OAuth");
  activity.visit({ id: 1 }, "file:///private", "File");
  expect(activity.list().history).toHaveLength(1);
  const loaded = new BrowserActivity(options);
  expect(loaded.list().history[0].title).toBe("Final");
  loaded.action("remove-history", loaded.list().history[0].id);
  expect(new BrowserActivity(options).list().history).toHaveLength(0);
});
it("tracks shared-session downloads once, restricts owners and preserves downloaded files when clearing", () => {
  const { activity, directory, shell, options } = fixture();
  const session = new EventEmitter();
  for (const id of [1, 2]) { const contents = new EventEmitter(); contents.id = id; contents.session = session; activity.attach(contents); }
  expect(session.listenerCount("will-download")).toBe(1);
  const item = new EventEmitter();
  Object.assign(item, { getFilename: () => "test.txt", getURL: () => "https://example.com/file", getTotalBytes: () => 10,
    getReceivedBytes: () => 10, getSavePath: () => path.join(directory, "test.txt"), setSaveDialogOptions: vi.fn(), cancel: vi.fn() });
  session.emit("will-download", {}, item, { id: 2 });
  expect(activity.list().downloads).toHaveLength(0);
  session.emit("will-download", {}, item, { id: 1 });
  const id = activity.list().downloads[0].id;
  activity.action("clear-downloads");
  expect(activity.list().downloads).toHaveLength(1);
  expect(new BrowserActivity(options).list().downloads[0].state).toBe("interrupted");
  activity.action("cancel", id); expect(item.cancel).toHaveBeenCalledOnce();
  fs.writeFileSync(item.getSavePath(), "downloaded");
  item.emit("updated", {}, "progressing"); item.emit("done", {}, "completed");
  activity.action("show-folder", id);
  expect(shell.showItemInFolder).toHaveBeenCalledWith(item.getSavePath());
  expect(new BrowserActivity(options).list().downloads[0].state).toBe("completed");
  activity.action("clear-downloads");
  expect(fs.existsSync(item.getSavePath())).toBe(true);
  expect(activity.list().downloads).toHaveLength(0);
});
