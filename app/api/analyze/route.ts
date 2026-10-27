import {
  buildMatcherPrompt,
  decide,
  emptyMatcherResult,
  parseMatcherResult,
  type MatcherCandidate,
} from "../../../lib/ai/matcher";
import { callSpark, MetaCallError, MetaKeyMissing, MetaParseError } from "../../../lib/ai/meta";
import type { LatLng } from "../../../lib/geo";
import { allowSnap, clientIp } from "../../../lib/rate/window";
import { getShopsNear, hasShopEnv, type NearbyShopRow } from "../../../lib/shops/source";
import { createClient } from "../../../lib/supabase/server";
import { NextResponse } from "next/server";

// Cache Components requires the Node.js runtime and rejects the runtime segment config.
export const maxDuration = 60;

const MAX_BYTES = 3 * 1024 * 1024;
const AREA_LABEL = "Soi 102, Hua Hin, Thailand";
const TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

async function queryNearby(origin: LatLng): Promise<NearbyShopRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("nearby_shops", {
    p_lat: origin.lat,
    p_lng: origin.lng,
    p_radius_m: 600,
  });
  if (error) throw new Error("nearby");
  return (data ?? []) as NearbyShopRow[];
}

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

async function signedInUserId(): Promise<string | null> {
  if (!hasShopEnv()) return null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

function readCoord(value: FormDataEntryValue | null): number | null | "bad" {
  if (value === null || value === "") return null;
  if (typeof value !== "string") return "bad";
  const number = Number(value);
  if (!Number.isFinite(number)) return "bad";
  return number;
}

function orderCandidates(
  candidates: MatcherCandidate[],
  shopId: string | null,
): MatcherCandidate[] {
  if (!shopId) return candidates;
  const index = candidates.findIndex((shop) => shop.id === shopId);
  if (index <= 0) return candidates;
  const next = candidates.slice();
  const [guess] = next.splice(index, 1);
  return [guess, ...next];
}

export async function POST(request: Request) {
  const started = Date.now();
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return bad("bad_form");
  }

  const image = form.get("image");
  if (!(image instanceof File)) return bad("image_required");
  const type = image.type.toLowerCase();
  if (!TYPES.has(type)) return bad("bad_type");
  if (image.size > MAX_BYTES) return bad("too_large");

  const lat = readCoord(form.get("lat"));
  const lng = readCoord(form.get("lng"));
  if (lat === "bad" || lng === "bad") return bad("bad_location");
  if ((lat === null) !== (lng === null)) return bad("bad_location");
  if (typeof lat === "number" && (lat < -90 || lat > 90)) return bad("bad_location");
  if (typeof lng === "number" && (lng < -180 || lng > 180)) return bad("bad_location");

  const point = typeof lat === "number" && typeof lng === "number" ? { lat, lng } : null;
  const selected = await getShopsNear(point, hasShopEnv() ? queryNearby : undefined);
  const ids = selected.candidates.map((shop) => shop.id);
  const prompt = buildMatcherPrompt({
    areaLabel: AREA_LABEL,
    candidates: selected.candidates,
  });

  const mime = type === "image/jpg" ? "image/jpeg" : type;
  const bytes = Buffer.from(await image.arrayBuffer());
  const imageDataUrl = "data:" + mime + ";base64," + bytes.toString("base64");
  if (!(await allowSnap(clientIp(request), await signedInUserId()))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  try {
    const spark = await callSpark({ prompt, imageDataUrl });
    const result = parseMatcherResult(spark.raw, ids);
    const decision = decide(result);
    return NextResponse.json({
      decision,
      result,
      candidates: orderCandidates(selected.candidates, result.shopId).map((shop) => ({
        id: shop.id,
        name: shop.name,
        nameLocal: shop.nameLocal,
        distanceM: shop.distanceM,
      })),
      demo: selected.demo,
      ms: spark.ms,
    });
  } catch (error) {
    if (error instanceof MetaKeyMissing) {
      return NextResponse.json({ error: "ai_not_configured" }, { status: 503 });
    }
    if (error instanceof MetaParseError) {
      return NextResponse.json({
        decision: "pick-all",
        result: emptyMatcherResult(),
        candidates: selected.candidates.map((shop) => ({
          id: shop.id,
          name: shop.name,
          nameLocal: shop.nameLocal,
          distanceM: shop.distanceM,
        })),
        demo: selected.demo,
        ms: Date.now() - started,
      });
    }
    const code = error instanceof MetaCallError ? error.code : "upstream";
    return NextResponse.json({ error: code }, { status: code === "busy" ? 503 : 502 });
  }
}
