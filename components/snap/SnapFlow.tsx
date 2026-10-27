"use client";

import { useEffect, useRef, useState } from "react";
import { DemoBanner } from "@/components/ui/DemoBanner";
import { t } from "@/lib/copy";
import { resizeToJpeg } from "@/lib/image/resize";

type ShopCard = {
  id: string;
  name: string;
  nameLocal?: string | null;
  distanceM: number;
};

type AnalyzeBody = {
  decision?: "confirm" | "pick" | "pick-all";
  result?: { shopId: string | null; confidence: number; category?: string };
  candidates?: ShopCard[];
  demo?: boolean;
  error?: string;
};

type Phase = "idle" | "reading" | "confirm" | "pick" | "success" | "error";

const primary =
  "inline-flex min-h-12 w-full items-center justify-center rounded-md bg-accent px-4 text-base font-semibold text-accent-ink no-underline touch-manipulation disabled:opacity-60";

const secondary =
  "inline-flex min-h-12 w-full items-center justify-center rounded-md bg-surface-2 px-4 text-base font-semibold text-fg no-underline touch-manipulation";

function locate(): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (point: { lat: number; lng: number } | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(point);
    };
    const timer = window.setTimeout(() => finish(null), 8000);
    navigator.geolocation.getCurrentPosition(
      (position) => finish({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => finish(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    );
  });
}

