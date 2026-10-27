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
  const shopId = body && typeof body === "object" ? (body as { shopId?: unknown }).shopId : null;
  if (typeof shopId !== "string" || !isUuid(shopId)) return NextResponse.json({ error: "bad_id" }, { status: 400 });
  const claimed = await supabase.rpc("claim_shop", { p_shop_id: shopId });
  if (claimed.error) return ownerFailure(claimed.error);
  return NextResponse.json({ ok: true, status: claimed.data ?? "pending" });
}
