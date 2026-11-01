import { NextResponse } from "next/server";
import { DEMO_SESSION_COOKIE } from "../../../../lib/demo/zone";
import { JUDGE_COOKIE } from "../../../../lib/judge/session";
import { createClient } from "../../../../lib/supabase/server";

export async function POST() {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch {
    // The cookies still have to expire so a real sign-in cannot inherit the tour.
  }
  const response = NextResponse.json({ ok: true, next: "/judge" });
  response.cookies.set(JUDGE_COOKIE, "", { path: "/", maxAge: 0, sameSite: "lax", httpOnly: false });
  response.cookies.set(DEMO_SESSION_COOKIE, "", { path: "/", maxAge: 0, sameSite: "lax", httpOnly: false });
  return response;
}
