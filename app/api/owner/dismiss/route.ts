import { NextResponse } from "next/server";
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
    body && typeof body === "object" ? (body as { shopId?: unknown; contributorId?: unknown }) : null;
  const shopId = typeof record?.shopId === "string" ? record.shopId : "";
  const contributorId = typeof record?.contributorId === "string" ? record.contributorId : "";
  if (!isUuid(shopId) || !isUuid(contributorId)) {
    return NextResponse.json({ error: "bad_id" }, { status: 400 });
  }
  const dismissed = await supabase.rpc("dismiss_book_thanks", {
    p_shop_id: shopId,
    p_contributor_id: contributorId,
  });
  if (dismissed.error) return ownerFailure(dismissed.error);
  return NextResponse.json({ ok: true });
}
