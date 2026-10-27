import { connection, NextResponse } from "next/server";
import { buildMatcherPrompt, parseMatcherResult } from "../../../lib/ai/matcher";
import { callSpark, MetaCallError, MetaKeyMissing, MetaParseError } from "../../../lib/ai/meta";
import { haversineMeters } from "../../../lib/geo";
import { blurFaces, matchShownFaces, normalizeBoxes } from "../../../lib/image/blur";
import { hasShopEnv } from "../../../lib/shops/source";
import { getLivePosts, photoPublicUrl } from "../../../lib/posts/source";
import { createClient } from "../../../lib/supabase/server";

export const maxDuration = 60;

const MAX_BYTES = 3 * 1024 * 1024;
const MAX_DISTANCE_M = 300;
const TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AREA_LABEL = "Soi 102, Hua Hin, Thailand";

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

function readShowFaces(value: FormDataEntryValue | null): number[][] {
  if (typeof value !== "string" || value.length === 0 || value.length > 2000) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((box): box is number[] => Array.isArray(box)).slice(0, 8);
  } catch {
    return [];
  }
}

function blurUnavailable() {
  return NextResponse.json({ error: "blur_unavailable" }, { status: 503 });
}

let loggedFactsFallback = false;

function missingFactsFunction(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const message = String(error.message ?? "").toLowerCase();
  return (
    error.code === "PGRST202" ||
    message.includes("could not find the function") ||
    message.includes("function not found") ||
    message.includes("schema cache")
  );
}

