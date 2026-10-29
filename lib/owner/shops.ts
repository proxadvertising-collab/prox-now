export type OwnerShop = {
  shopId: string;
  name: string;
  status: string;
  slug?: string;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Accepts the owner_home jsonb array, or that array already wrapped by the route. */
export function readOwnerShops(data: unknown): OwnerShop[] {
  let value = data;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      return [];
    }
  }
  if (value && typeof value === "object" && !Array.isArray(value) && "shops" in value) {
    value = (value as { shops?: unknown }).shops;
  }
  if (!Array.isArray(value)) return [];
  const shops: OwnerShop[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const shopId = text(record.shopId) || text(record.shop_id);
    const name = text(record.name);
    if (!shopId || !name) continue;
    const slug = text(record.slug);
    shops.push({
      shopId,
      name,
      status: text(record.status),
      ...(slug ? { slug } : {}),
    });
  }
  return shops;
}
