import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyBundledGit } from "./bundle-git-runtime.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);
const { listPackage } = require("@electron/asar");
const company = process.argv.includes("--company");
const store = process.argv.includes("--store");
if (company && store) throw new Error("Choose only one packaged build variant.");
const variant = company ? "company" : store ? "store" : "standard";
const executable = path.join(
  appRoot,
  "electron-dist",
  ...(variant === "standard" ? [] : [variant]),
  "win-unpacked",
  company ? "AcediaCompany.exe" : "Acedia.exe"
);
const marker = "MULTIAGENT_ELECTRON_BRIDGE_OK";
const variantMarker = `variant=${variant}`;

if (!fs.existsSync(executable)) {
  console.error("Packaged Electron executable is missing. Run npm run electron:pack first.");
  process.exit(1);
}

const asarPath = path.join(path.dirname(executable), "resources", "app.asar");
await verifyBundledGit(path.join(path.dirname(executable), "resources"));
const asarEntries = new Set(listPackage(asarPath).map((entry) => entry.replaceAll("/", "\\")));
for (const entry of [
  "\\electron\\remote-pwa\\index.html",
  "\\electron\\remote-pwa\\app.js",
  "\\electron\\remote-pwa\\styles.css",
  "\\electron\\remote-pwa\\account-pool.js",
  "\\electron\\remote-pwa\\usage-sessions.js",
  "\\electron\\services\\usage-session-summary.mjs",
  "\\electron\\services\\account-pool.mjs",
  "\\electron\\services\\account-pool-rpc.mjs",
  "\\electron\\remote-pwa\\vendor\\xterm.js",
]) {
  if (!asarEntries.has(entry)) {
    console.error(`Packaged Dashboard asset is missing: ${entry}`);
    process.exit(1);
  }
}
for (const apkEntry of [
  "\\electron\\remote-pwa\\downloads\\Acedia-Mobile.apk",
  "\\electron\\remote-pwa\\downloads\\MultiAgent-Mobile.apk",
]) {
  if (asarEntries.has(apkEntry)) {
    console.error("Packaged app unexpectedly contains a source-tree Remote APK.");
    process.exit(1);
  }
}
const stagedApk = path.join(path.dirname(executable), "resources", "mobile", "Acedia-Mobile.apk");
if ([...asarEntries].some(entry => /(?:^|\\)ref(?:\\|$)/i.test(entry))) {
  throw new Error("Reference files must not be included in the application package.");
}
if ((company || store) && fs.existsSync(stagedApk)) {
  console.error(`${variant} package unexpectedly contains the verified Remote APK resource.`);
  process.exit(1);
}
if (variant === "standard" && !fs.statSync(stagedApk, { throwIfNoEntry: false })?.isFile()) {
  console.error("Standard package is missing the verified Remote APK resource.");
  process.exit(1);
}

const userDataDir = fs.mkdtempSync(
  path.join(os.tmpdir(), "multiagent-electron-packaged-smoke-")
);
const localDataDir = path.join(userDataDir, "local-data");
fs.mkdirSync(localDataDir, { recursive: true });
const monitorPort = await new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : null;
    server.close((error) => error ? reject(error) : resolve(port));
  });
});
fs.writeFileSync(
  path.join(localDataDir, "monitor-config.json"),
  JSON.stringify({ enabled: true, serverPort: monitorPort }),
  "utf8",
);
const env = {
  ...process.env,
  MULTIAGENT_ELECTRON_BRIDGE_SMOKE: "1",
  MULTIAGENT_ELECTRON_USER_DATA: userDataDir,
  MULTIAGENT_LOCAL_DATA: localDataDir,
  MULTIAGENT_MONITOR_PORT: String(monitorPort),
};
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(executable, [], {
  cwd: path.dirname(executable),
  env,
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
let output = "";
let finished = false;
let bridgeReady = false;
let dashboardReady = false;
let gitReady = false;

function finishWhenReady() {
  if (bridgeReady && dashboardReady && gitReady) {
    finish(0, `[electron-smoke] PACKAGED_DASHBOARD_OK port=${monitorPort}`);
  }
}

function finish(code, message) {
  if (finished) return;
  finished = true;
  clearTimeout(timeout);
  if (!child.killed) child.kill();
  if (message) console.log(message);
  process.exitCode = code;
}

// Wait for Chromium to release the isolated profile before removing it.
child.once("close", () => {
  const relative = path.relative(fs.realpathSync(os.tmpdir()), fs.realpathSync(userDataDir));
  if (!relative.startsWith("multiagent-electron-packaged-smoke-") || relative.includes(path.sep)) throw new Error("Unexpected smoke profile cleanup path.");
  fs.rmSync(userDataDir, { recursive: true, maxRetries: 5, retryDelay: 100 });
});
child.once("error", error => finish(1, error.message));

child.stdout.on("data", (chunk) => {
  const text = chunk.toString();
  output += text;
  process.stdout.write(text);
  if (output.includes("MULTIAGENT_PACKAGED_GIT_QUERY_OK")) gitReady = true;
  if (output.includes(marker) && output.includes(variantMarker)) {
    bridgeReady = true;
    finishWhenReady();
  }
});
child.stderr.on("data", (chunk) => process.stderr.write(chunk));
child.on("exit", (code) => {
  if (!finished) {
    finish(
      bridgeReady && dashboardReady && gitReady ? 0 : 1,
      `Packaged Electron exited before verification completed (bridge=${bridgeReady}, dashboard=${dashboardReady}, git=${gitReady}, code=${code}).`,
    );
  }
});

void (async () => {
  while (!finished && !dashboardReady) {
    try {
      const response = await fetch(`http://127.0.0.1:${monitorPort}/`, {
        signal: AbortSignal.timeout(800),
      });
      const html = response.ok ? await response.text() : "";
      if (html.includes('class="app-shell"') && html.includes("/pwa/app.js")) {
        dashboardReady = true;
        finishWhenReady();
        return;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
})();

const timeout = setTimeout(() => {
  console.error("Packaged Electron bridge smoke test timed out.");
  finish(1);
}, 20000);