export async function GET() {
  await connection();
  let viewerId: string | null = null;
  if (hasShopEnv()) {
    try {
      const supabase = await createClient();
      const { data } = await supabase.auth.getUser();
      viewerId = data.user?.id ?? null;
    } catch {
      viewerId = null;
    }
  }
  const posts = await getLivePosts(undefined, viewerId);
  return NextResponse.json({ posts });
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return bad("bad_form");
  }

  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (userError || !userId) {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }

  const image = form.get("image");
  if (!(image instanceof File)) return bad("image_required");
  const type = image.type.toLowerCase();
  if (!TYPES.has(type)) return bad("bad_type");
  if (image.size > MAX_BYTES) return bad("too_large");

  const shopId = typeof form.get("shopId") === "string" ? String(form.get("shopId")) : "";
  if (!UUID.test(shopId)) return bad("bad_shop");
  const lat = Number(form.get("lat"));
  const lng = Number(form.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return bad("bad_location");
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return bad("bad_location");

  const { data: shop, error: shopError } = await supabase
    .from("shops")
    .select("id, name, name_local, category, lat, lng")
    .eq("id", shopId)
    .maybeSingle();
  if (shopError || !shop) return bad("too_far");
  const shopLat = Number(shop.lat);
  const shopLng = Number(shop.lng);
  if (!Number.isFinite(shopLat) || !Number.isFinite(shopLng)) return bad("too_far");
  const distanceM = Math.round(haversineMeters({ lat, lng }, { lat: shopLat, lng: shopLng }));
  if (distanceM > MAX_DISTANCE_M) return bad("too_far");

  const bytes = Buffer.from(await image.arrayBuffer());
  const mime = type === "image/jpg" ? "image/jpeg" : type;
  const imageDataUrl = "data:" + mime + ";base64," + bytes.toString("base64");
  const prompt = buildMatcherPrompt({
    areaLabel: AREA_LABEL,
    candidates: [
      {
        id: shopId,
        name: String(shop.name ?? ""),
        nameLocal: shop.name_local ?? null,
        category: String(shop.category ?? "other"),
        distanceM,
      },
    ],
  });

  let raw: unknown;
  try {
    const spark = await callSpark({ prompt, imageDataUrl });
    raw = spark.raw;
  } catch (error) {
    if (error instanceof MetaKeyMissing || error instanceof MetaCallError || error instanceof MetaParseError) {
      return blurUnavailable();
    }
    return blurUnavailable();
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw) || !Array.isArray((raw as { faces?: unknown }).faces)) {
    return blurUnavailable();
  }
  const reported = (raw as { faces: unknown[] }).faces;
  const result = parseMatcherResult(raw, [shopId]);
  const detected = reported.filter((box): box is number[] => Array.isArray(box));
  const boxes = normalizeBoxes(detected);
  if (reported.length > 0 && boxes.length === 0) return blurUnavailable();
  if (result.qualityScore <= 2) {
    return NextResponse.json({ error: "photo_unusable" }, { status: 422 });
  }
  const split = matchShownFaces(detected, readShowFaces(form.get("showFaces")));

  const blurred = await blurFaces(bytes, split.blur);
  const path = userId + "/" + crypto.randomUUID() + ".jpg";
  const uploaded = await supabase.storage.from("post-photos").upload(path, blurred, {
    contentType: "image/jpeg",
    upsert: false,
  });
  if (uploaded.error) return NextResponse.json({ error: "upload_failed" }, { status: 502 });

  const postArgs = {
    p_shop_id: shopId,
    p_photo_path: path,
    p_text_original: result.signText
      .map((item) => item.original.trim())
      .filter(Boolean)
      .join(" | ")
      .slice(0, 400),
    p_text_translated: {
      en: result.signText
        .map((item) => item.translated.trim())
        .filter(Boolean)
        .join(" | ")
        .slice(0, 400),
    },
    p_facts: result.facts,
  };
  let created = await supabase.rpc("create_post", postArgs);
  if (created.error && missingFactsFunction(created.error)) {
    if (!loggedFactsFallback) {
      loggedFactsFallback = true;
      console.warn("create_post facts argument is not available yet");
    }
    const { p_facts: _facts, ...withoutFacts } = postArgs;
    created = await supabase.rpc("create_post", withoutFacts);
  }

  if (created.error) {
    try {
      await supabase.storage.from("post-photos").remove([path]);
    } catch {
      // The session may not be allowed to delete. The row was not created.
    }
    const message = String(created.error.message ?? "");
    if (message.includes("rate_limited")) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }
    if (message.includes("already_live")) {
      return NextResponse.json({ error: "already_live" }, { status: 409 });
    }
    return NextResponse.json({ error: "upstream" }, { status: 502 });
  }

  const row = (Array.isArray(created.data) ? created.data[0] : created.data) as {
    id?: string;
    shop_id?: string;
    created_at?: string;
    expires_at?: string;
  } | null;
  if (!row?.id) return NextResponse.json({ error: "upstream" }, { status: 502 });

  return NextResponse.json({
    post: {
      id: row.id,
      shopId: row.shop_id ?? shopId,
      photoUrl: photoPublicUrl(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", path),
      createdAt: row.created_at ?? null,
      expiresAt: row.expires_at ?? null,
    },
    facesBlurred: split.blur.length,
    facesShown: split.shown,
  });
}

export async function DELETE(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return bad("bad_form");
  }
  const id = payload && typeof payload === "object" ? (payload as { id?: unknown }).id : null;
  if (typeof id !== "string" || !UUID.test(id)) return bad("bad_id");

  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }

  const removed = await supabase.rpc("delete_own_post", { p_id: id });
  if (removed.error) {
    const message = String(removed.error.message ?? "");
    if (message.includes("not_signed_in")) {
      return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
    }
    if (message.includes("not_author")) {
      return NextResponse.json({ error: "not_author" }, { status: 403 });
    }
    if (message.includes("not_found")) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ error: "upstream" }, { status: 502 });
  }

  const path = typeof removed.data === "string" ? removed.data : null;
  if (path) {
    try {
      await supabase.storage.from("post-photos").remove([path]);
    } catch {
      // The row is already gone. A later cleanup can remove the object.
    }
  }
  return NextResponse.json({ ok: true });
}
