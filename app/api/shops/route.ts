import { NextResponse } from "next/server";
import { buildMatcherPrompt, parseMatcherResult } from "../../../lib/ai/matcher";
import { callSpark, MetaCallError, MetaKeyMissing, MetaParseError } from "../../../lib/ai/meta";
import { currencyForCountry, parseCountryHeader, parseTimezone, timezoneFromPoint } from "../../../lib/places/world";
import {
  POST_RADIUS_M,
  blockingShops,
  editedNameAllowed,
  isPublicPlace,
  isUnreadablePhoto,
  readBusiness,
  sanitizeShopName,
  type GateShop,
} from "../../../lib/snap/place";
import { SHOP_CATEGORIES, type ShopCategory } from "../../../lib/snap/prefill";
import { createClient } from "../../../lib/supabase/server";

const MAX_BYTES = 3 * 1024 * 1024;
const AREA_LABEL = "Soi 102, Hua Hin, Thailand";
const IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

const CATEGORIES = new Set<string>(SHOP_CATEGORIES);

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

type ShopInput = {
  name: string;
  nameLocal: string | null;
  category: ShopCategory;
  lat: number;
  lng: number;
  addressHint: string | null;
};

function readShopInput(value: unknown): ShopInput | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  if (typeof body.name !== "string") return null;
  const name = body.name.trim();
  if (name.length < 2 || name.length > 80) return null;

  let nameLocal: string | null = null;
  if (body.nameLocal != null && body.nameLocal !== "") {
    if (typeof body.nameLocal !== "string") return null;
    nameLocal = body.nameLocal.trim();
    if (nameLocal.length > 80) return null;
    if (nameLocal.length === 0) nameLocal = null;
  }

  const categoryRaw = typeof body.category === "string" ? body.category.trim() : "other";
  const category = (CATEGORIES.has(categoryRaw) ? categoryRaw : "other") as ShopCategory;
  if (typeof body.lat !== "number" || typeof body.lng !== "number") return null;
  if (!Number.isFinite(body.lat) || !Number.isFinite(body.lng)) return null;
  if (body.lat < -90 || body.lat > 90 || body.lng < -180 || body.lng > 180) return null;

  let addressHint: string | null = null;
  if (typeof body.addressHint === "string") {
    const hint = body.addressHint.trim();
    if (hint.length > 160) return null;
    addressHint = hint.length > 0 ? hint : null;
  }

  return { name, nameLocal, category, lat: body.lat, lng: body.lng, addressHint };
}

function shopPayload(row: Record<string, unknown>) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    nameLocal: row.name_local ?? null,
    category: row.category,
    lat: row.lat,
    lng: row.lng,
  };
}

type ShopClient = {
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null }; error: unknown }> };
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

async function readBody(request: Request): Promise<{ payload: Record<string, unknown>; image: File | null } | "bad"> {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return "bad";
    }
    const lat = Number(form.get("lat"));
    const lng = Number(form.get("lng"));
    const image = form.get("image");
    return {
      payload: {
        name: form.get("name"),
        nameLocal: form.get("nameLocal"),
        category: form.get("category"),
        lat,
        lng,
        timezone: form.get("timezone"),
        addressHint: form.get("addressHint"),
      },
      image: image instanceof File && image.size > 0 ? image : null,
    };
  }
  try {
    const payload = asRecord(await request.json());
    if (!payload) return "bad";
    return { payload, image: null };
  } catch {
    return "bad";
  }
}

async function nearbyGate(supabase: ShopClient, lat: number, lng: number): Promise<GateShop[] | null> {
  try {
    const { data, error } = await supabase.rpc("nearby_shops", {
      p_lat: lat,
      p_lng: lng,
      p_radius_m: POST_RADIUS_M,
    });
    if (error || !Array.isArray(data)) return null;
    const shops: GateShop[] = [];
    for (const item of data) {
      const row = asRecord(item);
      if (!row) continue;
      const id = typeof row.id === "string" ? row.id : typeof row.shop_id === "string" ? row.shop_id : "";
      const name = typeof row.name === "string" ? row.name : typeof row.shop_name === "string" ? row.shop_name : "";
      if (!id || !name) continue;
      const localRaw = row.name_local ?? row.shop_name_local;
      const distance = Number(row.distance_m ?? row.metres);
      if (!Number.isFinite(distance)) continue;
      shops.push({
        id,
        name,
        nameLocal: typeof localRaw === "string" ? localRaw : null,
        distanceM: Math.round(distance),
      });
    }
    return shops;
  } catch {
    return null;
  }
}

