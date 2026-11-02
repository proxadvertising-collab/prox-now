import { tidyCategory } from "./categories";
import { parseHours, type BookHours } from "./hours";
import { EXTRACTED_JSON_BUDGET, MAX_ITEMS_PER_PAGE } from "./limits";
import { buildTagline } from "./tagline";

const TOP_KEYS = new Set(["pages", "shop_language", "tagline_facts", "shop_name", "colors"]);
const PAGE_KEYS = new Set(["index", "kind_guess", "is_menu", "language", "section", "items", "hours", "contacts"]);
const ITEM_KEYS = new Set(["name", "name_en", "price", "currency", "note", "tags", "photo", "photo_box"]);
const BOX_KEYS = new Set(["src_index", "x", "y", "w", "h"]);
const SHOP_CATEGORIES = new Set([
  "street_food",
  "drinks",
  "restaurant",
  "fruit",
  "laundry",
  "home_services",
  "barber",
  "other",
]);
const CATEGORY_LABELS = new Set([
  "street_food",
  "street food",
  "drinks",
  "restaurant",
  "fruit",
  "laundry",
  "home_services",
  "home services",
  "barber",
  "other",
]);
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
  category?: string | null;
  photo?: number;
  photoBox?: PhotoBox;
  photoUrl?: string;
  /** Set by the open-weight check. The owner should look at this line. */
  needsCheck?: boolean;
};

