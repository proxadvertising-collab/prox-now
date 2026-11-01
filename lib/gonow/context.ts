import { parseHours, openState } from "../book/hours";
import { haversineMeters, walkingMinutes, type LatLng } from "../geo";

export const GO_NOW_RADIUS_M = 2_000;
export const GO_NOW_CAP = 40;
export const MENU_CAP = 10;

export type ContextShop = {
  id: string;
  slug: string;
  name: string;
  category: string;
  lat: number;
  lng: number;
  timezone: string;
  hours: unknown;
  items: { name: string; price: string | null }[];
  book: boolean;
  demo?: boolean;
};

export type ContextPost = {
  shopId: string;
  caption: string | null;
  createdAt: string;
  expiresAt: string;
  lat: number;
  lng: number;
};

export type PlaceContext = {
  shopId: string;
  slug: string;
  name: string;
  category: string;
  lat: number;
  lng: number;
  distanceM: number;
  walkMinutes: number;
  open: "open" | "closed" | "unknown";
  hoursText: string | null;
  items: { name: string; price: string | null }[];
  posts: { caption: string; ageMinutes: number }[];
  demo: boolean;
};

function itemsOf(items: ContextShop["items"]): PlaceContext["items"] {
  const next: PlaceContext["items"] = [];
  for (const item of items) {
    const name = item.name.trim();
    if (!name) continue;
    next.push({ name: name.slice(0, 80), price: item.price ? item.price.slice(0, 32) : null });
    if (next.length >= MENU_CAP) break;
  }
  return next;
}

function ageMinutes(createdAt: string, now: number): number {
  const created = Date.parse(createdAt);
  if (!Number.isFinite(created)) return 0;
  return Math.max(0, Math.floor((now - created) / 60_000));
}

export function buildContext(input: {
  origin: LatLng;
  now: Date;
  shops: readonly ContextShop[];
  posts: readonly ContextPost[];
  keepDemo?: boolean;
}): PlaceContext[] {
  const nowMs = input.now.getTime();
  const live = input.posts.filter((post) => {
    const expires = Date.parse(post.expiresAt);
    if (!Number.isFinite(expires) || expires <= nowMs) return false;
    if (!Number.isFinite(post.lat) || !Number.isFinite(post.lng)) return false;
    return haversineMeters(input.origin, post) <= GO_NOW_RADIUS_M;
  });
  const postsByShop = new Map<string, ContextPost[]>();
  for (const post of live) {
    const rows = postsByShop.get(post.shopId) ?? [];
    rows.push(post);
    postsByShop.set(post.shopId, rows);
  }

  const places: PlaceContext[] = [];
  for (const shop of input.shops) {
    if (!Number.isFinite(shop.lat) || !Number.isFinite(shop.lng)) continue;
    const distanceM = Math.round(haversineMeters(input.origin, shop));
    if (distanceM > GO_NOW_RADIUS_M) continue;
    const shopPosts = (postsByShop.get(shop.id) ?? [])
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, 3);
    if (!shop.book && shopPosts.length === 0 && !(input.keepDemo && shop.demo)) continue;
    const hours = parseHours(shop.hours);
    const open = openState(hours, shop.timezone || "Asia/Bangkok", input.now);
    places.push({
      shopId: shop.id,
      slug: shop.slug,
      name: shop.name,
      category: shop.category,
      lat: shop.lat,
      lng: shop.lng,
      distanceM,
      walkMinutes: walkingMinutes(distanceM),
      open: open.state,
      hoursText: hours?.raw ?? null,
      items: itemsOf(shop.items),
      demo: shop.demo === true,
      posts: shopPosts.map((post) => ({
        caption: (post.caption ?? "").trim().slice(0, 80),
        ageMinutes: ageMinutes(post.createdAt, nowMs),
      })),
    });
  }

  places.sort((a, b) => a.distanceM - b.distanceM || a.shopId.localeCompare(b.shopId));
  return places.slice(0, GO_NOW_CAP);
}
