import { photoPublicUrl } from "../posts/source";
import { contrastRatio, MIN_CONTRAST } from "./palette";
import { cleanNameEn, type PageContacts } from "./schema";

export type BookLine = {
  name: string;
  price: string | null;
  note: string | null;
  nameEn?: string;
  tags?: string[];
  photoUrl?: string;
};

export type BookPageView = {
  id: string;
  kind: string;
  imageUrl: string | null;
  position: number;
  credit: string | null;
  section: string | null;
  items: BookLine[];
  failed: boolean;
};

export type Sourced = { value: string; page: number };

export type ShopInfo = {
  phones: Sourced[];
  lineId: Sourced | null;
  lineQrPage: number | null;
  whatsapp: Sourced | null;
  facebook: Sourced | null;
  instagram: Sourced | null;
  tiktok: Sourced | null;
  website: Sourced | null;
  email: Sourced | null;
  delivery: Sourced[];
  payment: Sourced[];
  hoursText: Sourced | null;
  address: Sourced | null;
  wifi: Sourced | null;
};

export type BookView = {
  id: string;
  slug: string;
  name: string;
  nameLocal: string | null;
  tagline: string | null;
  hoursLabel: string | null;
  swatches: string[];
  accent: string | null;
  ink: string | null;
  mood: "bold" | "elegant" | "playful" | "street" | null;
  logoUrl: string | null;
  heroUrl: string | null;
  font: string | null;
  nameEn: string | null;
  maps: string | null;
  deals: { title: string; provider: string | null; discount: string | null; conditions: string | null }[];
  pages: BookPageView[];
  info: ShopInfo;
  reading: boolean;
  sourceLanguage: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function text(value: unknown, max = 200): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function stringList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  const found: string[] = [];
  for (const item of value) {
    const row = text(item, 120);
    if (!row || found.includes(row)) continue;
    found.push(row);
    if (found.length >= max) break;
  }
  return found;
}

function cutoutUrl(supabaseUrl: string, value: unknown): string | null {
  const raw = text(value, 300);
  if (!raw || !raw.includes("book-cutouts/")) return null;
  if (raw.startsWith("http")) return raw;
  return bookImageUrl(supabaseUrl, raw);
}

function menuLines(value: unknown, supabaseUrl: string): { section: string | null; items: BookLine[] } {
  const record = asRecord(value);
  if (!record || !Array.isArray(record.items)) return { section: null, items: [] };
  const items: BookLine[] = [];
  for (const item of record.items) {
    const row = asRecord(item);
    const name = text(row?.name, 80);
    if (!name) continue;
    const line: BookLine = { name, price: text(row?.price, 32), note: text(row?.note, 80) };
    const nameEn = text(row?.nameEn, 80) ?? text(row?.name_en, 80);
    if (nameEn) line.nameEn = nameEn;
    const tags = stringList(row?.tags, 4).filter((tag) => tag === "spicy" || tag === "vegan");
    if (tags.length > 0) line.tags = tags;
    const photoUrl = cutoutUrl(supabaseUrl, row?.photo_url) ?? cutoutUrl(supabaseUrl, row?.photoUrl);
    if (photoUrl) line.photoUrl = photoUrl;
    items.push(line);
  }
  return { section: text(record.section, 80), items };
}

function readFailed(value: unknown): boolean {
  const meta = asRecord(value);
  return typeof meta?.error === "string" && meta.error.trim().length > 0;
}

export function bookImageUrl(supabaseUrl: string, imagePath: string | null): string | null {
  if (imagePath?.startsWith("/demo/")) return imagePath;
  const url = photoPublicUrl(supabaseUrl, imagePath);
  if (!url) return null;
  return url.replace("/post-photos/", "/shop-book/");
}

function hoursLabel(value: unknown): string | null {
  const record = asRecord(value);
  if (!record) return null;
  const raw = text(record.raw, 160);
  if (raw) return raw;
  if (!Array.isArray(record.days)) return null;
  const lines: string[] = [];
  for (const day of record.days) {
    const row = asRecord(day);
    if (!row) continue;
    const open = text(row.open, 8);
    const close = text(row.close, 8);
    if (!open || !close) continue;
    lines.push(open + "–" + close);
    if (lines.length >= 2) break;
  }
  return lines.length > 0 ? lines.join(", ") : null;
}

function digits(value: string): string {
  return value.replace(/\D/g, "");
}

