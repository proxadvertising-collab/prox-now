import { describe, expect, it } from "vitest";
import { BANGKOK_TZ, POST_TTL_MS, computeExpiresAt, couponDay, endOfCouponDay } from "./rules";

const HOUR = 60 * 60 * 1000;

describe("post expiry", () => {
  it("is exactly two hours", () => {
    expect(POST_TTL_MS).toBe(7_200_000);
    expect(POST_TTL_MS).toBe(2 * HOUR);
    expect(computeExpiresAt("2026-01-02T03:04:05.000Z")).toBe("2026-01-02T05:04:05.000Z");
  });
});

describe("coupon day", () => {
  it("flips the Bangkok day at 17:00 UTC", () => {
    expect(BANGKOK_TZ).toBe("Asia/Bangkok");
    expect(couponDay(new Date("2026-06-15T16:59:59.000Z"))).toBe("2026-06-15");
    expect(couponDay(new Date("2026-06-15T17:00:00.000Z"))).toBe("2026-06-16");
  });

  it("ends a Bangkok coupon day when the next local day starts", () => {
    expect(endOfCouponDay("2026-06-15").toISOString()).toBe("2026-06-15T17:00:00.000Z");
    expect(endOfCouponDay("2026-06-15", BANGKOK_TZ).toISOString()).toBe("2026-06-15T17:00:00.000Z");
  });

  it("treats the Los Angeles day of 2026-03-08 as 23 hours", () => {
    const start = endOfCouponDay("2026-03-07", "America/Los_Angeles");
    const end = endOfCouponDay("2026-03-08", "America/Los_Angeles");
    expect(start.toISOString()).toBe("2026-03-08T08:00:00.000Z");
    expect(end.toISOString()).toBe("2026-03-09T07:00:00.000Z");
    expect(end.getTime() - start.getTime()).toBe(23 * HOUR);
  });
});
