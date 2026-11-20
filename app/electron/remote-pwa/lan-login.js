import { remotePath } from './base-path.js';
import { t, setLanguage, bindShellTranslations } from "./i18n.js";

const accessKey = new URLSearchParams(location.hash.slice(1)).get("access");
if (location.hash) history.replaceState(history.state, "", location.pathname + location.search);
// Pasting a link while already on the help page can navigate only its fragment.
window.addEventListener("hashchange", () => { if (location.hash) location.reload(); });

bindShellTranslations(document);
const help = document.querySelector("#lanHelp");
const connecting = document.querySelector("#lanConnecting");
const error = document.querySelector("#lanError");
const showError = value => { error.textContent = t(value); error.hidden = false; };
help.hidden = Boolean(accessKey);
connecting.hidden = !accessKey;

try {
  const response = await fetch(remotePath("/auth/mode"), { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw new Error();
  const mode = await response.json();
  setLanguage(mode.language);
} catch { showError("서버에 연결하지 못했습니다. 다시 시도해 주세요."); }

if (accessKey) {
  error.hidden = true;
  try {
    const response = await fetch(remotePath("/auth/lan"), {
      method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ accessKey }),
    });
    if (response.ok) location.replace(remotePath("/") + location.search);
    else showError(response.status === 429 ? "시도가 너무 많습니다. 1분 후 다시 시도하세요." : "접속 링크가 만료되었거나 올바르지 않습니다.");
  } catch { showError("서버에 연결하지 못했습니다. 다시 시도해 주세요."); }
  if (!error.hidden) {
    connecting.hidden = true;
    help.hidden = false;
  }
}
