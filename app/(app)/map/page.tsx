import { Suspense } from "react";
import { connection } from "next/server";
import { MapChrome } from "@/components/map/MapChrome";
import { SkeletonCards } from "@/components/ui/SkeletonCards";
import { DEMO_ZONE_FALLBACK } from "@/lib/demo/zone";
import { DEMO_CENTER, FIXTURE_SHOPS } from "@/lib/fixtures/shops";
import { getLivePosts } from "@/lib/posts/source";
import { hasShopEnv, mapShopsFromRows, type MapShopRow } from "@/lib/shops/source";
import { createClient } from "@/lib/supabase/server";

function isDigest(error: unknown): boolean {
  return typeof error === "object" && error !== null && "digest" in error;
}

async function MapFromDatabase() {
  await connection();
  try {
    const supabase = await createClient();
    const session = await supabase.auth.getUser();
    const signedIn = Boolean(session.data.user);
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
    if (error || !data) return <SkeletonCards />;
    const shops = mapShopsFromRows(data as MapShopRow[], zone, { includeDemo: demoSession });
    const posts = await getLivePosts();
    return (
      <MapChrome
        shops={shops}
        fixtures={false}
        livePosts={posts}
        demoSession={demoSession}
        followGps={signedIn && !demoSession}
      />
    );
  } catch (error) {
    if (isDigest(error)) throw error;
    return <SkeletonCards />;
  }
}

export default function MapPage() {
  if (!hasShopEnv()) return <MapChrome shops={FIXTURE_SHOPS} fixtures />;
  return (
    <Suspense fallback={<SkeletonCards />}>
      <MapFromDatabase />
    </Suspense>
  );
}
