/** A save that timed out may still finish on the server. Look for the live book before calling it failed. */
export type BookProbe = (shopId: string) => Promise<{ live: boolean; slug: string | null } | null>;

export function savedMaybe(status: number | null): boolean {
  return status === null || status === 502 || status === 503 || status === 504;
}

export async function waitForBook(
  shopId: string,
  probe: BookProbe,
  tries = 18,
  delayMs = 5000,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((done) => setTimeout(done, ms)),
): Promise<string | null> {
  for (let i = 0; i < tries; i++) {
    const found = await probe(shopId).catch(() => null);
    if (found?.live && found.slug) return found.slug;
    if (i < tries - 1) await sleep(delayMs);
  }
  return null;
}
