export type PostPhotoRow = {
  author_id: string | null;
  shop_id: string | null;
  status: string;
  expires_at: string;
};

export type PhotoAudience = "public" | "private" | "none";

/** Live and kept posts are public. An ended post stays visible to its author and the verified owner. */
export function postPhotoAudience(
  rows: readonly PostPhotoRow[],
  userId: string | null,
  ownedShopIds: ReadonlySet<string>,
  now = Date.now(),
): PhotoAudience {
  let personal = false;
  for (const row of rows) {
    const expires = Date.parse(row.expires_at);
    const live = row.status === "live" && Number.isFinite(expires) && expires > now;
    if (live || row.status === "kept") return "public";
    const mine = Boolean(userId && row.author_id && row.author_id === userId);
    const owner = Boolean(userId && row.shop_id && ownedShopIds.has(row.shop_id));
    if (mine || owner) personal = true;
  }
  return personal ? "private" : "none";
}

export function postPhotoVisible(
  rows: readonly PostPhotoRow[],
  userId: string | null,
  ownedShopIds: ReadonlySet<string>,
  now = Date.now(),
): boolean {
  return postPhotoAudience(rows, userId, ownedShopIds, now) !== "none";
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
