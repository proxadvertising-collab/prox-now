import { NextResponse } from "next/server";
import { signInDemoRole } from "../../../../lib/judge/demo";
import { allowJudge, clientIp } from "../../../../lib/rate/window";
import { createClient } from "../../../../lib/supabase/server";

async function signIn(email: string, password: string) {
  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json({ error: "demo_not_ready" }, { status: 503 });
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return NextResponse.json({ error: "sign_in_failed" }, { status: 401 });
  return NextResponse.json({ ok: true, next: "/map" });
}

export async function POST(request: Request) {
  if (!(await allowJudge(clientIp(request)))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const role = new URL(request.url).searchParams.get("role");
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
    return NextResponse.json({ ok: true, next: "/map" });
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
