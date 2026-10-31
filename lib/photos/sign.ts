const PUBLIC_MARK = "/storage/v1/object/public/";

export function mediaPath(bucket: "post-photos" | "shop-book", objectPath: string): string | null {
  const clean = objectPath.replace(/^\/+/, "").split("?")[0] ?? "";
  if (!clean || clean.includes("..") || clean.includes("\\")) return null;
  return "/api/media/" + bucket + "/" + clean.split("/").map((part) => encodeURIComponent(part)).join("/");
}

/** App path that the server turns into a short-lived signed storage URL. */
export function signedPhotoUrl(value: string | null, bucket: "post-photos" | "shop-book"): string | null {
  if (!value) return null;
  if (value.startsWith("/demo/")) return value;
  const mark = PUBLIC_MARK + bucket + "/";
  const at = value.indexOf(mark);
  if (at >= 0) return mediaPath(bucket, decodeURIComponent(value.slice(at + mark.length)));
  if (value.startsWith("/api/media/")) return value;
  if (value.startsWith("http://") || value.startsWith("https://")) return null;
  return mediaPath(bucket, value);
}

type CacheEntry = { url: string; freshUntil: number };

const cache = new Map<string, CacheEntry>();
const FRESH_MS = 8 * 60 * 1000;

export function clearSignedUrlCache(): void {
  cache.clear();
}

/** Reuse a signed URL for 8 minutes so a page does not sign every image on every request. */
export async function cachedSignedUrl(
  bucket: string,
  objectPath: string,
  sign: () => Promise<string | null>,
  now = Date.now(),
): Promise<string | null> {
  const key = bucket + "\n" + objectPath;
  const hit = cache.get(key);
  if (hit && hit.freshUntil > now) return hit.url;
  const url = await sign();
  if (!url) return null;
  cache.set(key, { url, freshUntil: now + FRESH_MS });
  return url;
}
