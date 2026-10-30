import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ShopName } from "../../components/book/ShopName";
import { canRenameShop, shopNameDraft } from "./shopName";

const creator = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const owner = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const stranger = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

describe("edit shop name", () => {
  it("saves for the creator or a verified owner and rejects everyone else", () => {
    expect(canRenameShop({ userId: creator, createdBy: creator, ownerStatus: "none" })).toBe(true);
    expect(canRenameShop({ userId: owner, createdBy: creator, ownerStatus: "verified" })).toBe(true);
    expect(canRenameShop({ userId: stranger, createdBy: creator, ownerStatus: "none" })).toBe(false);
    expect(canRenameShop({ userId: stranger, createdBy: creator, ownerStatus: "pending" })).toBe(false);
    expect(canRenameShop({ userId: null, createdBy: creator, ownerStatus: "verified" })).toBe(false);
    expect(shopNameDraft("  Mala  ")).toBe("Mala");
    expect(shopNameDraft(" ")).toBeNull();
  });

  it("opens a field prefilled with the current name", () => {
    const closed = renderToStaticMarkup(
      createElement(ShopName, { shopId: "shop", name: "New shop", editing: false, className: "book-shop-name" }),
    );
    expect(closed).toContain("New shop");
    expect(closed).toContain("?edit=name");
    const open = renderToStaticMarkup(
      createElement(ShopName, { shopId: "shop", name: "New shop", editing: true, className: "book-shop-name" }),
    );
    expect(open).toContain('value="New shop"');
    expect(open).toContain("Save");
    expect(open).not.toContain('href="?edit=name"');
  });
});