export function SnapFlow() {
  const inputRef = useRef<HTMLInputElement>(null);
  const runRef = useRef(0);
  const fileRef = useRef<File | null>(null);
  const startedRef = useRef(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [preview, setPreview] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [demo, setDemo] = useState(false);
  const [error, setError] = useState("");
  const [candidates, setCandidates] = useState<ShopCard[]>([]);
  const [guessId, setGuessId] = useState<string | null>(null);
  const [chosen, setChosen] = useState<ShopCard | null>(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  useEffect(() => {
    if (phase !== "reading") return;
    const id = window.setInterval(() => {
      setElapsed(Math.max(0, Math.round((Date.now() - startedRef.current) / 1000)));
    }, 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  function reset() {
    runRef.current += 1;
    fileRef.current = null;
    setPhase("idle");
    setPreview(null);
    setElapsed(0);
    setDemo(false);
    setError("");
    setCandidates([]);
    setGuessId(null);
    setChosen(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function analyse(file: File) {
    const run = ++runRef.current;
    setPhase("reading");
    setError("");
    setElapsed(0);
    startedRef.current = Date.now();
    try {
      const point = await locate();
      if (run !== runRef.current) return;
      if (!point) setDemo(true);
      const jpeg = await resizeToJpeg(file);
      if (run !== runRef.current) return;
      const form = new FormData();
      form.set("image", jpeg, "snap.jpg");
      if (point) {
        form.set("lat", String(point.lat));
        form.set("lng", String(point.lng));
      }
      const response = await fetch("/api/analyze", { method: "POST", body: form });
      const body = (await response.json().catch(() => null)) as AnalyzeBody | null;
      if (run !== runRef.current) return;
      if (response.status === 503 && body?.error === "ai_not_configured") {
        setError(t("en", "err.ai"));
        setPhase("error");
        return;
      }
      if (!response.ok || !body?.decision || !body.result) {
        setError(t("en", "err.net"));
        setPhase("error");
        return;
      }
      const shops = body.candidates ?? [];
      setCandidates(shops);
      setDemo((current) => current || Boolean(body.demo));
      setTotalSeconds(Math.max(1, Math.round((Date.now() - startedRef.current) / 1000)));
      const guess = shops.find((shop) => shop.id === body.result?.shopId) ?? null;
      if (body.decision === "confirm" && guess) {
        setGuessId(guess.id);
        setChosen(guess);
        setPhase("confirm");
        return;
      }
      setGuessId(body.decision === "pick" ? guess?.id ?? null : null);
      setChosen(null);
      setPhase("pick");
    } catch {
      if (run !== runRef.current) return;
      setError(t("en", "err.net"));
      setPhase("error");
    }
  }

  function onFile(file: File | undefined) {
    if (!file) return;
    if (preview) URL.revokeObjectURL(preview);
    fileRef.current = file;
    setPreview(URL.createObjectURL(file));
    void analyse(file);
  }

  function choose(shop: ShopCard | null) {
    setChosen(shop);
    setTotalSeconds(Math.max(1, Math.round((Date.now() - startedRef.current) / 1000)));
    setPhase("success");
  }

  const guess = candidates.find((shop) => shop.id === guessId) ?? chosen;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-title font-bold text-fg">{t("en", "nav.snap")}</h1>
      {demo ? <DemoBanner /> : null}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(event) => onFile(event.target.files?.[0])}
      />

      {phase === "idle" ? (
        <div className="flex flex-col gap-3">
          <p className="text-body text-fg-muted">{t("en", "loc.why")}</p>
          <button type="button" className={primary + " min-h-16"} onClick={() => inputRef.current?.click()}>
            {t("en", "snap.cta")}
          </button>
        </div>
      ) : null}

      {preview && phase !== "idle" ? (
        <img src={preview} alt={t("en", "snap.alt")} className="aspect-[4/3] w-full rounded-lg object-cover" />
      ) : null}

      {phase === "reading" ? (
        <div aria-live="polite" className="flex flex-col gap-2">
          <p className="text-heading font-bold text-fg">{t("en", "reading.shop")}</p>
          <p className="min-h-6 text-label text-fg-muted">
            {t("en", "reading.seconds", { t: String(elapsed) })}
          </p>
          <ul className="flex flex-col gap-1 text-label text-fg">
            <li>{t("en", "reading.title")}</li>
            <li>{t("en", "reading.blur")}</li>
            <li>{t("en", "reading.translate")}</li>
            <li>{t("en", "reading.match")}</li>
          </ul>
          <p className="text-label text-fg-muted">{t("en", "snap.tip")}</p>
        </div>
      ) : null}

      {phase === "confirm" && guess ? (
        <div className="flex flex-col gap-3 rounded-lg bg-surface-1 p-4 shadow-card">
          <p className="text-heading font-bold text-fg">
            {t("en", "confirm.named", { name: guess.name })}
          </p>
          {guess.nameLocal ? <p className="text-label text-fg-muted">{guess.nameLocal}</p> : null}
          <p className="text-label text-fg-muted">{t("en", "snap.meters", { n: String(guess.distanceM) })}</p>
          <button type="button" className={primary} onClick={() => choose(guess)}>
            {t("en", "confirm.yes")}
          </button>
          <button type="button" className={secondary} onClick={() => setPhase("pick")}>
            {t("en", "confirm.no")}
          </button>
        </div>
      ) : null}

      {phase === "pick" ? (
        <div className="flex flex-col gap-3">
          <p className="text-heading font-bold text-fg">{t("en", "confirm.q")}</p>
          <ul className="flex flex-col gap-2">
            {candidates.map((shop) => (
              <li key={shop.id}>
                <button type="button" className={secondary + " items-start text-left"} onClick={() => choose(shop)}>
                  <span className="flex w-full flex-col">
                    {shop.id === guessId ? (
                      <span className="text-caption font-semibold text-accent">{t("en", "pick.best")}</span>
                    ) : null}
                    <span>{shop.name}</span>
                    <span className="text-caption text-fg-muted">
                      {t("en", "snap.meters", { n: String(shop.distanceM) })}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className={secondary} onClick={() => choose(null)}>
            {t("en", "pick.none")}
          </button>
        </div>
      ) : null}

      {phase === "success" ? (
        <div className="flex flex-col gap-3">
          <p className="text-heading font-bold text-fg">
            {chosen ? t("en", "success.pin", { name: chosen.name }) : t("en", "pick.skipped")}
          </p>
          <p className="text-label text-fg-muted">{t("en", "success.time", { t: String(totalSeconds) })}</p>
          <p className="text-body text-fg">{t("en", "success.demo")}</p>
          <button type="button" className={primary} onClick={reset}>
            {t("en", "success.again")}
          </button>
        </div>
      ) : null}

      {phase === "error" ? (
        <div className="flex flex-col gap-3">
          <p role="alert" className="min-h-6 text-body text-danger">
            {error}
          </p>
          <button
            type="button"
            className={primary}
            onClick={() => {
              const file = fileRef.current;
              if (file) void analyse(file);
              else reset();
            }}
          >
            {t("en", "err.retry")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
