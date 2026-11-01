import { describe, expect, it } from "vitest";
import { readSnapShop, snapSeedHref, snapShopHref } from "./target";

describe("preselected shop camera link", () => {
  it("builds a snap link that reopens the camera for that shop", () => {
    expect(snapShopHref("shop-1", "Dawn Cafe")).toBe("/snap?shop=shop-1&name=Dawn%20Cafe");
    expect(readSnapShop({ shop: "shop-1", name: "Dawn Cafe" })).toEqual({ id: "shop-1", name: "Dawn Cafe" });
  });

  it("keeps the shop id and name on a book seed link", () => {
    const href = snapSeedHref("shop-1", "Dawn Cafe");
    expect(href).toBe("/snap?seed=1&shop=shop-1&name=Dawn%20Cafe");
    const query = new URL(href, "http://localhost").searchParams;
    expect(readSnapShop({ shop: query.get("shop"), name: query.get("name") })).toEqual({
      id: "shop-1",
      name: "Dawn Cafe",
    });
  });

  it("rejects a missing or unsafe shop id", () => {
    expect(readSnapShop({ shop: "", name: "Cafe" })).toBeNull();
    expect(readSnapShop({ shop: "../book", name: "Cafe" })).toBeNull();
    expect(readSnapShop({ shop: null, name: "Cafe" })).toBeNull();
    expect(readSnapShop({ shop: "shop-1", name: "" })?.name).toBe("this shop");
  });
});
