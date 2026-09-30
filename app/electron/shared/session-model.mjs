const MODEL = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/;
const EFFORT = /^(none|minimal|low|medium|high|xhigh|max|ultra)$/;

export function normalizeSessionModel(value) {
  if (!value || typeof value !== "object" || typeof value.model !== "string" || !MODEL.test(value.model)) return undefined;
  if (value.effort != null && (typeof value.effort !== "string" || !EFFORT.test(value.effort))) return undefined;
  return { model: value.model, ...(value.effort ? { effort: value.effort } : {}) };
}

export function sessionModelArgs(value, launchOptions, provider = "codex") {
  if (value == null) return [];
  const settings = normalizeSessionModel(value);
  if (!settings) throw new Error("Invalid session model settings.");
  const args = launchOptions?.args ?? [];
  if (args.some((arg, index) => /^(?:-m|--model|--effort)(?:=|$)/.test(arg)
    || /^-m[^-]/.test(arg) || /^-c(?:model|model_reasoning_effort)\s*=/.test(arg)
    || /^(?:model|model_reasoning_effort)\s*=/.test(arg)
    || /^--config=(?:model|model_reasoning_effort)\s*=/.test(arg)
    || (/^(?:-c|--config)$/.test(arg) && /^(?:model|model_reasoning_effort)\s*=/.test(args[index + 1] || "")))) {
    throw new Error("고급 실행의 model/effort 옵션을 제거한 뒤 세션 모델 설정을 사용하세요. Remove model/effort overrides from advanced launch settings.");
  }
  return ["--model", settings.model, ...(settings.effort ? provider === "claude"
    ? ["--effort", settings.effort] : ["-c", `model_reasoning_effort=${JSON.stringify(settings.effort)}`] : [])];
}

// Claude exposes documented aliases and effort values in installed CLI help,
// rather than an account-scoped model/list API. Never claim these are entitlements.
export function claudeModelCatalog(help, known = []) {
  const section = String(help).match(/--model\s+<[^>]+>([\s\S]*?)(?=\n\s+--?|$)/)?.[1] || "";
  const aliasText = section.split(/model.s full name/i)[0];
  const aliases = [...aliasText.matchAll(/'([a-z][a-z0-9-]*)'/g)].map(match => match[1]);
  if (!aliases.length) throw new Error("Claude CLI의 모델 옵션을 확인하지 못했습니다. CLI를 업데이트하세요.");
  const effortText = String(help).match(/--effort\s+<[^>]+>([\s\S]*?)(?=\n\s+--?|$)/)?.[1] || "";
  const efforts = (effortText.match(/\(([^)]+)\)/)?.[1] || "").split(/,\s*/).filter(value => EFFORT.test(value));
  return [...new Set([...aliases, ...known.map(value => normalizeSessionModel(value)?.model).filter(Boolean)])]
    .map(model => ({ model, label: model, efforts: efforts.map(effort => ({ effort, description: "" })), defaultEffort: null, isDefault: false }));
}

export function normalizeModelCatalog(data) {
  return (Array.isArray(data) ? data : []).flatMap(item => {
    const model = typeof item?.model === "string" ? item.model : item?.id;
    if (item?.hidden || !MODEL.test(model || "")) return [];
    const efforts = (item.supportedReasoningEfforts ?? []).flatMap(e => EFFORT.test(e?.reasoningEffort || "")
      ? [{ effort: e.reasoningEffort, description: String(e.description || "").slice(0, 500) }] : []);
    return [{ model, label: String(item.displayName || model).slice(0, 128), efforts,
      defaultEffort: efforts.some(e => e.effort === item.defaultReasoningEffort) ? item.defaultReasoningEffort : null,
      isDefault: item.isDefault === true }];
  });
}

export async function readCodexModels(rpc) {
  const items = [], cursors = new Set();
  let cursor;
  for (let page = 0; page < 20; page++) {
    const result = await rpc.call("model/list", { limit: 50, includeHidden: false, ...(cursor ? { cursor } : {}) }, 15000);
    items.push(...normalizeModelCatalog(result?.data));
    cursor = result?.nextCursor;
    if (!cursor) return [...new Map(items.map(item => [item.model, item])).values()];
    if (cursors.has(cursor)) throw new Error("Invalid model catalog pagination.");
    cursors.add(cursor);
  }
  throw new Error("Model catalog is too large.");
}
