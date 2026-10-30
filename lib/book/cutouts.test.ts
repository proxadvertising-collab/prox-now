import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { applyCutouts, bookSurface, boxToPixelRect, containsSourceUpload, renderCutout } from "./cutouts";
import { normalizePhotoBox, parseBookRead, type PageRead } from "./schema";

const SOURCE = "https://example.supabase.co/storage/v1/object/public/shop-book/shop-1/menu.jpg";
const CUTOUT = "https://example.supabase.co/storage/v1/object/public/shop-book/book-cutouts/shop-1/tea.webp";

describe("book cutouts", () => {
  it("clamps a box into the photo and drops one under 4%", () => {
    expect(normalizePhotoBox({ src_index: 2, x: -0.2, y: 0.1, w: 0.5, h: 1.4 })).toEqual({
      srcIndex: 2,
      x: 0,
      y: 0.1,
      w: 0.5,
      h: 0.9,
    });
    expect(normalizePhotoBox({ src_index: 1, x: 0, y: 0, w: 0.03, h: 0.5 })).toBeNull();
    expect(
      normalizePhotoBox([
        { src_index: 1, x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
        { src_index: 9, x: 0.2, y: 0.2, w: 0.4, h: 0.4 },
      ]),
    ).toMatchObject({ srcIndex: 1 });
    expect(normalizePhotoBox({ src_index: 1, x: 0.1, y: 0.1, w: 0.2, h: 0.2, extra: true })).toBe("bad");
  });

  it("pads the box and returns a centered square in pixels", () => {
    expect(boxToPixelRect({ x: 0.1, y: 0.2, w: 0.4, h: 0.3 }, 1000, 800)).toEqual({
      left: 84,
      top: 64,
      width: 432,
      height: 432,
    });
    expect(boxToPixelRect({ x: 0, y: 0, w: 0.02, h: 0.5 }, 1000, 800)).toBeNull();
  });

  it("asks the reader for a photo box and keeps it on the item", () => {
    const parsed = parseBookRead({
      brand: { name: "Cafe", logo_box: { src_index: 1, x: 0.2, y: 0.2, w: 0.3, h: 0.3 } },
      menu: [
        {
          category: "Drinks",
          items: [
            {
              name: "ชา",
              name_en: "Tea",
              price: "40",
              photo: 2,
              photo_box: { src_index: 2, x: 0.1, y: 0.1, w: 0.4, h: 0.4 },
            },
          ],
        },
      ],
      photos: [
        { index: 1, kind: "logo" },
        { index: 2, kind: "menu" },
      ],
      hero: 1,
      hero_box: { src_index: 1, x: 0.1, y: 0.1, w: 0.5, h: 0.5 },
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.read.logo).toEqual({ index: 1, box: [0.2, 0.2, 0.3, 0.3] });
    expect(parsed.read.heroBox).toMatchObject({ srcIndex: 1 });
    expect(parsed.read.pages.find((page) => page.index === 2)?.items[0]?.photoBox).toMatchObject({ srcIndex: 2, w: 0.4 });
  });

  it("crops a square webp and stores it under book-cutouts", async () => {
    const bytes = await sharp({
      create: { width: 200, height: 160, channels: 3, background: "#ff8800" },
    })
      .jpeg()
      .toBuffer();
    const webp = await renderCutout(bytes, { x: 0.1, y: 0.1, w: 0.5, h: 0.5 });
    expect(webp).not.toBeNull();
    const meta = await sharp(webp ?? Buffer.alloc(0)).metadata();
    expect(meta.width).toBe(512);
    expect(meta.height).toBe(512);
    expect(meta.format).toBe("webp");

    const pages: PageRead[] = [
      {
        index: 1,
        kindGuess: "storefront",
        isMenu: false,
        language: null,
        section: null,
        items: [],
        hours: null,
        contacts: {
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
        },
      },
      {
        index: 2,
        kindGuess: "menu",
        isMenu: true,
        language: "th",
        section: "Drinks",
        items: [
          {
            name: "ชา",
            price: "40",
            currency: "THB",
            note: null,
            nameEn: "Tea",
            photoBox: { srcIndex: 2, x: 0.1, y: 0.1, w: 0.5, h: 0.5 },
          },
          { name: "กาแฟ", price: null, currency: null, note: null, nameEn: "Coffee" },
        ],
        hours: null,
        contacts: {
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
        },
      },
    ];
    const uploads: string[] = [];
    const cut = await applyCutouts({
      shopId: "shop-1",
      pages,
      sources: [
        { index: 1, bytes },
        { index: 2, bytes },
      ],
      logo: { index: 1, box: [0.2, 0.2, 0.3, 0.3] },
      heroBox: { srcIndex: 1, x: 0.1, y: 0.1, w: 0.6, h: 0.5 },
      heroIndex: 1,
      upload: async (path) => {
        uploads.push(path);
        return path;
      },
    });
    expect(pages[1]?.items[0]?.photoUrl).toMatch(/^book-cutouts\/shop-1\/[a-f0-9]+\.webp$/);
    expect(pages[1]?.items[1]?.photoUrl).toBeUndefined();
    expect(pages[0]?.logoUrl).toBe("book-cutouts/shop-1/logo.webp");
    expect(cut.heroCutout).toBe("book-cutouts/shop-1/hero.webp");
    expect(uploads.every((path) => path.startsWith("book-cutouts/shop-1/"))).toBe(true);
  });

  it("builds a page model with cutouts and text, and no source upload URL", () => {
    const surface = bookSurface({
      heroUrl: SOURCE,
      logoUrl: "book-cutouts/shop-1/logo.webp",
      pages: [
        { id: "logo", kind: "logo", imageUrl: "https://example.supabase.co/storage/v1/object/public/shop-book/shop-1/logo.jpg", section: null, items: [] },
        {
          id: "menu",
          kind: "menu",
          imageUrl: SOURCE,
          section: "Drinks",
          items: [
            { name: "ชา", nameEn: "Tea", price: "40", photoUrl: CUTOUT },
            { name: "กาแฟ", nameEn: "Coffee", price: null, photoUrl: SOURCE },
          ],
        },
        { id: "extra-1", kind: "extra", imageUrl: SOURCE, section: null, items: [] },
      ],
    });
    expect(surface.heroUrl).toBeNull();
    expect(surface.logoUrl).toBe("book-cutouts/shop-1/logo.webp");
    expect(surface.menu).toEqual([
      { name: "ชา", nameEn: "Tea", price: "40", photo: CUTOUT, category: "Drinks" },
      { name: "กาแฟ", nameEn: "Coffee", price: null, photo: null, category: "Drinks" },
    ]);
    expect(surface.extras).toEqual([{ id: "extra-1", imageUrl: null }]);
    expect(containsSourceUpload(surface)).toBe(false);
    expect(containsSourceUpload({ heroUrl: SOURCE })).toBe(true);
  });
});
