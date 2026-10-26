/** Two hours, in milliseconds. Matches the posts expiry trigger. */
export const POST_TTL_MS = 7_200_000;

/** Launch-market default. Pass the shop timezone for anywhere else. */
export const BANGKOK_TZ = "Asia/Bangkok";

export function computeExpiresAt(createdAtIso: string): string {
  const created = new Date(createdAtIso);
  return new Date(created.getTime() + POST_TTL_MS).toISOString();
}

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  const value = parts.find((item) => item.type === type)?.value;
  if (!value) throw new Error("missing date part: " + type);
  return value;
}

/** Calendar day as YYYY-MM-DD in the given time zone. */
export function couponDay(date: Date, tz: string = BANGKOK_TZ): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return part(parts, "year") + "-" + part(parts, "month") + "-" + part(parts, "day");
}

function wallClockAsUtc(instantMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instantMs));
  let year = Number(part(parts, "year"));
  let month = Number(part(parts, "month"));
  let day = Number(part(parts, "day"));
  let hour = Number(part(parts, "hour"));
  const minute = Number(part(parts, "minute"));
  const second = Number(part(parts, "second"));
  if (hour === 24) {
    hour = 0;
    const rolled = new Date(Date.UTC(year, month - 1, day + 1));
    year = rolled.getUTCFullYear();
    month = rolled.getUTCMonth() + 1;
    day = rolled.getUTCDate();
  }
  return Date.UTC(year, month - 1, day, hour, minute, second);
}

function offsetMs(instantMs: number, tz: string): number {
  return wallClockAsUtc(instantMs, tz) - instantMs;
}

/**
 * The instant the next local day starts. That is when a coupon for `day` ends.
 * Correct when the local day is 23 or 25 hours long.
 */
export function endOfCouponDay(day: string, tz: string = BANGKOK_TZ): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) throw new Error("day must be YYYY-MM-DD");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = Number(match[3]);
  const next = new Date(Date.UTC(year, month - 1, date + 1));
  const desired = Date.UTC(next.getUTCFullYear(), next.getUTCMonth(), next.getUTCDate(), 0, 0, 0);
  let utc = desired;
  for (let i = 0; i < 4; i += 1) {
    const adjusted = desired - offsetMs(utc, tz);
    if (adjusted === utc) break;
    utc = adjusted;
  }
  return new Date(utc);
}
