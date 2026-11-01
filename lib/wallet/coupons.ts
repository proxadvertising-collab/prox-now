export type WalletCoupon = {
  id: string;
  code: string;
  status: string;
  expiresAt: string;
  shopName: string;
  shopSlug?: string;
  createdAt?: string | null;
};

function issuedAt(coupon: { createdAt?: string | null }): number {
  const parsed = Date.parse(coupon.createdAt ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Newest issued coupon first. Rows with no time stay in their original order at the end. */
export function byNewestCoupon<T extends { createdAt?: string | null }>(coupons: readonly T[]): T[] {
  return coupons
    .map((coupon, index) => ({ coupon, index }))
    .sort((a, b) => {
      const delta = issuedAt(b.coupon) - issuedAt(a.coupon);
      return delta !== 0 ? delta : a.index - b.index;
    })
    .map((row) => row.coupon);
}

export function withIssuedTime<T extends { id?: string }>(
  coupons: readonly T[],
  issued: ReadonlyMap<string, string>,
): Array<T & { createdAt: string | null }> {
  return coupons.map((coupon) => ({
    ...coupon,
    createdAt: coupon.id ? (issued.get(coupon.id) ?? null) : null,
  }));
}

export function couponPhase(coupon: WalletCoupon, now: number): "active" | "used" | "expired" {
  if (coupon.status === "used") return "used";
  const expires = Date.parse(coupon.expiresAt);
  if (coupon.status === "expired" || !Number.isFinite(expires) || expires <= now) return "expired";
  return "active";
}

export function activeCouponCount(coupons: readonly WalletCoupon[], now: number): number {
  return coupons.filter((coupon) => couponPhase(coupon, now) === "active").length;
}
