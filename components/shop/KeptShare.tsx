"use client";

import { t } from "@/lib/copy";
import { keptShareCaption } from "@/lib/shop/caption";
import type { UsualFact } from "@/lib/shop/usual";

export function KeptShare({
  url,
  shop,
  author,
  facts,
}: {
  url: string;
  shop: string;
  author: string;
  facts: (UsualFact & { crowd?: string | null }) | null;
}) {
  const caption = keptShareCaption("en", shop, author, facts);

  async function share() {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const file = new File([blob], "prox-now-kept.jpg", { type: blob.type || "image/jpeg" });
      const nav = navigator as Navigator & { canShare?: (data: { files?: File[] }) => boolean };
      if (typeof nav.canShare === "function" && nav.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text: caption });
        return;
      }
      if (navigator.clipboard) await navigator.clipboard.writeText(caption);
      const href = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = href;
      link.download = "prox-now-kept.jpg";
      link.click();
      URL.revokeObjectURL(href);
    } catch {
      if (navigator.clipboard) await navigator.clipboard.writeText(caption);
    }
  }

  return (
    <button type="button" className="inline-flex min-h-11 items-center rounded-md bg-surface-2 px-3 text-label font-semibold text-fg" onClick={() => void share()}>
      {t("en", "loop.share")}
    </button>
  );
}
