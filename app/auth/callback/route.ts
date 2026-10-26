import { NextResponse } from "next/server";
import { safeNext } from "@/lib/auth/safe-next";
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

  return NextResponse.redirect(new URL(next, base));
}
