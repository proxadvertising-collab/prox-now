import { DEMO_CENTER } from "../fixtures/shops";
import { haversineMeters, type LatLng } from "../geo";

export type MatcherCandidate = {
  id: string;
  name: string;
  nameLocal?: string | null;
  category: string;
  distanceM: number;
};

export type SignText = {
  original: string;
  translated: string;
};

export type CrowdLevel = "empty" | "few" | "busy" | "queue";
export type OpenStatus = "open" | "closed" | "unknown";
export type PlaceSignal = "fresh_batch" | "promo" | "sold_out" | "event" | "music" | "new_item";

export type PlaceItem = {
  name: string;
  price: number | null;
  currency: string | null;
};

export type PlaceFacts = {
  caption: string | null;
  items: PlaceItem[];
  crowd: CrowdLevel | null;
  openStatus: OpenStatus;
  signals: PlaceSignal[];
  signLanguage: string | null;
  captions: { en: string | null; th: string | null };
};

export type PlaceKind = "business" | "public" | "none";

export type MatcherResult = {
  shopId: string | null;
  confidence: number;
  signText: SignText[];
  qualityScore: number;
  qualityReason: string;
  faces: number[][];
  category: string;
  safeToPost: boolean;
  safeReason: string;
  facts: PlaceFacts | null;
  placeName: string | null;
  placeNameLocal: string | null;
  placeKind: PlaceKind | null;
  placeConfidence: number;
};

export type Decision = "confirm" | "pick" | "pick-all";

export type MatchShop = {
  id: string;
  name: string;
  nameLocal?: string;
  category: string;
  lat: number;
  lng: number;
};

const TEMPLATE = `Task: match a customer's photo to ONE shop from a candidate list, for a map app in {AREA}.
Candidates (id | Thai name | English name | category | GPS distance):
{CL}

Method (do it silently): 1) Read all visible text (Thai, English, Chinese, phone numbers, menus). 2) Compare the shop NAME on the sign/menu/flyer to candidate names, tolerating transliteration/spelling variants of the SAME name (e.g. Mala/หม่าล่า) but NOT different names: if even one Thai word or syllable differs (e.g. แม่เย็น vs แม่ยิ้ม), they are different shops. Name text is the strongest evidence, then the type of goods shown, then GPS distance (weak tie-breaker only). 3) If no candidate clearly matches, shop_id must be null - never force a match; a shop that is not in the list should give null.
Confidence guide: 0.9+ name text clearly matches; 0.6-0.89 type/visual match without readable name; <0.5 guess.

Output ONLY this JSON (no markdown fences, no prose):
{"shop_id":"sNN or null","confidence":0.0,"sign_text":[{"thai":"original text","english":"translation"}],"quality_score":0,"quality_reason":"one line","faces":[[x1,y1,x2,y2]],"category":"","safe_to_post":true,"safe_reason":"","facts":{"caption":null,"items":[{"name":"","price":null,"currency":null}],"crowd":null,"open_status":"unknown","signals":[],"sign_language":null,"captions":{"en":null,"th":null}},"place_name":null,"place_name_local":null,"place_kind":"none","place_confidence":0}
Rules: sign_text lists the 1-6 most important text items (shop name, menu items, prices) with Thai-to-English translation (english may equal the text if already English). quality_score is 0-10 for how useful the photo is as a public map photo (sharp, well-framed, readable, well lit). faces = normalized [x1,y1,x2,y2] boxes (0-1, origin top-left). Draw a tight box around each head only, from forehead to chin and ear to ear, one box per face. Include every real human face, including partial faces. Use [] when there is no face. safe_to_post=false if clear identifiable faces of real people, minors, license plates, nudity, ID/cards, or private info are visible; illustrated cartoon faces on a sign are fine.
Facts are about the PLACE and the MOMENT only. Never identify anyone and never describe a person's appearance beyond crowd level. Leave a facts field null when unsure. Keep a price only when it is clearly readable on a sign or board. caption is at most 140 characters of what is shown or sold, with no people. items has at most 8 names. crowd is empty, few, busy, queue, or null. open_status is open, closed, or unknown. signals has at most 5 of fresh_batch, promo, sold_out, event, music, new_item. sign_language is a BCP-47 tag or null. captions.en and captions.th are the caption in those languages, or null.
Extra rules: (a) If the sign's name text is clearly readable but equals no candidate, shop_id=null and put the name you read in sign_text. (b) If the image is a screenshot, photo of a screen, or not a shop/stall/menu, shop_id=null, quality_score<=2. (c) If the image is too blurry/dark to read, shop_id=null and say why in quality_reason. (d) "confidence" is your confidence in shop_id; when shop_id is null set confidence to 0. (e) Real photographs of people's faces count in faces; printed drawings, mascots or cartoons on signs do not (mention in safe_reason). Keep sign_text to at most 6 short items.
Also set place_name to the business name on the sign or storefront, or null. place_name_local is that name in the sign's script, or null. place_kind is business, public, or none. place_confidence is 0 to 1 for how clearly place_name was read. public means a park, beach, landmark, or other public place with no business. none means there is no shop, stall, storefront, or public place, such as a desk, an animal, or a sunset. A shop that is not in the candidate list is still business: shop_id stays null, and the name goes in place_name, place_confidence, and sign_text.`;

