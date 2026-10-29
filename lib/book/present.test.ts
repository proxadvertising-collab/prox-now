import { describe, expect, it } from "vitest";
import { bookImageUrl, presentBook } from "./present";

describe("book view", () => {
  it("reads menu photos, the palette, and hours", () => {
    const view = presentBook(
      {
        shop: { id: "shop-1", slug: "dawn-cafe", name: "Dawn Cafe", name_local: "ดอน" },
        book: {
          tagline: "Coffee on the corner",
          theme: { swatches: ["#FF8A3D", "#112233", "nope"] },
          hours: { raw: "08:00–17:00", days: [] },
        },
        pages: [
          { id: "p1", kind: "menu", position: 0, image_path: "shop-1/menu.jpg" },
          { id: "p2", kind: "storefront", position: 1, image_path: "shop-1/front.jpg" },
        ],
      },
      "https://example.supabase.co",
    );
    expect(view?.name).toBe("Dawn Cafe");
    expect(view?.hoursLabel).toBe("08:00–17:00");
    expect(view?.swatches).toEqual(["#FF8A3D", "#112233"]);
    expect(view?.mood).toBeNull();
    expect(view?.logoUrl).toBeNull();
    expect(view?.pages.map((page) => page.kind)).toEqual(["menu", "storefront"]);
    expect(view?.pages[0]?.imageUrl).toBe(bookImageUrl("https://example.supabase.co", "shop-1/menu.jpg"));
    expect(view?.pages[0]?.imageUrl).toContain("/shop-book/shop-1/menu.jpg");
  });

  it("returns nothing when the book payload has no shop", () => {
    expect(presentBook(null, "https://example.supabase.co")).toBeNull();
    expect(presentBook({ pages: [] }, "https://example.supabase.co")).toBeNull();
  });
});
