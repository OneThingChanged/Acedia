import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { guardConsoleOutput } from "../electron/services/stdio-logging.mjs";

const require = createRequire(import.meta.url);
if (process.versions.electron) {
  const { app } = require("electron");
  const errors = [];
  guardConsoleOutput();
  for (const [name, stream] of [["stdout", process.stdout], ["stderr", process.stderr]]) stream.on("error", error => errors.push({ stream: name, code: error.code }));
  app.setPath("userData", path.join(process.env.ACEDIA_STDIO_FIXTURE, "profile"));
  app.on("window-all-closed", () => {});
  process.on("uncaughtException", error => {
    fs.writeFileSync(path.join(process.env.ACEDIA_STDIO_FIXTURE, "report.json"), JSON.stringify({ failed: error.message })); app.exit(1);
  });
  app.whenReady().then(() => {
    console.log("STDIO_READY");
    setTimeout(() => { console.log("first write after pipe closes"); console.error("first stderr write"); }, 300);
    setTimeout(() => { console.log("second write"); console.error("second stderr write"); }, 600);
    setTimeout(() => {
      fs.writeFileSync(path.join(process.env.ACEDIA_STDIO_FIXTURE, "report.json"), JSON.stringify({ completed: true, errors })); app.exit(0);
    }, 1000);
  });
} else {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "acedia-stdio-smoke-"));
  try {
    const env = { ...process.env, ACEDIA_STDIO_FIXTURE: root }; delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(require("electron"), [fileURLToPath(import.meta.url)], { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let ready = "";
    child.stdout.on("data", chunk => {
      ready += chunk.toString();
      if (ready.includes("STDIO_READY")) { child.stdout.destroy(); child.stderr.destroy(); }
    });
    const timeout = setTimeout(() => child.kill(), 15000);
    const code = await new Promise((resolve, reject) => { child.once("exit", resolve); child.once("error", reject); }).finally(() => clearTimeout(timeout));
    const report = JSON.parse(fs.readFileSync(path.join(root, "report.json"), "utf8"));
    if (code !== 0 || !report.completed || !["stdout", "stderr"].every(stream => report.errors.some(error => error.stream === stream && error.code === "EPIPE"))) {
      throw new Error("Closed-pipe Electron smoke failed: " + JSON.stringify(report));
    }
    console.log("ELECTRON_STDIO_EPIPE_OK stdout/stderr disconnected; app remained alive without uncaught errors");
  } finally {
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith("acedia-stdio-smoke-")) throw Error("Unexpected fixture cleanup path");
    try { fs.rmSync(root, { recursive: true }); } catch { /* Chromium may retain its isolated cache until exit. */ }
  }
}
