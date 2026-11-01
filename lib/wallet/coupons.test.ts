import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { activeCouponCount, byNewestCoupon, couponPhase, withIssuedTime, type WalletCoupon } from "./coupons";

const now = Date.parse("2026-10-27T12:00:00.000Z");

function coupon(status: string, expiresAt: string): WalletCoupon {
  return { id: status, code: "ABC", status, expiresAt, shopName: "Mala" };
}

describe("wallet coupons", () => {
  it("counts only active coupons that have not expired", () => {
    const rows = [
      coupon("active", "2026-10-28T00:00:00.000Z"),
      coupon("active", "2026-10-27T01:00:00.000Z"),
      coupon("used", "2026-10-28T00:00:00.000Z"),
    ];
    expect(couponPhase(rows[0], now)).toBe("active");
    expect(couponPhase(rows[1], now)).toBe("expired");
    expect(activeCouponCount(rows, now)).toBe(1);
  });

  it("renders the newest coupon first", () => {
    const seeded = { id: "old", shopName: "Seeded café", createdAt: "2026-10-01T00:00:00.000Z" };
    const thanks = { id: "new", shopName: "Thank-you coupon", createdAt: "2026-10-27T12:00:00.000Z" };
    const ordered = byNewestCoupon(withIssuedTime([seeded, thanks], new Map([
      ["old", seeded.createdAt],
      ["new", thanks.createdAt],
    ])));
    const html = renderToStaticMarkup(
      createElement(
        "ol",
        null,
        ordered.map((coupon) => createElement("li", { key: coupon.id }, coupon.shopName)),
      ),
    );
    expect(html.indexOf("Thank-you coupon")).toBeGreaterThanOrEqual(0);
    expect(html.indexOf("Thank-you coupon")).toBeLessThan(html.indexOf("Seeded café"));
  });
});
