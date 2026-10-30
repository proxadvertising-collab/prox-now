import { NextResponse } from "next/server";
import { callSpark } from "../../../../lib/ai/meta";
import { claimMatch, claimNear, claimPrompt, claimStatus } from "../../../../lib/owner/claim";
import { isUuid, ownerClient, ownerFailure, unsigned } from "../../../../lib/owner/http";

export const maxDuration = 60;

function coord(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(number) ? number : null;
}

async function readProof(request: Request): Promise<
  | { kind: "json"; shopId: string }
  | { kind: "proof"; shopId: string; lat: number | null; lng: number | null; image: File | null; live: boolean }
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
  return {
    kind: "proof",
    shopId,
    lat: coord(form.get("lat")),
    lng: coord(form.get("lng")),
    image: image instanceof File && image.size > 0 ? image : null,
    live: form.get("live") === "1",
  };
}

export async function POST(request: Request) {
  const { supabase, user } = await ownerClient();
  if (!supabase || !user) return unsigned();
  const proof = await readProof(request);
  if (proof.kind === "bad") return NextResponse.json({ error: "bad_id" }, { status: 400 });

  if (proof.kind === "json") {
    const claimed = await supabase.rpc("claim_shop", { p_shop_id: proof.shopId });
    if (claimed.error) return ownerFailure(claimed.error);
    return NextResponse.json({ ok: true, status: claimed.data ?? "pending" });
  }

  const shopResult = await supabase.from("shops").select("name, lat, lng").eq("id", proof.shopId).maybeSingle();
  const shop = shopResult.data as { name?: unknown; lat?: unknown; lng?: unknown } | null;
  if (shopResult.error || !shop) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const name = typeof shop.name === "string" ? shop.name : "";
  const here = proof.lat != null && proof.lng != null ? { lat: proof.lat, lng: proof.lng } : null;
  const place = { lat: coord(shop.lat) ?? Number.NaN, lng: coord(shop.lng) ?? Number.NaN };
  const near = claimNear(here, place);
  let match = false;
  if (near && proof.image && proof.live) {
    try {
      const bytes = Buffer.from(await proof.image.arrayBuffer());
      const mime = proof.image.type || "image/jpeg";
      const spark = await callSpark({
        prompt: claimPrompt(name),
        imageDataUrl: "data:" + mime + ";base64," + bytes.toString("base64"),
      });
      match = claimMatch(spark.raw);
    } catch {
      match = false;
    }
  }
  const status = claimStatus(near, match);
  if (status === "verified") {
    const verified = await supabase.rpc("verify_claim", { p_shop_id: proof.shopId });
    if (verified.error) return ownerFailure(verified.error);
    return NextResponse.json({ ok: true, status: verified.data ?? "verified" });
  }
  const claimed = await supabase.rpc("claim_shop", { p_shop_id: proof.shopId });
  if (claimed.error) return ownerFailure(claimed.error);
  return NextResponse.json({ ok: true, status: "pending", reason: "not_confirmed" });
}
