import { NextResponse } from "next/server";
import { ownerClient, ownerFailure, unsigned } from "../../../../lib/owner/http";
import { byNewestCoupon, withIssuedTime } from "../../../../lib/wallet/coupons";

export async function GET() {
  const { supabase, user } = await ownerClient();
  if (!supabase || !user) return unsigned();
  const result = await supabase.rpc("my_coupons");
  if (result.error) return ownerFailure(result.error);
  const rows = Array.isArray(result.data) ? result.data : [];
  const issued = new Map<string, string>();
  try {
    const times = await supabase.from("coupons").select("id, created_at").eq("holder_id", user.id);
    if (!times.error && Array.isArray(times.data)) {
      for (const row of times.data) {
        if (row && typeof row.id === "string" && typeof row.created_at === "string") issued.set(row.id, row.created_at);
      }
    }
  } catch {
    // The list still renders. Missing times keep the original order.
  }
  const coupons = byNewestCoupon(withIssuedTime(rows.filter((row) => row && typeof row === "object"), issued));
  return NextResponse.json({ coupons });
}
