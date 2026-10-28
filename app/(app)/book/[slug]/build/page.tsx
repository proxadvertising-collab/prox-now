import { connection } from "next/server";
import { BookBuilder } from "@/components/book/BookBuilder";
import { t } from "@/lib/copy";
import { hasShopEnv } from "@/lib/shops/source";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function shopByKey(key: string): Promise<{ slug: string; name: string } | null> {
  if (!hasShopEnv()) return null;
  try {
    const supabase = await createClient();
    const query = supabase.from("shops").select("slug, name");
    const result = UUID.test(key) ? await query.eq("id", key).maybeSingle() : await query.eq("slug", key).maybeSingle();
    const row = result.data;
    if (!row || typeof row.slug !== "string" || typeof row.name !== "string") return null;
    return { slug: row.slug, name: row.name };
  } catch {
    return null;
  }
}

export default async function BuildBookPage({ params }: { params: Promise<{ slug: string }> }) {
  await connection();
  const { slug } = await params;
  const key = decodeURIComponent(slug);
  const shop = await shopByKey(key);
  return <BookBuilder slug={shop?.slug ?? key} name={shop?.name ?? key} />;
}
