import { NextResponse } from "next/server";
import { couponDays } from "../../../../lib/coupon/suggest";
import { isUuid, ownerClient, ownerFailure, unsigned } from "../../../../lib/owner/http";

export async function POST(request: Request) {
  const { supabase, user } = await ownerClient();
  if (!supabase || !user) return unsigned();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_id" }, { status: 400 });
  }
  const record =
    body && typeof body === "object"
      ? (body as { shopId?: unknown; contributorId?: unknown; offer?: unknown; days?: unknown })
      : null;
  const shopId = typeof record?.shopId === "string" ? record.shopId : "";
  const contributorId = typeof record?.contributorId === "string" ? record.contributorId : "";
  if (!isUuid(shopId) || !isUuid(contributorId)) {
    return NextResponse.json({ error: "bad_id" }, { status: 400 });
  }
  const offer = typeof record?.offer === "string" ? record.offer.trim().slice(0, 120) : "";
  const thanked = await supabase.rpc("thank_book", {
    p_shop_id: shopId,
    p_contributor_id: contributorId,
    p_offer: offer || null,
    p_days: couponDays(record?.days),
  });
  if (thanked.error) return ownerFailure(thanked.error);
  return NextResponse.json({ ok: true, couponId: thanked.data ?? null });
}
