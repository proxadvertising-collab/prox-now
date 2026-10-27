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
{"shop_id":"sNN or null","confidence":0.0,"sign_text":[{"thai":"original text","english":"translation"}],"quality_score":0,"quality_reason":"one line","faces":[[x1,y1,x2,y2]],"category":"","safe_to_post":true,"safe_reason":""}
Rules: sign_text lists the 1-6 most important text items (shop name, menu items, prices) with Thai-to-English translation (english may equal the text if already English). quality_score is 0-10 for how useful the photo is as a public map photo (sharp, well-framed, readable, well lit). faces = normalized [x1,y1,x2,y2] boxes (0-1, origin top-left) for every human face visible including partial/small/stylized-photo faces, else []. safe_to_post=false if clear identifiable faces of real people, minors, license plates, nudity, ID/cards, or private info are visible; illustrated cartoon faces on a sign are fine.
Extra rules: (a) If the sign's name text is clearly readable but equals no candidate, shop_id=null and put the name you read in sign_text. (b) If the image is a screenshot, photo of a screen, or not a shop/stall/menu, shop_id=null, quality_score<=2. (c) If the image is too blurry/dark to read, shop_id=null and say why in quality_reason. (d) "confidence" is your confidence in shop_id; when shop_id is null set confidence to 0. (e) Real photographs of people's faces count in faces; printed drawings, mascots or cartoons on signs do not (mention in safe_reason). Keep sign_text to at most 6 short items.`;

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
  };
}

export function decide(result: MatcherResult): Decision {
  if (!result.shopId) return "pick-all";
  if (result.confidence >= 0.8) return "confirm";
  return "pick";
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
