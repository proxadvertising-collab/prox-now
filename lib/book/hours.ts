export type DayHours = {
  d: number;
  open: string;
  close: string;
};

export type BookHours = {
  days: DayHours[];
  raw: string | null;
  source: "photo" | "owner";
};

export type OpenState = {
  state: "open" | "closed" | "unknown";
  opensAt: string | null;
};

const DAY_NAME: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

const WEEKDAY_SHORT: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatMinutes(minutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, minutes));
  return pad(Math.floor(clamped / 60)) + ":" + pad(clamped % 60);
}

/** Minutes from midnight. 24:00 is 1440 and is only valid as a closing time. */
export function parseClock(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value >= 0 && value < 24 && Number.isInteger(value)) return value * 60;
    return null;
  }
  if (typeof value !== "string") return null;
  const text = value.trim().toLowerCase().replace(".", ":");
  const ampm = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/.exec(text);
  if (ampm) {
    let hour = Number(ampm[1]);
    const minute = Number(ampm[2] ?? "0");
    if (hour < 1 || hour > 12 || minute > 59) return null;
    if (ampm[3] === "pm" && hour !== 12) hour += 12;
    if (ampm[3] === "am" && hour === 12) hour = 0;
    return hour * 60 + minute;
  }
  const hm = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (hm) {
    const hour = Number(hm[1]);
    const minute = Number(hm[2]);
    if (hour === 24 && minute === 0) return 24 * 60;
    if (hour > 23 || minute > 59) return null;
    return hour * 60 + minute;
  }
  const compact = /^(\d{2})(\d{2})$/.exec(text);
  if (compact) {
    const hour = Number(compact[1]);
    const minute = Number(compact[2]);
    if (hour > 23 || minute > 59) return null;
    return hour * 60 + minute;
  }
  return null;
}

export function parseWeekday(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 6) return value;
  if (typeof value !== "string") return null;
  const text = value.trim().toLowerCase();
  if (/^[0-6]$/.test(text)) return Number(text);
  return DAY_NAME[text] ?? null;
}

function everyDayName(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const text = value.trim().toLowerCase().replace(/\s+/g, " ");
  return text === "daily" || text === "every day" || text === "everyday" || text === "all" || text === "all days";
}

function rawSaysDaily(raw: string | null): boolean {
  return raw !== null && /\bdaily\b/i.test(raw);
}

function dailyClock(raw: string | null): { open: number; close: number } | null {
  if (!rawSaysDaily(raw) || !raw) return null;
  const match = /(\d{1,2}(?::\d{2})?(?:\s*[ap]m)?)\s*(?:-|–|—|to)\s*(\d{1,2}(?::\d{2})?(?:\s*[ap]m)?)/i.exec(raw);
  if (!match) return null;
  const open = parseClock(match[1]);
  const close = parseClock(match[2]);
  if (open === null || close === null || open >= 24 * 60) return null;
  return { open, close };
}

