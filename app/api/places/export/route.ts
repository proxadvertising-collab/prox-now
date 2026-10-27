import { connection, NextResponse } from "next/server";
import {
  EXPORT_COLUMNS,
  EXPORT_LIMIT,
  parseExportQuery,
  toFeatureCollection,
  type ShopPlaceRow,
} from "../../../../lib/places/overture";
import { hasShopEnv } from "../../../../lib/shops/source";
import { createClient } from "../../../../lib/supabase/server";

export async function GET(request: Request) {
  await connection();
  const parsed = parseExportQuery(new URL(request.url).searchParams);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const headers = { "Cache-Control": "public, max-age=300, s-maxage=300" };
  if (!hasShopEnv()) {
    return NextResponse.json(toFeatureCollection([]), { headers });
  }

  try {
    const supabase = await createClient();
    let query = supabase
      .from("shops")
      .select(EXPORT_COLUMNS)
      .not("created_by", "is", null)
      .eq("is_demo", false);
    if (parsed.country) query = query.eq("country_code", parsed.country);
    if (parsed.since) query = query.gt("created_at", parsed.since);
    const { data, error } = await query.order("created_at", { ascending: false }).limit(EXPORT_LIMIT);
    if (error || !data) return NextResponse.json(toFeatureCollection([]), { headers });
    return NextResponse.json(toFeatureCollection(data as ShopPlaceRow[]), { headers });
  } catch (error) {
    if (typeof error === "object" && error !== null && "digest" in error) throw error;
    return NextResponse.json(toFeatureCollection([]), { headers });
  }
}
