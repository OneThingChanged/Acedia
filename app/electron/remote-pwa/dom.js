
function text(value) {
  return String(value ?? "").trim();
}

function make(tag, className, value) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (value != null) element.textContent = value;
  return element;
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(value); return; } catch {}
  }
  // The clipboard API is unavailable on plain LAN HTTP. Keep user-triggered
  // copies working with the browser's legacy selection-based operation.
  const focused = document.activeElement;
  const input = document.createElement("textarea");
  input.value = value;
  input.readOnly = true;
  input.style.cssText = "position:fixed;left:-9999px;top:0";
  document.body.append(input);
  try {
    input.select();
    if (!document.execCommand("copy")) throw new Error("Copy unavailable");
  } finally { input.remove(); focused?.focus({ preventScroll: true }); }
}

export { text, make, copyText };
