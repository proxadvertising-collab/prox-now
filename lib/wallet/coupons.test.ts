import { describe, expect, it } from "vitest";
import { activeCouponCount, couponPhase, type WalletCoupon } from "./coupons";

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
});
