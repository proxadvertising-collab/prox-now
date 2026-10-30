import { displayName } from "../book/display";
import { t } from "../copy";

export type OrderLine = {
  id: string;
  name: string;
  nameEn: string | null;
  price: string | null;
  photo: string | null;
  tags: string[];
  qty: number;
};

export type OrderState = {
  lines: OrderLine[];
  note: string;
  translation: string;
};

export type OrderStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export type OrderDraft = Omit<OrderLine, "qty"> & { qty?: number };

export function orderKey(slug: string): string {
  return "prox-order:" + slug;
}

export function emptyOrder(): OrderState {
  return { lines: [], note: "", translation: "" };
}

export function formatPrice(value: string | number | null | undefined): string | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    const rounded = Math.round(value * 100) / 100;
    return "฿" + (Number.isInteger(rounded) ? String(rounded) : String(rounded));
  }
  if (value == null) return null;
  let text = value.trim();
  if (!text) return null;
  text = text.replace(/฿/g, " ");
  text = text.replace(/\b(?:baht|thb)\b/gi, " ");
  text = text.replace(/\.00\b/g, "");
  text = text.replace(/\.\s*-(?=\s|$)/g, "");
  text = text.replace(/-(?=\s|$)/g, "");
  const match = text.match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const amount = Number(match[0]);
  if (!Number.isFinite(amount)) return null;
  return "฿" + (Number.isInteger(amount) ? String(amount) : String(amount));
}

export function priceAmount(value: string | null): number | null {
  const label = formatPrice(value);
  if (!label) return null;
  const amount = Number(label.slice(1));
  return Number.isFinite(amount) ? amount : null;
}

export function copyLang(nav: string | null | undefined): "en" | "th" {
  return (nav ?? "").toLowerCase().startsWith("th") ? "th" : "en";
}

export function itemCopy(
  item: { name: string; nameEn?: string | null },
  userLang: string | null | undefined,
): { title: string; subtitle: string | null } {
  const lang = (userLang ?? "").trim() || "en";
  const raw = item.name.trim();
  const original = displayName(raw);
  const english = displayName((item.nameEn ?? "").trim());
  const englishUser = lang.toLowerCase() === "en" || lang.toLowerCase().startsWith("en-");
  if (englishUser && english) {
    return { title: english, subtitle: original && original !== english ? original : null };
  }
  return { title: original || raw, subtitle: null };
}

export function lineId(name: string, category?: string | null): string {
  return (category ?? "") + "\n" + name;
}

export function tilePhoto(photo: string | null | undefined): string | null {
  if (!photo) return null;
  if (photo.includes("book-cutouts/") || photo.startsWith("/demo/")) return photo;
  return null;
}

export function orderSummary(state: OrderState): { count: number; amount: number; unpriced: number } {
  let count = 0;
  let amount = 0;
  let unpriced = 0;
  for (const line of state.lines) {
    const qty = line.qty > 0 ? line.qty : 0;
    count += qty;
    const price = priceAmount(line.price);
    if (price == null) unpriced += qty;
    else amount += price * qty;
  }
  return { count, amount, unpriced };
}

export function orderBarLabel(lang: "en" | "th", summary: { count: number; amount: number; unpriced: number }): string {
  const line = t(lang, "order.view") + " · " + t(lang, "order.items", { n: String(summary.count) });
  if (summary.amount > 0) return line + " · " + (formatPrice(summary.amount) ?? "฿0");
  return line;
}

export function orderBarCaption(lang: "en" | "th", summary: { unpriced: number }): string | null {
  return summary.unpriced > 0 ? t(lang, "order.unlisted") : null;
}

const COUNTRY_LANG: Record<string, string> = {
  TH: "th",
  US: "en",
  GB: "en",
  AU: "en",
  NZ: "en",
  CA: "en",
  JP: "ja",
  KR: "ko",
  CN: "zh",
  TW: "zh",
  VN: "vi",
  LA: "lo",
  KH: "km",
  MM: "my",
  MY: "ms",
  ID: "id",
  FR: "fr",
  DE: "de",
  ES: "es",
  IT: "it",
  RU: "ru",
  IN: "hi",
};

