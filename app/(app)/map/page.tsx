import { Suspense } from "react";
import { connection } from "next/server";
import { CouponBadge } from "@/components/map/CouponBadge";
import { MapView } from "@/components/map/MapView";
import { PlaceStats } from "@/components/map/PlaceStats";
import { ShopList } from "@/components/map/ShopList";
import { DemoBanner } from "@/components/ui/DemoBanner";
import { t } from "@/lib/copy";
import { DEMO_ZONE_FALLBACK } from "@/lib/demo/zone";
import { DEMO_CENTER, FIXTURE_SHOPS, type FixtureShop } from "@/lib/fixtures/shops";
import type { LivePost } from "@/lib/posts/source";
import { getLivePosts } from "@/lib/posts/source";
import { hasShopEnv, mapShopsFromRows, type MapShopRow } from "@/lib/shops/source";
import { createClient } from "@/lib/supabase/server";

const NO_LIVE_POSTS: LivePost[] = [];

function isDigest(error: unknown): boolean {
  return typeof error === "object" && error !== null && "digest" in error;
}

function MapChrome({
  shops,
  fixtures,
  livePosts = NO_LIVE_POSTS,
  demoSession = false,
}: {
  shops: FixtureShop[];
  fixtures: boolean;
  livePosts?: LivePost[];
  demoSession?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <div className="flex h-[calc(100dvh-var(--safe-top)-var(--nav-h)-var(--safe-bottom))] flex-col overflow-hidden md:h-[calc(100dvh-var(--safe-top)-2.75rem)]">
        {fixtures ? <DemoBanner /> : null}
        <div className="relative min-h-0 flex-1">
          <MapView
            shops={shops}
            fixtures={fixtures}
            livePosts={fixtures ? NO_LIVE_POSTS : livePosts}
            demoSession={demoSession}
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
        <ShopList shops={shops} fixtures={fixtures} />
      </section>
    </div>
  );
}

async function MapFromDatabase() {
  await connection();
  try {
    const supabase = await createClient();
    const session = await supabase.auth.getUser();
    let demoSession = false;
    if (session.data.user) {
      const account = await supabase.from("demo_accounts").select("role").limit(1);
      if (!account.error && (account.data?.length ?? 0) > 0) demoSession = true;
    }
    let zone = { lat: DEMO_CENTER.lat, lng: DEMO_CENTER.lng };
    if (demoSession) {
      const zoneResult = await supabase.rpc("demo_zone");
      const row = Array.isArray(zoneResult.data) ? zoneResult.data[0] : null;
      if (row && typeof row.lat === "number" && typeof row.lng === "number") {
        zone = { lat: row.lat, lng: row.lng };
      } else {
        zone = { lat: DEMO_ZONE_FALLBACK.lat, lng: DEMO_ZONE_FALLBACK.lng };
      }
    }
    const shopQuery = supabase
      .from("shops")
      .select("id, slug, name, name_local, category, lat, lng, is_demo");
    const { data, error } = demoSession ? await shopQuery : await shopQuery.eq("is_demo", false);
    if (error || !data) return <MapChrome shops={FIXTURE_SHOPS} fixtures />;
    const shops = mapShopsFromRows(data as MapShopRow[], zone, { includeDemo: demoSession });
    const posts = await getLivePosts();
    return <MapChrome shops={shops} fixtures={false} livePosts={posts} demoSession={demoSession} />;
  } catch (error) {
    if (isDigest(error)) throw error;
    return <MapChrome shops={FIXTURE_SHOPS} fixtures />;
  }
}

export default function MapPage() {
  if (!hasShopEnv()) return <MapChrome shops={FIXTURE_SHOPS} fixtures />;
  return (
    <Suspense fallback={<MapChrome shops={FIXTURE_SHOPS} fixtures />}>
      <MapFromDatabase />
    </Suspense>
  );
}
