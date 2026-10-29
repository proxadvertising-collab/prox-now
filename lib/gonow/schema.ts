export type GoNowPick = {
  shopId: string;
  reason: string;
  walkMinutes: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function parsePicks(value: unknown, allowed: ReadonlySet<string>): GoNowPick[] {
  const root = asRecord(value);
  if (!root || !Array.isArray(root.picks)) return [];
  const picks: GoNowPick[] = [];
  const seen = new Set<string>();
  for (const item of root.picks) {
    const row = asRecord(item);
    if (!row) continue;
    const shopId = typeof row.shop_id === "string" ? row.shop_id.trim() : "";
    if (!shopId || !allowed.has(shopId) || seen.has(shopId)) continue;
    const reason = typeof row.reason === "string" ? row.reason.trim().slice(0, 140) : "";
    if (!reason) continue;
    const walk = typeof row.walk_minutes === "number" && Number.isFinite(row.walk_minutes) ? Math.round(row.walk_minutes) : 0;
    seen.add(shopId);
    picks.push({ shopId, reason, walkMinutes: Math.max(1, Math.min(180, walk || 1)) });
    if (picks.length >= 3) break;
  }
  return picks;
}
