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

export function allowSnap(ip: string, userId: string | null, now: number): boolean {
  const limits = [{ key: "ip:" + ip, limit: SNAP_IP_LIMIT }];
  if (userId) limits.unshift({ key: "user:" + userId, limit: SNAP_USER_LIMIT });
  return take(snapHits, limits, now);
}

export function allowJudge(ip: string, now: number): boolean {
  return take(judgeHits, [{ key: "ip:" + ip, limit: SNAP_IP_LIMIT }], now);
}
