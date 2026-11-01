type Hit = { start: number; count: number };

export const HOUR_MS = 3_600_000;
export const SNAP_USER_LIMIT = 20;
export const DEMO_SNAP_USER_LIMIT = 200;
export const SNAP_IP_LIMIT = 60;
export const BOOK_USER_LIMIT = 60;
export const BOOK_IP_LIMIT = 120;

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
export const bookHits = new Map<string, Hit>();
export const resetHits = new Map<string, Hit>();
export const RESET_IP_LIMIT = 30;

export type RateBucket = "snap" | "judge" | "book";

export type RateRead = (
  bucket: RateBucket,
  subjects: readonly string[],
) => Promise<boolean | null>;

export function resetRateWindows(): void {
  snapHits.clear();
  judgeHits.clear();
  bookHits.clear();
  resetHits.clear();
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim() ?? "";
  if (first) return first.slice(0, 64);
  const real = request.headers.get("x-real-ip")?.trim() ?? "";
  if (real) return real.slice(0, 64);
  return "unknown";
}

function storeFor(bucket: RateBucket): Map<string, Hit> {
  if (bucket === "book") return bookHits;
  if (bucket === "judge") return judgeHits;
  return snapHits;
}

function limitsFor(
  bucket: RateBucket,
  subjects: readonly string[],
  userLimit = SNAP_USER_LIMIT,
): { key: string; limit: number }[] {
  return subjects.map((key) => {
    const user = key.startsWith("user:");
    if (bucket === "book") return { key, limit: user ? BOOK_USER_LIMIT : BOOK_IP_LIMIT };
    return { key, limit: user ? userLimit : SNAP_IP_LIMIT };
  });
}

async function isDemoAccount(userId: string): Promise<boolean> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return false;
  try {
    const { createClient } = await import("../supabase/server");
    const supabase = await createClient();
    const found = await supabase.from("demo_accounts").select("role").eq("user_id", userId).limit(1);
    if (found.error || !Array.isArray(found.data)) return false;
    return found.data.length > 0;
  } catch (error) {
    if (typeof error === "object" && error !== null && "digest" in error) throw error;
    return false;
  }
}

function missingRateFunction(message: string): boolean {
  const text = message.toLowerCase();
  return text.includes("take_rate_limit") || text.includes("schema cache") || text.includes("42883");
}

// A database that has not applied 0012 rejects the book bucket. null means
// "count this hour in this process" so uploads keep working until apply.
export function databaseRateAnswer(errorMessage: string | null, data: unknown): boolean | null {
  if (errorMessage) {
    const text = errorMessage.toLowerCase();
    if (missingRateFunction(text) || text.includes("bad_bucket")) return null;
    return false;
  }
  return data === true;
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
    if (error) return databaseRateAnswer(String(error.message ?? ""), null);
    return databaseRateAnswer(null, data);
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
  return take(storeFor(bucket), limitsFor(bucket, subjects), now);
}

export async function allowSnap(
  ip: string,
  userId: string | null,
  now = Date.now(),
  read: RateRead = takeFromDatabase,
  demo?: boolean,
): Promise<boolean> {
  const subjects: string[] = [];
  if (userId) subjects.push("user:" + userId);
  subjects.push("ip:" + ip);
  const demoAccount = demo ?? (userId ? await isDemoAccount(userId) : false);
  if (demoAccount && userId) {
    return take(snapHits, limitsFor("snap", subjects, DEMO_SNAP_USER_LIMIT), now);
  }
  return consumeRate("snap", subjects, now, read);
}

export async function allowBook(
  ip: string,
  userId: string | null,
  now = Date.now(),
  read: RateRead = takeFromDatabase,
): Promise<boolean> {
  const subjects: string[] = [];
  if (userId) subjects.push("user:" + userId);
  subjects.push("ip:" + ip);
  return consumeRate("book", subjects, now, read);
}

export async function allowJudge(
  ip: string,
  now = Date.now(),
  read: RateRead = takeFromDatabase,
): Promise<boolean> {
  return consumeRate("judge", ["ip:" + ip], now, read);
}

/** In-memory only. A fresh-demo reset must not call the shared judge limiter or production. */
export async function allowReset(ip: string, now = Date.now()): Promise<boolean> {
  return take(resetHits, [{ key: "ip:" + ip, limit: RESET_IP_LIMIT }], now);
}
