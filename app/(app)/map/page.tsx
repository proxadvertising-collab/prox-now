import { Suspense } from "react";
import { connection } from "next/server";
import { MapView } from "@/components/map/MapView";
import { ShopList } from "@/components/map/ShopList";
import { DemoBanner } from "@/components/ui/DemoBanner";
import { t } from "@/lib/copy";
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
}: {
  shops: FixtureShop[];
  fixtures: boolean;
  livePosts?: LivePost[];
}) {
  return (
    <div className="flex flex-col">
      <div className="flex h-[calc(100dvh-var(--safe-top)-var(--nav-h)-var(--safe-bottom))] flex-col overflow-hidden md:h-[calc(100dvh-var(--safe-top)-2.75rem)]">
        {fixtures ? <DemoBanner /> : null}
        <div className="min-h-0 flex-1">
          <MapView shops={shops} fixtures={fixtures} livePosts={fixtures ? NO_LIVE_POSTS : livePosts} />
        </div>
      </div>
      <section
        className="px-4 pb-[calc(var(--nav-h)+var(--safe-bottom)+1.5rem)] pt-4 md:pb-8"
        aria-labelledby="shops-near"
      >
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
    const { data, error } = await supabase
      .from("shops")
      .select("id, slug, name, name_local, category, lat, lng, is_demo")
      .eq("is_demo", false);
    if (error || !data) return <MapChrome shops={FIXTURE_SHOPS} fixtures />;
    const shops = mapShopsFromRows(data as MapShopRow[], DEMO_CENTER);
    const posts = await getLivePosts();
    return <MapChrome shops={shops} fixtures={false} livePosts={posts} />;
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
