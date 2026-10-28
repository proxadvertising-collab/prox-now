import { parseHours, type BookHours } from "./hours";
import { EXTRACTED_JSON_BUDGET, MAX_ITEMS_PER_PAGE } from "./limits";
import { buildTagline } from "./tagline";

const TOP_KEYS = new Set(["pages", "shop_language", "tagline_facts"]);
const PAGE_KEYS = new Set(["index", "kind_guess", "is_menu", "language", "section", "items", "hours"]);
const ITEM_KEYS = new Set(["name", "price", "currency", "note"]);
const HOURS_KEYS = new Set(["days", "raw"]);
const DAY_KEYS = new Set(["d", "open", "close"]);
const FACE_TOP = new Set(["pages"]);
const FACE_PAGE = new Set(["index", "faces"]);

const LANGUAGE = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/;

export type MenuItem = {
  name: string;
  price: string | null;
  currency: string | null;
  note: string | null;
};

export type PageRead = {
  index: number;
  kindGuess: string | null;
  isMenu: boolean;
  language: string | null;
  section: string | null;
  items: MenuItem[];
  hours: BookHours | null;
};

export type BookRead = {
  pages: PageRead[];
  shopLanguage: string | null;
  tagline: string | null;
};

export type SchemaFailure = { ok: false; reason: "invented_key" | "bad_shape" };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function unknownKey(record: Record<string, unknown>, allowed: Set<string>): boolean {
  return Object.keys(record).some((key) => !allowed.has(key));
}

function languageOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return LANGUAGE.test(text) ? text : null;
}

function clip(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  return text.slice(0, max);
}

function parsePrice(value: unknown): string | null | "bad" {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string") {
    const text = value.trim();
    return text.length === 0 ? null : text.slice(0, 32);
  }
  return "bad";
}

function parseItem(value: unknown): MenuItem | "bad" | "invented" {
  const record = asRecord(value);
  if (!record) return "bad";
  if (unknownKey(record, ITEM_KEYS)) return "invented";
  const name = clip(record.name, 80);
  if (!name) return "bad";
  const price = parsePrice(record.price);
  if (price === "bad") return "bad";
  let currency: string | null = null;
  if (record.currency !== null && record.currency !== undefined) {
    if (typeof record.currency !== "string") return "bad";
    currency = clip(record.currency, 8);
  }
  let note: string | null = null;
  if (record.note !== null && record.note !== undefined) {
    if (typeof record.note !== "string") return "bad";
    note = clip(record.note, 80);
  }
  return { name, price, currency, note };
}

function fitItems(items: MenuItem[]): MenuItem[] {
  const next = items.slice(0, MAX_ITEMS_PER_PAGE);
  while (next.length > 0 && Buffer.byteLength(JSON.stringify({ section: null, items: next })) > EXTRACTED_JSON_BUDGET) {
    next.pop();
  }
  return next;
}

export function parseBookRead(value: unknown): { ok: true; read: BookRead } | SchemaFailure {
  const record = asRecord(value);
  if (!record) return { ok: false, reason: "bad_shape" };
  if (unknownKey(record, TOP_KEYS)) return { ok: false, reason: "invented_key" };
  if (!Array.isArray(record.pages)) return { ok: false, reason: "bad_shape" };

  const pages: PageRead[] = [];
  for (const page of record.pages) {
    const row = asRecord(page);
    if (!row) return { ok: false, reason: "bad_shape" };
    if (unknownKey(row, PAGE_KEYS)) return { ok: false, reason: "invented_key" };
    if (typeof row.index !== "number" || !Number.isInteger(row.index) || row.index < 1 || row.index > 99) {
      return { ok: false, reason: "bad_shape" };
    }
    if (row.is_menu !== undefined && typeof row.is_menu !== "boolean") return { ok: false, reason: "bad_shape" };
    if (!Array.isArray(row.items)) return { ok: false, reason: "bad_shape" };
    const items: MenuItem[] = [];
    for (const item of row.items) {
      const parsed = parseItem(item);
      if (parsed === "invented") return { ok: false, reason: "invented_key" };
      if (parsed === "bad") continue;
      items.push(parsed);
    }
    let hours: BookHours | null = null;
    if (row.hours !== undefined && row.hours !== null) {
      const hoursRecord = asRecord(row.hours);
      if (!hoursRecord || unknownKey(hoursRecord, HOURS_KEYS)) return { ok: false, reason: "invented_key" };
      if (hoursRecord.days !== undefined && !Array.isArray(hoursRecord.days)) return { ok: false, reason: "bad_shape" };
      if (Array.isArray(hoursRecord.days)) {
        for (const day of hoursRecord.days) {
          const dayRecord = asRecord(day);
          if (!dayRecord || unknownKey(dayRecord, DAY_KEYS)) return { ok: false, reason: "invented_key" };
        }
      }
      hours = parseHours(hoursRecord);
    }
    pages.push({
      index: row.index,
      kindGuess: clip(row.kind_guess, 20),
      isMenu: row.is_menu === true,
      language: languageOf(row.language),
      section: clip(row.section, 80),
      items: fitItems(items),
      hours,
    });
  }

  let shopLanguage: string | null = null;
  if (record.shop_language !== undefined && record.shop_language !== null) {
    if (typeof record.shop_language !== "string") return { ok: false, reason: "bad_shape" };
    shopLanguage = languageOf(record.shop_language);
  }
  if (record.tagline_facts !== undefined && !Array.isArray(record.tagline_facts)) {
    return { ok: false, reason: "bad_shape" };
  }

  return {
    ok: true,
    read: {
      pages,
      shopLanguage,
      tagline: buildTagline(record.tagline_facts),
    },
  };
}

export function extractedOf(page: PageRead | null): { section: string | null; items: MenuItem[] } {
  if (!page) return { section: null, items: [] };
  return { section: page.section, items: page.items };
}

export type FacePage = { index: number; faces: number[][] };

export function parseFaceRead(value: unknown): { ok: true; pages: FacePage[] } | SchemaFailure {
  const record = asRecord(value);
  if (!record) return { ok: false, reason: "bad_shape" };
  if (unknownKey(record, FACE_TOP)) return { ok: false, reason: "invented_key" };
  if (!Array.isArray(record.pages)) return { ok: false, reason: "bad_shape" };
  const pages: FacePage[] = [];
  for (const page of record.pages) {
    const row = asRecord(page);
    if (!row) return { ok: false, reason: "bad_shape" };
    if (unknownKey(row, FACE_PAGE)) return { ok: false, reason: "invented_key" };
    if (typeof row.index !== "number" || !Number.isInteger(row.index)) return { ok: false, reason: "bad_shape" };
    if (!Array.isArray(row.faces)) return { ok: false, reason: "bad_shape" };
    const faces: number[][] = [];
    for (const box of row.faces) {
      if (!Array.isArray(box)) return { ok: false, reason: "bad_shape" };
      faces.push(box.map((part) => (typeof part === "number" ? part : Number(part))));
    }
    pages.push({ index: row.index, faces });
  }
  return { ok: true, pages };
}
