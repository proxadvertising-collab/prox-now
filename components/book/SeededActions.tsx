"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ClaimShop } from "@/components/owner/ClaimShop";
import { t } from "@/lib/copy";
import { bookBuildHref, nextShopNearby } from "@/lib/book/builder";

const primary =
  "inline-flex min-h-12 w-full items-center justify-center rounded-md bg-accent px-4 text-base font-semibold text-accent-ink no-underline touch-manipulation";
const secondary =
  "inline-flex min-h-12 w-full items-center justify-center rounded-md bg-surface-2 px-4 text-base font-semibold text-fg no-underline touch-manipulation";

type NearShop = { id?: string; slug?: string; name?: string };

export function SeededActions({
  shopId,
  slug,
  lat,
  lng,
  photoUrl = null,
  claimMode = "claim",
}: {
  shopId: string;
  slug: string;
  lat: number | null;
  lng: number | null;
  photoUrl?: string | null;
  claimMode?: "hidden" | "own" | "claim";
}) {
  const [nextHref, setNextHref] = useState<string | null>(null);

  useEffect(() => {
    if (lat == null || lng == null) return;
    let cancel = false;
    void fetch("/api/shops/near?lat=" + encodeURIComponent(String(lat)) + "&lng=" + encodeURIComponent(String(lng)))
      .then((response) => response.json())
      .then((body: { shops?: NearShop[] }) => {
        if (cancel) return;
        const shops = Array.isArray(body?.shops) ? body.shops : [];
        const next = nextShopNearby(
          shops.filter((shop): shop is { id: string; slug: string } => typeof shop.id === "string" && typeof shop.slug === "string"),
          { id: shopId, slug },
        );
        setNextHref(next ? bookBuildHref(next.slug) : null);
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, [shopId, slug, lat, lng]);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-body text-fg">{t("en", "book.saved")}</p>
      {lat != null && lng != null ? (
        <ClaimShop shopId={shopId} mode={claimMode} seed={{ lat, lng, photoUrl }} />
      ) : null}
      {nextHref ? (
        <Link className={primary} href={nextHref}>
          {t("en", "book.next")}
        </Link>
      ) : null}
      <Link className={nextHref ? secondary : primary} href={"/book/" + encodeURIComponent(slug)}>
        {t("en", "book.finish")}
      </Link>
    </div>
  );
}
