import { describe, expect, it } from "vitest";
import { CORE_TRANSLATIONS, EXTRA_LOCALES } from "./catalog";
import { WORKSPACE_TRANSLATIONS } from "./workspace";
import { translateText } from "./translate";

describe("translation catalogs", () => {
  it("contains one complete translation row per English source", () => {
    const rows = [...CORE_TRANSLATIONS, ...WORKSPACE_TRANSLATIONS];
    expect(new Set(rows.map(row => row[0])).size).toBe(rows.length);
    for (const row of rows) {
      expect(row).toHaveLength(EXTRA_LOCALES.length + 1);
      for (const value of row) expect(value.trim()).not.toBe("");
    }
  });

  it("translates core settings in every added locale", () => {
    expect(translateText("zh-CN", "설정", "Settings")).toBe("设置");
    expect(translateText("zh-TW", "설정", "Settings")).toBe("設定");
    expect(translateText("ja", "설정", "Settings")).toBe("設定");
    expect(translateText("es", "설정", "Settings")).toBe("Configuración");
    for (const locale of EXTRA_LOCALES) {
      expect(translateText(locale, "계정 추가", "Add account")).not.toBe("Add account");
      expect(translateText(locale, "새 세션", "New Session")).not.toBe("New Session");
    }
  });

  it("preserves Korean/English and falls back without changing unknown content", () => {
    expect(translateText("ko", "설정", "Settings")).toBe("설정");
    expect(translateText("en", "설정", "Settings")).toBe("Settings");
    expect(translateText("ja", "오류", "Backend error: project-123")).toBe("Backend error: project-123");
  });
});