export function mergeContacts(pages: readonly { page: number; contacts: PageContacts }[]): ShopInfo {
  const info: ShopInfo = {
    phones: [],
    lineId: null,
    lineQrPage: null,
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
  const phoneKeys = new Set<string>();
  const deliveryKeys = new Set<string>();
  const paymentKeys = new Set<string>();
  for (const row of pages) {
    const contacts = row.contacts;
    for (const phone of contacts.phones) {
      const key = digits(phone);
      if (!key || phoneKeys.has(key)) continue;
      phoneKeys.add(key);
      info.phones.push({ value: phone, page: row.page });
    }
    if (!info.lineId && contacts.lineId) info.lineId = { value: contacts.lineId, page: row.page };
    if (info.lineQrPage == null && contacts.lineQr) info.lineQrPage = row.page;
    if (!info.whatsapp && contacts.whatsapp) info.whatsapp = { value: contacts.whatsapp, page: row.page };
    if (!info.facebook && contacts.facebook) info.facebook = { value: contacts.facebook, page: row.page };
    if (!info.instagram && contacts.instagram) info.instagram = { value: contacts.instagram, page: row.page };
    if (!info.tiktok && contacts.tiktok) info.tiktok = { value: contacts.tiktok, page: row.page };
    if (!info.website && contacts.website) info.website = { value: contacts.website, page: row.page };
    if (!info.email && contacts.email) info.email = { value: contacts.email, page: row.page };
    for (const name of contacts.delivery) {
      if (deliveryKeys.has(name)) continue;
      deliveryKeys.add(name);
      info.delivery.push({ value: name, page: row.page });
    }
    for (const name of contacts.payment) {
      if (paymentKeys.has(name)) continue;
      paymentKeys.add(name);
      info.payment.push({ value: name, page: row.page });
    }
    if (!info.hoursText && contacts.hoursText) info.hoursText = { value: contacts.hoursText, page: row.page };
    if (!info.address && contacts.address) info.address = { value: contacts.address, page: row.page };
    if (!info.wifi && contacts.wifi) info.wifi = { value: contacts.wifi, page: row.page };
  }
  return info;
}

function readStoredContacts(extracted: unknown): { page: number; contacts: PageContacts } | null {
  const raw = asRecord(asRecord(extracted)?.contacts);
  if (!raw) return null;
  const page = typeof raw.page === "number" && Number.isFinite(raw.page) ? raw.page : 0;
  return {
    page,
    contacts: {
      phones: stringList(raw.phones, 8),
      lineId: text(raw.lineId, 120),
      lineQr: raw.lineQr === true,
      whatsapp: text(raw.whatsapp, 32),
      facebook: text(raw.facebook, 120),
      instagram: text(raw.instagram, 120),
      tiktok: text(raw.tiktok, 120),
      website: text(raw.website, 120),
      email: text(raw.email, 120),
      delivery: stringList(raw.delivery, 8),
      payment: stringList(raw.payment, 4),
      hoursText: text(raw.hoursText, 160),
      address: text(raw.address, 160),
      wifi: text(raw.wifi, 80),
    },
  };
}

export function presentBook(payload: unknown, supabaseUrl: string): BookView | null {
  const root = asRecord(payload);
  const shop = asRecord(root?.shop);
  const name = text(shop?.name, 80);
  const slug = text(shop?.slug, 80);
  const id = text(shop?.id, 80);
  if (!root || !name || !slug || !id) return null;
  const book = asRecord(root.book);
  const theme = asRecord(book?.theme);
  const swatches = Array.isArray(theme?.swatches)
    ? theme.swatches.filter((item): item is string => typeof item === "string" && /^#[0-9A-Fa-f]{6}$/.test(item)).slice(0, 5)
    : [];
  const accent = text(theme?.accent, 7);
  const ink = text(theme?.ink, 7);
  const moodText = text(theme?.mood, 12);
  const mood = moodText === "bold" || moodText === "elegant" || moodText === "playful" || moodText === "street" ? moodText : null;
  const pages: BookPageView[] = [];
  const contactRows: { page: number; contacts: PageContacts }[] = [];
  let logoCutout: string | null = null;
  let pageLanguage: string | null = null;
  if (Array.isArray(root.pages)) {
    for (const item of root.pages) {
      const page = asRecord(item);
      if (!page) continue;
      const pageId = text(page.id, 80);
      const kind = text(page.kind, 20);
      if (!pageId || !kind) continue;
      if (!pageLanguage) pageLanguage = text(page.language, 16);
      const position = typeof page.position === "number" && Number.isFinite(page.position) ? page.position : pages.length;
      const menu = menuLines(page.extracted, supabaseUrl);
      const extracted = asRecord(page.extracted);
      const cutout = cutoutUrl(supabaseUrl, extracted?.logo_url);
      if (cutout) logoCutout = cutout;
      const stored = readStoredContacts(page.extracted);
      if (stored) contactRows.push(stored);
      pages.push({
        id: pageId,
        kind,
        imageUrl: bookImageUrl(supabaseUrl, typeof page.image_path === "string" ? page.image_path : null),
        position,
        credit: text(page.credit, 80),
        section: menu.section,
        items: menu.items,
        failed: readFailed(page.ai_meta),
      });
    }
  }
  const logo = pages.find((page) => page.kind === "logo" && page.imageUrl);
  let accentOut = accent && /^#[0-9A-Fa-f]{6}$/.test(accent) ? accent.toUpperCase() : null;
  let inkOut = ink && /^#[0-9A-Fa-f]{6}$/.test(ink) ? ink.toUpperCase() : null;
  if (accentOut && inkOut && contrastRatio(accentOut, inkOut) < MIN_CONTRAST) {
    accentOut = null;
    inkOut = null;
  }
  const deals: BookView["deals"] = [];
  if (Array.isArray(theme?.deals)) {
    for (const item of theme.deals) {
      const row = asRecord(item);
      const title = text(row?.title, 80);
      if (!title) continue;
      deals.push({
        title,
        provider: text(row?.provider, 80),
        discount: text(row?.discount, 40),
        conditions: text(row?.conditions, 160),
      });
      if (deals.length >= 12) break;
    }
  }
  return {
    id,
    slug,
    name,
    nameLocal: text(shop?.name_local, 80),
    tagline: text(book?.tagline, 140),
    hoursLabel: hoursLabel(book?.hours),
    swatches,
    accent: accentOut,
    ink: inkOut,
    mood,
    logoUrl: logoCutout ?? logo?.imageUrl ?? null,
    heroUrl: bookImageUrl(supabaseUrl, typeof theme?.heroPath === "string" ? theme.heroPath : null),
    font: text(theme?.font, 40),
    nameEn: cleanNameEn(text(theme?.nameEn, 80)),
    maps: text(theme?.maps, 200),
    deals,
    pages,
    info: mergeContacts(contactRows),
    reading: pages.some((page) => page.failed),
    sourceLanguage: text(book?.source_language, 16) ?? pageLanguage,
  };
}
