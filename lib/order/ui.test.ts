import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OrderBar, OrderSheet } from "../../components/order/OrderUi";

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
        logoUrl: "/demo/mala-mafia-logo.svg",
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
    expect(html).toContain("ไม่ใส่มะเขือเทศ");
    expect(html).toContain("฿80");
    expect(html).toContain("+ 1 items without price");
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
        totalLabel: null,
        unpriced: 0,
        lang: "en",
        staff: true,
      }),
    );
    expect(html).toContain("2 × ชา");
    expect(html).toContain("ไม่ใส่มะเขือเทศ");
    expect(html).toContain("bg-[#FFF8F1]");
    expect(html).toContain("Done");
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
  });
});
