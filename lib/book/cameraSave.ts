import { seedBookPath } from "./seedName";

export type BookFailNote = "book.pageLimit" | "book.already" | "owner" | "generic";

/** Which line the camera shows after a book upload is refused. */
export function bookFailNote(status: number, error: unknown): BookFailNote {
  if (status === 403 && error === "not_owner") return "owner";
  if (error === "page_limit") return "book.pageLimit";
  if (error === "already_there") return "book.already";
  return "generic";
}

function hexHash(value: string): string | null {
  const hash = value.trim().toLowerCase();
  return /^[0-9a-f]{64}$/.test(hash) ? hash : null;
}

/** photo_hash from a live page's ai_meta, or null when the page has none. */
export function pagePhotoHash(meta: unknown): string | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const hash = (meta as { photo_hash?: unknown }).photo_hash;
  return typeof hash === "string" ? hexHash(hash) : null;
}

/** True when every shot is already a live page. An empty batch is not a duplicate. */
export function photosAlreadyLive(
  shotHashes: readonly string[],
  liveHashes: readonly (string | null | undefined)[],
): boolean {
  if (shotHashes.length === 0) return false;
  const live = new Set<string>();
  for (const hash of liveHashes) {
    if (typeof hash !== "string") continue;
    const clean = hexHash(hash);
    if (clean) live.add(clean);
  }
  if (live.size === 0) return false;
  return shotHashes.every((hash) => {
    const clean = hexHash(hash);
    return clean !== null && live.has(clean);
  });
}

/**
 * Book path when Done is pressed again on a shop that already has these photos.
 * Null means the photos still need to be sent.
 */
export function duplicateBookHref(input: {
  shopId: string;
  slug: string;
  shotHashes: readonly string[];
  liveHashes: readonly (string | null | undefined)[];
}): string | null {
  if (!photosAlreadyLive(input.shotHashes, input.liveHashes)) return null;
  return seedBookPath(input.shopId, input.slug, input.slug);
}
