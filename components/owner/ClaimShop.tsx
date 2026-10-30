"use client";

import { useState } from "react";
import { t } from "../../lib/copy";

const button =
  "inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-accent-ink";

export function ClaimShop({
  shopId,
  mode,
  seed = null,
}: {
  shopId: string;
  mode: "hidden" | "own" | "claim";
  seed?: { lat: number; lng: number; photoUrl: string | null } | null;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  if (mode === "hidden") return null;
  if (mode === "own") return <p className="text-sm font-semibold text-fg">{t("en", "claim.mine")}</p>;

  async function send(lat: number, lng: number, image: File | null) {
    const form = new FormData();
    form.set("shopId", shopId);
    form.set("lat", String(lat));
    form.set("lng", String(lng));
    if (image) form.set("image", image, image.name || "sign.jpg");
    setBusy(true);
    setNote(t("en", "claim.checking"));
    try {
      const response = await fetch("/api/owner/claim", { method: "POST", body: form });
      const body = (await response.json().catch(() => null)) as { status?: string; reason?: string } | null;
      if (response.status === 401) {
        const next = window.location.pathname + window.location.search;
        window.location.assign("/login?next=" + encodeURIComponent(next));
        return;
      }
      if (body?.status === "verified") {
        window.location.assign("/owner");
        return;
      }
      setNote(t("en", "claim.fail"));
      setOpen(true);
    } catch {
      setNote(t("en", "claim.fail"));
      setOpen(true);
    } finally {
      setBusy(false);
    }
  }

  async function claimSeed() {
    if (!seed) return;
    let image: File | null = null;
    if (seed.photoUrl) {
      try {
        const response = await fetch(seed.photoUrl);
        const blob = await response.blob();
        image = new File([blob], "sign.jpg", { type: blob.type || "image/jpeg" });
      } catch {
        image = null;
      }
    }
    await send(seed.lat, seed.lng, image);
  }

  function claimLive() {
    if (!file) {
      setNote(t("en", "claim.sign"));
      return;
    }
    if (!navigator.geolocation) {
      setNote(t("en", "claim.fail"));
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        void send(position.coords.latitude, position.coords.longitude, file);
      },
      () => {
        setBusy(false);
        setNote(t("en", "claim.fail"));
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 12000 },
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {seed ? (
        <button type="button" className={button} disabled={busy} onClick={() => void claimSeed()}>
          {t("en", "claim.seed")}
        </button>
      ) : (
        <button type="button" className={button} disabled={busy} onClick={() => setOpen(true)}>
          {t("en", "claim.shop")}
        </button>
      )}
      {open ? (
        <label className="flex flex-col gap-2 text-sm font-semibold text-fg">
          {t("en", "claim.sign")}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="text-sm font-normal"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <button type="button" className={button} disabled={busy} onClick={claimLive}>
            {t("en", "claim.shop")}
          </button>
        </label>
      ) : null}
      {note ? <p className="text-sm text-fg">{note}</p> : null}
    </div>
  );
}
