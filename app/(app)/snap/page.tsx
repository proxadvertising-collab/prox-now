import { Suspense } from "react";
import { LiveCamera } from "@/components/camera/LiveCamera";
import { readSnapShop } from "@/lib/snap/target";

async function SnapContent({
  searchParams,
}: {
  searchParams: Promise<{ shop?: string; name?: string; seed?: string }>;
}) {
  const params = await searchParams;
  return <LiveCamera preselected={readSnapShop(params)} startSeeding={params.seed === "1"} />;
}

export default function SnapPage({
  searchParams,
}: {
  searchParams: Promise<{ shop?: string; name?: string; seed?: string }>;
}) {
  return (
    <Suspense fallback={<LiveCamera />}>
      <SnapContent searchParams={searchParams} />
    </Suspense>
  );
}
