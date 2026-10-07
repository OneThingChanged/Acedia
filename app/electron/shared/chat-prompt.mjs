// Shared by desktop Chat and the Remote/Dashboard client. Question visibility
// must not depend on an options menu being present or a transcript being ready.
const bounded = (value, limit = 8000) => typeof value === "string" ? value.trim().slice(0, limit) : "";

export function isQuestionTool(name, { includeAsync = false } = {}) {
  const leaf = String(name || "").trim().toLowerCase().split(/[.:/]/).pop();
  return leaf === "askuserquestion" || leaf === "request_user_input"
    || (includeAsync && leaf === "request_user_input_async");
}

export function questionDetails(raw) {
  let source = raw;
  if (typeof source === "string") {
    try { source = JSON.parse(source); } catch { /* a plain-text question */ }
  }
  const questions = Array.isArray(source?.questions) ? source.questions.slice(0, 6).map((q, i) => ({
    id: bounded(q?.id, 200) || (q?.title ? `async-${i}` : ""),
    text: bounded(q?.question || q?.title || q?.header, 2000),
    options: Array.isArray(q?.options) ? q.options.slice(0, 12).map(option => ({
      label: bounded(typeof option === "string" ? option : option?.label, 300),
      description: bounded(option?.description, 700),
    })).filter(option => option.label) : [],
    multiSelect: q?.multiSelect === true,
  })).filter(q => q.text || q.options.length) : [];
  if (questions.length) {
    return {
      text: questions.map(q => [q.text, ...q.options.map(o => `• ${o.label}${o.description ? ` — ${o.description}` : ""}`)].filter(Boolean).join("\n")).join("\n\n"),
      questions,
    };
  }
  // Don't present a sliced/unparseable JSON object as if it were a question.
  const text = bounded(raw);
  return { text: /^[{[]/.test(text) ? "" : text, questions: [] };
}

export function parseChatPrompt(status, question, assistantMessage, provider) {
  if (!["waiting", "blocked", "attention", "question"].includes(status)) return null;
  const details = questionDetails(question);
  if (details.questions.length) {
    const first = details.questions[0];
    if (provider === "codex" && details.questions.every(q => q.id && !q.multiSelect)
      && new Set(details.questions.map(q => q.id)).size === details.questions.length) {
      return { kind: "question", answerStyle: "codex-form", text: details.text, options: [], questions: details.questions };
    }
    // Claude's single-choice AskUserQuestion is an arrow selector. Unidentified
    // Codex forms and Claude multi-select forms remain native terminal actions.
    const direct = provider === "claude" && details.questions.length === 1 && !first.multiSelect;
    return { kind: "question", answerStyle: direct && first.options.length ? "arrow" : "terminal",
      text: details.text, options: direct ? first.options.map((option, i) => ({ label: option.label, send: String(i + 1) })) : [] };
  }
  const src = details.text || bounded(assistantMessage);
  // Match direct CLI authentication failures, not quoted text or user questions.
  if (provider === "claude" && /^(?:(?:login expired|not logged in)\s*·\s*please run \/login\b|anthropic profile login expired\b)/i.test(src)) {
    return { kind: "authentication", answerStyle: "terminal", text: src, options: [] };
  }
  const lower = src.toLowerCase();
  const permission = ["allow", "permission", "approve", "grant", "proceed?", "do you want", "y/n", "yes/no", "허용", "권한", "승인", "진행할까요", "계속할까요"].some(h => lower.includes(h));
  const options = [];
  for (const raw of src.split(/\r?\n/)) {
    const line = raw.replace(/^[\s>❯•]+/, "").trim();
    const match = line.match(/^(\d{1,2})[.)]\s+(.+)$/) || line.match(/^\[?([a-zA-Z])\]?[.)]\s+(.+)$/);
    if (match) options.push({ label: match[2].replace(/\s+/g, " ").slice(0, 300), send: match[1] });
    if (options.length === 12) break;
  }
  if (options.length >= 2) return { kind: permission ? "permission" : "question", answerStyle: "digit", text: src, options };
  // Permission hints alone aren't enough to invent y/n approval keys. Keep the
  // request visible and let the user answer the actual native prompt.
  return { kind: permission ? "permission" : "question", answerStyle: "terminal", text: src, options: [] };
}

export function promptSignature(prompt) {
  return prompt ? JSON.stringify([prompt.kind, prompt.answerStyle, prompt.text, prompt.options, prompt.questions]) : "";
}
