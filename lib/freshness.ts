export const TOTAL_MS = 7_200_000;

export type Phase = "fresh" | "aging" | "last" | "expired";

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

export function phaseFor(remainingMs: number): Phase {
  if (remainingMs <= 0) return "expired";
  if (remainingMs > 60 * MINUTE_MS) return "fresh";
  if (remainingMs >= 10 * MINUTE_MS) return "aging";
  return "last";
}

export function formatRemaining(ms: number): string {
  if (ms <= 0) return "0s";
  if (ms >= HOUR_MS) {
    const hours = Math.floor(ms / HOUR_MS);
    const minutes = Math.floor((ms % HOUR_MS) / MINUTE_MS);
    return hours + "h " + minutes + "m";
  }
  if (ms >= 10 * MINUTE_MS) {
    return Math.floor(ms / MINUTE_MS) + "m";
  }
  const minutes = Math.floor(ms / MINUTE_MS);
  const seconds = Math.floor((ms % MINUTE_MS) / 1000);
  return minutes + "m " + seconds + "s";
}

export function ringOffset(
  circumference: number,
  remainingMs: number,
  totalMs: number = TOTAL_MS,
): number {
  const ratio = totalMs === 0 ? 0 : remainingMs / totalMs;
  const clamped = Math.min(1, Math.max(0, ratio));
  return circumference * (1 - clamped);
}

export function remainingMs(expiresAtIso: string, nowMs: number): number {
  return Date.parse(expiresAtIso) - nowMs;
}
