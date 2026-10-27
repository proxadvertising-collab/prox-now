import { connection, NextResponse } from "next/server";
import { isUuid } from "../../../../../lib/owner/http";
import { createClient } from "../../../../../lib/supabase/server";

export async function GET(_request: Request, context: { params: Promise<{ shopId: string }> }) {
  await connection();
  const { shopId } = await context.params;
  if (!isUuid(shopId)) return NextResponse.json({ error: "bad_id" }, { status: 400 });
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("place_facts")
      .select("observed_at, facts")
      .eq("shop_id", shopId)
      .order("observed_at", { ascending: false })
      .limit(20);
    if (error) return NextResponse.json({ facts: [] });
    const facts = (data ?? []).map((row) => {
      const raw = row.facts && typeof row.facts === "object" ? (row.facts as Record<string, unknown>) : {};
      const { caption: _caption, captions: _captions, ...rest } = raw;
      return { observedAt: row.observed_at, ...rest };
    });
    return NextResponse.json(
      { facts },
      { headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } },
    );
  } catch {
    return NextResponse.json({ facts: [] });
  }
}
