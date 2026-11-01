import { NextResponse } from "next/server";
import { createClient } from "../supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

export function ownerError(message: string): { error: string; status: number } {
  const text = message.toLowerCase();
  if (text.includes("not_signed_in")) return { error: "not_signed_in", status: 401 };
  if (text.includes("not_owner") || text.includes("not a verified owner")) return { error: "not_owner", status: 403 };
  if (text.includes("not_demo_shop") || text.includes("seed_post")) return { error: "not_allowed", status: 403 };
  if (text.includes("not_demo")) return { error: "not_demo", status: 403 };
  if (text.includes("not_allowed")) return { error: "not_allowed", status: 403 };
  if (text.includes("bad_name")) return { error: "bad_name", status: 400 };
  if (text.includes("not_found") || text.includes("post not found") || text.includes("shop_not_found")) {
    return { error: "not_found", status: 404 };
  }
  if (text.includes("already_decided")) return { error: "already_decided", status: 409 };
  if (text.includes("already_used")) return { error: "already_used", status: 409 };
  if (text.includes("already_owned")) return { error: "already_owned", status: 409 };
  if (text.includes("rate_limited")) return { error: "rate_limited", status: 429 };
  if (text.includes("not ready")) return { error: "not_ready", status: 409 };
  if (text.includes("expired")) return { error: "expired", status: 409 };
  if (text.includes("photo_still_stored")) return { error: "storage_failed", status: 502 };
  return { error: "upstream", status: 502 };
}

export function ownerFailure(error: { message?: string } | null) {
  const mapped = ownerError(String(error?.message ?? ""));
  return NextResponse.json({ error: mapped.error }, { status: mapped.status });
}

export async function ownerClient() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return { supabase: null, user: null };
    return { supabase, user: data.user };
  } catch {
    return { supabase: null, user: null };
  }
}

export function unsigned() {
  return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
}
