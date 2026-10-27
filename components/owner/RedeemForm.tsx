"use client";

import { useEffect, useRef, useState } from "react";
import { t } from "@/lib/copy";

type Detector = { detect: (source: HTMLVideoElement) => Promise<{ rawValue?: string }[]> };

export function RedeemForm() {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [scan, setScan] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canScan = typeof window !== "undefined" && "BarcodeDetector" in window;

  useEffect(() => {
    if (!scan) return;
    const video = videoRef.current;
    const Ctor = (window as unknown as { BarcodeDetector?: new (opts: { formats: string[] }) => Detector }).BarcodeDetector;
    if (!video || !Ctor) return;
    let stopped = false;
    let stream: MediaStream | null = null;
    const detector = new Ctor({ formats: ["qr_code"] });

    void navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((next) => {
        if (stopped) {
          next.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = next;
        video.srcObject = next;
        return video.play();
      })
      .then(async () => {
        while (!stopped && stream) {
          try {
            const found = await detector.detect(video);
            const value = found[0]?.rawValue;
            if (value) {
              setCode(value);
              setScan(false);
              return;
            }
          } catch {
            return;
          }
        }
      })
      .catch(() => setScan(false));

    return () => {
      stopped = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [scan]);

  async function submit() {
    setBusy(true);
    setError("");
    setName("");
    try {
      const response = await fetch("/api/owner/redeem", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string; holder_name?: string } | null;
      if (!response.ok) {
        setError(t("en", "loop.fail"));
        return;
      }
      setName(body?.holder_name ?? "");
    } catch {
      setError(t("en", "loop.fail"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-title font-bold text-fg">{t("en", "loop.redeem")}</h1>
      <label className="flex flex-col gap-1 text-label text-fg" htmlFor="coupon-code">
        {t("en", "loop.code")}
        <input
          id="coupon-code"
          className="min-h-12 rounded-md bg-surface-2 px-3 text-title font-bold tracking-widest text-fg"
          value={code}
          autoCapitalize="characters"
          onChange={(event) => setCode(event.target.value.toUpperCase())}
        />
      </label>
      {canScan ? (
        <button type="button" className="inline-flex min-h-11 items-center justify-center rounded-md bg-surface-2 px-4 font-semibold text-fg" onClick={() => setScan(true)}>
          {t("en", "loop.scan")}
        </button>
      ) : null}
      {scan ? <video ref={videoRef} className="aspect-square w-full rounded-lg bg-black" muted playsInline /> : null}
      <button type="button" className="inline-flex min-h-16 items-center justify-center rounded-md bg-accent px-4 text-base font-semibold text-accent-ink disabled:opacity-60" disabled={busy || code.trim().length < 4} onClick={() => void submit()}>
        {t("en", "loop.redeem")}
      </button>
      {name ? (
        <p className="rounded-lg bg-accent px-4 py-6 text-center text-title font-bold text-accent-ink" role="status">
          {t("en", "loop.valid")}
          <span className="mt-2 block text-heading">{name}</span>
        </p>
      ) : null}
      {error ? <p role="alert" className="text-body text-danger">{error}</p> : null}
    </div>
  );
}
