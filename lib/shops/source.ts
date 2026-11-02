import { selectCandidates, type MatchShop } from "../ai/matcher";
import { DEMO_CENTER, FIXTURE_SHOPS, type FixtureShop } from "../fixtures/shops";
import { haversineMeters, type LatLng } from "../geo";
import { MATCH_RADIUS_M } from "../snap/place";

export type ShopNear = {
  id: string;
  name: string;
  nameLocal: string | null;
  category: string;
  distanceM: number;
  lat: number;
  lng: number;
};

export type NearbyShopRow = {
  id: string;
  name: string;
  name_local: string | null;
  category: string;
  lat: number;
  lng: number;
  distance_m: number;
};

export type MapShopRow = {
  id: string;
  slug: string;
  name: string;
  name_local: string | null;
  category: string;
  lat: number;
  lng: number;
  is_demo: boolean;
};

export const MAP_RADIUS_M = 5000;
export const MAP_CAP = 200;

export function hasShopEnv(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

function fixtureNear(point: LatLng | null): { candidates: ShopNear[]; demo: boolean } {
  const shops: MatchShop[] = FIXTURE_SHOPS.map((shop) => ({
    id: shop.id,
    name: shop.name,
    nameLocal: shop.nameLocal,
    category: shop.category,
    lat: shop.lat,
    lng: shop.lng,
  }));
  const selected = selectCandidates(point, shops, { radiusM: MATCH_RADIUS_M, max: 10 });
  const byId = new Map(FIXTURE_SHOPS.map((shop) => [shop.id, shop]));
  return {
    demo: selected.demo,
    candidates: selected.candidates.map((candidate) => {
      const shop = byId.get(candidate.id);
      return {
        id: candidate.id,
        name: candidate.name,
        nameLocal: candidate.nameLocal ?? null,
        category: candidate.category,
        distanceM: candidate.distanceM,
        lat: shop?.lat ?? DEMO_CENTER.lat,
        lng: shop?.lng ?? DEMO_CENTER.lng,
      };
    }),
  };
}

export async function getShopsNear(
  point: LatLng | null,
  query?: (origin: LatLng) => Promise<NearbyShopRow[]>,
): Promise<{ candidates: ShopNear[]; demo: boolean }> {
  const fixtures = fixtureNear(point);
  if (!query) return fixtures;
  const origin = point ?? DEMO_CENTER;
  try {
    const rows = await query(origin);
    const candidates = (rows ?? [])
      .map((row) => ({
        id: String(row.id),
        name: row.name,
        nameLocal: row.name_local ?? null,
        category: row.category,
        distanceM: Math.round(Number(row.distance_m)),
        lat: Number(row.lat),
        lng: Number(row.lng),
      }))
      .filter(
        (shop) =>
          Number.isFinite(shop.lat) && Number.isFinite(shop.lng) && Number.isFinite(shop.distanceM),
      )
      .sort((a, b) => a.distanceM - b.distanceM || a.id.localeCompare(b.id))
      .slice(0, 10);
    if (candidates.length === 0 && point === null) return fixtures;
    if (candidates.length === 0) return { candidates: [], demo: false };
    return { candidates, demo: point === null };
  } catch {
    return fixtures;
  }
}

export function mapShopsFromRows(
  rows: readonly MapShopRow[],
  center: LatLng = DEMO_CENTER,
  options?: { includeDemo?: boolean },
): FixtureShop[] {
  return rows
    .filter((row) => options?.includeDemo || row.is_demo === false)
    .map((row) => ({
      id: String(row.id),
      slug: row.slug,
      name: row.name,
      nameLocal: row.name_local ?? undefined,
      category: row.category,
      lat: Number(row.lat),
      lng: Number(row.lng),
      isDemo: row.is_demo === true,
    }))
    .filter((shop) => Number.isFinite(shop.lat) && Number.isFinite(shop.lng))
    .map((shop) => ({ shop, distanceM: haversineMeters(center, shop) }))
    .filter((item) => item.distanceM <= MAP_RADIUS_M)
    .sort((a, b) => a.distanceM - b.distanceM || a.shop.id.localeCompare(b.shop.id))
    .slice(0, MAP_CAP)
    .map((item) => item.shop);
}
