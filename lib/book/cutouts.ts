import { createHash } from "node:crypto";
import sharp from "sharp";
import type { PageRead, PhotoBox } from "./schema";

export type PixelRect = { left: number; top: number; width: number; height: number };

export type CutoutSource = { index: number; bytes: Buffer };

const MIN_FRACTION = 0.04;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Pad the box by 4% of its size, then take a centered square inside the photo. */
export function boxToPixelRect(
  box: { x: number; y: number; w: number; h: number },
  imageWidth: number,
  imageHeight: number,
  pad = MIN_FRACTION,
): PixelRect | null {
  if (imageWidth < 2 || imageHeight < 2) return null;
  const x = clamp(box.x, 0, 1);
  const y = clamp(box.y, 0, 1);
  let w = clamp(box.w, 0, 1);
  let h = clamp(box.h, 0, 1);
  if (x + w > 1) w = 1 - x;
  if (y + h > 1) h = 1 - y;
  if (w < MIN_FRACTION || h < MIN_FRACTION) return null;
  const rawW = w * imageWidth;
  const rawH = h * imageHeight;
  const padX = rawW * pad;
  const padY = rawH * pad;
  let left = x * imageWidth - padX;
  let top = y * imageHeight - padY;
  let width = rawW + padX * 2;
  let height = rawH + padY * 2;
  if (left < 0) {
    width += left;
    left = 0;
  }
  if (top < 0) {
    height += top;
    top = 0;
  }
  if (left + width > imageWidth) width = imageWidth - left;
  if (top + height > imageHeight) height = imageHeight - top;
  if (width < 2 || height < 2) return null;
  const side = Math.min(imageWidth, imageHeight, Math.max(width, height));
  const centerX = left + width / 2;
  const centerY = top + height / 2;
  const squareLeft = clamp(centerX - side / 2, 0, imageWidth - side);
  const squareTop = clamp(centerY - side / 2, 0, imageHeight - side);
  return {
    left: Math.round(squareLeft),
    top: Math.round(squareTop),
    width: Math.round(side),
    height: Math.round(side),
  };
}

export function cutoutObjectPath(shopId: string, itemId: string): string {
  return "book-cutouts/" + shopId + "/" + itemId + ".webp";
}

function itemKey(name: string, src: number, nth: number): string {
  return createHash("sha256").update(name + ":" + src + ":" + nth).digest("hex").slice(0, 16);
}

export async function renderCutout(bytes: Buffer, box: { x: number; y: number; w: number; h: number }): Promise<Buffer | null> {
  const meta = await sharp(bytes, { failOn: "none" }).metadata();
  const rect = boxToPixelRect(box, meta.width ?? 0, meta.height ?? 0);
  if (!rect) return null;
  return sharp(bytes, { failOn: "none" })
    .extract(rect)
    .resize(512, 512, { fit: "cover" })
    .webp({ quality: 80 })
    .toBuffer();
}

