"use client";

import { t } from "@/lib/copy";

export function BookAddPhotos({
  shopId,
  className,
}: {
  shopId: string;
  shop: { lat: number; lng: number } | null;
  className: string;
}) {
  return (
    <a className={className} href={"/snap?seed=1&shop=" + encodeURIComponent(shopId)}>
      {t("en", "book.build")}
    </a>
  );
}
