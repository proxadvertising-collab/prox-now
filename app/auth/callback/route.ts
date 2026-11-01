import { NextResponse } from "next/server";
import { safeNext } from "@/lib/auth/safe-next";
import { DEMO_SESSION_COOKIE } from "@/lib/demo/zone";
import { JUDGE_COOKIE } from "@/lib/judge/session";
import { createClient } from "@/lib/supabase/server";

function redirectBase(request: Request, origin: string): string {
  if (process.env.NODE_ENV === "development") return origin;
  const forwarded = request.headers.get("x-forwarded-host");
  if (!forwarded) return origin;
  const host = forwarded.split(",")[0]?.trim() ?? "";
  if (!/^[A-Za-z0-9.-]+(?::\d+)?$/.test(host)) return origin;
  return "https://" + host;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"));
  const base = redirectBase(request, url.origin);
  const failure = NextResponse.redirect(new URL("/login?error=auth", base));
  const code = url.searchParams.get("code");
  if (!code) return failure;

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return failure;
  } catch {
    return failure;
  }

  const response = NextResponse.redirect(new URL(next, base));
  response.cookies.set(JUDGE_COOKIE, "", { path: "/", maxAge: 0, sameSite: "lax", httpOnly: false });
  response.cookies.set(DEMO_SESSION_COOKIE, "", { path: "/", maxAge: 0, sameSite: "lax", httpOnly: false });
  return response;
}
