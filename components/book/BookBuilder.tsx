"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { t, type CopyKey } from "@/lib/copy";
import { DEMO_ZONE_FALLBACK, hasDemoSessionCookie } from "@/lib/demo/zone";
import { getFix } from "@/lib/geo/fix-cache";
import { hasShopEnv } from "@/lib/shops/source";
import { createClient } from "@/lib/supabase/client";
import { PinDrop } from "@/components/camera/PinDrop";
import { RadarButton } from "@/components/ui/RadarButton";
import {
  BOOK_CAPTURE_STEPS,
  addBookShots,
  atThisShop,
  BOOK_READ_MISS,
  bookBuildHref,
  bookErrorKey,
  bookSavePlan,
  bookUploadState,
  removeBookShot,
  uploadBookSession,
  viewerUsesDemoLocation,
  type BookShot,
  type BookTile,
} from "@/lib/book/builder";
import { resizeToJpeg } from "@/lib/image/resize";
import { snapSeedHref } from "@/lib/snap/target";
import { frameSaveKey } from "@/lib/snap/where";

type Gate = "checking" | "ok" | "need_location" | "too_far" | "unknown_shop";
type Step = BookTile | "review";

type Queued = BookShot & { url: string };

const primary =
  "inline-flex min-h-12 w-full items-center justify-center rounded-md bg-accent px-4 text-base font-semibold text-accent-ink no-underline touch-manipulation disabled:opacity-60";
const upload = "btn-secondary min-h-12 w-full no-underline touch-manipulation disabled:opacity-60";
const quiet =
  "inline-flex min-h-12 w-full items-center justify-center rounded-md bg-surface-2 px-4 text-base font-semibold text-fg no-underline touch-manipulation disabled:opacity-60";

function stepTitle(step: BookTile): CopyKey {
  if (step === "menu") return "book.menuStep";
  if (step === "hours") return "book.hours";
  return "book.storefront";
}

function withUrls(previous: readonly Queued[], shots: readonly BookShot[]): Queued[] {
  const known = new Map(previous.map((shot) => [shot.id, shot]));
  const next = shots.map((shot) => {
    const kept = known.get(shot.id);
    if (kept) return kept;
    return { ...shot, url: URL.createObjectURL(shot.file) };
  });
  for (const shot of previous) {
    if (!next.some((item) => item.id === shot.id)) URL.revokeObjectURL(shot.url);
  }
  return next;
}

