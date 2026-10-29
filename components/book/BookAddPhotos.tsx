"use client";

import { useState } from "react";
import { t } from "@/lib/copy";
import { hasDemoSessionCookie } from "@/lib/demo/zone";
import { locate } from "@/lib/geo/locate";
import { hasShopEnv } from "@/lib/shops/source";
import { createClient } from "@/lib/supabase/client";
import {
  addBookShots,
  atThisShop,
  uploadBookSession,
  viewerUsesDemoLocation,
} from "@/lib/book/builder";

export function BookAddPhotos({
  shopId,
  shop,
  className,
}: {
  shopId: string;
  shop: { lat: number; lng: number } | null;
  className: string;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function onFiles(files: File[]) {
    if (files.length === 0 || busy) return;
    setBusy(true);
    setNote("");
    try {
      const demo = await viewerUsesDemoLocation({
        hasEnv: hasShopEnv(),
        demoCookie: hasDemoSessionCookie(document.cookie),
        lookup: async () => {
          const supabase = createClient();
          const account = await supabase.from("demo_accounts").select("role").limit(1);
          return { error: account.error, count: account.data?.length ?? 0 };
        },
      });
      if (!demo) {
        const located = await locate();
        const here = located.status === "ok" ? located.point : null;
        const gate = atThisShop(here, shop);
        if (gate !== "ok") {
          const key = gate === "too_far" ? "book.tooFar" : "book.needLoc";
          setNote(t("en", key));
          return;
        }
      }
      const { shots } = addBookShots([], "menu", files);
      const result = await uploadBookSession(shopId, shots);
      if (result.status === 401) {
        window.location.assign("/login?next=" + encodeURIComponent("/book/" + shopId));
        return;
      }
      if (result.status >= 400 || shots.length === 0) {
        setNote(t("en", "book.failed"));
        return;
      }
      window.location.assign("/book/" + encodeURIComponent(shopId) + "?seeded=1");
    } catch {
      setNote(t("en", "book.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label className={className}>
        <input
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          disabled={busy}
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            void onFiles(files);
          }}
        />
        {t("en", "book.build")}
      </label>
      {note ? (
        <p role="alert" className="text-body text-fg">
          {note}
        </p>
      ) : null}
    </div>
  );
}
