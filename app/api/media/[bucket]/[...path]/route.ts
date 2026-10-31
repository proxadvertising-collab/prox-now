import { connection, NextResponse } from "next/server";
import {
  bookPhotoVisible,
  cutoutShopId,
  extractedMentions,
  postPhotoVisible,
  type PostPhotoRow,
} from "../../../../../lib/photos/access";
import { cachedSignedUrl, SIGNED_URL_TTL_SECONDS } from "../../../../../lib/photos/sign";
import { createServiceClient } from "../../../../../lib/supabase/admin";
import { createClient } from "../../../../../lib/supabase/server";

const BUCKETS = new Set(["post-photos", "shop-book"]);

type Row = Record<string, unknown>;

function asRows(data: unknown): Row[] {
  if (!Array.isArray(data)) return [];
  return data.filter((row): row is Row => Boolean(row) && typeof row === "object");
}

async function callerId(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const auth = await supabase.auth.getUser();
    return auth.data.user?.id ?? null;
  } catch {
    return null;
  }
}

async function postAllowed(
  service: ReturnType<typeof createServiceClient>,
  objectPath: string,
  userId: string | null,
): Promise<boolean> {
  const posts = await service.from("posts").select("author_id, shop_id, status, expires_at").eq("photo_path", objectPath);
  if (posts.error) return false;
  const rows: PostPhotoRow[] = [];
  for (const row of asRows(posts.data)) {
    rows.push({
      author_id: typeof row.author_id === "string" ? row.author_id : null,
      shop_id: typeof row.shop_id === "string" ? row.shop_id : null,
      status: typeof row.status === "string" ? row.status : "",
      expires_at: typeof row.expires_at === "string" ? row.expires_at : "",
    });
  }
  const owned = new Set<string>();
  const shopIds = [...new Set(rows.map((row) => row.shop_id).filter((id): id is string => Boolean(id)))];
  if (userId && shopIds.length > 0) {
    const owners = await service
      .from("shop_owners")
      .select("shop_id")
      .eq("user_id", userId)
      .eq("status", "verified")
      .in("shop_id", shopIds);
    if (!owners.error) {
      for (const row of asRows(owners.data)) {
        if (typeof row.shop_id === "string") owned.add(row.shop_id);
      }
    }
  }
  return postPhotoVisible(rows, userId, owned);
}

async function bookAllowed(service: ReturnType<typeof createServiceClient>, objectPath: string): Promise<boolean> {
  const pages = await service
    .from("shop_book_pages")
    .select("shop_id")
    .eq("status", "live")
    .eq("image_path", objectPath)
    .limit(1);
  if (pages.error) return false;
  let shopId: string | null = null;
  const first = asRows(pages.data)[0];
  if (first && typeof first.shop_id === "string") shopId = first.shop_id;
  if (!shopId) {
    const cutShop = cutoutShopId(objectPath);
    if (cutShop) {
      const cuts = await service.from("shop_book_pages").select("extracted").eq("status", "live").eq("shop_id", cutShop);
      if (!cuts.error && asRows(cuts.data).some((row) => extractedMentions(row.extracted, objectPath))) shopId = cutShop;
    }
  }
  if (!shopId) return false;
  const book = await service.from("shop_books").select("status").eq("shop_id", shopId).maybeSingle();
  if (book.error) return false;
  const status = book.data && typeof book.data.status === "string" ? book.data.status : null;
  return bookPhotoVisible(shopId, status);
}

export async function GET(_request: Request, context: { params: Promise<{ bucket: string; path: string[] }> }) {
  await connection();
  const { bucket, path } = await context.params;
  if (!BUCKETS.has(bucket)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const objectPath = path.map((part) => decodeURIComponent(part)).join("/");
  if (!objectPath || objectPath.includes("..") || objectPath.includes("\\")) {
    return NextResponse.json({ error: "bad_path" }, { status: 400 });
  }
  let service;
  try {
    service = createServiceClient();
  } catch {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  const userId = await callerId();
  const allowed = bucket === "shop-book" ? await bookAllowed(service, objectPath) : await postAllowed(service, objectPath, userId);
  if (!allowed) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const url = await cachedSignedUrl(bucket, objectPath, async () => {
    const signed = await service.storage.from(bucket).createSignedUrl(objectPath, SIGNED_URL_TTL_SECONDS);
    const value = signed.data?.signedUrl;
    return typeof value === "string" && value.includes("token=") ? value : null;
  });
  if (!url) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.redirect(url, { headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } });
}
