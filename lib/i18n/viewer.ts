export function pickLanguage(
  input: string | readonly string[] | null | undefined,
  supported: readonly string[] = ["en", "th"],
): string {
  const fallback = supported[0] ?? "en";
  if (input == null) return fallback;
  const parts = typeof input === "string" ? input.split(",") : [...input];
  const ranked = parts
    .map((part, index) => {
      const bits = part.trim().split(";");
      const tag = (bits[0] ?? "").trim().toLowerCase();
      const qBit = bits.find((bit) => bit.trim().toLowerCase().startsWith("q="));
      const q = qBit ? Number(qBit.split("=")[1]) : 1;
      return { tag, q: Number.isFinite(q) ? q : 0, index };
    })
    .filter((item) => item.tag.length > 0 && item.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);

  const wanted = new Map(supported.map((item) => [item.toLowerCase(), item]));
  for (const item of ranked) {
    const exact = wanted.get(item.tag);
    if (exact) return exact;
    const base = wanted.get(item.tag.split("-")[0] ?? "");
    if (base) return base;
  }
  return fallback;
}

export function formatItemPrice(
  name: string,
  price: number | null,
  currency: string | null,
  locale: string,
): string {
  const label = name.trim();
  if (price == null || !currency || !/^[A-Z]{3}$/.test(currency)) return label;
  try {
    const money = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(price);
    return label + "  " + money;
  } catch {
    return label + "  " + String(price) + " " + currency;
  }
}

export function chooseCaption(
  captions: { en?: string | null; th?: string | null } | null | undefined,
  viewerLang: string,
  original: string | null | undefined,
): string | null {
  const text = (value: string | null | undefined) => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  };
  const preferred = viewerLang === "th" ? captions?.th : captions?.en;
  return text(preferred) ?? text(captions?.en) ?? text(original);
}

export function languageName(tag: string | null | undefined, viewerLang: string): string | null {
  if (!tag) return null;
  const base = tag.toLowerCase().split("-")[0];
  if (!base || base === viewerLang.toLowerCase()) return null;
  try {
    return new Intl.DisplayNames([viewerLang], { type: "language" }).of(tag) ?? null;
  } catch {
    return null;
  }
}
