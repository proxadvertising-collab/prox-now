import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MenuTile, bookCardCount, buildDeck, chunkMenu, type MenuTileData } from "./cards";

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

  it("renders a placeholder when a tile has no photo", () => {
    const html = renderToStaticMarkup(createElement(MenuTile, tile(0)));
    expect(html).toContain('data-placeholder="photo"');
    expect(html).toContain("book-tile-photo");
    expect(html).not.toContain("<img");
    const photo = renderToStaticMarkup(
      createElement(MenuTile, { name: "Tea", nameEn: "Tea", price: "40", photo: "/tea.jpg" }),
    );
    expect(photo).toContain("<img");
    expect(photo).not.toContain('data-placeholder="photo"');
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
