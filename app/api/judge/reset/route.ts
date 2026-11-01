import { NextResponse } from "next/server";
import { signInDemoRole } from "../../../../lib/judge/demo";
import { FRESH_DEMO_NEXT } from "../../../../lib/judge/reset";
import { runReset } from "../../../../lib/judge/runReset";
import { JUDGE_COOKIE } from "../../../../lib/judge/session";
import { allowReset, clientIp } from "../../../../lib/rate/window";
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
    const signed = await signInDemoRole(supabase, "explorer");
    if (!signed.ok) {
      const status = signed.error === "demo_not_ready" ? 503 : 401;
      return NextResponse.json({ error: signed.error }, { status });
    }
  }

  const reset = await runReset(supabase);
  if (!reset.ok) return NextResponse.json({ error: reset.error }, { status: reset.status });

  const response = NextResponse.json({ ok: true, next: FRESH_DEMO_NEXT });
  response.cookies.set(JUDGE_COOKIE, "explorer", { path: "/", sameSite: "lax", httpOnly: false });
  return response;
}
