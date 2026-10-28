import { describe, expect, it } from "vitest";
import { MAX_ITEMS_PER_PAGE } from "./limits";
import { parseBookRead, parseFaceRead } from "./schema";

function page(items: unknown[], extra?: Record<string, unknown>) {
  return {
    pages: [
      {
        index: 1,
        kind_guess: "menu",
        is_menu: true,
        language: "th",
        section: "Noodles",
        items,
        ...extra,
      },
    ],
    shop_language: "th",
    tagline_facts: ["Pad Thai", "best in town"],
  };
}

describe("parseBookRead", () => {
  it("accepts a menu and keeps a null price", () => {
    const parsed = parseBookRead(
      page([{ name: "Pad Thai", price: null, currency: "THB", note: null }, { name: "Soup", price: "40.-", currency: null, note: "" }]),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.read.pages[0]?.items).toEqual([
      { name: "Pad Thai", price: null, currency: "THB", note: null },
      { name: "Soup", price: "40.-", currency: null, note: null },
    ]);
    expect(parsed.read.shopLanguage).toBe("th");
    expect(parsed.read.tagline).toBe("Pad Thai");
  });

  it("rejects an invented key", () => {
    const invented = page([{ name: "Pad Thai", price: "50", currency: null, note: null, spicy: true }]);
    expect(parseBookRead(invented)).toEqual({ ok: false, reason: "invented_key" });
    expect(parseBookRead({ ...page([]), slogan: "best" })).toEqual({ ok: false, reason: "invented_key" });
  });

  it("caps items at 150 per page", () => {
    const items = Array.from({ length: MAX_ITEMS_PER_PAGE + 1 }, (_, index) => ({
      name: "Dish " + index,
      price: null,
      currency: null,
      note: null,
    }));
    const parsed = parseBookRead(page(items));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.read.pages[0]?.items).toHaveLength(MAX_ITEMS_PER_PAGE);
    expect(parsed.read.pages[0]?.items[0]?.name).toBe("Dish 0");
  });
});

describe("parseFaceRead", () => {
  it("requires a faces array on every page", () => {
    expect(parseFaceRead({ pages: [{ index: 1, faces: [] }] }).ok).toBe(true);
    expect(parseFaceRead({ pages: [{ index: 1, faces: [], note: "hi" }] })).toEqual({
      ok: false,
      reason: "invented_key",
    });
    expect(parseFaceRead({ pages: [{ index: 1 }] })).toEqual({ ok: false, reason: "bad_shape" });
  });
});
