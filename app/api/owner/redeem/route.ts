import { NextResponse } from "next/server";
import { ownerClient, ownerFailure, unsigned } from "../../../../lib/owner/http";

export async function POST(request: Request) {
  const { supabase, user } = await ownerClient();
  if (!supabase || !user) return unsigned();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_code" }, { status: 400 });
  }
  const code = body && typeof body === "object" ? (body as { code?: unknown }).code : null;
  if (typeof code !== "string" || code.trim().length < 4) {
    return NextResponse.json({ error: "bad_code" }, { status: 400 });
  }
  const redeemed = await supabase.rpc("redeem_coupon", { p_code: code.trim() });
  if (redeemed.error) return ownerFailure(redeemed.error);
  return NextResponse.json(redeemed.data ?? { ok: true });
}