export function emptyMatcherResult(): MatcherResult {
  return {
    shopId: null,
    confidence: 0,
    signText: [],
    qualityScore: 0,
    qualityReason: "",
    faces: [],
    category: "",
    safeToPost: false,
    safeReason: "",
    facts: null,
    placeName: null,
    placeNameLocal: null,
    placeKind: null,
    placeConfidence: 0,
  };
}

function candidateLine(candidate: MatcherCandidate): string {
  const local = candidate.nameLocal && candidate.nameLocal.trim() ? candidate.nameLocal : candidate.name;
  return (
    "- " +
    candidate.id +
    " | " +
    local +
    " | " +
    candidate.name +
    " | " +
    candidate.category +
    " | ~" +
    candidate.distanceM +
    " m from the GPS fix"
  );
}

export function buildMatcherPrompt(input: {
  areaLabel: string;
  candidates: readonly MatcherCandidate[];
}): string {
  const lines = input.candidates.map(candidateLine).join("\n");
  return TEMPLATE.split("{AREA}").join(input.areaLabel).split("{CL}").join(lines);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function parseMatcherResult(
  value: unknown,
  candidateIds?: readonly string[],
): MatcherResult {
  const record = asRecord(value);
  if (!record) return emptyMatcherResult();

  let shopId: string | null = null;
  const rawId = record.shop_id ?? record.shopId;
  if (typeof rawId === "string" && rawId.trim() && rawId.trim().toLowerCase() !== "null") {
    shopId = rawId.trim();
  }
  if (candidateIds && shopId && !candidateIds.includes(shopId)) shopId = null;

  let confidence = 0;
  const rawConfidence = record.confidence;
  if (typeof rawConfidence === "number" && Number.isFinite(rawConfidence)) {
    confidence = clamp(rawConfidence, 0, 1);
  }
  if (!shopId) confidence = 0;

  const signText: SignText[] = [];
  const rawSign = record.sign_text ?? record.signText;
  if (Array.isArray(rawSign)) {
    for (const item of rawSign) {
      if (signText.length >= 6) break;
      const row = asRecord(item);
      if (!row) continue;
      const original = row.thai ?? row.original;
      const translated = row.english ?? row.translated;
      if (typeof original !== "string" || typeof translated !== "string") continue;
      const cleanOriginal = original.trim();
      const cleanTranslated = translated.trim();
      if (!cleanOriginal || !cleanTranslated) continue;
      signText.push({ original: cleanOriginal, translated: cleanTranslated });
    }
  }

  let qualityScore = 0;
  const rawQuality = record.quality_score ?? record.qualityScore;
  if (typeof rawQuality === "number" && Number.isFinite(rawQuality)) {
    qualityScore = clamp(rawQuality, 0, 10);
  }

  const qualityReason =
    typeof record.quality_reason === "string"
      ? record.quality_reason
      : typeof record.qualityReason === "string"
        ? record.qualityReason
        : "";

  const faces: number[][] = [];
  if (Array.isArray(record.faces)) {
    for (const box of record.faces) {
      if (!Array.isArray(box) || box.length !== 4) continue;
      const nums = box.map((part) => (typeof part === "number" && Number.isFinite(part) ? part : null));
      if (nums.some((part) => part === null)) continue;
      faces.push(nums.map((part) => clamp(part as number, 0, 1)));
    }
  }

  const category = typeof record.category === "string" ? record.category : "";
  const safeReason =
    typeof record.safe_reason === "string"
      ? record.safe_reason
      : typeof record.safeReason === "string"
        ? record.safeReason
        : "";
  const rawSafe = record.safe_to_post ?? record.safeToPost;
  const safeToPost = rawSafe === true;
  const place = readPlaceFields(record);

  return {
    shopId,
    confidence,
    signText,
    qualityScore,
    qualityReason,
    faces,
    category,
    safeToPost,
    safeReason,
    facts: parseFacts(record.facts),
    placeName: place.name,
    placeNameLocal: place.local,
    placeKind: place.kind,
    placeConfidence: place.confidence,
  };
}

const PLACE_KINDS = new Set<PlaceKind>(["business", "public", "none"]);

function readPlaceFields(record: Record<string, unknown>): {
  name: string | null;
  local: string | null;
  kind: PlaceKind | null;
  confidence: number;
} {
  const name = clip(record.place_name ?? record.placeName, 80);
  const local = clip(record.place_name_local ?? record.placeNameLocal, 80);
  const kindRaw = record.place_kind ?? record.placeKind;
  const kind = typeof kindRaw === "string" && PLACE_KINDS.has(kindRaw as PlaceKind) ? (kindRaw as PlaceKind) : null;
  let confidence = 0;
  const raw = record.place_confidence ?? record.placeConfidence;
  if (typeof raw === "number" && Number.isFinite(raw)) confidence = clamp(raw, 0, 1);
  if (!name) confidence = kind === "public" ? confidence : 0;
  return { name, local, kind, confidence };
}

const CROWD = new Set<CrowdLevel>(["empty", "few", "busy", "queue"]);
const OPEN = new Set<OpenStatus>(["open", "closed", "unknown"]);
const SIGNALS = new Set<PlaceSignal>(["fresh_batch", "promo", "sold_out", "event", "music", "new_item"]);

function clip(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().slice(0, max);
  return text.length > 0 ? text : null;
}

function parseFacts(value: unknown): PlaceFacts | null {
  const record = asRecord(value);
  if (!record) return null;

  const items: PlaceItem[] = [];
  const rawItems = record.items;
  if (Array.isArray(rawItems)) {
    for (const item of rawItems) {
      if (items.length >= 8) break;
      const row = asRecord(item);
      if (!row) continue;
      const name = clip(row.name, 80);
      if (!name) continue;
      let price: number | null = null;
      if (typeof row.price === "number" && Number.isFinite(row.price) && row.price >= 0 && row.price <= 1_000_000) {
        price = row.price;
      }
      const currency = typeof row.currency === "string" && /^[A-Z]{3}$/.test(row.currency) ? row.currency : null;
      items.push({ name, price, currency });
    }
  }

  const crowdRaw = record.crowd;
  const crowd = typeof crowdRaw === "string" && CROWD.has(crowdRaw as CrowdLevel) ? (crowdRaw as CrowdLevel) : null;
  const openRaw = record.open_status ?? record.openStatus;
  const openStatus =
    typeof openRaw === "string" && OPEN.has(openRaw as OpenStatus) ? (openRaw as OpenStatus) : "unknown";

  const signals: PlaceSignal[] = [];
  if (Array.isArray(record.signals)) {
    for (const signal of record.signals) {
      if (signals.length >= 5) break;
      if (typeof signal !== "string" || !SIGNALS.has(signal as PlaceSignal)) continue;
      const typed = signal as PlaceSignal;
      if (!signals.includes(typed)) signals.push(typed);
    }
  }

  const languageRaw = record.sign_language ?? record.signLanguage;
  const signLanguage =
    typeof languageRaw === "string" && /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,3}$/.test(languageRaw.trim())
      ? languageRaw.trim().slice(0, 35)
      : null;

  const captionsRaw = asRecord(record.captions);

  return {
    caption: clip(record.caption, 140),
    items,
    crowd,
    openStatus,
    signals,
    signLanguage,
    captions: {
      en: clip(captionsRaw?.en, 140),
      th: clip(captionsRaw?.th, 140),
    },
  };
}

