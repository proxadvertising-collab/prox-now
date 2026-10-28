import { describe, expect, it } from "vitest";
import { readSnapShop, snapShopHref } from "./target";

describe("preselected shop camera link", () => {
  it("builds a snap link that reopens the camera for that shop", () => {
    expect(snapShopHref("shop-1", "Dawn Cafe")).toBe("/snap?shop=shop-1&name=Dawn%20Cafe");
    expect(readSnapShop({ shop: "shop-1", name: "Dawn Cafe" })).toEqual({ id: "shop-1", name: "Dawn Cafe" });
  });

  it("rejects a missing or unsafe shop id", () => {
    expect(readSnapShop({ shop: "", name: "Cafe" })).toBeNull();
    expect(readSnapShop({ shop: "../book", name: "Cafe" })).toBeNull();
    expect(readSnapShop({ shop: null, name: "Cafe" })).toBeNull();
    expect(readSnapShop({ shop: "shop-1", name: "" })?.name).toBe("this shop");
  });
});
