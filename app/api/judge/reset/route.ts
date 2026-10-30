import { NextResponse } from "next/server";
import { FRESH_DEMO_NEXT } from "../../../../lib/judge/reset";
import { ownerFailure } from "../../../../lib/owner/http";
import { allowJudge, clientIp } from "../../../../lib/rate/window";
import { createClient } from "../../../../lib/supabase/server";

export async function POST(request: Request) {
  if (!(await allowJudge(clientIp(request)))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json({ error: "demo_not_ready" }, { status: 503 });
  }

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    const email = process.env.DEMO_EXPLORER_EMAIL?.trim() ?? "";
    const password = process.env.DEMO_EXPLORER_PASSWORD ?? "";
    if (!email || !password) return NextResponse.json({ error: "demo_not_ready" }, { status: 503 });
    const signed = await supabase.auth.signInWithPassword({ email, password });
    if (signed.error) return NextResponse.json({ error: "sign_in_failed" }, { status: 401 });
  }

  const reset = await supabase.rpc("reset_demo");
  if (reset.error) return ownerFailure(reset.error);
  return NextResponse.json({ ok: true, next: FRESH_DEMO_NEXT });
}
