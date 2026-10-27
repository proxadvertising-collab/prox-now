"use client";

import dynamic from "next/dynamic";
import type { FixtureShop } from "@/lib/fixtures/shops";

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
}: {
  shops?: FixtureShop[];
  fixtures?: boolean;
}) {
  return (
    <div className="h-full min-h-0 w-full bg-bg">
      <ProxMap shops={shops} fixtures={fixtures} />
    </div>
  );
}
