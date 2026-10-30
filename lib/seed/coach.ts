export const SEED_MIN = 3;
export const SEED_MAX = 8;
export const PICK_METERS = 60;
export const COACH_EDGE = 512;
export const COACH_TIMEOUT_MS = 4000;

export const CONTAINS = [
  "storefront",
  "logo",
  "menu_board",
  "price_tag",
  "promo",
  "deal_card",
  "hours_sign",
  "qr",
  "product",
] as const;

export type Contain = (typeof CONTAINS)[number];

const CONTAIN_SET = new Set<string>(CONTAINS);
const COACH_KEYS = ["sharp", "duplicate_of", "contains", "name_guess", "next_tip_en", "next_tip_th"] as const;

export type CoachRead = {
  sharp: boolean;
  duplicate_of: number | null;
  contains: Contain[];
  name_guess: string | null;
  next_tip_en: string;
  next_tip_th: string;
};

export type CoachChips = { sign: boolean; menu: boolean; deals: boolean; hours: boolean };

export type CoachToast = { text: string; duplicateOf: number | null };

type NamedDistance = { name: string; distanceM: number };

export function nearbyShops<T extends NamedDistance>(shops: readonly T[], meters = PICK_METERS): T[] {
  return shops
    .filter((shop) => Number.isFinite(shop.distanceM) && shop.distanceM >= 0 && shop.distanceM <= meters)
    .slice()
    .sort((a, b) => a.distanceM - b.distanceM || a.name.localeCompare(b.name));
}

export function doneEnabled(count: number): boolean {
  return count >= SEED_MIN && count <= SEED_MAX;
}

export function canAddShot(count: number): boolean {
  return count < SEED_MAX;
}

export function seedKinds(count: number): "auto"[] {
  return Array.from({ length: Math.max(0, count) }, () => "auto" as const);
}

function asContain(value: unknown): Contain[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<Contain>();
  const contains: Contain[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !CONTAIN_SET.has(item)) continue;
    const kind = item as Contain;
    if (seen.has(kind)) continue;
    seen.add(kind);
    contains.push(kind);
  }
  return contains;
}

export function parseCoach(value: unknown, shotIndex?: number): CoachRead | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!COACH_KEYS.includes(key as (typeof COACH_KEYS)[number])) return null;
  }
  if (typeof record.sharp !== "boolean") return null;
  if (typeof record.next_tip_en !== "string" || typeof record.next_tip_th !== "string") return null;
  let duplicate: number | null = null;
  if (record.duplicate_of !== null) {
    if (typeof record.duplicate_of !== "number" || !Number.isInteger(record.duplicate_of) || record.duplicate_of < 1) {
      return null;
    }
    duplicate = record.duplicate_of;
    if (shotIndex !== undefined && duplicate >= shotIndex) duplicate = null;
  }
  let name: string | null = null;
  if (record.name_guess !== null) {
    if (typeof record.name_guess !== "string") return null;
    const trimmed = record.name_guess.trim();
    name = trimmed.length > 0 ? trimmed : null;
  }
  return {
    sharp: record.sharp,
    duplicate_of: duplicate,
    contains: asContain(record.contains),
    name_guess: name,
    next_tip_en: record.next_tip_en,
    next_tip_th: record.next_tip_th,
  };
}

export async function readCoach(run: () => Promise<unknown>, shotIndex?: number): Promise<CoachRead | null> {
  try {
    return parseCoach(await run(), shotIndex);
  } catch {
    return null;
  }
}

export function seenChips(shots: readonly { contains: readonly string[] }[]): CoachChips {
  const all = new Set(shots.flatMap((shot) => shot.contains));
  return {
    sign: all.has("storefront") || all.has("logo"),
    menu: all.has("menu_board") || all.has("price_tag"),
    deals: all.has("promo") || all.has("deal_card"),
    hours: all.has("hours_sign"),
  };
}

function saysExtra(text: string): boolean {
  return /\bextra\b/i.test(text);
}

export function coachToast(read: CoachRead, lang: "en" | "th"): CoachToast | null {
  if (!read.sharp) {
    return { text: lang === "th" ? "เบลอไป ถ่ายใหม่ไหม" : "Too blurry, retake?", duplicateOf: null };
  }
  if (read.duplicate_of !== null) {
    const n = String(read.duplicate_of);
    return {
      text: lang === "th" ? "ซ้ำกับรูป " + n : "Same as photo " + n,
      duplicateOf: read.duplicate_of,
    };
  }
  const tip = (lang === "th" ? read.next_tip_th : read.next_tip_en).trim();
  if (!tip || saysExtra(tip)) return null;
  return { text: tip, duplicateOf: null };
}

export function coachPrompt(
  index: number,
  previous: readonly { index: number; contains: readonly string[] }[],
): string {
  const prior =
    previous.length === 0
      ? "No earlier photos."
      : previous.map((shot) => "Photo " + shot.index + ": " + (shot.contains.join(", ") || "nothing listed")).join("\n");
  return [
    "You coach a person photographing one shop for a digital book.",
    "Reply with strict JSON only.",
    "This is photo " + index + ".",
    "Earlier photos:",
    prior,
    "Priority for the next tip: the shop sign or logo, then the MAIN menu board with prices, then deals, then hours.",
    "Never say the word extra.",
    "duplicate_of is the earlier photo number when this is the same scene, otherwise null.",
    "sharp is false when the photo is too blurry to read.",
    "contains uses only storefront, logo, menu_board, price_tag, promo, deal_card, hours_sign, qr, product.",
    "name_guess is the shop name when you can read it, otherwise null.",
    "next_tip_en and next_tip_th name the single next thing to shoot.",
    '{"sharp":boolean,"duplicate_of":number|null,"contains":string[],"name_guess":string|null,"next_tip_en":string,"next_tip_th":string}',
  ].join("\n");
}

