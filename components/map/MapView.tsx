"use client";

import dynamic from "next/dynamic";

function MapSkeleton() {
  return <div className="h-full w-full bg-surface-2" aria-hidden="true" />;
}

const ProxMap = dynamic(() => import("./ProxMap").then((mod) => mod.ProxMap), {
  ssr: false,
  loading: () => <MapSkeleton />,
});

export function MapView() {
  return (
    <div className="h-full min-h-0 w-full bg-bg">
      <ProxMap />
    </div>
  );
}
