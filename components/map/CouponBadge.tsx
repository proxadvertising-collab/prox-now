"use client";

import { useEffect, useState } from "react";
import { t } from "@/lib/copy";
import { createClient } from "@/lib/supabase/client";
import { activeCouponCount, couponPhase, type WalletCoupon } from "@/lib/wallet/coupons";

type ShownCoupon = WalletCoupon & { offer?: string | null };

export function CouponBadge() {
  const [view, setView] = useState({ count: 0, offer: "", until: "" });

  useEffect(() => {
    let stopped = false;
    let channel: { unsubscribe: () => void } | null = null;

    async function load() {
      try {
        const response = await fetch("/api/wallet/coupons");
        if (!response.ok || stopped) return;
        const body = (await response.json()) as { coupons?: ShownCoupon[] };
        const coupons = Array.isArray(body.coupons) ? body.coupons : [];
        const now = Date.now();
        const count = activeCouponCount(coupons, now);
        const coupon = coupons.find((item) => couponPhase(item, now) === "active");
        const offer = coupon && coupon.offer ? coupon.offer.trim() : "";
        setView({ count, offer, until: coupon ? coupon.expiresAt.slice(0, 10) : "" });
      } catch {
        if (!stopped) setView({ count: 0, offer: "", until: "" });
      }
    }

    void load();
    try {
      const supabase = createClient();
      void supabase.auth.getUser().then(({ data }) => {
        const id = data.user?.id;
        if (!id || stopped) return;
        channel = supabase
          .channel("map-coupon-badge")
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "coupons", filter: "holder_id=eq." + id },
            () => {
              void load();
            },
          )
          .subscribe();
      });
    } catch {
      channel = null;
    }

    return () => {
      stopped = true;
      channel?.unsubscribe();
    };
  }, []);

  if (view.count < 1) return null;

  return (
    <a
      href="/wallet"
      className="absolute right-3 top-3 z-20 flex max-w-56 flex-col items-end rounded-md bg-accent px-3 py-2 text-sm font-bold text-accent-ink"
    >
      <span>{view.offer || view.count}</span>
      {view.until ? (
        <span className="text-xs font-semibold">{t("en", "loop.validUntil", { date: view.until })}</span>
      ) : null}
      <span className="sr-only">{t("en", "nav.wallet")}</span>
    </a>
  );
}
