/** First-load fit for the demo shops. Real GPS visits stay on MAP_DEFAULTS. */
export const DEMO_FIT_MAX_ZOOM = 15;

export type FitPadding = { top: number; bottom: number; left: number; right: number };

/**
 * Ask and the coupon chip share the top row of the map.
 * Ask is `top-3` (12px) plus a shorter button. The coupon chip is the tall one:
 * `top-3` 12 + `py-2` 16 + `text-sm` line 20 + `text-xs` line 16 = 64.
 * Pins need 16px under that row. 72px still covers the chip.
 */
export const ASK_CHIP_ROW_PX = 12 + 16 + 20 + 16;

/**
 * On a wide map the attribution sits up from the map bottom.
 * `.prox-map .maplibregl-ctrl-bottom-left` is `bottom: 10.5rem` (168).
 * The compact control adds `margin: 10px`. The strip is one 20px line
 * (`min-height: 20px`, padding `0 0.5rem`, line-height 20px).
 * Its top is 168 + 10 + 20. Pins need 16px above that. Phone padding stays 210.
 */
export const ATTRIB_STRIP_TOP_PX = 168 + 10 + 20;

export function demoFitPadding(width: number): FitPadding {
  const phone = width < 700;
  return {
    top: ASK_CHIP_ROW_PX + 16,
    bottom: phone ? 210 : ATTRIB_STRIP_TOP_PX + 16,
    left: 40,
    right: 40,
  };
}

/** A demo session fits is_demo shops and leaves real shops out of the frame. */
export function shopsForDemoFit<T extends { isDemo?: boolean }>(shops: readonly T[], demoSession: boolean): T[] {
  if (!demoSession) return [...shops];
  return shops.filter((shop) => shop.isDemo === true);
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

const TILE_PX = 512;

function mercatorX(lng: number): number {
  return (lng + 180) / 360;
}

function mercatorY(lat: number): number {
  const sine = Math.sin((lat * Math.PI) / 180);
  return 0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI);
}

/** Zoom MapLibre would pick for these shops in a width×height map, capped at maxZoom. */
export function fittedZoom(input: {
  shops: readonly { lat: number; lng: number }[];
  width: number;
  height: number;
  padding?: FitPadding;
  maxZoom?: number;
}): number {
  const padding = input.padding ?? demoFitPadding(input.width);
  const maxZoom = input.maxZoom ?? DEMO_FIT_MAX_ZOOM;
  const bounds = shopBounds(input.shops);
  if (!bounds || input.width <= 0 || input.height <= 0) return maxZoom;
  const [[west, south], [east, north]] = bounds;
  const availW = Math.max(1, input.width - padding.left - padding.right);
  const availH = Math.max(1, input.height - padding.top - padding.bottom);
  const fracX = Math.max(1e-12, mercatorX(east) - mercatorX(west));
  const fracY = Math.max(1e-12, mercatorY(south) - mercatorY(north));
  const zoomX = Math.log2(availW / (fracX * TILE_PX));
  const zoomY = Math.log2(availH / (fracY * TILE_PX));
  return Math.min(maxZoom, zoomX, zoomY);
}

/** Screen pixels between two pins at a zoom. */
export function screenGapPx(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
  zoom: number,
): number {
  const dx = (mercatorX(b.lng) - mercatorX(a.lng)) * TILE_PX * 2 ** zoom;
  const dy = (mercatorY(b.lat) - mercatorY(a.lat)) * TILE_PX * 2 ** zoom;
  return Math.hypot(dx, dy);
}
