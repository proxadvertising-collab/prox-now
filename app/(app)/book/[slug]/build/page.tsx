import { connection } from "next/server";
import { BookBuilder } from "@/components/book/BookBuilder";
import { hasShopEnv } from "@/lib/shops/source";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function coord(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(number) ? number : null;
}

async function shopByKey(key: string): Promise<{ id: string; slug: string; name: string; lat: number | null; lng: number | null } | null> {
  if (!hasShopEnv()) return null;
  try {
    const supabase = await createClient();
    const query = supabase.from("shops").select("id, slug, name, lat, lng");
    const result = UUID.test(key) ? await query.eq("id", key).maybeSingle() : await query.eq("slug", key).maybeSingle();
    const row = result.data;
    if (!row || typeof row.id !== "string" || typeof row.slug !== "string" || typeof row.name !== "string") return null;
    return { id: row.id, slug: row.slug, name: row.name, lat: coord(row.lat), lng: coord(row.lng) };
  } catch {
    return null;
  }
}

export default async function BuildBookPage({ params }: { params: Promise<{ slug: string }> }) {
  await connection();
  const { slug } = await params;
  const key = decodeURIComponent(slug);
  const shop = await shopByKey(key);
  return (
    <BookBuilder
      shopId={shop?.id ?? key}
      slug={shop?.slug ?? key}
      name={shop?.name ?? key}
      lat={shop?.lat ?? null}
      lng={shop?.lng ?? null}
    />
  );
}
