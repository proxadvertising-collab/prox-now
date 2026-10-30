import { NextResponse } from "next/server";
import { FRESH_DEMO_NEXT } from "../../../../lib/judge/reset";
import { ownerFailure } from "../../../../lib/owner/http";
import { allowReset, clientIp } from "../../../../lib/rate/window";
import { createServiceClient } from "../../../../lib/supabase/admin";
import { createClient } from "../../../../lib/supabase/server";

export async function POST(request: Request) {
  if (!(await allowReset(clientIp(request)))) {
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
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }

  const reset = await supabase.rpc("reset_demo");
  if (reset.error) return ownerFailure(reset.error);

  const paths = Array.isArray(reset.data)
    ? reset.data.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
  if (paths.length > 0) {
    let service;
    try {
      service = createServiceClient();
    } catch {
      return NextResponse.json({ error: "demo_not_ready" }, { status: 503 });
    }
    const removed = await service.storage.from("post-photos").remove(paths);
    if (removed.error) return NextResponse.json({ error: "photo_cleanup_failed" }, { status: 502 });
  }

  return NextResponse.json({ ok: true, next: FRESH_DEMO_NEXT });
}
