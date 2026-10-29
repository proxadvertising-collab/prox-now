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

  it("serves /demo/ pages from public and leaves other paths on storage", () => {
    expect(bookImageUrl("https://example.supabase.co", "/demo/mala-mafia-logo.svg")).toBe(
      "/demo/mala-mafia-logo.svg",
    );
    expect(bookImageUrl("", "/demo/mala-mafia-hours.svg")).toBe("/demo/mala-mafia-hours.svg");
    const stored = bookImageUrl("https://example.supabase.co", "shop-1/menu.jpg");
    expect(stored).toBe(
      "https://example.supabase.co/storage/v1/object/public/shop-book/shop-1/menu.jpg",
    );
    const view = presentBook(
      {
        shop: { id: "shop-1", slug: "mala-mafia", name: "Mala Mafia" },
        book: {},
        pages: [
          { id: "logo", kind: "logo", position: 0, image_path: "/demo/mala-mafia-logo.svg" },
          { id: "menu", kind: "menu", position: 0, image_path: "shop-1/menu.jpg" },
        ],
      },
      "https://example.supabase.co",
    );
    expect(view?.logoUrl).toBe("/demo/mala-mafia-logo.svg");
    expect(view?.pages[1]?.imageUrl).toBe(stored);
  });

  it("renders extracted menu items and a failed read", () => {
    const view = presentBook(
      {
        shop: { id: "shop-1", slug: "mala-mafia", name: "Mala Mafia" },
        book: { theme: { accent: "#E23D28", ink: "#1C0E05", mood: "bold" } },
        pages: [
          {
            id: "logo",
            kind: "logo",
            position: 0,
            image_path: "shop-1/logo.jpg",
            extracted: {},
            ai_meta: {},
          },
          {
            id: "menu",
            kind: "menu",
            position: 0,
            image_path: "shop-1/menu.jpg",
            extracted: {
              section: "Skewers",
              items: [{ name: "หม่าล่า", price: "40", note: "Mala beef" }],
            },
            ai_meta: { error: "max_output_tokens" },
          },
        ],
      },
      "https://example.supabase.co",
    );
    expect(view?.name).toBe("Mala Mafia");
    expect(view?.accent).toBe("#E23D28");
    expect(view?.logoUrl).toContain("/shop-book/shop-1/logo.jpg");
    expect(view?.pages[1]?.section).toBe("Skewers");
    expect(view?.pages[1]?.items).toEqual([{ name: "หม่าล่า", price: "40", note: "Mala beef" }]);
    expect(view?.reading).toBe(true);
  });

  it("returns nothing when the book payload has no shop", () => {
    expect(presentBook(null, "https://example.supabase.co")).toBeNull();
    expect(presentBook({ pages: [] }, "https://example.supabase.co")).toBeNull();
  });
});
