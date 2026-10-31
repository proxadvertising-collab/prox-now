import { NextResponse } from "next/server";
import { COUPON_FALLBACK, suggestCouponOffer, type MenuHint } from "../../../../lib/coupon/suggest";
import { isUuid, ownerClient, ownerFailure, unsigned } from "../../../../lib/owner/http";
import { SIGNED_URL_TTL_SECONDS } from "../../../../lib/photos/sign";
import { allowSnap, clientIp } from "../../../../lib/rate/window";
import { createServiceClient } from "../../../../lib/supabase/admin";

export const maxDuration = 60;

function menuItems(rows: readonly { extracted?: unknown }[]): MenuHint[] {
  const items: MenuHint[] = [];
  for (const row of rows) {
    const extracted = row.extracted;
    if (!extracted || typeof extracted !== "object") continue;
    const list = (extracted as { items?: unknown }).items;
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const name = (item as { name?: unknown }).name;
      if (typeof name !== "string" || !name.trim()) continue;
      const price = (item as { price?: unknown }).price;
      const priceText =
        typeof price === "number" && Number.isFinite(price)
          ? String(price)
          : typeof price === "string"
            ? price.trim()
            : "";
      items.push(priceText ? { name: name.trim(), price: priceText } : { name: name.trim() });
      if (items.length >= 10) return items;
    }
  }
  return items;
}

export async function POST(request: Request) {
  const { supabase, user } = await ownerClient();
  if (!supabase || !user) return unsigned();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_id" }, { status: 400 });
  }
  const postId = body && typeof body === "object" ? (body as { post_id?: unknown }).post_id : null;
  if (typeof postId !== "string" || !isUuid(postId)) {
    return NextResponse.json({ error: "bad_id" }, { status: 400 });
  }

  const post = await supabase.from("posts").select("id, shop_id, photo_path").eq("id", postId).maybeSingle();
  if (post.error) return ownerFailure(post.error);
  const shopId = post.data && typeof post.data.shop_id === "string" ? post.data.shop_id : "";
  if (!shopId) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const owner = await supabase.rpc("is_verified_owner", { p_shop_id: shopId });
  if (owner.error) return ownerFailure(owner.error);
  if (owner.data !== true) return NextResponse.json({ error: "not_owner" }, { status: 403 });

  if (!(await allowSnap(clientIp(request), user.id))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let items: MenuHint[] = [];
  try {
    const pages = await supabase
      .from("shop_book_pages")
      .select("extracted")
      .eq("shop_id", shopId)
      .eq("status", "live")
      .eq("kind", "menu");
    if (!pages.error && Array.isArray(pages.data)) items = menuItems(pages.data);
  } catch {
    items = [];
  }

  try {
    const photoPath = post.data && typeof post.data.photo_path === "string" ? post.data.photo_path : null;
    if (!photoPath) return NextResponse.json({ offer: COUPON_FALLBACK });
    const service = createServiceClient();
    const signed = await service.storage.from("post-photos").createSignedUrl(photoPath, SIGNED_URL_TTL_SECONDS);
    const url = signed.data?.signedUrl;
    if (typeof url !== "string" || !url.includes("token=")) return NextResponse.json({ offer: COUPON_FALLBACK });
    const image = await fetch(url);
    if (!image.ok) return NextResponse.json({ offer: COUPON_FALLBACK });
    const type = (image.headers.get("content-type") || "image/jpeg").split(";")[0] || "image/jpeg";
    const bytes = Buffer.from(await image.arrayBuffer());
    const offer = await suggestCouponOffer({
      imageDataUrl: "data:" + type + ";base64," + bytes.toString("base64"),
      items,
    });
    return NextResponse.json({ offer });
  } catch {
    return NextResponse.json({ offer: COUPON_FALLBACK });
  }
}
