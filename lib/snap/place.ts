/**
 * How far a Snap may be tied to a shop.
 *
 * The matcher searches MATCH_RADIUS_M so a readable sign can still confirm.
 * The picker and the post route share the tighter POST_RADIUS_M gate: a shop
 * the server would reject is never offered, and the post route measures the
 * distance again from the stored shop coordinates.
 */
export const MATCH_RADIUS_M = 600;
export const POST_RADIUS_M = 300;
export const PICKER_CAP = 5;

export type NoMatchReason = "none_near" | "which_shop" | "retake";

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
  options?: { radiusM?: number; cap?: number },
): T[] {
  const radiusM = options?.radiusM ?? POST_RADIUS_M;
  const cap = options?.cap ?? PICKER_CAP;
  return shops
    .filter((shop) => Number.isFinite(shop.distanceM) && shop.distanceM >= 0 && shop.distanceM <= radiusM)
    .slice()
    .sort((a, b) => a.distanceM - b.distanceM || a.id.localeCompare(b.id))
    .slice(0, Math.max(0, cap));
}

export function classifyNoMatch(input: {
  nearbyCount: number;
  confident: boolean;
  qualityScore: number;
  qualityReason: string;
}): NoMatchReason | null {
  if (input.confident) return null;
  if (input.nearbyCount <= 0) return "none_near";
  if (isUnreadablePhoto(input.qualityScore, input.qualityReason)) return "retake";
  return "which_shop";
}
