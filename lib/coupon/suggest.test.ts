import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { COUPON_FALLBACK, couponDays, parseOffer, suggestCouponOffer, trimOffer } from "./suggest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

describe("coupon offer", () => {
  it("trims an offer to 80 characters and falls back when spark throws", async () => {
    expect(trimOffer("x".repeat(90))).toHaveLength(80);
    expect(parseOffer({ offer: "y".repeat(100) })).toHaveLength(80);
    expect(trimOffer("   ")).toBe(COUPON_FALLBACK);
    const offer = await suggestCouponOffer({
      imageDataUrl: "data:image/jpeg;base64,aa",
      call: async () => {
        throw new Error("down");
      },
    });
    expect(offer).toBe(COUPON_FALLBACK);
  });

  it("keeps 1, 7, and 30 days and turns anything else into 7", () => {
    expect(couponDays(1)).toBe(1);
    expect(couponDays(7)).toBe(7);
    expect(couponDays(30)).toBe(30);
    expect(couponDays("1")).toBe(1);
    expect(couponDays("7")).toBe(7);
    expect(couponDays("30")).toBe(30);
    expect(couponDays(3)).toBe(7);
    expect(couponDays("14")).toBe(7);
    expect(couponDays(null)).toBe(7);
    const sql = readFileSync(resolve(root, "supabase/migrations/0014_coupon_offer.sql"), "utf8");
    expect(sql).toContain("case when p_days in (1, 7, 30) then p_days else 7 end");
  });

  it("shows the offer and the valid-until date in the wallet and the map badge", () => {
    const wallet = readFileSync(resolve(root, "components/wallet/WalletList.tsx"), "utf8");
    const badge = readFileSync(resolve(root, "components/map/CouponBadge.tsx"), "utf8");
    expect(wallet).toContain("coupon.offer");
    expect(wallet).toContain("loop.validUntil");
    expect(badge).toContain("coupon.offer");
    expect(badge).toContain("loop.validUntil");
  });
});
