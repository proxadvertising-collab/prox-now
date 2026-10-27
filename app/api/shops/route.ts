import { NextResponse } from "next/server";
import { currencyForCountry, parseCountryHeader, parseTimezone } from "../../../lib/places/world";
import { SHOP_CATEGORIES, type ShopCategory } from "../../../lib/snap/prefill";
import { createClient } from "../../../lib/supabase/server";

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

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return bad("bad_form");
  }
  const input = readShopInput(payload);
  if (!input) return bad("bad_input");
  const country = parseCountryHeader(request.headers.get("x-vercel-ip-country"));
  const timezone = parseTimezone(
    payload && typeof payload === "object" ? (payload as Record<string, unknown>).timezone : null,
  );
  const currency = currencyForCountry(country);

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

  const { data, error } = await supabase.rpc("create_shop_from_snap", {
    p_name: input.name,
    p_name_local: input.nameLocal,
    p_category: input.category,
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
  return NextResponse.json({ shop: shopPayload(row) });
}
