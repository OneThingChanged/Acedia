import { t, setLanguage, bindShellTranslations } from "./i18n.js";

bindShellTranslations(document);
const form = document.querySelector("#lanForm");
const input = document.querySelector("#lanCode");
const button = document.querySelector("#lanConnect");
const error = document.querySelector("#lanError");
const showError = value => { error.textContent = t(value); error.hidden = false; };

try {
  const response = await fetch("/auth/mode", { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw new Error();
  const mode = await response.json();
  setLanguage(mode.language);
} catch { showError("서버에 연결하지 못했습니다. 다시 시도해 주세요."); }

form.addEventListener("submit", async event => {
  event.preventDefault();
  if (button.disabled) return;
  const code = input.value.replace(/\s/g, "");
  if (!/^\d{8}$/.test(code)) { showError("8자리 연결 코드를 입력하세요."); input.focus(); return; }
  button.disabled = true;
  error.hidden = true;
  try {
    const response = await fetch("/auth/lan", {
      method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }),
    });
    if (!response.ok) {
      showError(response.status === 429 ? "시도가 너무 많습니다. 1분 후 다시 시도하세요." : "호스트 PC에 표시된 연결 코드를 확인하세요.");
      input.focus(); input.select(); return;
    }
    // Preserve session/screen links without accepting external redirect targets.
    location.replace(`/${location.search}`);
  } catch { showError("서버에 연결하지 못했습니다. 다시 시도해 주세요."); }
  finally { button.disabled = false; }
});
