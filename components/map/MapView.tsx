"use client";

import dynamic from "next/dynamic";
import type { FixtureShop } from "@/lib/fixtures/shops";
import type { LivePost } from "@/lib/posts/source";

const EMPTY_POSTS: LivePost[] = [];

function MapSkeleton() {
  return <div className="h-full w-full bg-surface-2" aria-hidden="true" />;
}

const ProxMap = dynamic(() => import("./ProxMap").then((mod) => mod.ProxMap), {
  ssr: false,
  loading: () => <MapSkeleton />,
});

export function MapView({
  shops,
  fixtures = true,
  livePosts = EMPTY_POSTS,
}: {
  shops?: FixtureShop[];
  fixtures?: boolean;
  livePosts?: LivePost[];
}) {
  return (
    <div className="h-full min-h-0 w-full bg-bg">
      <ProxMap shops={shops} fixtures={fixtures} livePosts={livePosts} />
    </div>
  );
}
