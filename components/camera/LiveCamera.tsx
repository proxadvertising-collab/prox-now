"use client";

import { useEffect, useRef, useState } from "react";
import { SnapFlow } from "@/components/snap/SnapFlow";
import {
  adoptFacing,
  cameraConstraints,
  captureSize,
  drawUnmirrored,
  facingForSession,
  flipControl,
  flipStream,
  previewClass,
  rememberFacing,
  type Facing,
} from "./flip";
import { SeedCoach } from "./SeedCoach";
import { ShopPicker } from "./ShopPicker";
import { t } from "@/lib/copy";
import { RadarButton } from "@/components/ui/RadarButton";
import { captureFix, stampLine, type CaptureFix } from "@/lib/camera/seed";
import { uploadBookSession, type BookShot } from "@/lib/book/builder";
import { DEMO_ZONE_FALLBACK } from "@/lib/demo/zone";
import { stageSnapFile } from "@/lib/snap/handoff";
import {
  COACH_TIMEOUT_MS,
  canAddShot,
  coachToast,
  doneEnabled,
  nearbyShops,
  parseCoach,
  seenChips,
} from "@/lib/seed/coach";
import { createClient } from "@/lib/supabase/client";

type Phase = "camera" | "pick" | "seed" | "name" | "building";
type Lang = "en" | "th";
type Picked = { id: string; slug: string; name: string };
type NearShop = Picked & { distanceM: number };
type SeedShot = {
  id: string;
  url: string;
  file: File;
  index: number;
  contains: string[];
  fix: CaptureFix;
};
type ToastState = { text: string; duplicateOf: number | null; shotId: string };

async function lookupDemoPoint(): Promise<{ lat: number; lng: number } | null> {
  try {
    const supabase = createClient();
    const account = await supabase.from("demo_accounts").select("role").limit(1);
    if (account.error || (account.data?.length ?? 0) === 0) return null;
    const zone = await supabase.rpc("demo_zone");
    const row = Array.isArray(zone.data) ? zone.data[0] : null;
    if (row && typeof row.lat === "number" && typeof row.lng === "number") return { lat: row.lat, lng: row.lng };
    return { lat: DEMO_ZONE_FALLBACK.lat, lng: DEMO_ZONE_FALLBACK.lng };
  } catch {
    return null;
  }
}

function locate(): Promise<{ lat: number; lng: number; accuracy: number | null } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
        }),
      () => resolve(null),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 8_000 },
    );
  });
}

function here(): Promise<CaptureFix | null> {
  return captureFix({ lookupDemo: lookupDemoPoint, locate });
}

function asNear(value: unknown): NearShop[] {
  if (!value || typeof value !== "object") return [];
  const shops = (value as { shops?: unknown }).shops;
  if (!Array.isArray(shops)) return [];
  const parsed: NearShop[] = [];
  for (const shop of shops) {
    if (!shop || typeof shop !== "object") continue;
    const row = shop as { id?: unknown; slug?: unknown; name?: unknown; distanceM?: unknown };
    if (typeof row.id !== "string" || typeof row.name !== "string" || typeof row.distanceM !== "number") continue;
    parsed.push({
      id: row.id,
      slug: typeof row.slug === "string" && row.slug ? row.slug : row.id,
      name: row.name,
      distanceM: row.distanceM,
    });
  }
  return nearbyShops(parsed);
}

