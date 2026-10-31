import { NextResponse } from "next/server";
import { isUuid, ownerClient, unsigned } from "../../../../../lib/owner/http";
import { createServiceClient } from "../../../../../lib/supabase/admin";

export const maxDuration = 30;

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
  let service;
  try {
    service = createServiceClient();
  } catch {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  const issued = await service.rpc("issue_claim_capture", { p_shop_id: shopId, p_user_id: user.id });
  if (issued.error || typeof issued.data !== "string" || !isUuid(issued.data)) {
    return NextResponse.json({ error: "bad_capture" }, { status: 400 });
  }
  return NextResponse.json({ token: issued.data });
}
