const ID = /^[A-Za-z0-9_-]{1,80}$/;

export function snapShopHref(id: string, name: string): string {
  return "/snap?shop=" + encodeURIComponent(id) + "&name=" + encodeURIComponent(name);
}

export function snapSeedHref(id: string, name: string): string {
  return "/snap?seed=1&shop=" + encodeURIComponent(id) + "&name=" + encodeURIComponent(name);
}

export function readSnapShop(query: {
  shop?: string | string[] | null;
  name?: string | string[] | null;
}): { id: string; name: string } | null {
  const shop = Array.isArray(query.shop) ? query.shop[0] : query.shop;
  const rawName = Array.isArray(query.name) ? query.name[0] : query.name;
  const id = typeof shop === "string" ? shop.trim() : "";
  if (!ID.test(id)) return null;
  const name = typeof rawName === "string" ? rawName.trim().slice(0, 80) : "";
  return { id, name: name.length > 0 ? name : "this shop" };
}
