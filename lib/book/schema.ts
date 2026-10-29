import { parseHours, type BookHours } from "./hours";
import { EXTRACTED_JSON_BUDGET, MAX_ITEMS_PER_PAGE } from "./limits";
import { buildTagline } from "./tagline";

const TOP_KEYS = new Set(["pages", "shop_language", "tagline_facts", "shop_name", "colors"]);
const PAGE_KEYS = new Set(["index", "kind_guess", "is_menu", "language", "section", "items", "hours", "contacts"]);
const ITEM_KEYS = new Set(["name", "name_en", "price", "currency", "note", "tags"]);
const CONTACT_KEYS = new Set([
  "phones",
  "line_id",
  "line_qr",
  "whatsapp",
  "facebook",
  "instagram",
  "tiktok",
  "website",
  "email",
  "delivery",
  "payment",
  "hours_text",
  "address",
  "wifi",
]);
const DELIVERY = new Set(["grab", "foodpanda", "lineman", "robinhood", "shopeefood", "ubereats"]);
const PAYMENT = new Set(["promptpay", "card", "cash"]);
const TAGS = new Set(["spicy", "vegan"]);
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
  nameEn?: string;
  tags?: string[];
};

export type PageContacts = {
  phones: string[];
  lineId: string | null;
  lineQr: boolean;
  whatsapp: string | null;
  facebook: string | null;
  instagram: string | null;
  tiktok: string | null;
  website: string | null;
  email: string | null;
  delivery: string[];
  payment: string[];
  hoursText: string | null;
  address: string | null;
  wifi: string | null;
};

export function emptyContacts(): PageContacts {
  return {
    phones: [],
    lineId: null,
    lineQr: false,
    whatsapp: null,
    facebook: null,
    instagram: null,
    tiktok: null,
    website: null,
    email: null,
    delivery: [],
    payment: [],
    hoursText: null,
    address: null,
    wifi: null,
  };
}

export function contactsBlank(contacts: PageContacts): boolean {
  return (
    contacts.phones.length === 0 &&
    !contacts.lineId &&
    !contacts.lineQr &&
    !contacts.whatsapp &&
    !contacts.facebook &&
    !contacts.instagram &&
    !contacts.tiktok &&
    !contacts.website &&
    !contacts.email &&
    contacts.delivery.length === 0 &&
    contacts.payment.length === 0 &&
    !contacts.hoursText &&
    !contacts.address &&
    !contacts.wifi
  );
}

export type PageRead = {
  index: number;
  kindGuess: string | null;
  isMenu: boolean;
  language: string | null;
  section: string | null;
  items: MenuItem[];
  hours: BookHours | null;
  contacts: PageContacts;
};

export type BookRead = {
  pages: PageRead[];
  shopLanguage: string | null;
  tagline: string | null;
  shopName: string | null;
  colors: string[];
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
  let nameEn: string | null = null;
  if (record.name_en !== undefined && record.name_en !== null && record.name_en !== "") {
    if (typeof record.name_en !== "string") return "bad";
    nameEn = clip(record.name_en, 80);
  }
  const tags: string[] = [];
  if (record.tags !== undefined && record.tags !== null) {
    if (!Array.isArray(record.tags)) return "bad";
    for (const tag of record.tags) {
      if (typeof tag !== "string") return "invented";
      const key = tag.trim().toLowerCase();
      if (!TAGS.has(key)) return "invented";
      if (!tags.includes(key)) tags.push(key);
    }
  }
  const item: MenuItem = { name, price, currency, note };
  if (nameEn) item.nameEn = nameEn;
  if (tags.length > 0) item.tags = tags;
  return item;
}

function phoneOf(value: unknown): string | null | "bad" {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return "bad";
  const text = value.trim();
  if (!/^[+0-9][0-9\s().-]{5,22}$/.test(text)) return "bad";
  const digits = text.replace(/\D/g, "");
  if (digits.length < 6 || digits.length > 15) return "bad";
  return text;
}

function handleOf(value: unknown, website = false): string | null | "bad" {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return "bad";
  const text = value.trim();
  if (text.length < 2 || text.length > 120 || /\s/.test(text)) return "bad";
  if (!/^[A-Za-z0-9@./_:+-]{2,120}$/.test(text)) return "bad";
  if (website && !text.includes(".")) return "bad";
  return text;
}

function emailOf(value: unknown): string | null | "bad" {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return "bad";
  const text = value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) || text.length > 120) return "bad";
  return text;
}

