export const DECISION_MS = 7 * 24 * 60 * 60 * 1000;

export function decideBy(expiresAt: string): number {
  return Date.parse(expiresAt) + DECISION_MS;
}

export function daysLeft(expiresAt: string, now: number): number {
  const left = decideBy(expiresAt) - now;
  if (!Number.isFinite(left)) return 0;
  return Math.max(0, Math.ceil(left / 86_400_000));
}

export function inDecisionWindow(expiresAt: string, now: number): boolean {
  const expires = Date.parse(expiresAt);
  return Number.isFinite(expires) && expires <= now && now < expires + DECISION_MS;
}

export function expiredUndecided<T extends { status: string; expiresAt: string }>(
  rows: readonly T[],
  now: number,
): T[] {
  return rows.filter((row) => {
    const expires = Date.parse(row.expiresAt);
    return row.status === "live" && Number.isFinite(expires) && expires + DECISION_MS <= now;
  });
}
