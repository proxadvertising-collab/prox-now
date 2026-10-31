export type PostPhotoRow = {
  author_id: string | null;
  shop_id: string | null;
  status: string;
  expires_at: string;
};

/** A live post is public. Its author and the shop's verified owner can still open it. */
export function postPhotoVisible(
  rows: readonly PostPhotoRow[],
  userId: string | null,
  ownedShopIds: ReadonlySet<string>,
  now = Date.now(),
): boolean {
  for (const row of rows) {
    const expires = Date.parse(row.expires_at);
    if (row.status === "live" && Number.isFinite(expires) && expires > now) return true;
    if (userId && row.author_id && row.author_id === userId) return true;
    if (userId && row.shop_id && ownedShopIds.has(row.shop_id)) return true;
  }
  return false;
}

/** Cutouts are stored as book-cutouts/{shopId}/{file}. */
export function cutoutShopId(objectPath: string): string | null {
  const parts = objectPath.split("/");
  if (parts[0] !== "book-cutouts" || !parts[1] || parts.length < 3) return null;
  if (parts[1] === "." || parts[1] === "..") return null;
  return parts[1];
}

export function extractedMentions(extracted: unknown, objectPath: string): boolean {
  if (!objectPath) return false;
  return JSON.stringify(extracted ?? "").includes(objectPath);
}

/** Book photos are public for every shop whose book is live. */
export function bookPhotoVisible(pageShopId: string | null, bookStatus: string | null): boolean {
  return Boolean(pageShopId) && bookStatus === "live";
}
