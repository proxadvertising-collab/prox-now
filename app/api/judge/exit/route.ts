import { NextResponse } from "next/server";
import { DEMO_SESSION_COOKIE, hasDemoSessionCookie } from "../../../../lib/demo/zone";
import { runReset } from "../../../../lib/judge/runReset";
import { hasJudgeCookie, JUDGE_COOKIE } from "../../../../lib/judge/session";
import { allowReset, clientIp } from "../../../../lib/rate/window";
import { createClient } from "../../../../lib/supabase/server";

function demoMarker(request: Request): boolean {
  const cookie = request.headers.get("cookie") ?? "";
  return hasJudgeCookie(cookie) || hasDemoSessionCookie(cookie);
}

export async function POST(request: Request) {
  let reset = false;
  try {
    const supabase = await createClient();
    try {
      if (demoMarker(request)) {
        const session = await supabase.auth.getUser();
        if (!session.error && session.data.user && (await allowReset(clientIp(request)))) {
          const result = await runReset(supabase);
          if (result.ok) reset = true;
          else if (result.error !== "not_demo") console.error("demo reset failed", result.error);
        }
      }
    } catch (error) {
      console.error("demo reset failed", error instanceof Error ? error.message : "unknown");
    }
    await supabase.auth.signOut();
  } catch {
    // The cookies still have to expire so a real sign-in cannot inherit the tour.
  }
  const response = NextResponse.json({ ok: true, next: "/judge", reset });
  response.cookies.set(JUDGE_COOKIE, "", { path: "/", maxAge: 0, sameSite: "lax", httpOnly: false });
  response.cookies.set(DEMO_SESSION_COOKIE, "", { path: "/", maxAge: 0, sameSite: "lax", httpOnly: false });
  return response;
}
