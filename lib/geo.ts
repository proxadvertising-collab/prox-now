export type LatLng = { lat: number; lng: number };

const EARTH_RADIUS_M = 6_371_000;

export function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** About 4.8 km/h, rounded up, never under a minute. */
export function walkingMinutes(meters: number): number {
  return Math.max(1, Math.ceil(meters / 80));
}

export function walkingDirectionsUrl(point: LatLng): string {
  return (
    "https://www.google.com/maps/dir/?api=1&destination=" +
    point.lat +
    "," +
    point.lng +
    "&travelmode=walking"
  );
}
