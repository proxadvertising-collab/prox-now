import { connection, NextResponse } from "next/server";
import { cachedSignedUrl } from "../../../../../lib/photos/sign";
import { createServiceClient } from "../../../../../lib/supabase/admin";

const BUCKETS = new Set(["post-photos", "shop-book"]);

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
  const url = await cachedSignedUrl(bucket, objectPath, async () => {
    const signed = await service.storage.from(bucket).createSignedUrl(objectPath, 600);
    const value = signed.data?.signedUrl;
    return typeof value === "string" && value.includes("token=") ? value : null;
  });
  if (!url) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.redirect(url, { headers: { "Cache-Control": "public, max-age=480, s-maxage=480" } });
}
