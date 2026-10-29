import { photoPublicUrl } from "../posts/source";

export type BookLine = {
  name: string;
  price: string | null;
  note: string | null;
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
  pages: BookPageView[];
  reading: boolean;
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

function menuLines(value: unknown): { section: string | null; items: BookLine[] } {
  const record = asRecord(value);
  if (!record || !Array.isArray(record.items)) return { section: null, items: [] };
  const items: BookLine[] = [];
  for (const item of record.items) {
    const row = asRecord(item);
    const name = text(row?.name, 80);
    if (!name) continue;
    items.push({ name, price: text(row?.price, 32), note: text(row?.note, 80) });
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
  if (Array.isArray(root.pages)) {
    for (const item of root.pages) {
      const page = asRecord(item);
      if (!page) continue;
      const pageId = text(page.id, 80);
      const kind = text(page.kind, 20);
      if (!pageId || !kind) continue;
      const position = typeof page.position === "number" && Number.isFinite(page.position) ? page.position : pages.length;
      const menu = menuLines(page.extracted);
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
  return {
    id,
    slug,
    name,
    nameLocal: text(shop?.name_local, 80),
    tagline: text(book?.tagline, 140),
    hoursLabel: hoursLabel(book?.hours),
    swatches,
    accent: accent && /^#[0-9A-Fa-f]{6}$/.test(accent) ? accent.toUpperCase() : null,
    ink: ink && /^#[0-9A-Fa-f]{6}$/.test(ink) ? ink.toUpperCase() : null,
    mood,
    logoUrl: logo?.imageUrl ?? null,
    pages,
    reading: pages.some((page) => page.failed),
  };
}
