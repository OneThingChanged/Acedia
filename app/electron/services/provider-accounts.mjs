import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { storedAccountIdentity } from "./account-identity.mjs";

const validId = (id) => /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id);

export function selectedAccountId(args) {
  return (args.aiToolId === "claude" ? args.claudeAccountId : args.codexAccountId) || "default";
}

// Credentials stay in provider-owned homes, never in renderer storage or IPC.
export class ProviderAccounts {
  constructor(storageDir, provider, { startLogin, baseEnv = process.env } = {}) {
    if (!["codex", "claude"].includes(provider)) throw new Error("Unsupported account provider");
    this.provider = provider;
    this.homeName = `.${provider}`;
    this.homeEnv = provider === "codex" ? "CODEX_HOME" : "CLAUDE_CONFIG_DIR";
    this.transcriptDirectory = provider === "codex" ? "sessions" : "projects";
    this.credentialFile = provider === "codex" ? "auth.json" : ".credentials.json";
    this.root = path.join(storageDir, `${provider}-accounts`);
    this.registry = path.join(this.root, "accounts.json");
    this.baseEnv = baseEnv;
    this.startLogin = startLogin;
    this.accounts = [];
    this.removedAccounts = [];
    this.login = null;
    this.results = new Map();
    this.failures = new Map();
    try {
      if (fs.existsSync(this.registry)) {
        const accounts = JSON.parse(fs.readFileSync(this.registry, "utf8"));
        if (!Array.isArray(accounts) || accounts.some((a) => !a || !validId(a.id) || typeof a.label !== "string")) {
          throw new Error("Invalid account registry");
        }
        this.accounts = accounts.filter(a => a.removed !== true).map(({ id, label }) => ({ id, label }));
        this.removedAccounts = accounts.filter(a => a.removed === true).map(({ id, label }) => ({ id, label }));
      }
    } catch {
      this.loadError = new Error("계정 목록을 읽을 수 없습니다. accounts.json 파일을 확인하세요.");
    }
  }

  home(id) {
    if (!id || id === "default") return this.baseEnv[this.homeEnv] || path.join(os.homedir(), this.homeName);
    if (!this.accounts.some((a) => a.id === id)) throw new Error("계정을 찾을 수 없습니다.");
    // Store/MSIX redirects AppData inside the package. External Codex cannot
    // resolve the logical AppData path. Native realpath uses the Windows file
    // handle to return the physical LocalCache path (regular realpath does not).
    const logicalHome = path.join(this.root, id, this.homeName);
    return fs.existsSync(logicalHome) ? fs.realpathSync.native(logicalHome) : logicalHome;
  }

  roots() {
    return [this.home(), ...[...this.accounts, ...this.removedAccounts].map((a) => this.storedHome(a.id))].map((home) => path.join(home, this.transcriptDirectory));
  }

  storedHome(id) {
    const logical = path.join(this.root, id, this.homeName);
    return fs.existsSync(logical) ? fs.realpathSync.native(logical) : logical;
  }

  accountForPath(sourcePath) {
    if (!sourcePath) return null;
    return [...this.accounts, ...this.removedAccounts].find((a) => {
      const relative = path.relative(path.join(this.storedHome(a.id), this.transcriptDirectory), sourcePath);
      return relative && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
    }) ?? null;
  }

