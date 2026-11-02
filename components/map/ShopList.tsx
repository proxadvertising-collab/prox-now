"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { t } from "@/lib/copy";
import { EmptyState } from "@/components/ui/EmptyState";
import { makeDemoPosts } from "@/lib/fixtures/demo-posts";
import { DEMO_CENTER, FIXTURE_SHOPS, shopBySlug, type FixtureShop } from "@/lib/fixtures/shops";
import { formatRemaining, remainingMs } from "@/lib/freshness";
import { haversineMeters, walkingDirectionsUrl, walkingMinutes, type LatLng } from "@/lib/geo";
import { bookHref } from "@/lib/map/pin-sheet";
import { getClock, getServerClock, subscribeClock } from "./clock";
import { getServerWalkOrigin, getWalkOrigin, subscribeWalkOrigin } from "./walk-origin";

function walkLine(origin: LatLng | null, shop: LatLng) {
  if (!origin) return null;
  const minutes = walkingMinutes(haversineMeters(origin, shop));
  return <p className="text-label text-fg-muted">{t("en", "map.walk", { n: String(minutes) })}</p>;
}

export function ShopList({
  shops = FIXTURE_SHOPS,
  fixtures = true,
  demoSession = false,
}: {
  shops?: FixtureShop[];
  fixtures?: boolean;
  demoSession?: boolean;
}) {
  const nowMs = useSyncExternalStore(subscribeClock, getClock, getServerClock);
  const storedOrigin = useSyncExternalStore(subscribeWalkOrigin, getWalkOrigin, getServerWalkOrigin);
  const origin = fixtures || demoSession ? DEMO_CENTER : storedOrigin;
  const count = <p className="text-label text-fg-muted">{t("en", "map.count", { n: String(shops.length) })}</p>;
  if (!fixtures) {
    if (shops.length === 0) {
      return (
        <>
          {count}
          <EmptyState message={t("en", "empty.map")} action={{ href: "/snap", label: t("en", "snap.cta") }} camera />
        </>
      );
    }
    return (
      <>
        {count}
        <ul className="mt-3 flex flex-col gap-3">
          {shops.map((shop) => (
            <li key={shop.id} className="rounded-lg bg-surface-1 p-4 shadow-card">
              <Link className="text-heading font-bold text-fg no-underline" href={bookHref(shop.slug)}>
                {shop.name}
              </Link>
              {shop.nameLocal ? <p className="text-label text-fg-muted">{shop.nameLocal}</p> : null}
              {walkLine(origin, shop)}
              <a
                className="mt-3 inline-flex min-h-12 items-center justify-center rounded-md bg-accent px-4 text-base font-semibold text-accent-ink no-underline"
                href={walkingDirectionsUrl(shop, fixtures || demoSession ? DEMO_CENTER : null)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("en", "post.go")}
              </a>
            </li>
          ))}
        </ul>
      </>
    );
  }
  const posts = makeDemoPosts(nowMs || 1).slice().sort((a, b) => a.expires_at.localeCompare(b.expires_at));

  return (
    <>
      {count}
      <ul className="mt-3 flex flex-col gap-3">
        {posts.map((post) => {
          const shop = shopBySlug(post.shopSlug);
          if (!shop) return null;
          const timeLabel =
            nowMs === 0
              ? "–"
              : t("en", "timer.left", { t: formatRemaining(remainingMs(post.expires_at, nowMs)) });
          return (
            <li key={post.id} className="rounded-lg bg-surface-1 p-4 shadow-card">
              <Link className="text-heading font-bold text-fg no-underline" href={bookHref(shop.slug)}>
                {shop.name}
              </Link>
              {shop.nameLocal ? <p className="text-label text-fg-muted">{shop.nameLocal}</p> : null}
              <p className="mt-1 min-h-6 text-label tabular-nums text-fg">{timeLabel}</p>
              {walkLine(origin, shop)}
              <a
                className="mt-3 inline-flex min-h-12 items-center justify-center rounded-md bg-accent px-4 text-base font-semibold text-accent-ink no-underline"
                href={walkingDirectionsUrl(shop, fixtures || demoSession ? DEMO_CENTER : null)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("en", "post.go")}
              </a>
            </li>
          );
        })}
      </ul>
    </>
  );
}
