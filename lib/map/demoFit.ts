/** First-load fit for the demo shops. Real GPS visits stay on MAP_DEFAULTS. */
export const DEMO_FIT_MAX_ZOOM = 15;

export type FitPadding = { top: number; bottom: number; left: number; right: number };

/**
 * Room for the tour card above the map and the bottom sheet on the map.
 * 390 is the phone width. 1280 is the wide viewport, where the bottom nav is hidden.
 */
export function demoFitPadding(width: number): FitPadding {
  const phone = width < 700;
  return {
    top: phone ? 72 : 56,
    bottom: phone ? 210 : 180,
    left: 40,
    right: 40,
  };
}

/** MapLibre bounds: southwest, northeast. */
export function shopBounds(
  shops: readonly { lat: number; lng: number }[],
): [[number, number], [number, number]] | null {
  if (shops.length === 0) return null;
  let west = shops[0]!.lng;
  let east = shops[0]!.lng;
  let south = shops[0]!.lat;
  let north = shops[0]!.lat;
  for (const shop of shops) {
    if (!Number.isFinite(shop.lat) || !Number.isFinite(shop.lng)) continue;
    if (shop.lng < west) west = shop.lng;
    if (shop.lng > east) east = shop.lng;
    if (shop.lat < south) south = shop.lat;
    if (shop.lat > north) north = shop.lat;
  }
  return [
    [west, south],
    [east, north],
  ];
}