export function decide(result: MatcherResult): Decision {
  if (!result.shopId) return "pick-all";
  if (result.confidence >= 0.8) return "confirm";
  return "pick";
}

/** Exact folded names, and near-misses such as one extra letter. */
export const SIGN_MATCH_STRONG = 0.85;
export const SIGN_MATCH_CONFIDENCE = 0.95;

export function compactShopName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\u0e00-\u0e7f\u4e00-\u9fff]+/g, "");
}

function editDistance(left: string, right: string): number {
  if (left === right) return 0;
  if (left.length === 0) return right.length;
  if (right.length === 0) return left.length;
  const row = new Array<number>(right.length + 1);
  for (let column = 0; column <= right.length; column += 1) row[column] = column;
  for (let i = 1; i <= left.length; i += 1) {
    let previous = row[0] ?? 0;
    row[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const current = row[j] ?? 0;
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      const next = Math.min(current + 1, (row[j - 1] ?? 0) + 1, previous + cost);
      row[j] = next;
      previous = current;
    }
  }
  return row[right.length] ?? 0;
}

/** 1 when the names are the same after case and spaces are removed. */
export function nameMatchScore(readName: string, shopName: string): number {
  const left = compactShopName(readName);
  const right = compactShopName(shopName);
  if (left.length < 4 || right.length < 4) return 0;
  if (left === right) return 1;
  const distance = editDistance(left, right);
  return 1 - distance / Math.max(left.length, right.length);
}