function pushEveryDay(days: DayHours[], open: number, close: number): void {
  for (let d = 0; d <= 6; d += 1) {
    if (days.length >= 14) break;
    days.push({ d, open: formatMinutes(open), close: formatMinutes(close) });
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function parseHours(value: unknown, source: BookHours["source"] = "photo"): BookHours | null {
  const record = asRecord(value);
  if (!record) return null;
  const rawDays = record.days;
  const days: DayHours[] = [];
  if (Array.isArray(rawDays)) {
    for (const row of rawDays) {
      if (days.length >= 14) break;
      const item = asRecord(row);
      if (!item) continue;
      const open = parseClock(item.open);
      const close = parseClock(item.close);
      if (open === null || close === null || open >= 24 * 60) continue;
      const lone = rawDays.length === 1 && (item.d == null || item.d === "");
      if (everyDayName(item.d) || lone) {
        pushEveryDay(days, open, close);
        continue;
      }
      const d = parseWeekday(item.d);
      if (d === null) continue;
      days.push({ d, open: formatMinutes(open), close: formatMinutes(close) });
    }
  }
  const raw = typeof record.raw === "string" && record.raw.trim() ? record.raw.trim().slice(0, 400) : null;
  if (days.length === 1 && rawSaysDaily(raw)) {
    const open = parseClock(days[0]?.open);
    const close = parseClock(days[0]?.close);
    if (open !== null && close !== null) {
      days.length = 0;
      pushEveryDay(days, open, close);
    }
  }
  if (days.length === 0) {
    const fromRaw = dailyClock(raw);
    if (fromRaw) pushEveryDay(days, fromRaw.open, fromRaw.close);
  }
  if (days.length === 0 && !raw) return null;
  return { days, raw, source };
}

export function hoursEmpty(hours: unknown): boolean {
  if (!hours || typeof hours !== "object" || Array.isArray(hours)) return true;
  return Object.keys(hours as Record<string, unknown>).length === 0;
}

export function hoursFromOwner(hours: unknown): boolean {
  const record = asRecord(hours);
  return record?.source === "owner";
}

type Interval = { d: number; open: number; close: number };

function intervals(hours: BookHours): Interval[] {
  const out: Interval[] = [];
  for (const day of hours.days) {
    const open = parseClock(day.open);
    const close = parseClock(day.close);
    if (open === null || close === null || open >= 24 * 60) continue;
    out.push({ d: day.d, open, close });
  }
  return out;
}

export function clockInTimeZone(now: Date, timeZone: string): { weekday: number; minutes: number } | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const weekday = WEEKDAY_SHORT[parts.find((part) => part.type === "weekday")?.value ?? ""];
    let hour = Number(parts.find((part) => part.type === "hour")?.value);
    const minute = Number(parts.find((part) => part.type === "minute")?.value);
    if (weekday === undefined || !Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    if (hour === 24) hour = 0;
    return { weekday, minutes: hour * 60 + minute };
  } catch {
    return null;
  }
}

function isOpenAt(hours: BookHours, weekday: number, minutes: number): boolean {
  for (const interval of intervals(hours)) {
    if (interval.close > interval.open) {
      if (interval.d === weekday && minutes >= interval.open && minutes < interval.close) return true;
      continue;
    }
    if (interval.d === weekday && minutes >= interval.open) return true;
    const previous = (weekday + 6) % 7;
    if (interval.d === previous && minutes < interval.close) return true;
  }
  return false;
}

function nextOpen(hours: BookHours, weekday: number, minutes: number): string | null {
  let best: number | null = null;
  let label: string | null = null;
  for (const interval of intervals(hours)) {
    for (let add = 0; add < 8; add += 1) {
      const day = (weekday + add) % 7;
      if (day !== interval.d) continue;
      if (add === 0 && interval.open <= minutes) continue;
      const score = add * 1440 + interval.open;
      if (best === null || score < best) {
        best = score;
        label = formatMinutes(interval.open);
      }
    }
  }
  return label;
}

export function openState(hours: BookHours | null | undefined, timeZone: string, now: Date): OpenState {
  if (!hours || hours.days.length === 0) return { state: "unknown", opensAt: null };
  const clock = clockInTimeZone(now, timeZone);
  if (!clock) return { state: "unknown", opensAt: null };
  if (isOpenAt(hours, clock.weekday, clock.minutes)) return { state: "open", opensAt: null };
  return { state: "closed", opensAt: nextOpen(hours, clock.weekday, clock.minutes) };
}

export function mergeHours(pages: readonly (BookHours | null)[]): BookHours | null {
  const days: DayHours[] = [];
  let raw: string | null = null;
  for (const page of pages) {
    if (!page) continue;
    if (!raw && page.raw) raw = page.raw;
    for (const day of page.days) {
      if (days.length >= 14) break;
      days.push(day);
    }
  }
  if (days.length === 0) return null;
  return { days, raw, source: "photo" };
}
