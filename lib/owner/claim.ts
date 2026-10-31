import { haversineMeters, type LatLng } from "../geo";

export const CLAIM_RADIUS_M = 150;

export type ClaimMode = "hidden" | "own" | "claim";

export function claimNear(here: LatLng | null, shop: LatLng | null): boolean {
  if (!here || !shop) return false;
  if (!Number.isFinite(here.lat) || !Number.isFinite(here.lng)) return false;
  if (!Number.isFinite(shop.lat) || !Number.isFinite(shop.lng)) return false;
  return haversineMeters(here, shop) <= CLAIM_RADIUS_M;
}

const CLAIM_WORDS = ["mango", "river", "lime", "paper", "tiger", "coral", "bamboo", "pepper", "lotus", "amber"];

/** A short word plus 4 digits. The owner writes this on paper for the live photo. */
export function claimCode(random: () => number = Math.random): string {
  const word = CLAIM_WORDS[Math.floor(random() * CLAIM_WORDS.length)] ?? "mango";
  const digits = String(Math.floor(random() * 10000)).padStart(4, "0");
  return word + " " + digits;
}

/** Quotes and line breaks cannot break out of the prompt string. */
export function quoteShopName(name: string): string {
  return name.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]/g, " ").slice(0, 80);
}

export function claimPrompt(shopName: string, code = ""): string {
  const name = quoteShopName(shopName);
  const safeCode = quoteShopName(code);
  const codeLine = safeCode
    ? 'The owner wrote the code "' + safeCode + '" on paper. That exact code must be readable in the photo. '
    : "";
  return (
    codeLine +
    'Does this photo show the sign, menu, or register for "' +
    name +
    '"? Reply with JSON only: {"match":true} or {"match":false}. ' +
    "Match when that shop's name is readable, including another script or a short form, and the written code matches. " +
    "A different shop, a missing code, or a photo that is not a sign, menu, or register, is false."
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

/**
 * A real claim is verified only when the photo matches the stored code.
 * `near` and `live` are client fields. They cannot grant or block verification.
 */
export function claimGranted(input: { match: boolean; near?: boolean; live?: boolean }): boolean {
  return input.match === true;
}

export function claimStatus(near: boolean, match: boolean): "verified" | "pending" {
  return claimGranted({ match, near }) ? "verified" : "pending";
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
