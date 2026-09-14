const protectedNames = new Set([
  "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "XDG_CONFIG_HOME",
  "CODEX_HOME", "CLAUDE_CONFIG_DIR", "QWEN_CODE_HOME",
  "GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_APPLICATION_CREDENTIALS",
  "OPENAI_API_KEY", "CODEX_API_KEY", "CODEX_ACCESS_TOKEN",
  "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN",
  "CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR", "ANTHROPIC_CUSTOM_HEADERS",
  "ANTHROPIC_BASE_URL", "CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX",
  "CLAUDE_CODE_USE_FOUNDRY", "AWS_BEARER_TOKEN_BEDROCK",
  "TERM", "COLORTERM", "NO_COLOR", "FORCE_COLOR", "ELECTRON_RUN_AS_NODE",
]);

export function isProtectedLaunchEnvironment(name) {
  const key = name.toUpperCase();
  return protectedNames.has(key) || key.startsWith("MULTIAGENT_");
}

export function normalizeLaunchOptions(raw) {
  if (!raw || typeof raw !== "object") return undefined;
  const executable = typeof raw.executable === "string" ? raw.executable.trim() : "";
  const args = Array.isArray(raw.args) ? raw.args.filter(x => typeof x === "string" && x.length > 0) : [];
  const env = Array.isArray(raw.env) ? raw.env
    .filter(x => x && typeof x.name === "string" && typeof x.value === "string")
    .map(x => ({ name: x.name.trim(), value: x.value }))
    .filter(x => x.name || x.value) : [];
  return executable || args.length || env.length ? { executable, args: [...args], env } : undefined;
}

export function launchOptionsProblem(raw) {
  const value = normalizeLaunchOptions(raw);
  if (!value) return null;
  if (value.executable && (!/^(?:[A-Za-z]:[\\/]|[\\/]{2}|\/)/.test(value.executable) || /[\x00-\x1f"]/.test(value.executable))) return "path";
  if (value.executable.length > 4096 || value.args.length > 64 || value.env.length > 64 ||
      value.args.reduce((sum, x) => sum + x.length, 0) > 24000 ||
      value.env.reduce((sum, x) => sum + x.name.length + x.value.length, 0) > 24000) return "limits";
  if (value.args.some(x => /[\x00-\x1f]/.test(x))) return "args";
  const managedArgs = /^(?:resume$|--resume(?:=|$)|-r$|--id(?:=|$)|--no-alt-screen(?:=|$)|--dangerously-skip-permissions(?:=|$)|--dangerously-bypass-approvals-and-sandbox(?:=|$)|--yolo(?:=|$))/;
  if (value.args.some(x => managedArgs.test(x) || /^(?:(?:-c|--config)[= ]*)?cli_auth_credentials_store\s*=/.test(x))) return "managedArgs";
  const names = new Set();
  for (const item of value.env) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(item.name)) return "envName";
    if (isProtectedLaunchEnvironment(item.name)) return "envReserved";
    if (item.value.includes("\0")) return "envValue";
    const name = item.name.toUpperCase();
    if (names.has(name)) return "envDuplicate";
    names.add(name);
  }
  return null;
}
