import { afterEach, describe, expect, it } from "vitest";
import { t, setLanguage, getLanguage, monthLabel, bucketLabel } from "./i18n.js";
import { messages } from "./translations.js";

afterEach(() => setLanguage("en"));

describe("Remote display language", () => {
  it("follows the resolved desktop locale and falls back safely for missing or invalid settings", () => {
    for (const locale of ["ko", "en", "zh-CN", "zh-TW", "ja", "es"]) {
      setLanguage(locale);
      expect(getLanguage()).toBe(locale);
    }
    setLanguage("ko");
    expect(t("월간 토큰 사용량")).toBe("월간 토큰 사용량");
    setLanguage("en");
    expect(t("월간 토큰 사용량")).toBe("Monthly token usage");
    setLanguage("unsupported");
    expect(getLanguage()).toBe("en");
    expect(setLanguage(undefined)).toBe(false);
  });

  it("formats usage dates and compact months using the app locale, ignoring Korean API labels", () => {
    setLanguage("en");
    expect(monthLabel(9)).toBe("Sep");
    expect(bucketLabel({ key: "2026-09-12", label: "12일" }, "month")).toBe("Sep 12");
    expect(bucketLabel({ key: "2026-09", label: "9월" }, "year")).toBe("Sep");
    setLanguage("ko");
    expect(monthLabel(9)).toBe("9월");
  });

  it("substitutes data once without translating content or interpreting markup", () => {
    setLanguage("en");
    const value = "문서 <img src=x> {0}";
    expect(t("문서를 열지 못했습니다: {0}", [value])).toBe(`Could not open document: ${value}`);
    expect(t("arbitrary user content")).toBe("arbitrary user content");
  });

  it("keeps interpolation fields intact in every translated message", () => {
    const placeholders = value => [...value.matchAll(/\{\d+\}/g)].map(match => match[0]).sort();
    const keys = new Set();
    for (const [source, english, ...otherLanguages] of messages) {
      expect(keys.has(source), `Duplicate message: ${source}`).toBe(false);
      keys.add(source);
      expect(english, source).toBeTruthy();
      for (const translation of [english, ...otherLanguages]) {
        expect(placeholders(translation), source).toEqual(placeholders(source));
      }
    }
  });
});
