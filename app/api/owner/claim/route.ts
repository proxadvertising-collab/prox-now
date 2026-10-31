import { NextResponse } from "next/server";
import { callSpark } from "../../../../lib/ai/meta";
import { allowNoCodeClaim } from "../../../../lib/judge/shortcuts";
import { claimCode, claimGranted, claimMatch, claimNear, claimPrompt } from "../../../../lib/owner/claim";
import { isUuid, ownerClient, ownerFailure, unsigned } from "../../../../lib/owner/http";
import { createServiceClient } from "../../../../lib/supabase/admin";

export const maxDuration = 60;

const REVIEW = "We'll review this within 48 hours";

function coord(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(number) ? number : null;
}

async function readProof(request: Request): Promise<
  | { kind: "json"; shopId: string }
  | { kind: "proof"; shopId: string; lat: number | null; lng: number | null; image: File | null; code: string; capture: string }
  | { kind: "bad" }
> {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return { kind: "bad" };
    }
    const shopId = body && typeof body === "object" ? (body as { shopId?: unknown }).shopId : null;
    if (typeof shopId !== "string" || !isUuid(shopId)) return { kind: "bad" };
    return { kind: "json", shopId };
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return { kind: "bad" };
  }
  const shopId = form.get("shopId");
  if (typeof shopId !== "string" || !isUuid(shopId)) return { kind: "bad" };
  const image = form.get("image");
  const code = form.get("code");
  const capture = form.get("capture");
  return {
    kind: "proof",
    shopId,
    lat: coord(form.get("lat")),
    lng: coord(form.get("lng")),
    image: image instanceof File && image.size > 0 ? image : null,
    code: typeof code === "string" ? code.trim() : "",
    capture: typeof capture === "string" ? capture.trim() : "",
  };
}

async function review(supabase: NonNullable<Awaited<ReturnType<typeof ownerClient>>["supabase"]>, shopId: string) {
  const reviewed = await supabase.rpc("mark_claim_review", { p_shop_id: shopId });
  if (reviewed.error) return ownerFailure(reviewed.error);
  return NextResponse.json({ ok: true, status: "in_review", reason: "not_confirmed", message: REVIEW });
}

export async function POST(request: Request) {
  const { supabase, user } = await ownerClient();
  if (!supabase || !user) return unsigned();
  const proof = await readProof(request);
  if (proof.kind === "bad") return NextResponse.json({ error: "bad_id" }, { status: 400 });

  if (proof.kind === "json") {
    const shopResult = await supabase.from("shops").select("is_demo").eq("id", proof.shopId).maybeSingle();
    const shopDemo = (shopResult.data as { is_demo?: boolean } | null)?.is_demo === true;
    const account = await supabase.from("demo_accounts").select("role").limit(1);
    const demoAccount = !account.error && Array.isArray(account.data) && account.data.length > 0;
    const code = claimCode();
    const opened = await supabase.rpc("open_claim", { p_shop_id: proof.shopId, p_code: code });
    if (opened.error) return ownerFailure(opened.error);
    if (!allowNoCodeClaim({ shopDemo, demoAccount })) {
      return NextResponse.json({ ok: true, status: opened.data ?? "pending", code });
    }
    let service;
    try {
      service = createServiceClient();
    } catch {
      return NextResponse.json({ error: "not_configured" }, { status: 503 });
    }
    const verified = await service.rpc("verify_claim", { p_shop_id: proof.shopId, p_user_id: user.id });
    if (verified.error) return ownerFailure(verified.error);
    return NextResponse.json({ ok: true, status: verified.data ?? "verified", demo: true });
  }

  const shopResult = await supabase.from("shops").select("name, lat, lng").eq("id", proof.shopId).maybeSingle();
  const shop = shopResult.data as { name?: unknown; lat?: unknown; lng?: unknown } | null;
  if (shopResult.error || !shop) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const name = typeof shop.name === "string" ? shop.name : "";
  const here = proof.lat != null && proof.lng != null ? { lat: proof.lat, lng: proof.lng } : null;
  const place = { lat: coord(shop.lat) ?? Number.NaN, lng: coord(shop.lng) ?? Number.NaN };
  if (!claimNear(here, place)) return NextResponse.json({ error: "too_far" }, { status: 400 });
  if (!isUuid(proof.capture)) return NextResponse.json({ error: "bad_capture" }, { status: 400 });

  const storedResult = await supabase
    .from("shop_owners")
    .select("claim_code")
    .eq("shop_id", proof.shopId)
    .eq("user_id", user.id)
    .maybeSingle();
  const storedRow = storedResult.data as { claim_code?: unknown } | null;
  const stored = storedRow && typeof storedRow.claim_code === "string" ? storedRow.claim_code.trim() : "";
  if (!stored || (proof.code && stored !== proof.code)) return review(supabase, proof.shopId);
  const code = stored;

  let service;
  try {
    service = createServiceClient();
  } catch {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  const consumed = await service.rpc("consume_claim_capture", {
    p_token: proof.capture,
    p_shop_id: proof.shopId,
    p_user_id: user.id,
  });
  if (consumed.error || consumed.data !== true) return NextResponse.json({ error: "bad_capture" }, { status: 400 });

  let match = false;
  if (proof.image) {
    try {
      const bytes = Buffer.from(await proof.image.arrayBuffer());
      const mime = proof.image.type || "image/jpeg";
      const spark = await callSpark({
        prompt: claimPrompt(name, code),
        imageDataUrl: "data:" + mime + ";base64," + bytes.toString("base64"),
      });
      match = claimMatch(spark.raw);
    } catch {
      match = false;
    }
  }
  if (proof.image && claimGranted({ match })) {
    const verified = await service.rpc("verify_claim", { p_shop_id: proof.shopId, p_user_id: user.id });
    if (verified.error) return ownerFailure(verified.error);
    return NextResponse.json({ ok: true, status: verified.data ?? "verified" });
  }
  return review(supabase, proof.shopId);
}
