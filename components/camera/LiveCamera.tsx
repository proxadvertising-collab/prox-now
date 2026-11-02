"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { cameraStart, shutterAction } from "@/lib/camera/camera-gate";
import { captureFix, stampLine, type CaptureFix } from "@/lib/camera/seed";
import { getFix } from "@/lib/geo/fix-cache";
import { bookSavePlan, uploadBookSession, type BookShot } from "@/lib/book/builder";
import { resizeToJpeg } from "@/lib/image/resize";
import { afterPin, chooseShotPlace, frameSaveKey } from "@/lib/snap/where";
import { PinDrop } from "@/components/camera/PinDrop";
import { PLACEHOLDER_SHOP_NAME, seedBookPath } from "@/lib/book/seedName";
import { waitForBook } from "@/lib/book/waitBook";
import { SkeletonCards } from "@/components/ui/SkeletonCards";
import { DEMO_ZONE_FALLBACK } from "@/lib/demo/zone";
import { BuildProgress } from "@/components/book/BuildProgress";
import { BookReadMiss } from "@/components/book/BookReadMiss";
import { DEMO_CAFES, demoShopTarget, explainer, judgeSampleSave, readTour } from "@/lib/judge/script";
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

type Phase = "camera" | "pick" | "seed" | "building";
type Lang = "en" | "th";
type Picked = { id: string; slug: string; name: string };
type NearShop = Picked & { distanceM: number; lat?: number; lng?: number };
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
  return getFix({ userAction: true });
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
    const row = shop as { id?: unknown; slug?: unknown; name?: unknown; distanceM?: unknown; lat?: unknown; lng?: unknown };
    if (typeof row.id !== "string" || typeof row.name !== "string" || typeof row.distanceM !== "number") continue;
    parsed.push({
      id: row.id,
      slug: typeof row.slug === "string" && row.slug ? row.slug : row.id,
      name: row.name,
      distanceM: row.distanceM,
      ...(typeof row.lat === "number" && typeof row.lng === "number" ? { lat: row.lat, lng: row.lng } : {}),
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
  const router = useRouter();
  const openCameraRef = useRef<(() => void) | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const facingRef = useRef<Facing>(facingForSession());
  const alive = useRef(true);
  const shotsRef = useRef<SeedShot[]>([]);
  const fixRef = useRef<CaptureFix | null>(null);
  const langRef = useRef<Lang>("en");
  const boot = useRef(false);
  const samplesOnce = useRef(false);
  const sampleNoteShown = useRef(false);
  const loadSamplesRef = useRef<() => Promise<boolean>>(async () => false);
  const facedSeed = useRef(false);
  const [facing, setFacing] = useState<Facing>(facingForSession());
  const [cameraCount, setCameraCount] = useState<number | null>(null);
  const [flipFailed, setFlipFailed] = useState(false);
  const [phase, setPhase] = useState<Phase>("camera");
  const [choices, setChoices] = useState<NearShop[]>([]);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [shots, setShots] = useState<SeedShot[]>([]);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [lang, setLang] = useState<Lang>("en");
  const [liveFile, setLiveFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [readAgain, setReadAgain] = useState(false);
  const [retryShot, setRetryShot] = useState(false);
  const [cameraClosed, setCameraClosed] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [askWhere, setAskWhere] = useState(false);
  const [askJoin, setAskJoin] = useState<Picked | null>(null);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const pinRef = useRef<{ lat: number; lng: number } | null>(null);
  const pendingUploads = useRef<File[] | null>(null);
  const pendingPick = useRef(false);
  const shopPointRef = useRef<{ lat: number; lng: number; name: string } | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("samples") !== "1" || readTour()?.role !== "shopper") return;
    let stopped = false;
    let running = false;
    const attempt = async () => {
      if (stopped || samplesOnce.current || running) return;
      running = true;
      try {
        const ok = await loadSamplesRef.current();
        if (ok) samplesOnce.current = true;
      } finally {
        running = false;
      }
    };
    void attempt();
    const timer = window.setInterval(() => {
      if (samplesOnce.current) {
        window.clearInterval(timer);
        return;
      }
      void attempt();
    }, 1000);
    const stop = window.setTimeout(() => {
      stopped = true;
      window.clearInterval(timer);
    }, 30_000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.clearTimeout(stop);
    };
  }, []);

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
    function openCamera() {
      if (streamRef.current || stopped) return;
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraClosed(true);
        return;
      }
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
            void video.play().then(() => {
              if (!stopped) setCameraReady(true);
            }).catch(() => setCameraClosed(true));
          }
          void navigator.mediaDevices.enumerateDevices().then((devices) => {
            if (stopped) return;
            setCameraCount(devices.filter((device) => device.kind === "videoinput").length);
          }).catch(() => undefined);
        })
        .catch(() => setCameraClosed(true));
    }
    openCameraRef.current = openCamera;
    void (async () => {
      let perm: "granted" | "prompt" | "denied" | null = null;
      try {
        const status = await navigator.permissions?.query({ name: "camera" as PermissionName });
        const state = status?.state;
        perm = state === "granted" || state === "prompt" || state === "denied" ? state : null;
      } catch {
        perm = null;
      }
      if (stopped) return;
      const gate = cameraStart(perm);
      if (gate === "closed") {
        setCameraClosed(true);
        return;
      }
      if (gate === "auto") openCamera();
    })();
    return () => {
      stopped = true;
      alive.current = false;
      openCameraRef.current = null;
      for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    };
  }, []);

  useEffect(() => {
    if (phase !== "seed" || facedSeed.current) return;
    facedSeed.current = true;
    const stream = streamRef.current;
    if (!stream || facingRef.current === "environment" || stream.getVideoTracks()[0]?.getSettings().facingMode === "environment") {
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

  async function placeForShot(): Promise<CaptureFix | null> {
    const fix = await here();
    if (fix) return fix;
    const at = new Date().toISOString();
    const chosen = chooseShotPlace({
      at,
      gps: null,
      demo: null,
      pin: pinRef.current,
      shop: shopPointRef.current,
    });
    if (!chosen) {
      setAskWhere(true);
      return null;
    }
    return { lat: chosen.lat, lng: chosen.lng, accuracy: null, at: chosen.at, source: chosen.source };
  }

  async function openPicker(known?: CaptureFix) {
    if (busy) return;
    setNote("");
    setRetryShot(false);
    const fix = known ?? (await placeForShot());
    if (!fix) {
      pendingPick.current = true;
      return;
    }
    pendingPick.current = false;
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
      setRetryShot(false);
      const fix = await placeForShot();
      if (!fix) return;
      let file: File;
      try {
        file = await grab(fix);
      } catch (error) {
        setNote(t(lang, frameSaveKey(error)));
        setRetryShot(true);
        return;
      }
      stageSnapFile(file);
      setLiveFile(file);
      return;
    }
    if (phase !== "seed" || !canAddShot(shotsRef.current.length)) return;
    setNote("");
    setRetryShot(false);
    const fix = (await placeForShot()) ?? fixRef.current;
    if (!fix) return;
    let file: File;
    try {
      file = await grab(fix);
    } catch (error) {
      setNote(t(lang, frameSaveKey(error)));
      setRetryShot(true);
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

  async function loadSamples(): Promise<boolean> {
    const fix = (await placeForShot()) ?? fixRef.current;
    if (!fix) {
      if (!sampleNoteShown.current) {
        sampleNoteShown.current = true;
        setNote("Turn on location to use sample photos");
      }
      return false;
    }
    sampleNoteShown.current = false;
    const tour = readTour();
    const cafe = DEMO_CAFES[tour?.cafe ?? "a"];
    const files: File[] = [];
    for (const url of cafe.photos) {
      const response = await fetch(url);
      if (!response.ok) continue;
      const blob = await response.blob();
      files.push(new File([blob], "sample-menu.jpg", { type: blob.type || "image/jpeg" }));
    }
    if (files.length === 0) return false;
    setPhase("seed");
    await keepUploads(files, fix, true, false);
    return true;
  }

  loadSamplesRef.current = loadSamples;

  async function keepUploads(files: readonly File[], fix: CaptureFix, seed = phase === "seed", coach = true) {
    fixRef.current = fix;
    try {
      if (seed) {
        let next = shotsRef.current;
        for (const file of files) {
          if (!canAddShot(next.length)) break;
          const jpeg = await resizeToJpeg(file);
          const saved = new File([jpeg], "upload-" + Date.now() + ".jpg", { type: "image/jpeg" });
          const index = next.reduce((max, shot) => Math.max(max, shot.index), 0) + 1;
          const shot: SeedShot = {
            id: crypto.randomUUID(),
            url: URL.createObjectURL(saved),
            file: saved,
            index,
            contains: [],
            fix,
          };
          if (coach) askCoach(shot, next.map((item) => ({ index: item.index, contains: item.contains })));
          next = [...next, shot];
        }
        commitShots(next);
        return;
      }
      const jpeg = await resizeToJpeg(files[0]);
      const saved = new File([jpeg], "upload-" + Date.now() + ".jpg", { type: "image/jpeg" });
      stageSnapFile(saved);
      setLiveFile(saved);
    } catch (error) {
      setNote(t(lang, frameSaveKey(error)));
      setRetryShot(true);
    }
  }

  async function acceptUploads(list: FileList | readonly File[] | null) {
    if (!list || list.length === 0) return;
    if (busy) {
      setNote(t(lang, "snap.busy"));
      return;
    }
    const files = Array.from(list);
    setRetryShot(false);
    if (phase === "pick") {
      pendingUploads.current = files;
      setNote(t(lang, "snap.pickFirst"));
      return;
    }
    setNote(t(lang, "snap.locating"));
    const fix = await placeForShot();
    if (!fix) {
      pendingUploads.current = files;
      setAskWhere(true);
      setNote(t(lang, "snap.where"));
      return;
    }
    pendingUploads.current = null;
    await keepUploads(files, fix);
  }

  function resumeSeedUploads() {
    const waiting = pendingUploads.current;
    const fix = fixRef.current;
    pendingUploads.current = null;
    if (waiting && waiting.length > 0 && fix) void keepUploads(waiting, fix, true);
  }

  function takePin(point: { lat: number; lng: number }) {
    pinRef.current = point;
    setAskWhere(false);
    const chosen = chooseShotPlace({
      at: new Date().toISOString(),
      gps: null,
      demo: null,
      pin: point,
      shop: shopPointRef.current,
    });
    if (!chosen) return;
    const fix: CaptureFix = { lat: chosen.lat, lng: chosen.lng, accuracy: null, at: chosen.at, source: chosen.source };
    const next = afterPin({ pickerWaiting: pendingPick.current, uploadsWaiting: pendingUploads.current?.length ?? 0 });
    if (next === "picker") {
      void openPicker(fix);
      return;
    }
    if (next !== "uploads") return;
    const waiting = pendingUploads.current ?? [];
    pendingUploads.current = null;
    void keepUploads(waiting, fix);
  }


  function removeShot(id: string) {
    const target = shotsRef.current.find((shot) => shot.id === id);
    if (target) URL.revokeObjectURL(target.url);
    commitShots(shotsRef.current.filter((shot) => shot.id !== id));
    setToast((current) => (current && current.shotId === id ? null : current));
  }

  function finishSeed() {
    if (busy || !doneEnabled(shotsRef.current.length)) return;
    void save(picked);
  }

  async function save(shop: Picked | null, force = false) {
    if (busy || saving.current) return;
    saving.current = true;
    setAskJoin(null);
    setBusy(true);
    setPhase("building");
    setReadAgain(false);
    setNote("");
    try {
      let target = shop;
      let createdHere = false;
      const tour = readTour();
      const judged = force ? null : judgeSampleSave(tour);
      if (!target && judged && tour) {
        const supabase = createClient();
        const found = await supabase
          .from("shops")
          .select("id, slug, name")
          .eq("slug", judged.shop)
          .eq("is_demo", true)
          .maybeSingle();
        const resolved = demoShopTarget(judged.shop, found.data);
        if (!resolved) {
          setNote("The book did not save.");
          setPhase("seed");
          return;
        }
        target = resolved;
        setPicked(resolved);
      } else if (!target) {
        const name = PLACEHOLDER_SHOP_NAME;
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
            force,
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
          setPhase("seed");
          return;
        }
        const joined = !force && response.status === 409 ? body?.shops?.[0] : undefined;
        if (joined?.id) {
          setAskJoin({ id: joined.id, slug: joined.slug || joined.id, name: joined.name || name });
          setPhase("seed");
          return;
        } else {
          const id = body?.shop?.id ?? body?.id;
          if (!response.ok || !id) {
            setNote("The shop was not created.");
            setPhase("seed");
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
      const saveFor = target;
      const startedAt = new Date().toISOString();
      const result = await uploadBookSession(
        saveFor.id,
        bookShots,
        fetch,
        createdHere ? undefined : "improve",
        createdHere,
      ).catch(() => null);
      const plan = bookSavePlan(result);
      if (plan === "again") {
        setReadAgain(true);
        return;
      }
      if (plan === "probe") {
        const supabase = createClient();
        const userId = (await supabase.auth.getUser().catch(() => null))?.data.user?.id ?? null;
        const slug = await waitForBook(saveFor.id, async (shopId) => {
          const client = createClient();
          const [book, row, pages, writes] = await Promise.all([
            client.from("shop_books").select("status").eq("shop_id", shopId).maybeSingle(),
            client.from("shops").select("slug").eq("id", shopId).maybeSingle(),
            userId
              ? client
                  .from("shop_book_pages")
                  .select("id")
                  .eq("shop_id", shopId)
                  .eq("contributed_by", userId)
                  .gte("created_at", startedAt)
                  .limit(1)
              : Promise.resolve({ data: [] as { id: string }[] }),
            userId
              ? client
                  .from("shop_book_writes")
                  .select("id")
                  .eq("shop_id", shopId)
                  .eq("user_id", userId)
                  .gte("created_at", startedAt)
                  .limit(1)
              : Promise.resolve({ data: [] as { id: string }[] }),
          ]);
          const fresh =
            (Array.isArray(pages.data) && pages.data.length > 0) ||
            (Array.isArray(writes.data) && writes.data.length > 0);
          return {
            live: book.data?.status === "live" && fresh,
            slug: (row.data?.slug as string | undefined) ?? null,
          };
        });
        const late = slug ? seedBookPath(saveFor.id, saveFor.slug, slug) : null;
        if (late) {
          router.push(late + "?seeded=1");
          return;
        }
        setNote("The book did not save.");
        setPhase("seed");
        return;
      }
      if (!result) return;
      if (plan === "signin") {
        setNote("Sign in to save.");
        setPhase("seed");
        return;
      }
      if (plan === "fail") {
        const error = result.body && typeof result.body === "object" ? (result.body as { error?: unknown }).error : null;
        setNote(result.status === 403 && error === "not_owner" ? "The owner manages this shop's book." : "The book did not save.");
        setPhase("seed");
        return;
      }
      const body = result.body as { slug?: unknown } | null;
      const readSlug = body && typeof body.slug === "string" ? body.slug : null;
      const next = seedBookPath(target.id, target.slug, readSlug);
      if (!next) {
        setNote("The book did not save.");
        setPhase("seed");
        return;
      }
      const place = fixRef.current ?? shotsRef.current[0]?.fix;
      const params = new URLSearchParams({ seeded: "1" });
      if (place) {
        params.set("lat", String(place.lat));
        params.set("lng", String(place.lng));
      }
      router.push(next + "?" + params.toString());
    } catch {
      setNote("The book did not save.");
      setPhase("seed");
    } finally {
      saving.current = false;
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

  function pressShutter() {
    const action = shutterAction({
      streamOpen: streamRef.current != null,
      cameraClosed,
      phase,
      reviewing: liveFile != null,
    });
    if (action === "open") {
      openCameraRef.current?.();
      return;
    }
    if (action === "upload") {
      uploadRef.current?.click();
      return;
    }
    if (action === "shoot") void shoot();
  }

  function shutterRow() {
    return (
      <div className="snap-shutter">
        <button type="button" className="btn-secondary min-h-12" onClick={() => uploadRef.current?.click()}>
          {t(lang, "snap.upload")}
        </button>
        <RadarButton label="Take a photo" size={64} onClick={pressShutter} />
      </div>
    );
  }

  function whereSheet(reviewing: boolean) {
    if (!askWhere) return null;
    const shop = shopPointRef.current;
    return (
      <div
        className={
          (reviewing
            ? "fixed inset-x-4 z-40 bottom-[calc(13rem+env(safe-area-inset-bottom))] "
            : "absolute inset-x-4 bottom-8 z-30 ") +
          "flex flex-col gap-2 rounded-lg border border-border bg-surface-1 p-3 text-fg"
        }
      >
        <p className="text-body">{t(lang, "snap.where")}</p>
        {shop ? (
          <button
            type="button"
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-surface-2 px-3 text-sm font-semibold text-fg"
            onClick={() => {
              const here = shopPointRef.current;
              if (!here) return;
              takePin({ lat: here.lat, lng: here.lng });
            }}
          >
            {t(lang, "snap.useShop", { name: shop.name })}
          </button>
        ) : null}
        <PinDrop
          onPick={(point) => {
            takePin(point);
          }}
        />
      </div>
    );
  }

  const onTour = Boolean(readTour());
  return (
    <>
    <div className={"fixed inset-x-0 top-0 z-10 bg-bg text-fg bottom-[calc(7.5rem+env(safe-area-inset-bottom))] md:bottom-0" + (onTour ? " snap-tour" : "") + (liveFile ? " pointer-events-none" : "")}>
      <video
        ref={videoRef}
        className={(liveFile ? "pointer-events-none opacity-0 " : "") + previewClass(facing)}
        autoPlay
        muted
        playsInline
      />
      {!liveFile ? (
      <>
      {!cameraReady && !cameraClosed ? (
        <div className="absolute inset-0 z-10 bg-bg p-4 pt-20">
          <SkeletonCards />
        </div>
      ) : null}
      <Link className="absolute left-4 top-4 z-20 inline-flex min-h-11 min-w-11 items-center text-2xl text-white" href="/map" aria-label="Back" style={onTour ? { top: "calc(1rem + var(--tour-bar, 0px))" } : undefined}>
        ←
      </Link>
      {onTour ? null : (
        <p className="pointer-events-none absolute inset-x-4 top-16 z-20 truncate whitespace-nowrap text-sm text-white">
          {explainer("seed").body}
        </p>
      )}
      {phase === "camera" ? (
        <button type="button" className="seed-open" onClick={() => void openPicker()}>
          {t(lang, "seed.shop")}
        </button>
      ) : null}
      {phase === "pick" ? (
        <ShopPicker
          shops={choices}
          heading={t(lang, "snap.which")}
          newLabel={t(lang, "seed.new")}
          onPick={(id) => {
            const shop = choices.find((item) => item.id === id);
            if (!shop) return;
            setPicked({ id: shop.id, slug: shop.slug, name: shop.name });
            if (typeof shop.lat === "number" && typeof shop.lng === "number") {
              shopPointRef.current = { lat: shop.lat, lng: shop.lng, name: shop.name };
            }
            setPhase("seed");
            resumeSeedUploads();
          }}
          onNew={() => {
            setPicked(null);
            setPhase("seed");
            resumeSeedUploads();
          }}
        />
      ) : null}
      {askJoin && phase === "seed" ? (
        <div className="absolute inset-x-4 bottom-36 z-30 flex flex-col gap-2 rounded-lg bg-surface-1 p-3">
          <p className="text-sm text-fg">{t(lang, "confirm.named", { name: askJoin.name })}</p>
          <button type="button" className="btn-primary min-h-12 w-full" onClick={() => void save(askJoin)}>
            {t(lang, "confirm.yes")}
          </button>
          <button
            type="button"
            className="inline-flex min-h-12 items-center justify-center rounded-md border border-line px-4 text-sm font-semibold text-fg"
            onClick={() => void save(null, true)}
          >
            {t(lang, "confirm.different")}
          </button>
        </div>
      ) : null}
      {phase === "seed" && onTour && readTour()?.role === "shopper" ? (
        <button
          type="button"
          className="absolute top-[7.5rem] inset-x-0 z-20 mx-auto inline-flex min-h-11 w-fit items-center rounded-full bg-accent-soft px-4 text-sm font-semibold text-accent"
          style={{ top: "calc(7.5rem + var(--tour-bar, 0px))" }}
          onClick={() => void loadSamples()}
        >
          Use pre-seeded photos
        </button>
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
      {phase === "building" ? (
        <div className="seed-build">
          {readAgain ? <BookReadMiss onAgain={() => void save(picked)} /> : <BuildProgress />}
        </div>
      ) : null}
      {flipMode === "hide" || cameraClosed || !cameraReady ? null : (
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
      {whereSheet(false)}
      {note ? (
        <div className="absolute inset-x-4 bottom-32 z-20 flex flex-col items-center gap-2">
          <p className="text-center text-body">{note}</p>
          {retryShot ? (
            <button type="button" className="inline-flex min-h-11 items-center rounded-md border border-border bg-surface-2 px-4 text-sm font-semibold text-fg" onClick={() => void shoot()}>
              {t(lang, "snap.retry")}
            </button>
          ) : null}
        </div>
      ) : null}
      </>
      ) : null}
    </div>
    {liveFile ? (
      <>
        <div className="fixed inset-x-0 top-0 z-20 overflow-y-auto bg-bg p-4 bottom-[calc(13rem+env(safe-area-inset-bottom))]">
          <button type="button" className="mb-3 min-h-11 text-label font-semibold text-fg" onClick={() => setLiveFile(null)}>
            ← Camera
          </button>
          <SnapFlow
            preselected={preselected}
            placed={
              fixRef.current
                ? { lat: fixRef.current.lat, lng: fixRef.current.lng, source: fixRef.current.source ?? "gps" }
                : null
            }
            onRetake={() => setLiveFile(null)}
          />
        </div>
        {whereSheet(true)}
      </>
    ) : null}
    {shutterRow()}
    <input
      ref={uploadRef}
      type="file"
      accept="image/*"
      multiple
      className="sr-only"
      onChange={(event) => {
        const files = Array.from(event.target.files ?? []);
        event.target.value = "";
        void acceptUploads(files);
      }}
    />
    </>
  );
}
