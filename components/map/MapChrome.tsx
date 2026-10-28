"use client";

import { useEffect, useState } from "react";
import { CouponBadge } from "@/components/map/CouponBadge";
import { MapView } from "@/components/map/MapView";
import { PlaceStats } from "@/components/map/PlaceStats";
import { ShopList } from "@/components/map/ShopList";
import { setWalkOrigin } from "@/components/map/walk-origin";
import { DemoBanner } from "@/components/ui/DemoBanner";
import { t } from "@/lib/copy";
import type { FixtureShop } from "@/lib/fixtures/shops";
import type { LatLng } from "@/lib/geo";
import { locate } from "@/lib/geo/locate";
import type { LivePost } from "@/lib/posts/source";

const NO_LIVE_POSTS: LivePost[] = [];

export function MapChrome({
  shops,
  fixtures,
  livePosts = NO_LIVE_POSTS,
  demoSession = false,
  followGps = false,
}: {
  shops: FixtureShop[];
  fixtures: boolean;
  livePosts?: LivePost[];
  demoSession?: boolean;
  followGps?: boolean;
}) {
  const [shown, setShown] = useState(followGps ? [] : shops);
  const [focus, setFocus] = useState<LatLng | null>(null);

  useEffect(() => {
    if (!followGps) setShown(shops);
  }, [shops, followGps]);

  useEffect(() => {
    if (!followGps || fixtures) return;
    let cancelled = false;
    void (async () => {
      const result = await locate();
      if (cancelled) return;
      if (result.status !== "ok") {
        setShown(shops);
        return;
      }
      setWalkOrigin(result.point);
      setFocus(result.point);
      try {
        const response = await fetch(
          "/api/shops/near?lat=" + encodeURIComponent(String(result.point.lat)) + "&lng=" + encodeURIComponent(String(result.point.lng)),
        );
        const body = (await response.json().catch(() => null)) as { shops?: FixtureShop[] } | null;
        if (!cancelled && response.ok && Array.isArray(body?.shops)) setShown(body.shops);
        else if (!cancelled) setShown(shops);
      } catch {
        if (!cancelled) setShown(shops);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [followGps, fixtures, shops]);

  return (
    <div className="flex flex-col">
      <div className="flex h-[calc(100dvh-var(--safe-top)-var(--nav-h)-var(--safe-bottom))] flex-col overflow-hidden md:h-[calc(100dvh-var(--safe-top)-2.75rem)]">
        {fixtures ? <DemoBanner /> : null}
        <div className="relative min-h-0 flex-1">
          <MapView
            shops={shown}
            fixtures={fixtures}
            livePosts={fixtures ? NO_LIVE_POSTS : livePosts}
            demoSession={demoSession}
            focus={focus}
          />
          <CouponBadge />
        </div>
      </div>
      <section
        className="px-4 pb-[calc(var(--nav-h)+var(--safe-bottom)+1.5rem)] pt-4 md:pb-8"
        aria-labelledby="shops-near"
      >
        <PlaceStats />
        <h1 id="shops-near" className="text-heading font-bold text-fg">
          {t("en", "map.near")}
        </h1>
        <ShopList shops={shown} fixtures={fixtures} />
      </section>
    </div>
  );
}
