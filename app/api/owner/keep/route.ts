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
  const id = body && typeof body === "object" ? (body as { id?: unknown }).id : null;
  if (typeof id !== "string" || !isUuid(id)) return NextResponse.json({ error: "bad_id" }, { status: 400 });
  const kept = await supabase.rpc("keep_post", { p_post_id: id });
  if (kept.error) return ownerFailure(kept.error);
  return NextResponse.json({ ok: true, couponId: kept.data ?? null });
}