  environment(id) {
    const env = { ...this.baseEnv };
    if (id && id !== "default") {
      const stripped = this.provider === "codex"
        ? ["OPENAI_API_KEY", "CODEX_API_KEY", "CODEX_ACCESS_TOKEN", this.homeEnv]
        : ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN",
          "CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR", "ANTHROPIC_CUSTOM_HEADERS", "ANTHROPIC_BASE_URL",
          "CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX", "CLAUDE_CODE_USE_FOUNDRY",
          "AWS_BEARER_TOKEN_BEDROCK", this.homeEnv];
      // Windows environment keys are case-insensitive.
      for (const key of Object.keys(env)) {
        if (stripped.includes(process.platform === "win32" ? key.toUpperCase() : key)) delete env[key];
      }
      env[this.homeEnv] = this.home(id);
    }
    return env;
  }

  list() {
    if (this.loadError) throw this.loadError;
    return [{ id: "default", label: "기존 로그인", state: "default" }, ...this.accounts.map((a) => {
      const home = this.home(a.id);
      const credentialsSaved = fs.existsSync(path.join(home, this.credentialFile));
      const result = this.results.get(a.id);
      const state = this.login?.id === a.id ? "pending" : result && result !== "saved" ? result : credentialsSaved ? "saved" : "empty";
      return {
        ...a, state,
        ...(state === "saved" ? { identity: storedAccountIdentity(this.provider, home) } : {}),
        ...(this.failures.has(a.id) ? { failureReason: this.failures.get(a.id) } : {}),
      };
    })];
  }

  create(label) {
    if (this.loadError) throw this.loadError;
    if (typeof label !== "string" || !label.trim() || label.length > 80) throw new Error("계정 이름은 1~80자로 입력하세요.");
    const account = { id: randomUUID(), label: label.trim() };
    fs.mkdirSync(path.join(this.root, account.id, this.homeName), { recursive: true, mode: 0o700 });
    if (this.provider === "codex") fs.writeFileSync(path.join(this.root, account.id, this.homeName, "config.toml"), 'cli_auth_credentials_store = "file"\n', { mode: 0o600 });
    const next = [...this.accounts, account];
    this.saveRegistry(next);
    this.accounts = next;
    return account.id;
  }

  saveRegistry(accounts, removed = this.removedAccounts) {
    if (this.loadError) throw this.loadError;
    const entries = [...accounts, ...removed.map(account => ({ ...account, removed: true }))];
    fs.writeFileSync(`${this.registry}.tmp`, JSON.stringify(entries, null, 2), { mode: 0o600 });
    fs.renameSync(`${this.registry}.tmp`, this.registry);
  }

  rename(id, label) {
    if (this.loadError) throw this.loadError;
    if (!validId(id) || !this.accounts.some(account => account.id === id)) throw new Error("추가 계정을 선택하세요.");
    if (typeof label !== "string" || !label.trim() || label.length > 80) throw new Error("계정 이름은 1~80자로 입력하세요.");
    const next = this.accounts.map(account => account.id === id ? { ...account, label: label.trim() } : account);
    this.saveRegistry(next);
    this.accounts = next;
    return { id, label: label.trim() };
  }

  remove(id) {
    if (this.loadError) throw this.loadError;
    if (!validId(id)) throw new Error("추가 계정을 선택하세요.");
    const account = this.accounts.find(account => account.id === id);
    if (!account) {
      if (this.removedAccounts.some(account => account.id === id)) return;
      throw new Error("계정을 찾을 수 없습니다.");
    }
    const next = this.accounts.filter(account => account.id !== id);
    const removed = [...this.removedAccounts, account];
    // One atomic registry write records removal and its durable recovery marker.
    // Provider-owned files remain available for conversation history indexing.
    this.saveRegistry(next, removed);
    if (this.login?.id === id) this.cancelLogin({ accountId: id });
    this.accounts = next;
    this.removedAccounts = removed;
    this.results.delete(id); this.failures.delete(id);
  }

  beginLogin(id) {
    if (!id || id === "default") throw new Error("추가 계정을 선택하세요.");
    this.home(id);
    if (this.login) throw new Error("진행 중인 로그인을 완료하거나 취소하세요.");
    const job = { id, process: null, timer: null, outputTail: "", failureReason: null };
    this.login = job;
    this.results.delete(id);
    this.failures.delete(id);
    try {
      job.timer = setTimeout(() => {
        if (this.login === job) this.cancelLogin({ accountId: id, timedOut: true });
      }, 5 * 60_000);
      job.timer.unref?.();
      job.process = this.startLogin(this.environment(id));
      // Retain only a bounded transient tail to classify a known setup failure.
      // Never forward/persist OAuth URLs, tokens or arbitrary CLI output.
      job.process.onData((chunk) => {
        if (this.login !== job) return;
        job.outputTail = (job.outputTail + String(chunk)).slice(-4096);
        if (/(?:CODEX_HOME|CLAUDE_CONFIG_DIR)[\s\S]*?(?:does not exist|not a directory)/i.test(job.outputTail)) job.failureReason = "home_unavailable";
      });
      job.process.onExit(({ exitCode }) => {
        if (this.login !== job) return;
        clearTimeout(job.timer);
        this.login = null;
        const saved = exitCode === 0 && fs.existsSync(path.join(this.home(id), this.credentialFile));
        this.results.set(id, saved ? "saved" : "failed");
        if (!saved) this.failures.set(id, job.failureReason || (exitCode === 0 ? "credentials_not_saved" : "login_failed"));
        job.outputTail = "";
      });
    } catch (error) {
      clearTimeout(job.timer);
      job.outputTail = "";
      this.login = null;
      this.results.set(id, "failed");
      this.failures.set(id, "login_start_failed");
      throw error;
    }
    return null;
  }

  cancelLogin({ accountId, timedOut = false } = {}) {
    const job = this.login;
    if (!job) return;
    if (accountId && job.id !== accountId) throw new Error("진행 중인 로그인 계정이 변경되었습니다. 목록을 새로고침하세요.");
    this.login = null;
    clearTimeout(job.timer);
    job.outputTail = "";
    try { job.process?.kill(); } catch { /* login process already exited */ }
    this.results.set(job.id, timedOut ? "timed_out" : "cancelled");
  }
}
