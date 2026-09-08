import { CORE_TRANSLATIONS, EXTRA_LOCALES, type ExtraLocale } from "./catalog";
import { WORKSPACE_TRANSLATIONS } from "./workspace";

export type AppLocale = "ko" | "en" | ExtraLocale;
export const APP_LOCALES: readonly AppLocale[] = ["ko", "en", ...EXTRA_LOCALES];
export const LOCALE_LABELS: Record<AppLocale, string> = {
  ko: "한국어", en: "English", "zh-CN": "简体中文", "zh-TW": "繁體中文（台灣）", ja: "日本語", es: "Español",
};
const catalogs = new Map<string, Map<string, string>>();
EXTRA_LOCALES.forEach((locale, index) => {
  catalogs.set(locale, new Map([...CORE_TRANSLATIONS, ...WORKSPACE_TRANSLATIONS].map(row => [row[0], row[index + 1]])));
});
export function translateText(locale: AppLocale, korean: string, english: string): string {
  if (locale === "ko") return korean;
  if (locale === "en") return english;
  return catalogs.get(locale)?.get(english) ?? english;
}
