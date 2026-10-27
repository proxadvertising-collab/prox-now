import { NextResponse } from "next/server";
import { isUuid, ownerClient, ownerFailure, unsigned } from "../../../../lib/owner/http";

export async function POST(request: Request) {
  const { supabase, user } = await ownerClient();
  if (!supabase || !user) return unsigned();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_id" }, { status: 400 });
  }
  const id = body && typeof body === "object" ? (body as { id?: unknown }).id : null;
  if (typeof id !== "string" || !isUuid(id)) return NextResponse.json({ error: "bad_id" }, { status: 400 });

  const begun = await supabase.rpc("pass_post_begin", { p_post_id: id });
  if (begun.error) return ownerFailure(begun.error);
  const path = typeof begun.data === "string" && begun.data.length > 0 ? begun.data : null;
  if (path) {
    const removed = await supabase.storage.from("post-photos").remove([path]);
    if (removed.error) return NextResponse.json({ error: "storage_failed" }, { status: 502 });
  }
  const finished = await supabase.rpc("pass_post_finish", { p_post_id: id });
  if (finished.error) return ownerFailure(finished.error);
  return NextResponse.json({ ok: true });
}
