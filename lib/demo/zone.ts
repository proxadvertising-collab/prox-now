import { haversineMeters, type LatLng } from "../geo";

export const DEMO_ZONE_FALLBACK = { lat: 12.5684, lng: 99.9577, zoom: 16.5 };
export const EXPLORE_RADIUS_M = 25_000;

export function showExploreChip(input: {
  demoSession: boolean;
  viewer: LatLng | null;
  posts: readonly LatLng[];
}): boolean {
  if (input.demoSession) return false;
  if (input.posts.length === 0) return true;
  if (!input.viewer) return false;
  return input.posts.every((post) => haversineMeters(input.viewer as LatLng, post) > EXPLORE_RADIUS_M);
}

export function nearestDemoShop<T extends LatLng & { isDemo: boolean }>(
  shops: readonly T[],
  from: LatLng,
): T | null {
  let best: T | null = null;
  let bestMeters = Number.POSITIVE_INFINITY;
  for (const shop of shops) {
    if (!shop.isDemo) continue;
    const meters = haversineMeters(from, shop);
    if (meters < bestMeters) {
      best = shop;
      bestMeters = meters;
    }
  }
  return best;
}
