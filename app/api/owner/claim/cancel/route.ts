import { NextResponse } from "next/server";
import { isUuid, ownerClient, ownerFailure, unsigned } from "../../../../../lib/owner/http";

export async function POST(request: Request) {
  const { supabase, user } = await ownerClient();
  if (!supabase || !user) return unsigned();

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_id" }, { status: 400 });
  }
  const shopId = payload && typeof payload === "object" ? (payload as { shopId?: unknown }).shopId : null;
  if (typeof shopId !== "string" || !isUuid(shopId)) {
    return NextResponse.json({ error: "bad_id" }, { status: 400 });
  }

  const cancelled = await supabase.rpc("cancel_claim", { p_shop_id: shopId });
  if (cancelled.error) return ownerFailure(cancelled.error);
  return NextResponse.json({ ok: true });
}