export function BookBuilder({
  shopId,
  slug,
  name,
  lat,
  lng,
}: {
  shopId: string;
  slug: string;
  name: string;
  lat: number | null;
  lng: number | null;
}) {
  const router = useRouter();
  const pointRef = useRef<{ lat: number; lng: number } | null>(null);
  const [gate, setGate] = useState<Gate>("checking");
  const [attempt, setAttempt] = useState(0);
  const [step, setStep] = useState<Step>("storefront");
  const [shots, setShots] = useState<Queued[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [readAgain, setReadAgain] = useState(false);
  const shotsRef = useRef<Queued[]>([]);

  useEffect(() => {
    shotsRef.current = shots;
  }, [shots]);

  useEffect(() => {
    return () => {
      for (const shot of shotsRef.current) URL.revokeObjectURL(shot.url);
    };
  }, []);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      const shop = lat != null && lng != null ? { lat, lng } : null;
      const demo = await viewerUsesDemoLocation({
        hasEnv: hasShopEnv(),
        demoCookie: hasDemoSessionCookie(document.cookie),
        lookup: async () => {
          const supabase = createClient();
          const account = await supabase.from("demo_accounts").select("role").limit(1);
          return { error: account.error, count: account.data?.length ?? 0 };
        },
      });
      if (cancel) return;
      if (demo) {
        const stand = shop ?? { lat: DEMO_ZONE_FALLBACK.lat, lng: DEMO_ZONE_FALLBACK.lng };
        pointRef.current = stand;
        setGate(atThisShop(stand, shop, true));
        return;
      }
      const here = await getFix({ userAction: false });
      if (cancel) return;
      pointRef.current = here;
      setGate(atThisShop(here, shop));
    })();
    return () => {
      cancel = true;
    };
  }, [lat, lng, attempt]);

  function recheck() {
    setNote("");
    setGate("checking");
    setAttempt((current) => current + 1);
  }

  function skip() {
    if (step === "storefront") setStep("menu");
    else if (step === "menu") setStep("hours");
    else if (step === "hours") setStep("review");
  }

  async function addUploads(list: readonly File[]) {
    if (list.length === 0 || step === "review") return;
    const files: File[] = [];
    for (const file of list) {
      try {
        const jpeg = await resizeToJpeg(file);
        files.push(new File([jpeg], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }));
      } catch (error) {
        setNote(t("en", frameSaveKey(error)));
      }
    }
    if (files.length === 0) return;
    setShots((current) => withUrls(current, addBookShots(current, step, files).shots));
  }

  function remove(id: string) {
    setShots((current) => {
      const next = removeBookShot(current, id);
      return withUrls(current, next);
    });
  }

  async function save() {
    if (shots.length === 0) {
      setNote(t("en", "book.emptySave"));
      return;
    }
    setBusy(true);
    setReadAgain(false);
    setNote(t("en", "book.uploading", { n: String(shots.length) }));
    try {
      const result = await uploadBookSession(
        shopId,
        shots.map(({ id, kind, file }) => ({ id, kind, file })),
      );
      if (bookSavePlan(result) === "again") {
        setNote(BOOK_READ_MISS);
        setReadAgain(true);
        return;
      }
      const state = bookUploadState(result.status, result.error);
      if (state === "signin") {
        window.location.assign("/login?next=" + encodeURIComponent(bookBuildHref(slug)));
        return;
      }
      if (state === "ok" || state === "resting" || state === "saved") {
        const here = pointRef.current;
        const params = new URLSearchParams({ seeded: "1" });
        if (here) {
          params.set("lat", String(here.lat));
          params.set("lng", String(here.lng));
        }
        router.push("/book/" + encodeURIComponent(slug) + "?" + params.toString());
        return;
      }
      setNote(t("en", bookErrorKey(result.error) as CopyKey));
    } catch {
      setNote(t("en", "book.failed"));
    } finally {
      setBusy(false);
    }
  }

  const thumbs = (
    <ul className="flex gap-2 overflow-x-auto">
      {shots.map((shot) => (
        <li key={shot.id}>
          <button type="button" className="min-h-11 min-w-11" aria-label={t("en", "book.remove")} onClick={() => remove(shot.id)}>
            <img src={shot.url} alt="" className="h-20 w-20 rounded-md object-cover" />
          </button>
        </li>
      ))}
    </ul>
  );

  if (gate === "checking") {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-title font-bold text-fg">{name}</h1>
        <p className="text-body text-fg">{t("en", "book.checking")}</p>
      </div>
    );
  }

  if (gate === "need_location") {
    const shopPoint = lat != null && lng != null ? { lat, lng } : null;
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-title font-bold text-fg">{name}</h1>
        <p className="text-body text-fg">{t("en", "snap.where")}</p>
        <button
          type="button"
          className={primary}
          onClick={() => {
            void (async () => {
              const here = await getFix({ userAction: true });
              if (!here) return;
              pointRef.current = here;
              setGate(atThisShop(here, shopPoint));
            })();
          }}
        >
          {t("en", "loc.ask")}
        </button>
        {shopPoint ? (
          <button
            type="button"
            className={primary}
            onClick={() => {
              pointRef.current = shopPoint;
              setGate("ok");
            }}
          >
            {t("en", "snap.useShop", { name })}
          </button>
        ) : null}
        <PinDrop
          onPick={(point) => {
            pointRef.current = point;
            setGate(atThisShop(point, shopPoint));
          }}
        />
      </div>
    );
  }

  if (gate !== "ok") {
    const key: CopyKey = gate === "too_far" ? "book.tooFar" : "book.where";
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-title font-bold text-fg">{name}</h1>
        <p role="status" className="text-body text-fg">
          {t("en", key)}
        </p>
        <button type="button" className={primary} onClick={recheck}>
          {t("en", "err.retry")}
        </button>
      </div>
    );
  }

  const capture = step === "review" ? null : step;
  const menuCount = shots.filter((shot) => shot.kind === "menu").length;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-title font-bold text-fg">{name}</h1>
      <p className="text-label text-fg-muted">{t("en", "book.stay")}</p>
      {capture ? (
        <p className="text-heading font-bold text-fg">
          {t("en", stepTitle(capture))} {BOOK_CAPTURE_STEPS.indexOf(capture) + 1}/{BOOK_CAPTURE_STEPS.length}
        </p>
      ) : null}
      {capture ? (
        <>
          <RadarButton
            href={
              snapSeedHref(shopId, name).startsWith("/snap?seed=1")
                ? snapSeedHref(shopId, name)
                : "/snap?seed=1"
            }
            caption={capture === "menu" && menuCount > 0 ? t("en", "book.another") : t("en", "snap.take")}
          />
          <label className={upload}>
            {t("en", "snap.upload")}
            <input
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = "";
                void addUploads(files);
              }}
            />
          </label>
          {capture === "menu" ? (
            <button type="button" className={quiet} disabled={busy} onClick={() => setStep("hours")}>
              {t("en", "book.stepDone")}
            </button>
          ) : null}
          <button type="button" className={quiet} disabled={busy} onClick={skip}>
            {t("en", "book.skip")}
          </button>
        </>
      ) : (
        <button type="button" className={primary} disabled={busy} onClick={() => void save()}>
          {t("en", "book.save")}
        </button>
      )}
      {shots.length > 0 ? thumbs : null}
      {note ? (
        <p role="status" className="text-body text-fg">
          {note}
        </p>
      ) : null}
      {readAgain ? (
        <button type="button" className={primary} onClick={() => void save()}>
          Try again
        </button>
      ) : null}
    </div>
  );
}
