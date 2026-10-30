import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  CoverCard,
  MenuTile,
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
    expect(off).toContain("book-logo-letter");
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
});
