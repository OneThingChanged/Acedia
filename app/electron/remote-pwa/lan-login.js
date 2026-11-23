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
const openDashboard = () => location.replace(remotePath("/") + location.search);
const request = (path, options) => fetch(remotePath(path), {
  credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(10_000), ...options,
});

help.hidden = Boolean(accessKey);
connecting.hidden = !accessKey;

async function readMode() {
  const response = await request("/auth/mode");
  if (!response.ok) throw new Error();
  const mode = await response.json();
  setLanguage(mode.language);
  return mode;
}

try {
  const mode = await readMode();
  if (mode.authenticated || mode.directAccess) {
    openDashboard();
  } else if (accessKey) {
    const response = await request("/auth/lan", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accessKey }),
    });
    if (response.ok) {
      if ((await readMode()).authenticated) openDashboard();
      else showError("로그인 쿠키가 적용되지 않았습니다. 이 주소의 쿠키를 허용한 뒤 접속 링크를 다시 여세요.");
    } else {
      showError(response.status === 429 ? "시도가 너무 많습니다. 1분 후 다시 시도하세요." : "접속 링크가 만료되었거나 올바르지 않습니다.");
    }
  }
} catch { showError("서버에 연결하지 못했습니다. 다시 시도해 주세요."); }
if (!error.hidden) {
  connecting.hidden = true;
  help.hidden = false;
}
