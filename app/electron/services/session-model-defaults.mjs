import fs from "node:fs";
import path from "node:path";
import { normalizeSessionModel } from "../shared/session-model.mjs";

const initial = {
  codex: { model: "gpt-6.1-sol", effort: "xhigh", serviceTier: "default" },
  claude: { model: "sonnet", effort: "medium" },
};
function checked(provider, value) {
  if (!Object.hasOwn(initial, provider)) throw new Error("지원하지 않는 기본 모델 제공자입니다.");
  const settings = normalizeSessionModel(value);
  if (!settings || (provider === "claude" && Object.hasOwn(settings, "serviceTier"))
    || (provider === "codex" && !["default", "fast"].includes(settings.serviceTier))) {
    throw new Error("기본 모델 설정이 올바르지 않습니다.");
  }
  return settings;
}

// Host-owned preferences also cover launches from remote surfaces. Keep these
// separate from per-session memory so a changed default cannot replace it.
export class SessionModelDefaults {
  constructor(file, { onError = error => console.warn("[electron] model defaults", error.message) } = {}) {
    this.file = file;
    this.data = { version: 1, revision: 0, codex: { ...initial.codex }, claude: { ...initial.claude } };
    try {
      if (fs.statSync(file).size > 16 * 1024) throw new Error("Model defaults file is too large.");
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      if (data.version !== 1 || !Number.isSafeInteger(data.revision) || data.revision < 0) throw new Error("Invalid model defaults file.");
      this.data = { version: 1, revision: data.revision, codex: checked("codex", data.codex), claude: checked("claude", data.claude) };
    } catch (error) {
      if (error.code !== "ENOENT") { this.unavailable = true; onError(error); }
    }
  }
  get(provider) {
    if (this.unavailable) throw new Error("기본 모델 저장 파일을 읽지 못했습니다. session-model-defaults.json을 확인하세요.");
    const settings = checked(provider, this.data[provider]);
    return { settings, revision: this.data.revision };
  }
  save(provider, value, revision, models) {
    this.get(provider);
    if (revision !== this.data.revision) throw new Error("기본 설정이 다른 창에서 변경되었습니다. 다시 불러오세요.");
    const settings = checked(provider, value);
    const model = models.find(item => item.model === settings.model);
    if (!model) throw new Error("이 계정에서 사용할 수 있는 모델을 선택하세요.");
    if (settings.effort && !model.efforts.some(item => item.effort === settings.effort)) throw new Error("이 모델에서 지원하는 effort를 선택하세요.");
    const data = { ...this.data, revision: this.data.revision + 1, [provider]: settings };
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(data), { mode: 0o600 });
    fs.renameSync(temporary, this.file);
    this.data = data;
    return this.get(provider);
  }
}