export type PhotoBox = {
  srcIndex: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type BookDeal = {
  title: string;
  provider: string | null;
  discount: string | null;
  conditions: string | null;
};

export type BookStyle = {
  primary: string | null;
  secondary: string | null;
  font: string | null;
  vibe: string | null;
};

export type BookLogo = {
  index: number;
  box: [number, number, number, number] | null;
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
  logoUrl?: string | null;
};

export type BookRead = {
  pages: PageRead[];
  shopLanguage: string | null;
  tagline: string | null;
  shopName: string | null;
  colors: string[];
  nameEn?: string | null;
  deals?: BookDeal[];
  style?: BookStyle | null;
  logo?: BookLogo | null;
  hero?: number | null;
  heroBox?: PhotoBox | null;
  heroCutout?: string | null;
  category?: string | null;
  maps?: string | null;
  rich?: boolean;
};

export function cleanNameEn(value: string | null, section?: string | null): string | null {
  if (!value) return null;
  const key = value.trim().toLowerCase();
  if (!key || CATEGORY_LABELS.has(key)) return null;
  if (section && key === section.trim().toLowerCase()) return null;
  return value.trim();
}

export function categoryFromOther(current: string, suggested: string | null): string | null {
  if (current !== "other" || !suggested) return null;
  const key = suggested.trim().toLowerCase();
  if (!SHOP_CATEGORIES.has(key) || key === "other") return null;
  return key;
}

export function validLogoBox(value: unknown): [number, number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const nums: number[] = [];
  for (const part of value) {
    if (typeof part !== "number" || !Number.isFinite(part)) return null;
    nums.push(part);
  }
  const x = nums[0] ?? 0;
  const y = nums[1] ?? 0;
  const w = nums[2] ?? 0;
  const h = nums[3] ?? 0;
  if (x < 0 || y < 0 || w <= 0 || h <= 0) return null;
  if (x > 1 || y > 1 || x + w > 1 || y + h > 1) return null;
  return [x, y, w, h];
}

export function logoOrHero(
  logoIndex: number | null,
  box: unknown,
  hero: number | null,
): { index: number | null; box: [number, number, number, number] | null } {
  const valid = validLogoBox(box);
  if (valid && logoIndex != null) return { index: logoIndex, box: valid };
  return { index: hero, box: null };
}

export type SchemaFailure = { ok: false; reason: "invented_key" | "bad_shape" };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function unknownKey(record: Record<string, unknown>, allowed: Set<string>): boolean {
  return Object.keys(record).some((key) => !allowed.has(key));
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** One box. Values clamp into 0–1. A box under 4% of width or height is dropped. */
export function normalizePhotoBox(value: unknown): PhotoBox | null | "bad" {
  if (Array.isArray(value)) return normalizePhotoBox(value[0]);
  const row = asRecord(value);
  if (!row) return "bad";
  if (unknownKey(row, BOX_KEYS)) return "bad";
  const src = row.src_index;
  if (typeof src !== "number" || !Number.isInteger(src) || src < 1) return "bad";
  const parts = [row.x, row.y, row.w, row.h];
  if (parts.some((part) => typeof part !== "number" || !Number.isFinite(part))) return "bad";
  const x = clamp01(row.x as number);
  const y = clamp01(row.y as number);
  let w = clamp01(row.w as number);
  let h = clamp01(row.h as number);
  if (x + w > 1) w = 1 - x;
  if (y + h > 1) h = 1 - y;
  if (w < 0.04 || h < 0.04) return null;
  return { srcIndex: src, x, y, w, h };
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
    nameEn = cleanNameEn(clip(record.name_en, 80));
  }
  let photo: number | null = null;
  if (record.photo !== undefined && record.photo !== null) {
    if (typeof record.photo !== "number" || !Number.isInteger(record.photo) || record.photo < 1) return "bad";
    photo = record.photo;
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
  let photoBox: PhotoBox | null = null;
  if (record.photo_box !== undefined && record.photo_box !== null) {
    const box = normalizePhotoBox(record.photo_box);
    if (box === "bad") return "bad";
    photoBox = box;
  }
  if (photo != null) item.photo = photo;
  if (photoBox) item.photoBox = photoBox;
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

function hexOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^#([0-9a-f]{6})$/i.exec(value.trim());
  return match ? "#" + match[1].toUpperCase() : null;
}

function isRichRecord(record: Record<string, unknown>): boolean {
  return "brand" in record || "style" in record || "menu" in record || "deals" in record || "photos" in record || "hero" in record || "info" in record;
}

function plainItem(item: MenuItem, section: string | null): MenuItem {
  const nameEn = item.nameEn ? cleanNameEn(item.nameEn, section) : null;
  const category = tidyCategory(section);
  const next: MenuItem = { name: item.name, price: item.price, currency: item.currency, note: item.note };
  if (nameEn) next.nameEn = nameEn;
  if (category) next.category = category;
  if (item.tags && item.tags.length > 0) next.tags = item.tags;
  if (item.photoBox) next.photoBox = item.photoBox;
  if (item.photoUrl) next.photoUrl = item.photoUrl;
  return next;
}

function sharedSection(items: readonly MenuItem[]): string | null {
  const first = tidyCategory(items[0]?.category ?? null);
  if (!first) return null;
  const key = first.toLowerCase();
  for (const item of items) {
    const label = tidyCategory(item.category ?? null);
    if (!label || label.toLowerCase() !== key) return null;
  }
  return first;
}

function parseRichBook(record: Record<string, unknown>): { ok: true; read: BookRead } | SchemaFailure {
  const top = new Set(["brand", "style", "menu", "deals", "info", "photos", "hero", "hero_box", "category"]);
  if (unknownKey(record, top)) return { ok: false, reason: "invented_key" };
  const brandKeys = new Set([
    "name",
    "name_en",
    "tagline",
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
    "logo",
    "logo_box",
  ]);
  let shopName: string | null = null;
  let nameEn: string | null = null;
  let tagline: string | null = null;
  let contacts = emptyContacts();
  let logoIndex: number | null = null;
  let logoBox: unknown = null;
  if (record.brand !== undefined && record.brand !== null) {
    const brand = asRecord(record.brand);
    if (!brand || unknownKey(brand, brandKeys)) return { ok: false, reason: brand ? "invented_key" : "bad_shape" };
    shopName = clip(brand.name, 80);
    nameEn = cleanNameEn(clip(brand.name_en, 80));
    tagline = clip(brand.tagline, 140);
    const parsedContacts = parseContacts({
      phones: brand.phones,
      line_id: brand.line_id,
      line_qr: brand.line_qr,
      whatsapp: brand.whatsapp,
      facebook: brand.facebook,
      instagram: brand.instagram,
      tiktok: brand.tiktok,
      website: brand.website,
      email: brand.email,
      delivery: brand.delivery,
      payment: brand.payment,
    });
    if (parsedContacts === "invented") return { ok: false, reason: "invented_key" };
    if (parsedContacts === "bad") return { ok: false, reason: "bad_shape" };
    contacts = parsedContacts;
    if (brand.logo !== undefined && brand.logo !== null) {
      const logo = asRecord(brand.logo);
      if (!logo || unknownKey(logo, new Set(["index", "box"]))) return { ok: false, reason: logo ? "invented_key" : "bad_shape" };
      if (typeof logo.index !== "number" || !Number.isInteger(logo.index)) return { ok: false, reason: "bad_shape" };
      logoIndex = logo.index;
      logoBox = logo.box;
    }
    if (brand.logo_box !== undefined && brand.logo_box !== null) {
      const box = normalizePhotoBox(brand.logo_box);
      if (box === "bad") return { ok: false, reason: "bad_shape" };
      if (box) {
        logoIndex = box.srcIndex;
        logoBox = [box.x, box.y, box.w, box.h];
      }
    }
  }
  let heroBox: PhotoBox | null = null;
  if (record.hero_box !== undefined && record.hero_box !== null) {
    const box = normalizePhotoBox(record.hero_box);
    if (box === "bad") return { ok: false, reason: "bad_shape" };
    heroBox = box;
  }
  let style: BookStyle | null = null;
  if (record.style !== undefined && record.style !== null) {
    const row = asRecord(record.style);
    if (!row || unknownKey(row, new Set(["primary", "secondary", "font", "vibe"]))) {
      return { ok: false, reason: row ? "invented_key" : "bad_shape" };
    }
    style = { primary: hexOf(row.primary), secondary: hexOf(row.secondary), font: clip(row.font, 40), vibe: clip(row.vibe, 80) };
  }
  const groups: { category: string | null; items: MenuItem[] }[] = [];
  if (record.menu !== undefined && record.menu !== null) {
    if (!Array.isArray(record.menu)) return { ok: false, reason: "bad_shape" };
    for (const group of record.menu) {
      const row = asRecord(group);
      if (!row || unknownKey(row, new Set(["category", "items"]))) return { ok: false, reason: row ? "invented_key" : "bad_shape" };
      if (!Array.isArray(row.items)) return { ok: false, reason: "bad_shape" };
      const category = clip(row.category, 80);
      const items: MenuItem[] = [];
      for (const item of row.items) {
        const parsed = parseItem(item);
        if (parsed === "invented") return { ok: false, reason: "invented_key" };
        if (parsed === "bad") continue;
        items.push(parsed);
      }
      groups.push({ category, items });
    }
  }
  const deals: BookDeal[] = [];
  if (record.deals !== undefined && record.deals !== null) {
    if (!Array.isArray(record.deals)) return { ok: false, reason: "bad_shape" };
    for (const deal of record.deals) {
      const row = asRecord(deal);
      if (!row || unknownKey(row, new Set(["title", "provider", "discount", "conditions"]))) {
        return { ok: false, reason: row ? "invented_key" : "bad_shape" };
      }
      const title = clip(row.title, 80);
      if (!title) continue;
      deals.push({
        title,
        provider: clip(row.provider, 80),
        discount: clip(row.discount, 40),
        conditions: clip(row.conditions, 160),
      });
    }
  }
  let hours: BookHours | null = null;
  let hoursText: string | null = null;
  let address: string | null = null;
  let maps: string | null = null;
  let language: string | null = null;
  if (record.info !== undefined && record.info !== null) {
    const info = asRecord(record.info);
    if (!info || unknownKey(info, new Set(["hours_text", "hours", "address", "maps", "language"]))) {
      return { ok: false, reason: info ? "invented_key" : "bad_shape" };
    }
    hoursText = clip(info.hours_text, 160);
    address = clip(info.address, 160);
    maps = clip(info.maps, 200);
    language = languageOf(info.language);
    if (info.hours !== undefined && info.hours !== null) {
      const hoursRecord = asRecord(info.hours);
      if (!hoursRecord || unknownKey(hoursRecord, HOURS_KEYS)) return { ok: false, reason: "invented_key" };
      if (hoursRecord.days !== undefined && !Array.isArray(hoursRecord.days)) return { ok: false, reason: "bad_shape" };
      hours = parseHours(hoursRecord);
    }
  }
  const photoKinds = new Map<number, string>();
  if (record.photos !== undefined && record.photos !== null) {
    if (!Array.isArray(record.photos)) return { ok: false, reason: "bad_shape" };
    for (const photo of record.photos) {
      const row = asRecord(photo);
      if (!row || unknownKey(row, new Set(["index", "kind"]))) return { ok: false, reason: row ? "invented_key" : "bad_shape" };
      if (typeof row.index !== "number" || !Number.isInteger(row.index) || row.index < 1) return { ok: false, reason: "bad_shape" };
      const kind = clip(row.kind, 20);
      if (kind) photoKinds.set(row.index, kind);
    }
  }
  let hero: number | null = null;
  if (record.hero !== undefined && record.hero !== null) {
    if (typeof record.hero !== "number" || !Number.isInteger(record.hero)) return { ok: false, reason: "bad_shape" };
    hero = record.hero;
  }
  let category: string | null = null;
  if (record.category !== undefined && record.category !== null) {
    if (typeof record.category !== "string") return { ok: false, reason: "bad_shape" };
    const key = record.category.trim().toLowerCase();
    if (SHOP_CATEGORIES.has(key)) category = key;
  }
  const logo = logoOrHero(logoIndex, logoBox, hero);
  const indexes = new Set<number>(photoKinds.keys());
  if (logo.index != null) indexes.add(logo.index);
  if (hero != null) indexes.add(hero);
  for (const group of groups) {
    for (const item of group.items) {
      if (item.photo) indexes.add(item.photo);
    }
  }
  if (indexes.size === 0) indexes.add(hero ?? 1);
  const sorted = [...indexes].sort((a, b) => a - b);
  const home = hero != null && indexes.has(hero) ? hero : sorted[0];
  const menuHosts = sorted.filter((index) => {
    const kind = photoKinds.get(index) ?? null;
    return kind === "menu" || kind === "product";
  });
  const host = menuHosts[0] ?? null;
  const queued: MenuItem[] = [];
  for (const group of groups) {
    for (const item of group.items) queued.push(plainItem(item, group.category));
  }
  const itemsByIndex = new Map<number, MenuItem[]>();
  if (host != null) itemsByIndex.set(host, queued);
  const contactIndex = home;
  if (hoursText) contacts = { ...contacts, hoursText };
  if (address) contacts = { ...contacts, address };
  const pages: PageRead[] = sorted.map((index) => {
    const kind = photoKinds.get(index) ?? null;
    const isMenu = kind === "menu" || kind === "product";
    const items = isMenu ? fitItems(itemsByIndex.get(index) ?? []) : [];
    return {
      index,
      kindGuess: kind,
      isMenu,
      language,
      section: sharedSection(items),
      items,
      hours: index === contactIndex ? hours : null,
      contacts: index === contactIndex ? contacts : emptyContacts(),
    };
  });
  const colors: string[] = [];
  if (style?.primary) colors.push(style.primary);
  if (style?.secondary && style.secondary !== style.primary) colors.push(style.secondary);
  return {
    ok: true,
    read: {
      pages,
      shopLanguage: language,
      tagline,
      shopName,
      colors,
      nameEn,
      deals,
      style,
      logo: logo.index != null ? { index: logo.index, box: logo.box } : null,
      hero,
      heroBox,
      category,
      maps,
      rich: true,
    },
  };
}

export function parseBookRead(value: unknown): { ok: true; read: BookRead } | SchemaFailure {
  const record = asRecord(value);
  if (!record) return { ok: false, reason: "bad_shape" };
  if (isRichRecord(record)) return parseRichBook(record);
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
  const body: {
    section: string | null;
    items: MenuItem[];
    contacts?: PageContacts & { page: number };
    logo_url?: string;
  } = {
    section: page.section,
    items: page.items.map((item) => {
      const stored: MenuItem = {
        name: item.name,
        price: item.price,
        currency: item.currency,
        note: item.note,
      };
      if (item.nameEn) stored.nameEn = item.nameEn;
      if (item.category) stored.category = item.category;
      if (item.tags && item.tags.length > 0) stored.tags = item.tags;
      if (item.photoUrl) stored.photoUrl = item.photoUrl;
      if (item.needsCheck) stored.needsCheck = true;
      return stored;
    }),
  };
  if (page.logoUrl) body.logo_url = page.logoUrl;
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
