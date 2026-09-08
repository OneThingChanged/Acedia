import { app, BrowserWindow } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { browserFormRuntimeExpression } from "../electron/services/browser-form-automation.mjs";
import { uploadBrowserFiles } from "../electron/services/browser-file-upload.mjs";
import http from "node:http";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "multiagent-browser-form-smoke-"));
app.setPath("userData", path.join(temporaryRoot, "user-data"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function execute(webContents, method, body = {}) {
  return webContents.executeJavaScript(browserFormRuntimeExpression(method, body), true);
}

async function run() {
  const window = new BrowserWindow({
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  await window.loadFile(path.join(appRoot, "electron", "services", "browser-form-fixture.html"));

  const snapshot = await execute(window.webContents, "snapshot");
  assert(snapshot.controls.some((entry) => entry.locator?.id === "enabled-feature" && entry.checked === false), "checkbox state missing");
  const displayTargetId = snapshot.controls.find((entry) => entry.locator?.id === "display-name")?.targetId;
  assert(displayTargetId, "semantic text target missing");
  const password = snapshot.controls.find((entry) => entry.locator?.id === "password");
  const upload = snapshot.controls.find((entry) => entry.locator?.id === "upload");
  assert(password?.valueState === "redacted" && password.value === "", "password value leaked");
  assert(upload?.valueState === "file" && upload.value === "", "file value leaked");

  const checked = await execute(window.webContents, "setChecked", { target: { id: "enabled-feature" }, checked: true });
  assert(checked.ok && checked.after?.checked === true && checked.changed === true, "checkbox was not checked");
  const checkedAgain = await execute(window.webContents, "setChecked", { target: { id: "enabled-feature" }, checked: true });
  assert(checkedAgain.ok && checkedAgain.skipped === true, "checkbox action was not idempotent");

  const radio = await execute(window.webContents, "setChecked", { target: { id: "mode-b" }, checked: true });
  assert(radio.ok && radio.after?.checked === true, "radio was not selected");

  const selected = await execute(window.webContents, "selectOption", { target: { id: "country" }, option: { label: "United States" } });
  assert(selected.ok && selected.after?.options?.some((entry) => entry.label === "United States" && entry.selected), "select option failed");
  const disabledOption = await execute(window.webContents, "selectOption", { target: { id: "country" }, option: { label: "Disabled" } });
  assert(disabledOption.ok === false && disabledOption.error === "disabled_option", "disabled option was not rejected");

  const typed = await execute(window.webContents, "type", { target: { targetId: displayTargetId }, text: "after" });
  assert(typed.ok && typed.after?.value === "after", "text input failed");
  await execute(window.webContents, "click", { target: { id: "rerender" } });
  const retained = await execute(window.webContents, "getControl", { target: { targetId: displayTargetId } });
  assert(retained.ok && retained.control?.value === "after", "semantic target did not survive re-render");
  const cleared = await execute(window.webContents, "clear", { target: { targetId: displayTargetId } });
  assert(cleared.ok && cleared.after?.valueState === "empty" && cleared.after?.validity?.valid === false, "clear/validation failed");

  const ambiguous = await execute(window.webContents, "getControl", { target: { label: "Duplicate action", role: "button" } });
  assert(ambiguous.ok === false && ambiguous.error === "ambiguous_target" && ambiguous.candidates?.length === 2, "ambiguous target was not rejected");

  const custom = await execute(window.webContents, "selectOption", { target: { id: "custom-combobox" }, option: { label: "Blue" } });
  assert(custom.ok && custom.after?.text === "Blue", "custom ARIA combobox failed");
  const waited = await execute(window.webContents, "waitFor", { target: { id: "custom-combobox" }, condition: "text", expected: "Blue", timeoutMs: 1_000 });
  assert(waited.ok && waited.satisfied, "wait condition failed");

  const passwordBlocked = await execute(window.webContents, "type", { target: { id: "password" }, text: "blocked" });
  assert(passwordBlocked.ok === false && passwordBlocked.error === "sensitive_control", "password typing was not blocked");

  const firstFile = path.join(temporaryRoot, "upload 한글 file.txt");
  const secondFile = path.join(temporaryRoot, "second.txt");
  fs.writeFileSync(firstFile, "browser-upload-fixture-one");
  fs.writeFileSync(secondFile, "browser-upload-fixture-two");
  let received = "";
  const server = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    received = Buffer.concat(chunks).toString("utf8");
    response.writeHead(200, { "Access-Control-Allow-Origin": "*" }); response.end("accepted");
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    await window.webContents.executeJavaScript(`(() => {
      const input = document.querySelector('#upload'); input.hidden = true;
      window.uploadEvents = [];
      input.addEventListener('input', () => window.uploadEvents.push('input'));
      input.addEventListener('change', () => {
        window.uploadEvents.push('change');
        const data = new FormData(); for (const file of input.files) data.append('files', file);
        window.uploadResult = fetch('http://127.0.0.1:${server.address().port}/upload', { method:'POST', body:data }).then(r => r.text());
      });
    })()`);
    const single = await uploadBrowserFiles(window.webContents, { selector: "#upload", files: [firstFile] });
    assert(single.ok && single.selectedCount === 1, `Hidden upload failed: ${JSON.stringify(single)}`);
    assert(await window.webContents.executeJavaScript("window.uploadResult") === "accepted", "Upload response missing");
    assert(received.includes("browser-upload-fixture-one"), "File bytes did not reach the local upload server");
    const events = await window.webContents.executeJavaScript("window.uploadEvents");
    assert(events.includes("input") && events.includes("change"), "Native upload events missing");
    const multipleRejected = await uploadBrowserFiles(window.webContents, { selector: "#upload", files: [firstFile, secondFile] });
    assert(multipleRejected.error === "file_input_does_not_allow_multiple", "Single-file input accepted multiple files");
    await window.webContents.executeJavaScript("document.querySelector('#upload').multiple = true");
    const multiple = await uploadBrowserFiles(window.webContents, { selector: "#upload", files: [firstFile, secondFile] });
    assert(multiple.ok && multiple.selectedCount === 2, "Multiple file selection failed");
    await window.webContents.executeJavaScript("window.uploadResult");
    assert(received.includes("browser-upload-fixture-one") && received.includes("browser-upload-fixture-two"), "Multiple file bytes missing");
    const redacted = await execute(window.webContents, "snapshot");
    assert(!JSON.stringify(redacted).includes(firstFile) && !JSON.stringify(redacted).includes("browser-upload-fixture-one"), "Upload paths or contents leaked through snapshot");
    assert((await uploadBrowserFiles(window.webContents, { selector: "input", files: [firstFile] })).error === "ambiguous_file_input", "Ambiguous selector accepted");
    assert((await uploadBrowserFiles(window.webContents, { selector: "#password", files: [firstFile] })).error === "not_a_file_input", "Non-file input accepted");
    await window.webContents.executeJavaScript("document.querySelector('#upload').disabled = true");
    assert((await uploadBrowserFiles(window.webContents, { selector: "#upload", files: [firstFile] })).error === "file_input_unavailable_or_disabled", "Disabled input accepted");
    assert(!window.webContents.debugger.isAttached(), "Upload debugger was not released");
  } finally {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }

  window.destroy();
  console.log("MULTIAGENT_BROWSER_FORM_SMOKE_OK");
}

void app.whenReady().then(async () => {
  try {
    await run();
    app.exit(0);
  } catch (error) {
    console.error(error?.stack || error);
    app.exit(1);
  } finally {
    try { fs.rmSync(temporaryRoot, { recursive: true, force: true }); } catch {}
  }
});
