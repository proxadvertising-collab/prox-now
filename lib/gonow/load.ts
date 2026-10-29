import { hasShopEnv } from "../shops/source";
import type { ContextPost, ContextShop } from "./context";
import type { LatLng } from "../geo";

type NearRow = {
  id?: unknown;
  slug?: unknown;
  name?: unknown;
  category?: unknown;
  lat?: unknown;
  lng?: unknown;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function itemsFrom(extracted: unknown): { name: string; price: string | null }[] {
  if (!extracted || typeof extracted !== "object" || Array.isArray(extracted)) return [];
  const items = (extracted as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  const next: { name: string; price: string | null }[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const name = text((item as { name?: unknown }).name);
    if (!name) continue;
    const priceValue = (item as { price?: unknown }).price;
    const price = typeof priceValue === "number" && Number.isFinite(priceValue) ? String(priceValue) : text(priceValue);
    next.push({ name, price: price || null });
  }
  return next;
}

export async function loadGoNowRows(
  origin: LatLng,
  now: Date,
): Promise<{ shops: ContextShop[]; posts: ContextPost[] }> {
  if (!hasShopEnv()) return { shops: [], posts: [] };
  const { createClient } = await import("../supabase/server");
  const supabase = await createClient();
  const near = await supabase.rpc("nearby_shops", {
    p_lat: origin.lat,
    p_lng: origin.lng,
    p_radius_m: 2000,
  });
  if (near.error || !Array.isArray(near.data)) return { shops: [], posts: [] };

  const rows = near.data as NearRow[];
  const ids = rows.map((row) => text(row.id)).filter((id) => id.length > 0);
  if (ids.length === 0) return { shops: [], posts: [] };

  const [zones, books, pages, posts] = await Promise.all([
    supabase.from("shops").select("id, timezone").in("id", ids),
    supabase.from("shop_books").select("shop_id, hours").eq("status", "live").in("shop_id", ids),
    supabase.from("shop_book_pages").select("shop_id, extracted").eq("status", "live").eq("kind", "menu").in("shop_id", ids),
    supabase
      .from("posts")
      .select("shop_id, text_original, created_at, expires_at")
      .eq("status", "live")
      .gt("expires_at", now.toISOString())
      .in("shop_id", ids),
  ]);

  const timezone = new Map<string, string>();
  if (!zones.error && Array.isArray(zones.data)) {
    for (const row of zones.data as { id?: unknown; timezone?: unknown }[]) {
      const id = text(row.id);
      const zone = text(row.timezone);
      if (id && zone) timezone.set(id, zone);
    }
  }

  const hours = new Map<string, unknown>();
  if (!books.error && Array.isArray(books.data)) {
    for (const row of books.data as { shop_id?: unknown; hours?: unknown }[]) {
      const id = text(row.shop_id);
      if (id) hours.set(id, row.hours ?? null);
    }
  }

  const menus = new Map<string, { name: string; price: string | null }[]>();
  if (!pages.error && Array.isArray(pages.data)) {
    for (const row of pages.data as { shop_id?: unknown; extracted?: unknown }[]) {
      const id = text(row.shop_id);
      if (!id) continue;
      const current = menus.get(id) ?? [];
      for (const item of itemsFrom(row.extracted)) {
        if (current.length >= 10) break;
        current.push(item);
      }
      menus.set(id, current);
    }
  }

  const point = new Map<string, { lat: number; lng: number }>();
  const shops: ContextShop[] = [];
  for (const row of rows) {
    const id = text(row.id);
    const lat = Number(row.lat);
    const lng = Number(row.lng);
    if (!id || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    point.set(id, { lat, lng });
    const book = hours.has(id);
    shops.push({
      id,
      slug: text(row.slug) || id,
      name: text(row.name) || "Shop",
      category: text(row.category) || "other",
      lat,
      lng,
      timezone: timezone.get(id) || "Asia/Bangkok",
      hours: hours.get(id) ?? null,
      items: menus.get(id) ?? [],
      book,
    });
  }

  const live: ContextPost[] = [];
  if (!posts.error && Array.isArray(posts.data)) {
    for (const row of posts.data as {
      shop_id?: unknown;
      text_original?: unknown;
      created_at?: unknown;
      expires_at?: unknown;
    }[]) {
      const shopId = text(row.shop_id);
      const where = point.get(shopId);
      if (!shopId || !where) continue;
      live.push({
        shopId,
        caption: text(row.text_original) || null,
        createdAt: text(row.created_at),
        expiresAt: text(row.expires_at),
        lat: where.lat,
        lng: where.lng,
      });
    }
  }

  return { shops, posts: live };
}
