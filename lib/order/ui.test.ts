import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { OrderBar, OrderClient, OrderSheet, bookBarPadClass, CLEAR_UNDO_MS, staffCloseHref } from "../../components/order/OrderUi";

const line = {
  id: "tea",
  name: "ชา",
  title: "Tea",
  subtitle: "ชา",
  qty: 2,
  priceLabel: "฿80",
  photo: null,
};

describe("order page", () => {
  it("renders the shop header, lines, and note", () => {
    const html = renderToStaticMarkup(
      createElement(OrderSheet, {
        shopName: "Mala Mafia",
        logoUrl: "/demo/shop-logo.svg",
        place: "Soi 102",
        lines: [line],
        note: "no tomatoes",
        translation: "ไม่ใส่มะเขือเทศ",
        totalLabel: "฿80",
        unpriced: 1,
        lang: "en",
      }),
    );
    expect(html).toContain("Mala Mafia");
    expect(html).toContain("Soi 102");
    expect(html).toContain("Tea");
    expect(html).toContain("Requests (e.g. no tomatoes, less spicy)");
    expect(html).toContain("no tomatoes");
    expect(html).toContain("For the staff");
    expect(html.split("ไม่ใส่มะเขือเทศ").length - 1).toBe(1);
    expect(html).toContain("฿80");
    expect(html).toContain("+ 1 items without price");
    expect(html).toContain("Clear order");
    expect(html).not.toContain("Tap again to clear");
    expect(html.indexOf("Clear order")).toBeLessThan(html.indexOf(">More<"));
  });

  it("shows the staff card in the menu language", () => {
    const html = renderToStaticMarkup(
      createElement(OrderSheet, {
        shopName: "Mala Mafia",
        logoUrl: null,
        place: null,
        lines: [line],
        note: "",
        translation: "ไม่ใส่มะเขือเทศ",
        totalLabel: "฿80",
        unpriced: 0,
        lang: "en",
        staff: true,
      }),
    );
    expect(html).toContain("2 × ชา");
    expect(html).toContain("Total");
    expect(html).toContain("฿80");
    expect(html).toContain("ไม่ใส่มะเขือเทศ");
    expect(html).toContain("bg-surface-1");
    expect(html).toContain("Done · เสร็จ");
    expect(html).toContain("min-h-11");
    expect(html).toContain('type="button"');
    const chrome = readFileSync(new URL("../../components/judge/TourChrome.tsx", import.meta.url), "utf8");
    expect(chrome).toContain("relative z-[60]");
    expect(html).toContain("z-50");
    expect(staffCloseHref("http://localhost/book/mala/order?staff=1")).toBe("/book/mala/order");
    expect(staffCloseHref("/book/mala/order?tour=1&staff=1")).toBe("/book/mala/order?tour=1");
    expect(html).not.toContain("tour-bar");
  });

  it("pushes the staff list down by the tour bar only in tour mode", () => {
    const store = new Map<string, string>();
    store.set("prox-judge-tour", JSON.stringify({ cafe: "a", role: "shopper", step: "order" }));
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
        removeItem: (key: string) => void store.delete(key),
      },
    });
    const touring = renderToStaticMarkup(
      createElement(OrderSheet, {
        shopName: "Farm to Go",
        logoUrl: null,
        place: null,
        lines: [line],
        note: "",
        translation: "",
        totalLabel: "",
        unpriced: 0,
        lang: "en",
        staff: true,
      }),
    );
    expect(touring).not.toContain("tour-bar");
    const source = readFileSync(new URL("../../components/order/OrderUi.tsx", import.meta.url), "utf8");
    expect(source).toContain("setOnTour(Boolean(readTour()))");
    expect(source).toContain('paddingTop: "calc(1.5rem + var(--tour-bar, 0px))"');
    expect(source).not.toContain("const onTour = Boolean(readTour())");
    vi.unstubAllGlobals();
    const plain = renderToStaticMarkup(
      createElement(OrderSheet, {
        shopName: "Farm to Go",
        logoUrl: null,
        place: null,
        lines: [line],
        note: "",
        translation: "",
        totalLabel: "",
        unpriced: 0,
        lang: "en",
        staff: true,
      }),
    );
    expect(plain).not.toContain("tour-bar");
    expect(plain).toContain("Done · เสร็จ");
  });

  it("leaves the address off when the shop has none", () => {
    const html = renderToStaticMarkup(
      createElement(OrderClient, {
        slug: "mala",
        shopName: "Mala Mafia",
        logoUrl: null,
        address: null,
        shopCountry: "TH",
      }),
    );
    expect(html).toContain("Mala Mafia");
    expect(html).not.toContain("near");
  });
});

describe("clear order", () => {
  it("clears in one tap and keeps an undo for 5 seconds", () => {
    expect(CLEAR_UNDO_MS).toBe(5000);
    const source = readFileSync(new URL("../../components/order/OrderUi.tsx", import.meta.url), "utf8");
    const sheet = source.slice(source.indexOf("export function OrderSheet"), source.indexOf("function sheetLines"));
    expect(sheet.indexOf('t(lang, "order.clear")')).toBeLessThan(sheet.indexOf("<MoreSheet"));
    expect(sheet).toContain("CLEAR_UNDO_MS");
    expect(sheet).toContain('t(lang, "order.undo")');
    expect(sheet).not.toContain("nextClearState");
    expect(sheet).not.toContain("Tap again to clear");
    expect(source).toContain("undone.current = readOrder");
  });
});

describe("order bar", () => {
  it("shows only when the order has items", () => {
    const empty = renderToStaticMarkup(
      createElement(OrderBar, { count: 0, href: "/book/mala/order", label: "View order · 3 items · ฿180" }),
    );
    expect(empty).toBe("");
    const filled = renderToStaticMarkup(
      createElement(OrderBar, { count: 3, href: "/book/mala/order", label: "View order · 3 items · ฿180" }),
    );
    expect(filled).toContain("View order · 3 items · ฿180");
    expect(filled).toContain('href="/book/mala/order"');
    expect(filled).toContain("h-14");
    expect(filled).toContain("rounded-2xl");
    expect(bookBarPadClass(true)).toContain("3.5rem+12px");
    expect(bookBarPadClass(false)).toBe("pb-[calc(92px+env(safe-area-inset-bottom))]");
    expect(bookBarPadClass(true)).not.toBe(bookBarPadClass(false));
  });
});
