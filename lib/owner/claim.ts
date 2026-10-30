import { haversineMeters, type LatLng } from "../geo";

export const CLAIM_RADIUS_M = 150;

export type ClaimMode = "hidden" | "own" | "claim";

export function claimNear(here: LatLng | null, shop: LatLng | null): boolean {
  if (!here || !shop) return false;
  if (!Number.isFinite(here.lat) || !Number.isFinite(here.lng)) return false;
  if (!Number.isFinite(shop.lat) || !Number.isFinite(shop.lng)) return false;
  return haversineMeters(here, shop) <= CLAIM_RADIUS_M;
}

export function claimPrompt(shopName: string): string {
  return (
    'Does this photo show the shop sign or storefront for "' +
    shopName +
    '"? Reply with JSON only: {"match":true} or {"match":false}. ' +
    "Match when that shop's name is readable, including another script or a short form. " +
    "A different shop, or a photo that is not a sign or storefront, is false."
  );
}

/** True only when the reader says this photo is that shop's sign. */
export function claimMatch(raw: unknown): boolean {
  const parsed = typeof raw === "string" ? parseClaimJson(raw) : raw;
  if (!parsed || typeof parsed !== "object") return false;
  return (parsed as { match?: unknown }).match === true;
}

function parseClaimJson(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

export function claimStatus(near: boolean, match: boolean): "verified" | "pending" {
  return near && match ? "verified" : "pending";
}

export function claimButtonMode(input: { otherVerified: boolean; mine: "verified" | "pending" | "none" }): ClaimMode {
  if (input.mine === "verified") return "own";
  if (input.otherVerified) return "hidden";
  return "claim";
}

/** Inbox, Keep/Pass, and redeem stay closed until a shop is verified. */
export function ownerToolsOpen(shops: readonly { status: string }[]): boolean {
  return shops.some((shop) => shop.status === "verified");
}