async function visionPlace(image: File, shops: readonly GateShop[]) {
  if (!IMAGE_TYPES.has(image.type.toLowerCase()) || image.size > MAX_BYTES) return "bad_photo" as const;
  const mime = image.type.toLowerCase() === "image/jpg" ? "image/jpeg" : image.type.toLowerCase();
  const bytes = Buffer.from(await image.arrayBuffer());
  const imageDataUrl = "data:" + mime + ";base64," + bytes.toString("base64");
  const prompt = buildMatcherPrompt({
    areaLabel: AREA_LABEL,
    candidates: shops.map((shop) => ({
      id: shop.id,
      name: shop.name,
      nameLocal: shop.nameLocal ?? null,
      category: "other",
      distanceM: shop.distanceM,
    })),
  });
  try {
    const spark = await callSpark({ prompt, imageDataUrl });
    const result = parseMatcherResult(
      spark.raw,
      shops.map((shop) => shop.id),
    );
    if (isUnreadablePhoto(result.qualityScore, result.qualityReason)) return "unreadable" as const;
    if (isPublicPlace(result)) return "public" as const;
    const business = readBusiness(result);
    if (!business) return "none" as const;
    return business;
  } catch (error) {
    if (error instanceof MetaKeyMissing) return "ai_not_configured" as const;
    if (error instanceof MetaCallError && error.code === "busy") return "ai_resting" as const;
    if (error instanceof MetaCallError || error instanceof MetaParseError) return "ai_down" as const;
    return "ai_down" as const;
  }
}

function acceptedLocal(submitted: string | null, modelName: string, modelLocal: string | null): string | null {
  if (submitted && (editedNameAllowed(submitted, modelName) || (modelLocal ? editedNameAllowed(submitted, modelLocal) : false))) {
    return sanitizeShopName(submitted);
  }
  return modelLocal ? sanitizeShopName(modelLocal) : null;
}

export async function POST(request: Request) {
  const body = await readBody(request);
  if (body === "bad") return bad("bad_form");
  const input = readShopInput(body.payload);
  if (!input) return bad("bad_input");
  const country = parseCountryHeader(request.headers.get("x-vercel-ip-country"));
  const fromPoint = timezoneFromPoint(input.lat, input.lng);
  const fromBrowser = parseTimezone(body.payload.timezone);
  const timezone = fromPoint ?? fromBrowser;
  const currency = currencyForCountry(country);

  let supabase: ShopClient;
  try {
    supabase = (await createClient()) as unknown as ShopClient;
  } catch {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }

  const nearby = await nearbyGate(supabase, input.lat, input.lng);
  if (!nearby) return NextResponse.json({ error: "upstream" }, { status: 502 });

  const name = sanitizeShopName(input.name);
  if (!name) return bad("bad_name");
  let nameLocal = input.nameLocal ? sanitizeShopName(input.nameLocal) : null;
  const category = input.category;

  if (body.image) {
    const seen = await visionPlace(body.image, nearby);
    if (seen === "bad_photo") return bad("bad_type");
    if (seen === "ai_not_configured") return NextResponse.json({ error: "ai_not_configured" }, { status: 503 });
    if (seen === "ai_resting") return NextResponse.json({ error: "ai_resting" }, { status: 503 });
    if (seen === "ai_down") return NextResponse.json({ error: "upstream" }, { status: 502 });
    if (seen === "unreadable") return NextResponse.json({ error: "photo_unusable" }, { status: 422 });
    if (seen === "public") return NextResponse.json({ error: "public_place" }, { status: 422 });
    if (seen === "none") return NextResponse.json({ error: "not_a_place" }, { status: 422 });
    if (!editedNameAllowed(name, seen.name)) return bad("bad_name");
    nameLocal = acceptedLocal(nameLocal, seen.name, seen.nameLocal);
  }

  const force = body.payload.force === true;
  if (!force) {
    const blocked = blockingShops(nearby, name);
    if (blocked.length > 0) {
      return NextResponse.json(
        {
          error: "shop_exists",
          shops: blocked.map((shop) => ({
            id: shop.id,
            name: shop.name,
            nameLocal: shop.nameLocal ?? null,
            distanceM: shop.distanceM,
          })),
        },
        { status: 409 },
      );
    }
  }

  const createName = force ? distinctShopName(name) : name;
  const { data, error } = await supabase.rpc("create_shop_from_snap", {
    p_name: createName,
    p_name_local: nameLocal,
    p_category: category,
    p_lat: input.lat,
    p_lng: input.lng,
    p_address_hint: input.addressHint,
    p_country_code: country,
    p_timezone: timezone,
    p_currency: currency,
  });

  if (error) {
    const message = String(error.message ?? "");
    if (message.includes("not_signed_in")) {
      return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
    }
    if (message.includes("rate_limited")) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }
    if (message.includes("bad_location")) {
      return NextResponse.json({ error: "bad_location" }, { status: 400 });
    }
    if (message.includes("bad_name")) {
      return NextResponse.json({ error: "bad_name" }, { status: 400 });
    }
    return NextResponse.json({ error: "upstream" }, { status: 502 });
  }

  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  if (!row || typeof row.id !== "string" || typeof row.name !== "string") {
    return NextResponse.json({ error: "upstream" }, { status: 502 });
  }
  if (force && row.name !== name) {
    const renamed = await supabase.rpc("set_shop_name", { p_shop_id: row.id, p_name: name });
    if (!renamed.error && typeof renamed.data === "string") row.name = renamed.data;
  }
  return NextResponse.json({ shop: shopPayload(row) });
}

function distinctShopName(name: string): string {
  const suffix = Math.random().toString(36).slice(2, 6);
  return (name.slice(0, 70).trim() + " " + suffix).slice(0, 80);
}
