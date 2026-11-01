import { createHash } from "node:crypto";

export function photoHash(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

export function dupePlan(
  hash: string,
  live: readonly { id: string; hash: string | null }[],
): { action: "skip"; pageId: string } | null {
  const match = live.find((page) => page.hash !== null && page.hash === hash);
  if (!match) return null;
  return { action: "skip", pageId: match.id };
}
