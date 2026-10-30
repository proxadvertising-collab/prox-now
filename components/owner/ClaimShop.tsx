"use client";

import { useState } from "react";
import { t } from "../../lib/copy";

const button =
  "inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-accent-ink";
const outline =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-accent bg-transparent px-4 text-sm font-semibold text-accent";
const quiet =
  "inline-flex min-h-11 items-center justify-center rounded-md bg-surface-2 px-4 text-sm font-semibold text-fg";

export function ClaimShop({
  shopId,
  mode,
  name = "this shop",
  seed = null,
}: {
  shopId: string;
  mode: "hidden" | "own" | "claim";
  name?: string;
  seed?: { lat: number; lng: number; photoUrl: string | null } | null;
}) {
  const [confirm, setConfirm] = useState(false);
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  if (mode === "hidden") return null;
  if (mode === "own") return <p className="text-sm font-semibold text-fg">{t("en", "claim.mine")}</p>;

  async function livePhoto(): Promise<File | null> {
    if (!navigator.mediaDevices?.getUserMedia) return null;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    } catch {
      return null;
    }
    try {
      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      await new Promise((resolve) => window.setTimeout(resolve, 250));
      const width = video.videoWidth;
      const height = video.videoHeight;
      if (width < 2 || height < 2) return null;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) return null;
      context.drawImage(video, 0, 0, width, height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
      if (!blob) return null;
      return new File([blob], "sign.jpg", { type: "image/jpeg" });
    } finally {
      for (const track of stream.getTracks()) track.stop();
    }
  }

  async function prove() {
    setBusy(true);
    setNote(t("en", "claim.checking"));
    try {
      if (!navigator.geolocation) {
        setNote(t("en", "claim.fail"));
        return;
      }
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 12000,
        });
      });
      const image = await livePhoto();
      if (!image) {
        setNote(t("en", "claim.camera"));
        return;
      }
      const form = new FormData();
      form.set("shopId", shopId);
      form.set("lat", String(position.coords.latitude));
      form.set("lng", String(position.coords.longitude));
      form.set("live", "1");
      form.set("code", code);
      form.set("image", image, "sign.jpg");
      const response = await fetch("/api/owner/claim", { method: "POST", body: form });
      const body = (await response.json().catch(() => null)) as { status?: string } | null;
      if (response.status === 401) {
        const next = window.location.pathname + window.location.search;
        window.location.assign("/login?next=" + encodeURIComponent(next));
        return;
      }
      if (body?.status === "verified") {
        window.location.assign("/owner");
        return;
      }
      if (body?.status === "in_review") {
        setNote(t("en", "claim.review"));
        return;
      }
      setNote(t("en", "claim.fail"));
    } catch {
      setNote(t("en", "claim.fail"));
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  }

  async function issueCode() {
    setBusy(true);
    setNote("");
    try {
      const response = await fetch("/api/owner/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ shopId }),
      });
      const body = (await response.json().catch(() => null)) as { status?: string; code?: string } | null;
      if (response.status === 401) {
        const next = window.location.pathname + window.location.search;
        window.location.assign("/login?next=" + encodeURIComponent(next));
        return;
      }
      if (body?.status === "verified") {
        window.location.assign("/owner");
        return;
      }
      if (!response.ok || !body?.code) {
        setNote(t("en", "claim.fail"));
        return;
      }
      setCode(body.code);
    } catch {
      setNote(t("en", "claim.fail"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button type="button" className={outline} disabled={busy} onClick={() => setConfirm(true)}>
        {seed ? t("en", "claim.seed") : t("en", "claim.shop")}
      </button>
      {confirm ? (
        <div className="flex flex-col gap-2 rounded-lg bg-surface-1 p-3">
          <p className="text-sm text-fg">{t("en", "claim.confirm", { name })}</p>
          {code ? <p className="text-heading font-bold text-fg">{t("en", "claim.code", { code })}</p> : null}
          {code ? (
            <button type="button" className={button} disabled={busy} onClick={() => void prove()}>
              {t("en", "claim.take")}
            </button>
          ) : (
            <button type="button" className={button} disabled={busy} onClick={() => void issueCode()}>
              {t("en", "claim.yes")}
            </button>
          )}
          <button type="button" className={quiet} disabled={busy} onClick={() => setConfirm(false)}>
            {t("en", "claim.notNow")}
          </button>
        </div>
      ) : null}
      {note ? <p className="text-sm text-fg">{note}</p> : null}
    </div>
  );
}
