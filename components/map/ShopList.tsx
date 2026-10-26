"use client";

import { useSyncExternalStore } from "react";
import { t } from "@/lib/copy";
import { makeDemoPosts } from "@/lib/fixtures/demo-posts";
import { shopBySlug } from "@/lib/fixtures/shops";
import { formatRemaining, remainingMs } from "@/lib/freshness";
import { haversineMeters, walkingDirectionsUrl, walkingMinutes } from "@/lib/geo";
import { getClock, getServerClock, subscribeClock } from "./clock";
import { getServerWalkOrigin, getWalkOrigin, subscribeWalkOrigin } from "./walk-origin";

export function ShopList() {
  const nowMs = useSyncExternalStore(subscribeClock, getClock, getServerClock);
  const origin = useSyncExternalStore(subscribeWalkOrigin, getWalkOrigin, getServerWalkOrigin);
  const posts = makeDemoPosts(nowMs || 1).slice().sort((a, b) => a.expires_at.localeCompare(b.expires_at));

  return (
    <ul className="mt-3 flex flex-col gap-3">
      {posts.map((post) => {
        const shop = shopBySlug(post.shopSlug);
        if (!shop) return null;
        const timeLabel =
          nowMs === 0
            ? "–"
            : t("en", "timer.left", { t: formatRemaining(remainingMs(post.expires_at, nowMs)) });
        const minutes = walkingMinutes(haversineMeters(origin, shop));
        return (
          <li key={post.id} className="rounded-lg bg-surface-1 p-4 shadow-card">
            <p className="text-heading font-bold text-fg">{shop.name}</p>
            {shop.nameLocal ? <p className="text-label text-fg-muted">{shop.nameLocal}</p> : null}
            <p className="mt-1 min-h-6 text-label tabular-nums text-fg">{timeLabel}</p>
            <p className="text-label text-fg-muted">{t("en", "map.walk", { n: String(minutes) })}</p>
            <a
              className="mt-3 inline-flex min-h-12 items-center justify-center rounded-md bg-accent px-4 text-base font-semibold text-accent-ink no-underline"
              href={walkingDirectionsUrl(shop)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("en", "post.go")}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
