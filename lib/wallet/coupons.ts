export type WalletCoupon = {
  id: string;
  code: string;
  status: string;
  expiresAt: string;
  shopName: string;
  shopSlug?: string;
};

export function couponPhase(coupon: WalletCoupon, now: number): "active" | "used" | "expired" {
  if (coupon.status === "used") return "used";
  const expires = Date.parse(coupon.expiresAt);
  if (coupon.status === "expired" || !Number.isFinite(expires) || expires <= now) return "expired";
  return "active";
}

export function activeCouponCount(coupons: readonly WalletCoupon[], now: number): number {
  return coupons.filter((coupon) => couponPhase(coupon, now) === "active").length;
}
