export const DEVICE_LANG_KEY = "prox-lang";

export const DEVICE_LANGS = [
  { id: "en", label: "English" },
  { id: "th", label: "ไทย" },
  { id: "vi", label: "Tiếng Việt" },
  { id: "zh", label: "中文" },
  { id: "ja", label: "日本語" },
  { id: "ko", label: "한국어" },
  { id: "ru", label: "Русский" },
  { id: "de", label: "Deutsch" },
  { id: "fr", label: "Français" },
] as const;

export function deviceLang(saved: string | null | undefined, navigatorLang: string | null | undefined): string {
  const choice = (saved ?? "").trim().toLowerCase().split("-")[0] ?? "";
  if (DEVICE_LANGS.some((item) => item.id === choice)) return choice;
  const nav = (navigatorLang ?? "en").trim().toLowerCase().split("-")[0] ?? "en";
  if (DEVICE_LANGS.some((item) => item.id === nav)) return nav;
  return "en";
}

export function menuCacheKey(name: string, lang: string): string {
  const base = lang.trim().toLowerCase().split("-")[0] || "en";
  return "prox-menu:" + base + ":" + name.trim();
}

export function titledItem(original: string, translated: string | null): { title: string; subtitle: string | null } {
  const title = (translated ?? "").trim();
  const source = original.trim();
  if (!title || title === source) return { title: source, subtitle: null };
  return { title, subtitle: source };
}