/** Shop country/locale decides the staff language. Thailand and unknown shops use Thai. */
export function shopStaffLanguage(country: string | null | undefined): string {
  const code = (country ?? "").trim().toUpperCase();
  if (!code || code === "TH") return "th";
  return COUNTRY_LANG[code] ?? "th";
}

export function staffNoteTarget(note: string, country: string | null | undefined): string | null {
  const text = note.trim();
  if (!text) return null;
  const to = shopStaffLanguage(country);
  const thai = /[\u0E00-\u0E7F]/.test(text);
  const latin = /[A-Za-z]/.test(text);
  if (!thai && !latin) return null;
  if (to === "th" && thai && !latin) return null;
  if (to === "en" && latin && !thai) return null;
  return to;
}

export function orderBarFor(
  pathname: string,
  storage: OrderStorage,
  lang: "en" | "th",
): { slug: string; count: number; label: string; caption: string | null } | null {
  const match = /^\/book\/([^/]+)\/?$/.exec(pathname);
  if (!match?.[1]) return null;
  let slug = match[1];
  try {
    slug = decodeURIComponent(slug);
  } catch {
    slug = match[1];
  }
  const summary = orderSummary(readOrder(slug, storage));
  if (summary.count < 1) return null;
  return { slug, count: summary.count, label: orderBarLabel(lang, summary), caption: orderBarCaption(lang, summary) };
}

export function addLine(state: OrderState, draft: OrderDraft): OrderState {
  const qty = draft.qty ?? 1;
  const lines = state.lines.slice();
  const at = lines.findIndex((line) => line.id === draft.id);
  if (at >= 0) {
    const current = lines[at];
    if (!current) return state;
    lines[at] = { ...current, qty: current.qty + qty };
  } else {
    lines.push({
      id: draft.id,
      name: draft.name,
      nameEn: draft.nameEn,
      price: draft.price,
      photo: draft.photo,
      tags: draft.tags ?? [],
      qty,
    });
  }
  return { ...state, lines };
}

export function removeLine(state: OrderState, id: string): OrderState {
  return { ...state, lines: state.lines.filter((line) => line.id !== id) };
}

export function setLineQty(state: OrderState, id: string, qty: number): OrderState {
  if (qty <= 0) return removeLine(state, id);
  return { ...state, lines: state.lines.map((line) => (line.id === id ? { ...line, qty } : line)) };
}

export function setOrderNote(state: OrderState, note: string): OrderState {
  return { ...state, note, translation: note === state.note ? state.translation : "" };
}

export function setOrderTranslation(state: OrderState, translation: string): OrderState {
  return { ...state, translation };
}

export function clearOrder(): OrderState {
  return emptyOrder();
}

function isLine(value: unknown): value is OrderLine {
  if (!value || typeof value !== "object") return false;
  const row = value as OrderLine;
  return typeof row.id === "string" && typeof row.name === "string" && typeof row.qty === "number";
}

export function readOrder(slug: string, storage: OrderStorage): OrderState {
  const raw = storage.getItem(orderKey(slug));
  if (!raw) return emptyOrder();
  try {
    const parsed = JSON.parse(raw) as Partial<OrderState>;
    const lines = Array.isArray(parsed.lines) ? parsed.lines.filter(isLine) : [];
    return {
      lines,
      note: typeof parsed.note === "string" ? parsed.note : "",
      translation: typeof parsed.translation === "string" ? parsed.translation : "",
    };
  } catch {
    return emptyOrder();
  }
}

export function writeOrder(slug: string, state: OrderState, storage: OrderStorage): void {
  storage.setItem(orderKey(slug), JSON.stringify(state));
}

export function notifyOrder(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("prox-order"));
}

export function browserStorage(): OrderStorage {
  if (typeof localStorage === "undefined") return { getItem: () => null, setItem: () => undefined };
  return localStorage;
}
