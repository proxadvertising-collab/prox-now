import { createHash } from "node:crypto";

export function photoHash(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

/** Indexes of shots that repeat an earlier hash in this batch. */
export function batchDupes(hashes: readonly string[]): Set<number> {
  const seen = new Set<string>();
  const dupes = new Set<number>();
  hashes.forEach((hash, index) => {
    if (seen.has(hash)) dupes.add(index);
    else seen.add(hash);
  });
  return dupes;
}

export function dupePlan(
  hash: string,
  live: readonly { id: string; hash: string | null }[],
): { action: "skip"; pageId: string } | null {
  const match = live.find((page) => page.hash !== null && page.hash === hash);
  if (!match) return null;
  return { action: "skip", pageId: match.id };
}
