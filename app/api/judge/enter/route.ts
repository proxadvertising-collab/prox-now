import { NextResponse } from "next/server";
import { DEMO_SESSION_COOKIE } from "../../../../lib/demo/zone";
import { signInDemoRole } from "../../../../lib/judge/demo";
import { JUDGE_COOKIE } from "../../../../lib/judge/session";
import { allowJudge, clientIp } from "../../../../lib/rate/window";
import { createClient } from "../../../../lib/supabase/server";

/** A role swap of someone who already has a demo account. First sign-ins return false. */
async function swappingDemoRoles(role: string | null): Promise<boolean> {
  if (role !== "explorer" && role !== "owner") return false;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    const id = data.user?.id;
    if (!id) return false;
    const found = await supabase.from("demo_accounts").select("role").eq("user_id", id).limit(1);
    if (found.error) return false;
    return Array.isArray(found.data) && found.data.length > 0;
  } catch {
    return false;
  }
}

async function signIn(email: string, password: string) {
  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json({ error: "demo_not_ready" }, { status: 503 });
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return NextResponse.json({ error: "sign_in_failed" }, { status: 401 });
  const response = NextResponse.json({ ok: true, next: "/map" });
  response.cookies.set(JUDGE_COOKIE, "", { path: "/", maxAge: 0, sameSite: "lax", httpOnly: false });
  response.cookies.set(DEMO_SESSION_COOKIE, "", { path: "/", maxAge: 0, sameSite: "lax", httpOnly: false });
  return response;
}

export async function POST(request: Request) {
  const role = new URL(request.url).searchParams.get("role");
  if (!(await swappingDemoRoles(role)) && !(await allowJudge(clientIp(request)))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  if (role !== null) {
    if (role !== "explorer" && role !== "owner") {
      return NextResponse.json({ error: "bad_role" }, { status: 400 });
    }
    let supabase;
    try {
      supabase = await createClient();
    } catch {
      return NextResponse.json({ error: "demo_not_ready" }, { status: 503 });
    }
    const signed = await signInDemoRole(supabase, role);
    if (!signed.ok) {
      const status = signed.error === "demo_not_ready" ? 503 : 401;
      return NextResponse.json({ error: signed.error }, { status });
    }
    const response = NextResponse.json({ ok: true, next: "/map" });
    response.cookies.set(JUDGE_COOKIE, role, { path: "/", sameSite: "lax", httpOnly: false });
    return response;
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_input" }, { status: 400 });
  }
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
  const email = typeof record?.email === "string" ? record.email.trim() : "";
  const password = typeof record?.password === "string" ? record.password : "";
  if (!email || !password) return NextResponse.json({ error: "bad_input" }, { status: 400 });
  return signIn(email, password);
}