export function LiveCamera({
  preselected = null,
  startSeeding = false,
}: {
  preselected?: { id: string; name: string } | null;
  startSeeding?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const facingRef = useRef<Facing>(facingForSession());
  const alive = useRef(true);
  const shotsRef = useRef<SeedShot[]>([]);
  const fixRef = useRef<CaptureFix | null>(null);
  const nameGuessRef = useRef("");
  const langRef = useRef<Lang>("en");
  const boot = useRef(false);
  const facedSeed = useRef(false);
  const [facing, setFacing] = useState<Facing>(facingForSession());
  const [cameraCount, setCameraCount] = useState<number | null>(null);
  const [flipFailed, setFlipFailed] = useState(false);
  const [phase, setPhase] = useState<Phase>("camera");
  const [choices, setChoices] = useState<NearShop[]>([]);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [shots, setShots] = useState<SeedShot[]>([]);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [draftName, setDraftName] = useState(preselected?.name ?? "");
  const [lang, setLang] = useState<Lang>("en");
  const [liveFile, setLiveFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  function commitShots(next: SeedShot[]) {
    shotsRef.current = next;
    setShots(next);
  }

  useEffect(() => {
    langRef.current = lang;
  }, [lang]);

  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("th")) setLang("th");
  }, []);

  useEffect(() => {
    alive.current = true;
    let stopped = false;
    const video = videoRef.current;
    const opening = facingRef.current;
    void navigator.mediaDevices
      .getUserMedia(cameraConstraints(opening))
      .then(async (stream) => {
        if (stopped || !alive.current) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }
        let active = stream;
        if (facingRef.current !== opening) {
          const adopted = await adoptFacing(facingRef.current, opening, stream, (constraints) =>
            navigator.mediaDevices.getUserMedia(constraints),
          );
          if (stopped || !alive.current) {
            for (const track of adopted.stream.getTracks()) track.stop();
            return;
          }
          active = adopted.stream;
        }
        streamRef.current = active;
        if (video) {
          video.srcObject = active;
          void video.play();
        }
        void navigator.mediaDevices.enumerateDevices().then((devices) => {
          if (stopped) return;
          setCameraCount(devices.filter((device) => device.kind === "videoinput").length);
        }).catch(() => undefined);
      })
      .catch(() => setNote("The camera did not open."));
    return () => {
      stopped = true;
      alive.current = false;
      for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    };
  }, []);

  useEffect(() => {
    if (phase !== "seed" || facedSeed.current) return;
    facedSeed.current = true;
    const stream = streamRef.current;
    if (!stream || facingRef.current === "environment") {
      facingRef.current = "environment";
      rememberFacing("environment");
      setFacing("environment");
      return;
    }
    let cancel = false;
    void adoptFacing("environment", facingRef.current, stream, (constraints) =>
      navigator.mediaDevices.getUserMedia(constraints),
    ).then((result) => {
      if (cancel || !alive.current) {
        if (result.stream !== stream) {
          for (const track of result.stream.getTracks()) track.stop();
        }
        return;
      }
      if (!result.ok) return;
      streamRef.current = result.stream;
      facingRef.current = result.facing;
      setFacing(result.facing);
      const video = videoRef.current;
      if (video) {
        video.srcObject = result.stream;
        void video.play();
      }
    });
    return () => {
      cancel = true;
    };
  }, [phase]);

  useEffect(() => {
    if (liveFile) return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    void video.play();
  }, [liveFile]);

  useEffect(() => {
    if (!startSeeding || boot.current) return;
    boot.current = true;
    void openPicker();
  }, [startSeeding]);

  async function grab(fix: CaptureFix): Promise<File> {
    const video = videoRef.current;
    const fitted = captureSize(video?.videoWidth ?? 0, video?.videoHeight ?? 0);
    const canvas = document.createElement("canvas");
    const width = fitted.width;
    const height = fitted.height;
    if (!video || width < 1 || height < 1) throw new Error("frame");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("frame");
    drawUnmirrored(context, video, width, height);
    const line = stampLine(fix);
    context.fillStyle = "rgba(0,0,0,0.55)";
    context.fillRect(0, height - 40, width, 40);
    context.fillStyle = "#fff";
    context.font = "16px sans-serif";
    context.fillText(line, 12, height - 14);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) throw new Error("jpeg");
    return new File([blob], `shot-${fix.at}.jpg`, { type: "image/jpeg" });
  }

  async function openPicker() {
    if (busy) return;
    setNote("");
    const fix = await here();
    if (!fix) {
      setNote("Location is required for a shot.");
      return;
    }
    fixRef.current = fix;
    let shops: NearShop[] = [];
    try {
      const response = await fetch("/api/shops/near?lat=" + encodeURIComponent(String(fix.lat)) + "&lng=" + encodeURIComponent(String(fix.lng)));
      shops = asNear(await response.json().catch(() => null));
    } catch {
      shops = [];
    }
    setChoices(shops);
    setPhase("pick");
  }

  function askCoach(shot: SeedShot, previous: { index: number; contains: string[] }[]) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), COACH_TIMEOUT_MS);
    const form = new FormData();
    form.set("image", shot.file, "seed.jpg");
    form.set("previous", JSON.stringify(previous));
    form.set("index", String(shot.index));
    void fetch("/api/seed/check", { method: "POST", body: form, signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json();
      })
      .then((body) => {
        const read = parseCoach(body, shot.index);
        if (!read || !shotsRef.current.some((item) => item.id === shot.id)) return;
        commitShots(
          shotsRef.current.map((item) => (item.id === shot.id ? { ...item, contains: read.contains } : item)),
        );
        if (read.name_guess) nameGuessRef.current = read.name_guess;
        const next = coachToast(read, langRef.current);
        setToast(next ? { ...next, shotId: shot.id } : null);
      })
      .catch(() => undefined)
      .finally(() => clearTimeout(timer));
  }

  async function shoot() {
    if (busy) return;
    if (phase === "camera") {
      setNote("");
      const fix = await here();
      if (!fix) {
        setNote("Location is required for a shot.");
        return;
      }
      let file: File;
      try {
        file = await grab(fix);
      } catch {
        setNote("That frame did not save.");
        return;
      }
      stageSnapFile(file);
      setLiveFile(file);
      return;
    }
    if (phase !== "seed" || !canAddShot(shotsRef.current.length)) return;
    setNote("");
    const fix = (await here()) ?? fixRef.current;
    if (!fix) {
      setNote("Location is required for a shot.");
      return;
    }
    let file: File;
    try {
      file = await grab(fix);
    } catch {
      setNote("That frame did not save.");
      return;
    }
    const index = shotsRef.current.reduce((max, shot) => Math.max(max, shot.index), 0) + 1;
    const shot: SeedShot = {
      id: crypto.randomUUID(),
      url: URL.createObjectURL(file),
      file,
      index,
      contains: [],
      fix,
    };
    const previous = shotsRef.current.map((item) => ({ index: item.index, contains: item.contains }));
    commitShots([...shotsRef.current, shot]);
    askCoach(shot, previous);
  }

  function removeShot(id: string) {
    const target = shotsRef.current.find((shot) => shot.id === id);
    if (target) URL.revokeObjectURL(target.url);
    commitShots(shotsRef.current.filter((shot) => shot.id !== id));
    setToast((current) => (current && current.shotId === id ? null : current));
  }

  function finishSeed() {
    if (busy || !doneEnabled(shotsRef.current.length)) return;
    if (!picked) {
      setDraftName((current) => nameGuessRef.current || current.trim());
      setPhase("name");
      return;
    }
    void save(picked);
  }

  async function save(shop: Picked | null) {
    if (busy) return;
    setBusy(true);
    setPhase("building");
    setNote("");
    try {
      let target = shop;
      let createdHere = false;
      if (!target) {
        const name = draftName.trim() || nameGuessRef.current.trim();
        if (name.length < 2) {
          setNote("Name the shop before Done.");
          setPhase("name");
          return;
        }
        const place = fixRef.current ?? shotsRef.current[0]?.fix;
        if (!place) return;
        const response = await fetch("/api/shops", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            nameLocal: "",
            category: "other",
            lat: place.lat,
            lng: place.lng,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
        });
        const body = (await response.json().catch(() => null)) as {
          id?: string;
          slug?: string;
          shop?: { id?: string; slug?: string };
          shops?: { id?: string; slug?: string; name?: string }[];
        } | null;
        if (response.status === 401) {
          setNote("Sign in to save.");
          setPhase("name");
          return;
        }
        const joined = response.status === 409 ? body?.shops?.[0] : undefined;
        if (joined?.id) {
          target = { id: joined.id, slug: joined.slug || joined.id, name: joined.name || name };
        } else {
          const id = body?.shop?.id ?? body?.id;
          if (!response.ok || !id) {
            setNote("The shop was not created.");
            setPhase("name");
            return;
          }
          target = { id, slug: body?.shop?.slug ?? body?.slug ?? id, name };
          createdHere = true;
        }
        setPicked(target);
      }
      const bookShots: BookShot[] = shotsRef.current.map((shot) => ({
        id: shot.id,
        kind: "auto",
        file: shot.file,
      }));
      const result = await uploadBookSession(target.id, bookShots, fetch, undefined, createdHere);
      if (result.status === 401) {
        setNote("Sign in to save.");
        setPhase(shop ? "seed" : "name");
        return;
      }
      if (result.status >= 400) {
        setNote("The book did not save.");
        setPhase(shop ? "seed" : "name");
        return;
      }
      window.location.assign("/book/" + encodeURIComponent(target.slug));
    } catch {
      setNote("The book did not save.");
      setPhase(shop ? "seed" : "name");
    } finally {
      setBusy(false);
    }
  }

  async function flip() {
    const currentStream = streamRef.current;
    if (!currentStream || flipControl(cameraCount, flipFailed) !== "show") return;
    const result = await flipStream(facingRef.current, currentStream, (constraints) =>
      navigator.mediaDevices.getUserMedia(constraints),
    );
    if (!alive.current) {
      if (result.stream !== currentStream) {
        for (const track of result.stream.getTracks()) track.stop();
      }
      return;
    }
    if (!result.ok) {
      setFlipFailed(true);
      const video = videoRef.current;
      if (video && video.srcObject !== currentStream) {
        video.srcObject = currentStream;
        void video.play();
      }
      return;
    }
    streamRef.current = result.stream;
    facingRef.current = result.facing;
    setFacing(result.facing);
    const video = videoRef.current;
    if (video) {
      video.srcObject = result.stream;
      void video.play();
    }
  }

  const flipMode = flipControl(cameraCount, flipFailed);
  const chips = seenChips(shots);

  if (liveFile) {
    return (
      <div className="fixed inset-0 z-40 overflow-y-auto bg-bg p-4">
        <button type="button" className="mb-3 min-h-11 text-label font-semibold text-fg" onClick={() => setLiveFile(null)}>
          ← Camera
        </button>
        <SnapFlow preselected={preselected} onRetake={() => setLiveFile(null)} />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-40 bg-black text-white">
      <video ref={videoRef} className={previewClass(facing)} autoPlay muted playsInline />
      <a className="absolute left-4 top-4 z-20 inline-flex min-h-11 min-w-11 items-center text-2xl" href="/map" aria-label="Back">
        ←
      </a>
      {phase === "camera" ? (
        <button type="button" className="seed-open" onClick={() => void openPicker()}>
          {t(lang, "seed.shop")}
        </button>
      ) : null}
      {phase === "pick" ? (
        <ShopPicker
          shops={choices}
          newLabel={t(lang, "seed.new")}
          onPick={(id) => {
            const shop = choices.find((item) => item.id === id);
            if (!shop) return;
            setPicked({ id: shop.id, slug: shop.slug, name: shop.name });
            setPhase("seed");
          }}
          onNew={() => {
            setPicked(null);
            setPhase("seed");
          }}
        />
      ) : null}
      {phase === "seed" ? (
        <SeedCoach
          seen={chips}
          labels={{
            sign: t(lang, "seed.sign"),
            menu: t(lang, "seed.menu"),
            deals: t(lang, "seed.deals"),
            hours: t(lang, "seed.hours"),
          }}
          toast={toast}
          deleteLabel={t(lang, "seed.delete")}
          shots={shots}
          doneLabel={t(lang, "seed.done").replace("{n}", String(shots.length))}
          canDone={doneEnabled(shots.length)}
          onDelete={removeShot}
          onDone={finishSeed}
        />
      ) : null}
      {phase === "name" ? (
        <form
          className="seed-name"
          onSubmit={(event) => {
            event.preventDefault();
            void save(null);
          }}
        >
          <label>
            <span>{t(lang, "seed.name")}</span>
            <input value={draftName} onChange={(event) => setDraftName(event.target.value)} />
          </label>
          <button type="submit" disabled={busy}>
            {t(lang, "seed.done").replace("{n}", String(shots.length))}
          </button>
        </form>
      ) : null}
      {phase === "building" ? (
        <div className="seed-build">
          <p>{t(lang, "seed.building")}</p>
          <div className="seed-skel" />
        </div>
      ) : null}
      {phase === "camera" || phase === "seed" ? (
        <RadarButton label="Take a photo" className="absolute bottom-8 left-1/2 -translate-x-1/2" onClick={() => void shoot()} />
      ) : null}
      {flipMode === "hide" ? null : (
        <button
          type="button"
          className="camera-flip"
          aria-label={t("en", "snap.flip")}
          disabled={flipMode === "disable"}
          onClick={() => void flip()}
        >
          <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
            <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M7 7h9a4 4 0 0 1 0 8H8" />
            <path fill="currentColor" d="M7 3.5 3 7.5 7 11.5z" />
            <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M17 17H8a4 4 0 0 1 0-8h8" />
            <path fill="currentColor" d="M17 20.5 21 16.5 17 12.5z" />
          </svg>
        </button>
      )}
      {note ? <p className="absolute inset-x-4 bottom-32 z-20 text-center text-body">{note}</p> : null}
    </div>
  );
}
