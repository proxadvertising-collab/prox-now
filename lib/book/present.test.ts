import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BookSwiper, swipeStep } from "../../components/book/BookSwiper";
import { bookImageUrl, mergeContacts, presentBook } from "./present";
import { emptyContacts, extractedOf, parseBookRead } from "./schema";

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

  it("accepts contacts printed on a page and keeps the page index", () => {
    const parsed = parseBookRead({
      pages: [
        {
          index: 2,
          kind_guess: "menu",
          is_menu: true,
          items: [{ name: "หม่าล่า", name_en: "Mala beef", price: "40", currency: "THB", note: null, tags: ["spicy"] }],
          contacts: {
            phones: ["0812345678"],
            line_id: "@malamafia",
            line_qr: true,
            whatsapp: "+66812345678",
            facebook: "malamafia",
            instagram: "malamafia",
            tiktok: "malamafia",
            website: "mala.example",
            email: "hi@mala.example",
            delivery: ["Grab", "LINE MAN"],
            payment: ["PromptPay QR", "cash only"],
            hours_text: "10:00–22:00",
            address: "Soi 102",
            wifi: "Mala-Guest",
          },
        },
      ],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.read.pages[0]?.items[0]).toMatchObject({ nameEn: "Mala beef", tags: ["spicy"] });
    expect(parsed.read.pages[0]?.contacts.delivery).toEqual(["grab", "lineman"]);
    expect(parsed.read.pages[0]?.contacts.payment).toEqual(["promptpay", "cash"]);
    expect(parsed.read.pages[0]?.contacts.lineQr).toBe(true);
    const stored = extractedOf(parsed.read.pages[0] ?? null);
    expect(stored.contacts?.page).toBe(2);
    expect(stored.contacts?.phones).toEqual(["0812345678"]);
  });

  it("rejects invented contact formats", () => {
    const base = {
      index: 1,
      is_menu: true,
      items: [{ name: "Soup", price: null, currency: null, note: null }],
    };
    expect(parseBookRead({ pages: [{ ...base, contacts: { phones: ["call me"] } }] })).toEqual({
      ok: false,
      reason: "bad_shape",
    });
    expect(parseBookRead({ pages: [{ ...base, contacts: { delivery: ["pigeon"] } }] })).toEqual({
      ok: false,
      reason: "bad_shape",
    });
    expect(parseBookRead({ pages: [{ ...base, contacts: { website: "notaurl" } }] })).toEqual({
      ok: false,
      reason: "bad_shape",
    });
    expect(parseBookRead({ pages: [{ ...base, contacts: { owner_mood: "fun" } }] })).toEqual({
      ok: false,
      reason: "invented_key",
    });
    expect(
      parseBookRead({
        pages: [{ ...base, items: [{ name: "Soup", price: null, currency: null, note: null, tags: ["yummy"] }] }],
      }),
    ).toEqual({ ok: false, reason: "invented_key" });
  });

  it("merges contacts from two pages and keeps the first phone", () => {
    const blank = emptyContacts();
    const info = mergeContacts([
      { page: 1, contacts: { ...blank, phones: ["081-234-5678"], lineId: "@shop", delivery: ["grab"] } },
      {
        page: 2,
        contacts: {
          ...blank,
          phones: ["0812345678", "029999999"],
          delivery: ["grab", "foodpanda"],
          address: "Soi 102",
        },
      },
    ]);
    expect(info.phones).toEqual([
      { value: "081-234-5678", page: 1 },
      { value: "029999999", page: 2 },
    ]);
    expect(info.lineId).toEqual({ value: "@shop", page: 1 });
    expect(info.delivery).toEqual([
      { value: "grab", page: 1 },
      { value: "foodpanda", page: 2 },
    ]);
    expect(info.address).toEqual({ value: "Soi 102", page: 2 });

    const view = presentBook(
      {
        shop: { id: "shop-1", slug: "mala", name: "Mala" },
        book: {},
        pages: [
          {
            id: "a",
            kind: "menu",
            position: 0,
            extracted: { items: [], contacts: { phones: ["081-234-5678"], lineId: "@shop", delivery: ["grab"], page: 1 } },
          },
          {
            id: "b",
            kind: "hours",
            position: 1,
            extracted: {
              items: [],
              contacts: { phones: ["0812345678", "029999999"], delivery: ["grab", "foodpanda"], address: "Soi 102", page: 2 },
            },
          },
        ],
      },
      "https://example.supabase.co",
    );
    expect(view?.info.phones.map((phone) => phone.page)).toEqual([1, 2]);
    expect(view?.info.delivery.map((item) => item.value)).toEqual(["grab", "foodpanda"]);
    expect(view?.info.address).toEqual({ value: "Soi 102", page: 2 });
  });
});

describe("book swiper", () => {
  it("renders the card count and steps on a swipe", () => {
    const html = renderToStaticMarkup(createElement(BookSwiper, null, "Cover", "Info", "Menu"));
    expect(html).toContain('data-count="3"');
    expect(html).toContain("Cover");
    expect(html).toContain("Info");
    expect(swipeStep(0, 3, -60)).toBe(1);
    expect(swipeStep(1, 3, 60)).toBe(0);
    expect(swipeStep(0, 3, 10)).toBe(0);
    expect(swipeStep(2, 3, -80)).toBe(2);
  });
});
