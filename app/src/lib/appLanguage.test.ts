import { describe, expect, it } from "vitest";
import {
  normalizeAppLanguagePreference,
  resolveAppLanguage,
} from "./appLanguage";

describe("app language", () => {
  it("keeps explicit language choices", () => {
    expect(resolveAppLanguage("ko", ["en-US"])).toBe("ko");
    expect(resolveAppLanguage("en", ["ko-KR"])).toBe("en");
  });

  it("uses Korean for a Korean system locale", () => {
    expect(resolveAppLanguage("system", ["ko-KR", "en-US"])).toBe("ko");
  });

  it("detects supported system locales in preference order", () => {
    expect(resolveAppLanguage("system", ["ja-JP"])).toBe("ja");
    expect(resolveAppLanguage("system", ["es-MX"])).toBe("es");
    expect(resolveAppLanguage("system", ["en-US", "ko-KR"])).toBe("en");
    expect(resolveAppLanguage("system", ["fr-FR", "ja-JP"])).toBe("ja");
    expect(resolveAppLanguage("system", ["fr-FR"])).toBe("en");
    expect(resolveAppLanguage("system", [])).toBe("en");
  });

  it("distinguishes Chinese scripts, including regional system locales", () => {
    for (const locale of ["zh-TW", "zh-HK", "zh_MO", "zh-Hant", "zh-Hant-CN"]) {
      expect(resolveAppLanguage("system", [locale])).toBe("zh-TW");
    }
    for (const locale of ["zh", "zh-CN", "zh-SG", "zh-Hans", "zh-Hans-TW"]) {
      expect(resolveAppLanguage("system", [locale])).toBe("zh-CN");
    }
    expect(resolveAppLanguage("zh-TW", ["zh-CN"])).toBe("zh-TW");
  });

  it("normalizes stale stored values", () => {
    expect(normalizeAppLanguagePreference("ko")).toBe("ko");
    for (const locale of ["zh-CN", "zh-TW", "ja", "es"]) {
      expect(normalizeAppLanguagePreference(locale)).toBe(locale);
    }
    expect(normalizeAppLanguagePreference("invalid")).toBe("system");
    expect(normalizeAppLanguagePreference(null)).toBe("system");
  });
});