export async function applyCutouts(input: {
  shopId: string;
  pages: PageRead[];
  sources: readonly CutoutSource[];
  logo: { index: number; box: [number, number, number, number] } | null;
  heroBox: PhotoBox | null;
  heroIndex: number | null;
  upload: (path: string, bytes: Buffer) => Promise<string | null>;
}): Promise<{ heroCutout: string | null }> {
  const byIndex = new Map(input.sources.map((source) => [source.index, source.bytes]));
  let nth = 0;
  for (const page of input.pages) {
    for (const item of page.items) {
      const box = item.photoBox;
      if (!box) continue;
      const bytes = byIndex.get(box.srcIndex);
      if (!bytes) continue;
      const webp = await renderCutout(bytes, box);
      if (!webp) continue;
      const path = cutoutObjectPath(input.shopId, itemKey(item.name, box.srcIndex, nth));
      nth += 1;
      const stored = await input.upload(path, webp);
      if (stored) item.photoUrl = stored;
    }
  }
  if (input.logo?.box) {
    const bytes = byIndex.get(input.logo.index);
    const [x, y, w, h] = input.logo.box;
    if (bytes && w >= MIN_FRACTION && h >= MIN_FRACTION) {
      const webp = await renderCutout(bytes, { x, y, w, h });
      if (webp) {
        const path = cutoutObjectPath(input.shopId, "logo");
        const stored = await input.upload(path, webp);
        const page = input.pages.find((item) => item.index === input.logo?.index) ?? input.pages[0];
        if (stored && page) page.logoUrl = stored;
      }
    }
  }
  let heroCutout: string | null = null;
  const heroPage = input.pages.find((page) => page.index === input.heroIndex);
  const heroKind = heroPage?.kindGuess;
  if (input.heroBox && (heroKind === "storefront" || heroKind === "product")) {
    const bytes = byIndex.get(input.heroBox.srcIndex);
    if (bytes) {
      const webp = await renderCutout(bytes, input.heroBox);
      if (webp) {
        const path = cutoutObjectPath(input.shopId, "hero");
        heroCutout = await input.upload(path, webp);
      }
    }
  }
  return { heroCutout };
}

export function isSourceUpload(url: string | null | undefined): boolean {
  if (!url) return false;
  const marker = "/shop-book/";
  const at = url.indexOf(marker);
  if (at < 0) return false;
  return !url.slice(at + marker.length).startsWith("book-cutouts/");
}

export function displayPhoto(url: string | null | undefined): string | null {
  if (!url || isSourceUpload(url)) return null;
  if (url.includes("book-cutouts/") || url.startsWith("/demo/")) return url;
  return null;
}

export function containsSourceUpload(value: unknown): boolean {
  const text = JSON.stringify(value);
  const marker = "/shop-book/";
  let from = 0;
  while (from < text.length) {
    const at = text.indexOf(marker, from);
    if (at < 0) return false;
    if (!text.slice(at + marker.length).startsWith("book-cutouts/")) return true;
    from = at + marker.length;
  }
  return false;
}

export type BookSurface = {
  heroUrl: string | null;
  logoUrl: string | null;
  menu: { name: string; nameEn: string | null; price: string | null; photo: string | null; category: string | null; tags?: string[] }[];
  extras: { id: string; imageUrl: null }[];
};

export function bookSurface(view: {
  heroUrl: string | null;
  logoUrl: string | null;
  pages: readonly {
    id: string;
    kind: string;
    imageUrl: string | null;
    section: string | null;
    items: readonly {
      name: string;
      nameEn?: string | null;
      price: string | null;
      photoUrl?: string | null;
      tags?: readonly string[];
      category?: string | null;
    }[];
  }[];
}): BookSurface {
  const menuBoards = new Set(
    view.pages.filter((page) => page.kind === "menu" || page.kind === "extra").map((page) => page.imageUrl),
  );
  let heroUrl = displayPhoto(view.heroUrl);
  if (view.heroUrl && menuBoards.has(view.heroUrl)) heroUrl = null;
  const menu: BookSurface["menu"] = [];
  const extras: BookSurface["extras"] = [];
  for (const page of view.pages) {
    if (page.kind === "extra") {
      extras.push({ id: page.id, imageUrl: null });
      continue;
    }
    if (page.kind === "storefront" || page.kind === "logo" || page.kind === "hours" || page.kind === "qr") continue;
    if (page.kind !== "menu" && page.items.length === 0) continue;
    for (const item of page.items) {
      const row: BookSurface["menu"][number] = {
        name: item.name,
        nameEn: item.nameEn ?? null,
        price: item.price,
        photo: displayPhoto(item.photoUrl ?? null),
        category: item.category ?? page.section,
      };
      const tags = (item.tags ?? []).filter((tag) => tag === "spicy" || tag === "vegan");
      if (tags.length > 0) row.tags = tags;
      menu.push(row);
    }
  }
  return { heroUrl, logoUrl: displayPhoto(view.logoUrl), menu, extras };
}
