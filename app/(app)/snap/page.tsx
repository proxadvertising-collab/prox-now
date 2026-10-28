import { Suspense } from "react";
import { SnapFlow } from "@/components/snap/SnapFlow";
import { readSnapShop } from "@/lib/snap/target";

async function SnapContent({
  searchParams,
}: {
  searchParams: Promise<{ shop?: string; name?: string }>;
}) {
  const params = await searchParams;
  return <SnapFlow preselected={readSnapShop(params)} />;
}

export default function SnapPage({
  searchParams,
}: {
  searchParams: Promise<{ shop?: string; name?: string }>;
}) {
  return (
    <Suspense fallback={<SnapFlow />}>
      <SnapContent searchParams={searchParams} />
    </Suspense>
  );
}
