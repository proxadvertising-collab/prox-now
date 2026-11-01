"use client";

import { RadarButton } from "@/components/ui/RadarButton";
import { t } from "@/lib/copy";
import { snapSeedHref } from "@/lib/snap/target";

export function BookAddPhotos({
  shopId,
  name = "",
}: {
  shopId: string;
  name?: string;
  shop: { lat: number; lng: number } | null;
}) {
  const href = snapSeedHref(shopId, name);
  return (
    <RadarButton
      href={href.startsWith("/snap?seed=1") ? href : "/snap?seed=1"}
      caption={t("en", "book.build")}
    />
  );
}
