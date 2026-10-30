const DAY_INDEX: Record<string, number> = {
  mon: 0, monday: 0,
  tue: 1, tues: 1, tuesday: 1,
  wed: 2, wednesday: 2,
  thu: 3, thur: 3, thurs: 3, thursday: 3,
  fri: 4, friday: 4,
  sat: 5, saturday: 5,
  sun: 6, sunday: 6,
};

const DAY_NAME = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const TIME_RE = /(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\s*(?:[-–—]+|\bto\b)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?/i;

export type HoursRow = { days: string; time: string };

/** ALL-CAPS English becomes Title Case. Thai and mixed case stay as written. */
export function displayName(name: string): string {
  if (!name || /[\u0E00-\u0E7F]/.test(name)) return name;
  const letters = name.replace(/[^A-Za-z]/g, "");
  if (!letters || letters !== letters.toUpperCase()) return name;
  return name.toLowerCase().replace(/\b[a-z]/g, (char) => char.toUpperCase());
}

export function isRawGps(value: string): boolean {
  return /-?\d{1,3}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}/.test(value);
}

export function isCaptureStamp(value: string): boolean {
  return /\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}/.test(value);
}

/** Hide a raw GPS pair or a capture timestamp. Other text is kept. */
export function bookText(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed || isRawGps(trimmed) || isCaptureStamp(trimmed)) return null;
  return trimmed;
}

function applyMarker(hour: number, marker: string | undefined): number | null {
  let h = hour;
  if (marker === "pm" && h < 12) h += 12;
  if (marker === "am" && h === 12) h = 0;
  if (h > 23) return null;
  return h;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function rangeText(match: RegExpMatchArray): string | null {
  const minute1 = match[2] ? Number(match[2]) : 0;
  const minute2 = match[5] ? Number(match[5]) : 0;
  const hour1 = applyMarker(Number(match[1]), match[3]?.toLowerCase());
  const hour2 = applyMarker(Number(match[4]), match[6]?.toLowerCase());
  if (hour1 == null || hour2 == null || minute1 > 59 || minute2 > 59) return null;
  return pad(hour1) + ":" + pad(minute1) + "–" + pad(hour2) + ":" + pad(minute2);
}

function dayToken(token: string): number[] | null {
  const range = token.match(/^([A-Za-z]+)[–\-—]([A-Za-z]+)$/);
  if (range) {
    const start = DAY_INDEX[range[1].toLowerCase()];
    const end = DAY_INDEX[range[2].toLowerCase()];
    if (start == null || end == null || start > end) return null;
    const days: number[] = [];
    for (let index = start; index <= end; index += 1) days.push(index);
    return days;
  }
  const one = DAY_INDEX[token.toLowerCase()];
  if (one == null) return null;
  return [one];
}

function expandDays(label: string): number[] | null {
  if (!label.trim()) return [];
  const days: number[] = [];
  for (const token of label.split(/[\s,/&]+/).filter(Boolean)) {
    const found = dayToken(token);
    if (!found) return null;
    days.push(...found);
  }
  return days;
}

function collapse(days: number[]): string {
  const groups: string[] = [];
  let start = days[0] ?? 0;
  let prev = start;
  for (let index = 1; index <= days.length; index += 1) {
    const cur = days[index];
    if (cur === prev + 1) {
      prev = cur;
      continue;
    }
    const left = DAY_NAME[start] ?? "";
    const right = DAY_NAME[prev] ?? "";
    groups.push(start === prev ? left : left + "–" + right);
    start = cur ?? 0;
    prev = start;
  }
  return groups.join(", ");
}

/** One row per day group. Null means the string should be shown as written. */
export function parseHours(raw: string): HoursRow[] | null {
  const text = raw.replace(/\r/g, "").trim();
  if (!text) return null;
  const pieces = text.split(/\n+|;\s*|\s*\|\s*/).map((part) => part.trim()).filter(Boolean);
  const byDay = new Map<number, string>();
  const loose: string[] = [];
  for (const piece of pieces) {
    const flags = piece.match(new RegExp(TIME_RE.source, "gi")) ?? [];
    const clauses = flags.length > 1 ? piece.split(/,\s*(?=[A-Za-z])/) : [piece];
    for (const clause of clauses) {
      const match = clause.match(TIME_RE);
      if (!match || match.index == null) return null;
      const time = rangeText(match);
      if (!time) return null;
      const days = expandDays(clause.slice(0, match.index).replace(/[:\s]+$/g, "").trim());
      if (!days) return null;
      if (days.length === 0) loose.push(time);
      for (const day of days) {
        const prev = byDay.get(day);
        if (prev && prev !== time) return null;
        byDay.set(day, time);
      }
    }
  }
  if (byDay.size === 0) return loose.length === 1 ? [{ days: "", time: loose[0] ?? "" }] : null;
  if (loose.length > 0) return null;
  const grouped = new Map<string, number[]>();
  const order: string[] = [];
  for (const day of [...byDay.keys()].sort((a, b) => a - b)) {
    const time = byDay.get(day);
    if (!time) continue;
    const list = grouped.get(time);
    if (list) list.push(day);
    else {
      grouped.set(time, [day]);
      order.push(time);
    }
  }
  return order.map((time) => ({ days: collapse(grouped.get(time) ?? []), time }));
}
