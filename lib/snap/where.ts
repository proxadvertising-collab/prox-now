export type LocationSource = "gps" | "pin" | "demo";

export type ShotPlace = {
  lat: number;
  lng: number;
  accuracy: number | null;
  at: string;
  source: LocationSource;
};

/** Demo street wins for a demo account. Otherwise GPS, then a pin or the shop. */
export function chooseShotPlace(input: {
  at: string;
  gps: { lat: number; lng: number; accuracy: number | null } | null;
  demo: { lat: number; lng: number } | null;
  pin: { lat: number; lng: number } | null;
  shop: { lat: number; lng: number } | null;
}): ShotPlace | null {
  if (input.demo && Number.isFinite(input.demo.lat) && Number.isFinite(input.demo.lng)) {
    return { lat: input.demo.lat, lng: input.demo.lng, accuracy: null, at: input.at, source: "demo" };
  }
  if (input.gps && Number.isFinite(input.gps.lat) && Number.isFinite(input.gps.lng)) {
    return { ...input.gps, at: input.at, source: "gps" };
  }
  const picked = input.pin ?? input.shop;
  if (picked && Number.isFinite(picked.lat) && Number.isFinite(picked.lng)) {
    return { lat: picked.lat, lng: picked.lng, accuracy: null, at: input.at, source: "pin" };
  }
  return null;
}

export function postedSource(asked: string, demoAccount: boolean): LocationSource {
  if (asked === "demo" && demoAccount) return "demo";
  if (asked === "pin") return "pin";
  return "gps";
}

export function frameSaveKey(error: unknown): "snap.frameEmpty" | "snap.frameEncode" | "snap.frameFail" {
  const message = error instanceof Error ? error.message : "";
  if (message === "frame") return "snap.frameEmpty";
  if (message === "jpeg" || message === "canvas") return "snap.frameEncode";
  return "snap.frameFail";
}
