import type { PlaceKind } from "../ai/matcher";
import type { LatLng } from "../geo";
import { mapCategory, prefillShop, type ShopCategory } from "./prefill";

/**
 * How far a Snap may be tied to a shop.
 *
 * The matcher searches MATCH_RADIUS_M so a readable sign can still confirm.
 * The picker and the post route share the tighter POST_RADIUS_M gate: a shop
 * the server would reject is never offered, and the post route measures the
 * distance again from the stored shop coordinates.
 * SAME_PLACE_M is "a shop is already here": any shop this close blocks a new one.
 */
export const MATCH_RADIUS_M = 600;
export const POST_RADIUS_M = 300;
export const SAME_PLACE_M = 25;
export const PICKER_CAP = 5;
export const PLACE_NAME_CONFIDENCE = 0.6;

export type SnapNext = "which_shop" | "add_shop" | "not_a_place" | "public_place" | "retake";

export type DistanceShop = {
  id: string;
  distanceM: number;
};

/**
 * Optical failure only. A low quality score is also how the matcher marks
 * "this is not a sign", so the score alone must not ask for a retake.
 */
const UNREADABLE =
  /\b(?:blur(?:ry|red)?|out of focus|unreadable|illegible|too dark|very dark|too dim|underexposed|overexposed|cannot see|can't see|hard to see|too shaky|motion blur)\b/i;

export function isUnreadablePhoto(qualityScore: number, qualityReason: string): boolean {
  if (!Number.isFinite(qualityScore) || qualityScore > 2) return false;
  return UNREADABLE.test(qualityReason);
}

/**
 * Demo fallback shops are measured from the demo centre, not from a real fix.
 * When the person has a GPS fix, those shops are not near them.
 */
export function nearbyCandidates<T>(input: {
  candidates: readonly T[];
  demo: boolean;
  hasFix: boolean;
}): readonly T[] {
  if (input.demo && input.hasFix) return [];
  return input.candidates;
}

export function pickerCandidates<T extends DistanceShop>(
  shops: readonly T[],
  options?: { radiusM?: number; cap?: number; pinId?: string | null },
): T[] {
  const radiusM = options?.radiusM ?? POST_RADIUS_M;
  const cap = options?.cap ?? PICKER_CAP;
  const picked = shops
    .filter((shop) => Number.isFinite(shop.distanceM) && shop.distanceM >= 0 && shop.distanceM <= radiusM)
    .slice()
    .sort((a, b) => a.distanceM - b.distanceM || a.id.localeCompare(b.id))
    .slice(0, Math.max(0, cap));
  const pinId = options?.pinId;
  if (!pinId) return picked;
  const pinned = shops.find((shop) => shop.id === pinId);
  if (!pinned) return picked;
  const rest = picked.filter((shop) => shop.id !== pinned.id);
  return [pinned, ...rest].slice(0, Math.max(1, cap));
}

/** Demo accounts and demo mode are already at the demo place, so the GPS gate stays open. */
export function allowPostDistance(distanceM: number, demo: boolean): boolean {
  if (demo) return true;
  return distanceM <= POST_RADIUS_M;
}

/** Keep a real fix. Demo mode with no fix stands at the demo zone. */
export function postStandIn(
  here: LatLng | null,
  demo: boolean,
  zone: LatLng,
): LatLng | null {
  if (here && Number.isFinite(here.lat) && Number.isFinite(here.lng)) return here;
  if (demo && Number.isFinite(zone.lat) && Number.isFinite(zone.lng)) return zone;
  return null;
}

export type BusinessRead = {
  name: string;
  nameLocal: string | null;
  category: ShopCategory;
  confidence: number;
};

type PlaceSource = {
  placeName: string | null;
  placeNameLocal: string | null;
  placeKind: PlaceKind | null;
  placeConfidence: number;
  qualityScore: number;
  category: string;
  signText: readonly { original: string; translated: string }[];
};

export function sanitizeShopName(value: string): string | null {
  const clean = value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length < 2 || clean.length > 80) return null;
  if (!/[A-Za-z\u00C0-\u024F\u0E00-\u0E7F\u4E00-\u9FFF]/.test(clean)) return null;
  return clean;
}

/** Case-insensitive and accent-insensitive. */
export function foldName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\u0e00-\u0e7f\u4e00-\u9fff]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function namesCollide(left: string, right: string): boolean {
  const a = foldName(left);
  const b = foldName(right);
  return a.length >= 2 && a === b;
}

export function editedNameAllowed(submitted: string, modelName: string): boolean {
  const clean = sanitizeShopName(submitted);
  const model = sanitizeShopName(modelName);
  if (!clean || !model) return false;
  const a = foldName(clean);
  const b = foldName(model);
  if (a === b) return true;
  if (a.length >= 3 && b.length >= 3 && (a.includes(b) || b.includes(a))) return true;
  return false;
}

export function readBusiness(result: PlaceSource): BusinessRead | null {
  const kind = result.placeKind;
  const named = result.placeName ? sanitizeShopName(result.placeName) : null;
  const confidence = result.placeConfidence;
  if (named && kind !== "public" && kind !== "none" && confidence >= PLACE_NAME_CONFIDENCE) {
    const local = result.placeNameLocal ? sanitizeShopName(result.placeNameLocal) : null;
    return {
      name: named,
      nameLocal: local,
      category: mapCategory(result.category),
      confidence,
    };
  }
  if (kind === "public" || kind === "none") return null;
  if (named && confidence < PLACE_NAME_CONFIDENCE) return null;
  if (!(result.qualityScore > 2)) return null;
  const filled = prefillShop({ signText: result.signText, category: result.category });
  const fallback = sanitizeShopName(filled.name);
  if (!fallback) return null;
  return {
    name: fallback,
    nameLocal: filled.nameLocal ? sanitizeShopName(filled.nameLocal) : null,
    category: filled.category,
    confidence: 0.7,
  };
}

export function isPublicPlace(result: PlaceSource): boolean {
  return result.placeKind === "public" && readBusiness(result) === null;
}

export function classifySnap(input: {
  confident: boolean;
  pickerCount: number;
  unreadable: boolean;
  business: boolean;
  publicPlace: boolean;
  hasFix: boolean;
}): SnapNext | null {
  if (input.confident) return null;
  if (input.unreadable) return "retake";
  if (input.publicPlace) return "public_place";
  if (input.pickerCount > 0) return "which_shop";
  if (input.business && input.hasFix) return "add_shop";
  return "not_a_place";
}

export type GateShop = DistanceShop & {
  name: string;
  nameLocal?: string | null;
};

/**
 * Shops that block a new insert. Anything within SAME_PLACE_M blocks, and so
 * does the same folded name inside the publish radius. Farther same names do not.
 */
export function blockingShops<T extends GateShop>(shops: readonly T[], name: string): T[] {
  const close = shops
    .filter((shop) => shop.distanceM <= SAME_PLACE_M)
    .slice()
    .sort((a, b) => a.distanceM - b.distanceM || a.id.localeCompare(b.id));
  if (close.length > 0) return close.slice(0, PICKER_CAP);
  const named = shops
    .filter(
      (shop) =>
        shop.distanceM <= POST_RADIUS_M &&
        (namesCollide(name, shop.name) ||
          (shop.nameLocal ? namesCollide(name, shop.nameLocal) : false) ||
          namesCollide(shop.name, "New shop")),
    )
    .slice()
    .sort((a, b) => a.distanceM - b.distanceM || a.id.localeCompare(b.id));
  return named.slice(0, PICKER_CAP);
}