function wordsOf(value: unknown, allowed: Set<string>, alias: Record<string, string>): string[] | "bad" {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return "bad";
  const found: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") return "bad";
    const key = alias[item.trim().toLowerCase().replace(/\s+/g, " ")];
    if (!key || !allowed.has(key)) return "bad";
    if (!found.includes(key)) found.push(key);
  }
  return found;
}

function parseContacts(value: unknown): PageContacts | "bad" | "invented" {
  const record = asRecord(value);
  if (!record) return "bad";
  if (unknownKey(record, CONTACT_KEYS)) return "invented";
  const phones: string[] = [];
  if (record.phones !== undefined && record.phones !== null) {
    if (!Array.isArray(record.phones)) return "bad";
    for (const phone of record.phones) {
      const parsed = phoneOf(phone);
      if (parsed === "bad") return "bad";
      if (parsed) phones.push(parsed);
    }
  }
  const lineId = handleOf(record.line_id);
  if (lineId === "bad") return "bad";
  if (record.line_qr !== undefined && record.line_qr !== null && typeof record.line_qr !== "boolean") return "bad";
  const whatsapp = phoneOf(record.whatsapp);
  if (whatsapp === "bad") return "bad";
  const facebook = handleOf(record.facebook);
  if (facebook === "bad") return "bad";
  const instagram = handleOf(record.instagram);
  if (instagram === "bad") return "bad";
  const tiktok = handleOf(record.tiktok);
  if (tiktok === "bad") return "bad";
  const website = handleOf(record.website, true);
  if (website === "bad") return "bad";
  const email = emailOf(record.email);
  if (email === "bad") return "bad";
  const delivery = wordsOf(record.delivery, DELIVERY, {
    grab: "grab",
    foodpanda: "foodpanda",
    lineman: "lineman",
    "line man": "lineman",
    robinhood: "robinhood",
    shopeefood: "shopeefood",
    "shopee food": "shopeefood",
    ubereats: "ubereats",
    "uber eats": "ubereats",
  });
  if (delivery === "bad") return "bad";
  const payment = wordsOf(record.payment, PAYMENT, {
    promptpay: "promptpay",
    "promptpay qr": "promptpay",
    card: "card",
    cards: "card",
    cash: "cash",
    "cash only": "cash",
  });
  if (payment === "bad") return "bad";
  return {
    phones,
    lineId,
    lineQr: record.line_qr === true,
    whatsapp,
    facebook,
    instagram,
    tiktok,
    website,
    email,
    delivery,
    payment,
    hoursText: clip(record.hours_text, 160),
    address: clip(record.address, 160),
    wifi: clip(record.wifi, 80),
  };
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
    let contacts = emptyContacts();
    if (row.contacts !== undefined && row.contacts !== null) {
      const parsedContacts = parseContacts(row.contacts);
      if (parsedContacts === "invented") return { ok: false, reason: "invented_key" };
      if (parsedContacts === "bad") return { ok: false, reason: "bad_shape" };
      contacts = parsedContacts;
    }
    pages.push({
      index: row.index,
      kindGuess: clip(row.kind_guess, 20),
      isMenu: row.is_menu === true,
      language: languageOf(row.language),
      section: clip(row.section, 80),
      items: fitItems(items),
      hours,
      contacts,
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
  let shopName: string | null = null;
  if (record.shop_name !== undefined && record.shop_name !== null) {
    if (typeof record.shop_name !== "string") return { ok: false, reason: "bad_shape" };
    shopName = clip(record.shop_name, 80);
  }
  const colors: string[] = [];
  if (record.colors !== undefined && record.colors !== null) {
    if (!Array.isArray(record.colors)) return { ok: false, reason: "bad_shape" };
    for (const color of record.colors) {
      if (typeof color !== "string") continue;
      const match = /^#([0-9a-f]{6})$/i.exec(color.trim());
      if (!match) continue;
      colors.push("#" + match[1].toUpperCase());
      if (colors.length >= 3) break;
    }
  }

  return {
    ok: true,
    read: {
      pages,
      shopLanguage,
      tagline: buildTagline(record.tagline_facts),
      shopName,
      colors,
    },
  };
}

export function extractedOf(page: PageRead | null): {
  section: string | null;
  items: MenuItem[];
  contacts?: PageContacts & { page: number };
} {
  if (!page) return { section: null, items: [] };
  const body: { section: string | null; items: MenuItem[]; contacts?: PageContacts & { page: number } } = {
    section: page.section,
    items: page.items,
  };
  if (!contactsBlank(page.contacts)) body.contacts = { ...page.contacts, page: page.index };
  return body;
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
