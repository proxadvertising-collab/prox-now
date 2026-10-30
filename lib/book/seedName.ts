/** Placeholder used until the book reader returns a brand name. */
export const PLACEHOLDER_SHOP_NAME = "New shop";

const SHOP_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type SeedBrand = {
  name: string;
  nameLocal: string | null;
  nameEn: string | null;
};

export function isPlaceholderShopName(name: string | null | undefined): boolean {
  return (name ?? "").trim() === PLACEHOLDER_SHOP_NAME;
}

function localScript(value: string): boolean {
  return /[^\u0000-\u007F]/.test(value);
}

/** Native sign name, plus an English or romanized line when the reader found one. */
export function seedBrand(shopName: string | null | undefined, nameEn: string | null | undefined): SeedBrand | null {
  const native = (shopName ?? "").trim().slice(0, 80);
  const english = (nameEn ?? "").trim().slice(0, 80);
  if (!native && !english) return null;
  if (native && english && native.toLowerCase() !== english.toLowerCase()) {
    return { name: native, nameLocal: localScript(native) ? native : null, nameEn: english };
  }
  const only = native || english;
  return { name: only, nameLocal: localScript(only) ? only : null, nameEn: null };
}

/** Latin slug from the English name when we have one, otherwise from the sign name. */
export function seedSlug(nameEn: string | null, name: string, shopId: string): string {
  const source = nameEn && /[A-Za-z]/.test(nameEn) ? nameEn : name;
  let base = source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  if (!base) base = "shop";
  const suffix = shopId.replace(/[^a-z0-9]/gi, "").slice(0, 6).toLowerCase() || "shop";
  return (base + "-" + suffix).slice(0, 48);
}

/** Book URL after seeding. Never the shop id. */
export function seedBookPath(
  shopId: string,
  createdSlug: string | null | undefined,
  readSlug: string | null | undefined,
): string | null {
  const read = (readSlug ?? "").trim();
  const created = (createdSlug ?? "").trim();
  const slug =
    (read && read !== shopId && !SHOP_ID.test(read) ? read : null) ??
    (created && created !== shopId && !SHOP_ID.test(created) ? created : null);
  if (!slug) return null;
  return "/book/" + encodeURIComponent(slug);
}
