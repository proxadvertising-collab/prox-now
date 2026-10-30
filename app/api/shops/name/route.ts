import { NextResponse } from "next/server";
import { shopNameDraft } from "../../../../lib/book/shopName";
import { isUuid, ownerClient, ownerFailure, unsigned } from "../../../../lib/owner/http";

export async function POST(request: Request) {
  const { supabase, user } = await ownerClient();
  if (!supabase || !user) return unsigned();

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_name" }, { status: 400 });
  }
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
  const shopId = typeof record?.shopId === "string" ? record.shopId : "";
  const name = shopNameDraft(typeof record?.name === "string" ? record.name : "");
  if (!isUuid(shopId) || !name) return NextResponse.json({ error: "bad_name" }, { status: 400 });

  const saved = await supabase.rpc("set_shop_name", { p_shop_id: shopId, p_name: name });
  if (saved.error) return ownerFailure(saved.error);
  const next = typeof saved.data === "string" && saved.data.trim() ? saved.data : name;
  return NextResponse.json({ ok: true, name: next });
}
