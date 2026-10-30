import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BookSwiper } from "../../../../components/book/BookSwiper";
import type { ShopInfo } from "../../../../lib/book/present";
import {
  CoverCard,
  MenuCard,
  MenuTile,
  assembleDeck,
  bookCardCount,
  bookFallbackPhoto,
  buildDeck,
  chunkMenu,
  liveLeftLabel,
  type MenuTileData,
} from "./cards";

function tile(index: number): MenuTileData {
  return { name: "Item " + index, nameEn: "Item " + index, price: null, photo: null };
}

const blankInfo: ShopInfo = {
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

describe("tidy book cards", () => {
  it("splits the menu into pages of at most 6 items", () => {
    const pages = chunkMenu(Array.from({ length: 13 }, (_, index) => tile(index)));
    expect(pages).toHaveLength(3);
    expect(pages[0]).toHaveLength(6);
    expect(pages[1]).toHaveLength(6);
    expect(pages[2]).toHaveLength(1);
    expect(pages.every((page) => page.length <= 6)).toBe(true);
    expect(chunkMenu(Array.from({ length: 6 }, (_, index) => tile(index)))).toHaveLength(1);
  });

  it("uses a shop photo instead of an empty tile", () => {
    const fallback = bookFallbackPhoto(null, [
      { kind: "hours", imageUrl: "/hours.jpg" },
      { kind: "menu", imageUrl: "/menu.jpg" },
    ]);
    expect(bookFallbackPhoto("/hero.jpg", [{ kind: "menu", imageUrl: "/menu.jpg" }])).toBe("/hero.jpg");
    expect(fallback).toBe("/menu.jpg");
    const html = renderToStaticMarkup(
      createElement(MenuTile, { name: "Tea", nameEn: null, price: null, photo: fallback }),
    );
    expect(html).toContain('src="/menu.jpg"');
    expect(html).not.toContain("data-placeholder");
    const empty = renderToStaticMarkup(createElement(MenuTile, tile(0)));
    expect(empty).not.toContain("<img");
    expect(empty).not.toContain("data-placeholder");
  });

  it("shows a price chip only when a price exists", () => {
    const priced = renderToStaticMarkup(
      createElement(MenuTile, { name: "Tea", nameEn: "Tea", price: "40", photo: "/tea.jpg" }),
    );
    expect(priced).toContain("book-price-chip");
    expect(priced).toContain("40");
    const plain = renderToStaticMarkup(
      createElement(MenuTile, { name: "Tea", nameEn: "Tea", price: null, photo: "/tea.jpg" }),
    );
    expect(plain).not.toContain("book-price-chip");
  });

  it("shows the live pill only while a post is active", () => {
    const now = Date.parse("2026-10-29T12:00:00.000Z");
    const label = liveLeftLabel("2026-10-29T13:30:00.000Z", now);
    expect(label).toBe("LIVE · 1h 30m left");
    expect(liveLeftLabel("2026-10-29T11:00:00.000Z", now)).toBeNull();
    const on = renderToStaticMarkup(
      createElement(CoverCard, {
        name: "Cafe",
        logoUrl: null,
        heroUrl: "/hero.jpg",
        tagline: "Coffee",
        mood: "",
        style: {},
        liveLabel: label,
      }),
    );
    expect(on).toContain("book-live");
    expect(on).toContain("LIVE · 1h 30m left");
    const off = renderToStaticMarkup(
      createElement(CoverCard, {
        name: "Cafe",
        logoUrl: null,
        heroUrl: "/hero.jpg",
        tagline: null,
        mood: "",
        style: {},
        liveLabel: null,
      }),
    );
    expect(off).not.toContain("book-live");
    expect(off).not.toContain("book-logo-letter");
  });

  it("counts cover, info, menu pages, and extras", () => {
    const deck = buildDeck({
      menuItems: Array.from({ length: 13 }, (_, index) => tile(index)),
      extras: ["extra-1", "extra-2"],
    });
    const menuPages = deck.filter((card) => card.type === "menu");
    expect(menuPages).toHaveLength(3);
    expect(deck.filter((card) => card.type === "cover")).toHaveLength(1);
    expect(deck.filter((card) => card.type === "info")).toHaveLength(1);
    expect(deck.filter((card) => card.type === "extra")).toHaveLength(2);
    expect(deck).toHaveLength(bookCardCount(menuPages.length, 2));
    expect(deck).toHaveLength(7);
    expect(deck.map((card) => card.type)).toEqual(["cover", "menu", "menu", "menu", "info", "extra", "extra"]);
    const withDeals = buildDeck({
      menuItems: [],
      extras: [],
      deals: [{ title: "10% off", provider: "SCB", discount: "10%", conditions: null }],
    });
    expect(withDeals.map((card) => card.type)).toEqual(["cover", "deals", "info"]);
  });

  it("renders none of five empty extra pages", () => {
    const extras = Array.from({ length: 5 }, (_, index) => ({
      id: "extra-" + index,
      section: index === 2 ? "12.5684, 99.9577" : null,
      credit: null,
      items: [] as { name: string; price: string | null }[],
    }));
    const deck = assembleDeck({ menuItems: [], extras, hours: null, info: blankInfo });
    expect(deck.some((card) => card.type === "extra")).toBe(false);
    const html = renderToStaticMarkup(
      createElement(
        BookSwiper,
        null,
        ...deck.map((card) => createElement("div", { key: card.type }, card.type === "extra" ? "Extras" : card.type)),
      ),
    );
    expect(html).not.toContain("Extras");
    expect(html).toContain('data-count="1"');
    const duplicated = assembleDeck({
      menuItems: [],
      extras: [
        { id: "a", section: "Our story", credit: null, items: [{ name: "Soup", price: "40" }] },
        { id: "b", section: "Our story", credit: null, items: [{ name: "Soup", price: "40" }] },
      ],
      hours: null,
      info: blankInfo,
    });
    expect(duplicated.filter((card) => card.type === "extra")).toHaveLength(1);
  });

  it("lists items with no cutout as text and never repeats a source photo", () => {
    const html = renderToStaticMarkup(
      createElement(MenuCard, {
        index: 0,
        total: 1,
        style: {},
        items: [
          { name: "ชา", nameEn: "Tea", price: "40", photo: "https://example.supabase.co/storage/v1/object/public/shop-book/shop/menu.jpg" },
          { name: "กาแฟ", nameEn: "Coffee", price: null, photo: null },
        ],
      }),
    );
    expect(html).not.toContain("<img");
    expect(html).not.toContain("book-menu-banner");
    expect(html).toContain("rounded-2xl");
    expect(html).toContain("Tea");
    expect(html).toContain("฿40");
    expect(html).not.toContain("shop-book/shop/menu.jpg");
  });

  it("renders a cutout card beside a text row", () => {
    const cutout = "https://example.supabase.co/storage/v1/object/public/shop-book/book-cutouts/shop/tea.webp";
    const html = renderToStaticMarkup(
      createElement(MenuCard, {
        index: 0,
        total: 1,
        style: {},
        items: [
          { name: "Tea", nameEn: "Tea", price: "40", photo: cutout },
          { name: "Coffee", nameEn: "Coffee", price: null, photo: null },
        ],
      }),
    );
    expect(html.match(/<img /g)).toHaveLength(1);
    expect(html).toContain("h-[84px]");
    expect(html).toContain("Coffee");
    expect(html).not.toContain("book-menu-banner");
  });

  it("uses a gradient when the hero is missing or is the logo", () => {
    const photo = renderToStaticMarkup(
      createElement(CoverCard, {
        name: "Cafe",
        logoUrl: "/logo.jpg",
        heroUrl: "/hero.jpg",
        tagline: "Coffee",
        mood: "",
        style: {},
      }),
    );
    expect(photo).toContain("book-cover-photo");
    expect(photo).toContain('src="/hero.jpg"');
    expect(photo).not.toContain("book-cover-fallback");

    const missing = renderToStaticMarkup(
      createElement(CoverCard, {
        name: "Cafe",
        logoUrl: "/logo.jpg",
        heroUrl: null,
        tagline: "Coffee",
        mood: "",
        style: {},
      }),
    );
    expect(missing).toContain("book-cover-fallback");
    expect(missing).not.toContain("book-cover-photo");
    expect(missing).toContain("book-logo");
    expect(missing).toContain('src="/logo.jpg"');

    const same = renderToStaticMarkup(
      createElement(CoverCard, {
        name: "Cafe",
        logoUrl: "/logo.jpg",
        heroUrl: "/logo.jpg",
        tagline: null,
        mood: "",
        style: {},
      }),
    );
    expect(same).toContain("book-cover-fallback");
    expect(same).not.toContain("book-cover-photo");
    expect(same.match(/src="\/logo.jpg"/g)).toHaveLength(1);
  });
});
