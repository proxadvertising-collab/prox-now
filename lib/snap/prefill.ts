export const SHOP_CATEGORIES = [
  "street_food",
  "drinks",
  "restaurant",
  "fruit",
  "laundry",
  "home_services",
  "barber",
  "other",
] as const;

export type ShopCategory = (typeof SHOP_CATEGORIES)[number];

const ALIASES: Record<string, ShopCategory> = {
  street_food: "street_food",
  "street food": "street_food",
  streetfood: "street_food",
  food: "street_food",
  drinks: "drinks",
  drink: "drinks",
  restaurant: "restaurant",
  fruit: "fruit",
  laundry: "laundry",
  "home services": "home_services",
  home_services: "home_services",
  service: "home_services",
  barber: "barber",
  other: "other",
};

const OTHER_SCRIPT = /[\u0E00-\u0E7F\u4E00-\u9FFF\u3040-\u30FF\u0400-\u04FF\u0600-\u06FF]/;

export function mapCategory(input: string | null | undefined): ShopCategory {
  const key = (input ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
  if (ALIASES[key]) return ALIASES[key];
  return ALIASES[key.replace(/ /g, "_")] ?? "other";
}

function looksLikePriceOrPhone(text: string): boolean {
  const value = text.trim();
  if (/^[\d\s+()./-]+$/.test(value)) return true;
  const digits = value.replace(/\D/g, "");
  const compact = value.replace(/\s/g, "");
  if (digits.length >= 8 && compact.length > 0 && digits.length / compact.length > 0.5) return true;
  if (/(฿|\$|€|£)/.test(value) && value.length <= 16) return true;
  if (/\b(baht|thb)\b/i.test(value) && digits.length > 0 && value.length <= 24) return true;
  if (/บาท/.test(value) && digits.length > 0 && value.length <= 24) return true;
  return false;
}

const DISH_LINE = /ผัดไทย|ต้มยำ|ก๋วยเตี๋ยว|ข้าวผัด|ชานม|น้ำปั่น|pad\s*thai|fried\s*rice|smoothie/i;
const SHOP_WORD = /ร้าน|shop|cafe|café|restaurant|kitchen|house|bar|stand|stall|บาร์|คาเฟ่/i;

/** A menu line, a price, or a dish is not a shop name. */
export function rejectedShopName(value: string): boolean {
  const text = value.trim().replace(/\s+/g, " ");
  if (!text) return false;
  if (/เมนู|menu/i.test(text)) return true;
  if (/[0-9๐-๙]/.test(text) || /฿|บาท|\.(?:\s*-)|\b(?:baht|thb)\b/i.test(text)) return true;
  if (DISH_LINE.test(text) && !SHOP_WORD.test(text)) return true;
  return false;
}

/** A real name, "New shop" when the text is a menu line, or null when it is empty. */
export function shopNameCandidate(value: string | null | undefined): string | null {
  const clean = (value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length < 2 || clean.length > 80) return null;
  if (!/[A-Za-z\u00C0-\u024F\u0E00-\u0E7F\u4E00-\u9FFF]/.test(clean)) return null;
  if (rejectedShopName(clean)) return "New shop";
  return clean;
}

/** A menu or dish line that someone might mistake for the shop. A bare price is not one. */
export function rejectedNameLine(value: string | null | undefined): boolean {
  const text = (value ?? "").trim();
  if (text.length < 2 || looksLikePriceOrPhone(text)) return false;
  return shopNameCandidate(text) === "New shop";
}

/** First real shop name. Menu lines collapse to "New shop" only when nothing else is a name. */
export function firstShopName(...values: (string | null | undefined)[]): string | null {
  let fallback = false;
  for (const value of values) {
    const next = shopNameCandidate(value);
    if (!next) continue;
    if (next !== "New shop") return next;
    fallback = true;
  }
  return fallback ? "New shop" : null;
}

function looksLikeShopName(text: string): boolean {
  const value = text.trim();
  if (value.length < 2 || value.length > 80) return false;
  if (looksLikePriceOrPhone(value)) return false;
  if (rejectedShopName(value)) return false;
  return /[A-Za-z\u0E00-\u0E7F\u4E00-\u9FFF]/.test(value);
}

export function prefillShop(input: {
  signText?: readonly { original?: string; translated?: string }[];
  category?: string;
}): { name: string; nameLocal: string | null; category: ShopCategory } {
  const category = mapCategory(input.category);
  for (const item of input.signText ?? []) {
    const original = (item.original ?? "").trim();
    const translated = (item.translated ?? "").trim();
    if (!looksLikeShopName(original) && !looksLikeShopName(translated)) continue;
    const nameSource = looksLikeShopName(translated) ? translated : original;
    return {
      name: nameSource.slice(0, 80),
      nameLocal: OTHER_SCRIPT.test(original) ? original.slice(0, 80) : null,
      category,
    };
  }
  return { name: "", nameLocal: null, category };
}