export function matchShopBySign<T extends { id: string; name: string; nameLocal?: string | null }>(
  readName: string,
  shops: readonly T[],
): { shop: T; score: number } | null {
  let best: { shop: T; score: number } | null = null;
  for (const shop of shops) {
    const score = Math.max(
      nameMatchScore(readName, shop.name),
      shop.nameLocal ? nameMatchScore(readName, shop.nameLocal) : 0,
    );
    if (score < SIGN_MATCH_STRONG) continue;
    if (!best || score > best.score) best = { shop, score };
  }
  return best;
}

function signNames(result: MatcherResult): string[] {
  const names = [result.placeName, result.placeNameLocal];
  for (const line of result.signText) names.push(line.original, line.translated);
  return names.filter((name): name is string => Boolean(name && name.trim()));
}

/**
 * A strong read of the sign wins over the model id.
 * The matched shop is moved to the front, including when it sat outside the short list.
 */
export function applySignMatch<T extends { id: string; name: string; nameLocal?: string | null }>(
  result: MatcherResult,
  shops: readonly T[],
): { result: MatcherResult; shops: T[]; matched: boolean } {
  let best: { shop: T; score: number } | null = null;
  for (const name of signNames(result)) {
    const hit = matchShopBySign(name, shops);
    if (hit && (!best || hit.score > best.score)) best = hit;
  }
  if (!best) return { result, shops: shops.slice(), matched: false };
  const rest = shops.filter((shop) => shop.id !== best.shop.id);
  return {
    result: {
      ...result,
      shopId: best.shop.id,
      confidence: best.score >= 1 ? SIGN_MATCH_CONFIDENCE : 0.9,
    },
    shops: [best.shop, ...rest],
    matched: true,
  };
}

function rank(shops: readonly MatchShop[], origin: LatLng): MatcherCandidate[] {
  return shops
    .map((shop) => ({
      id: shop.id,
      name: shop.name,
      nameLocal: shop.nameLocal ?? null,
      category: shop.category,
      distanceM: Math.round(haversineMeters(origin, shop)),
    }))
    .sort((a, b) => a.distanceM - b.distanceM || a.id.localeCompare(b.id));
}

export function selectCandidates(
  point: LatLng | null,
  shops: readonly MatchShop[],
  options?: { radiusM?: number; max?: number },
): { candidates: MatcherCandidate[]; demo: boolean } {
  const radiusM = options?.radiusM ?? 500;
  const max = options?.max ?? 10;
  if (point) {
    const near = rank(shops, point)
      .filter((shop) => shop.distanceM <= radiusM)
      .slice(0, max);
    if (near.length > 0) return { candidates: near, demo: false };
  }
  return { candidates: rank(shops, DEMO_CENTER).slice(0, max), demo: true };
}
