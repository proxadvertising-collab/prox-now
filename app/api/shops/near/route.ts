import { NextResponse } from "next/server";
import { hasShopEnv, mapShopsFromRows, type MapShopRow } from "../../../../lib/shops/source";
import { createClient } from "../../../../lib/supabase/server";

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return bad("bad_location");
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return bad("bad_location");
  if (!hasShopEnv()) return NextResponse.json({ shops: [] });

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("shops")
      .select("id, slug, name, name_local, category, lat, lng, is_demo")
      .eq("is_demo", false);
    if (error || !data) return NextResponse.json({ shops: [] });
    const shops = mapShopsFromRows(data as MapShopRow[], { lat, lng });
    return NextResponse.json({ shops });
  } catch {
    return NextResponse.json({ shops: [] });
  }
}
