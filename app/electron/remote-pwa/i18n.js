import { messages } from "./translations.js";

const languages = ["ko", "en", "zh-CN", "zh-TW", "ja", "es"];
const catalog = new Map();
for (const row of messages) {
  catalog.set(row[0], row);
  if (!catalog.has(row[1])) catalog.set(row[1], row);
}
let language = "en";
const bindings = [];

export function getLanguage() { return language; }

export function t(source, values = []) {
  const row = catalog.get(source);
  const translated = row ? row[languages.indexOf(language)] || row[1] : source;
  return translated.replace(/\{(\d+)\}/g, (match, index) => (
    index < values.length ? String(values[index] ?? "") : match
  ));
}

// Capture only the trusted initial app shell. Never observe or translate user
// messages, project names, documents, terminal output, or subsequently added DOM.
export function bindShellTranslations(root) {
  const walker = root.createTreeWalker(root.body, 4);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const source = node.nodeValue.trim();
    if (catalog.has(source)) bindings.push({ node, source });
  }
  for (const node of root.querySelectorAll("[title], [aria-label], [placeholder], [alt], meta[name=description]")) {
    for (const attribute of ["title", "aria-label", "placeholder", "alt", "content"]) {
      const source = node.getAttribute(attribute);
      if (source && catalog.has(source)) bindings.push({ node, source, attribute });
    }
  }
  applyShell();
}

function applyShell() {
  if (typeof document === "undefined") return;
  document.documentElement.lang = language;
  for (const { node, source, attribute } of bindings) {
    if (!node.isConnected) continue;
    if (attribute) node.setAttribute(attribute, t(source));
    else node.nodeValue = t(source);
  }
  document.querySelector(".composer")?.setAttribute("data-drop-label", t("이미지를 놓아 첨부"));
}

export function setLanguage(value) {
  const next = languages.includes(value) ? value : "en";
  if (language === next) return false;
  language = next;
  applyShell();
  return true;
}

export function monthLabel(month, style = "short") {
  return new Intl.DateTimeFormat(language, { month: style }).format(new Date(2024, Number(month) - 1, 1));
}

export function bucketLabel(bucket, mode) {
  const key = String(bucket?.key || bucket?.date || "");
  if (/^\d{4}-\d{2}(?:-\d{2})?$/.test(key)) {
    const [year, month, day = 1] = key.split("-").map(Number);
    return new Intl.DateTimeFormat(language, mode === "year" ? { month: "short" } : { month: "short", day: "numeric" }).format(new Date(year, month - 1, day));
  }
  return String(bucket?.label || key);
}
