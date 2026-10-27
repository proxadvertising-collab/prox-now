"use client";

import { useEffect, useState } from "react";
import { t } from "@/lib/copy";
import { createClient } from "@/lib/supabase/client";
import { activeCouponCount, type WalletCoupon } from "@/lib/wallet/coupons";

export function CouponBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let stopped = false;
    let channel: { unsubscribe: () => void } | null = null;

    async function load() {
      try {
        const response = await fetch("/api/wallet/coupons");
        if (!response.ok || stopped) return;
        const body = (await response.json()) as { coupons?: WalletCoupon[] };
        setCount(activeCouponCount(body.coupons ?? [], Date.now()));
      } catch {
        if (!stopped) setCount(0);
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

  if (count < 1) return null;
  return (
    <a
      href="/wallet"
      className="absolute right-3 top-3 z-20 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-accent px-3 text-base font-bold text-accent-ink"
    >
      {count}
      <span className="sr-only">{t("en", "nav.wallet")}</span>
    </a>
  );
}
