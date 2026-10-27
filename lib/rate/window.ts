type Hit = { start: number; count: number };

export const HOUR_MS = 3_600_000;
export const SNAP_USER_LIMIT = 20;
export const SNAP_IP_LIMIT = 60;

export function take(
  store: Map<string, Hit>,
  limits: readonly { key: string; limit: number }[],
  now: number,
  windowMs = HOUR_MS,
): boolean {
  const rows: { key: string; hit: Hit }[] = [];
  for (const item of limits) {
    const existing = store.get(item.key);
    const hit =
      !existing || now - existing.start >= windowMs ? { start: now, count: 0 } : existing;
    if (hit.count >= item.limit) return false;
    rows.push({ key: item.key, hit });
  }
  for (const row of rows) {
    row.hit.count += 1;
    store.set(row.key, row.hit);
  }
  return true;
}

export const snapHits = new Map<string, Hit>();
export const judgeHits = new Map<string, Hit>();

export type RateBucket = "snap" | "judge";

export type RateRead = (
  bucket: RateBucket,
  subjects: readonly string[],
) => Promise<boolean | null>;

export function resetRateWindows(): void {
  snapHits.clear();
  judgeHits.clear();
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim() ?? "";
  if (first) return first.slice(0, 64);
  const real = request.headers.get("x-real-ip")?.trim() ?? "";
  if (real) return real.slice(0, 64);
  return "unknown";
}

function limitsFor(subjects: readonly string[]): { key: string; limit: number }[] {
  return subjects.map((key) => ({
    key,
    limit: key.startsWith("user:") ? SNAP_USER_LIMIT : SNAP_IP_LIMIT,
  }));
}

function missingRateFunction(message: string): boolean {
  const text = message.toLowerCase();
  return text.includes("take_rate_limit") || text.includes("schema cache") || text.includes("42883");
}

export async function takeFromDatabase(
  bucket: RateBucket,
  subjects: readonly string[],
): Promise<boolean | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null;
  try {
    const { createClient } = await import("../supabase/server");
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("take_rate_limit", {
      p_bucket: bucket,
      p_subjects: [...subjects],
    });
    if (error) {
      if (missingRateFunction(String(error.message ?? ""))) return null;
      return false;
    }
    return data === true;
  } catch (error) {
    if (typeof error === "object" && error !== null && "digest" in error) throw error;
    return null;
  }
}

export async function consumeRate(
  bucket: RateBucket,
  subjects: readonly string[],
  now: number,
  read: RateRead = takeFromDatabase,
): Promise<boolean> {
  const stored = await read(bucket, subjects);
  if (stored !== null) return stored;
  const store = bucket === "snap" ? snapHits : judgeHits;
  return take(store, limitsFor(subjects), now);
}

export async function allowSnap(
  ip: string,
  userId: string | null,
  now = Date.now(),
  read: RateRead = takeFromDatabase,
): Promise<boolean> {
  const subjects: string[] = [];
  if (userId) subjects.push("user:" + userId);
  subjects.push("ip:" + ip);
  return consumeRate("snap", subjects, now, read);
}

export async function allowJudge(
  ip: string,
  now = Date.now(),
  read: RateRead = takeFromDatabase,
): Promise<boolean> {
  return consumeRate("judge", ["ip:" + ip], now, read);
}
