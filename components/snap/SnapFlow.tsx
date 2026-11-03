"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { DemoBanner } from "@/components/ui/DemoBanner";
import { RadarButton } from "@/components/ui/RadarButton";
import { LocationHelp } from "@/components/ui/LocationHelp";
import { t, type CopyKey } from "@/lib/copy";
import { DEMO_ZONE_FALLBACK, nearestDemoShop } from "@/lib/demo/zone";
import { readTour } from "@/lib/judge/script";
import { getFix } from "@/lib/geo/fix-cache";
import { locate, type LocateResult } from "@/lib/geo/locate";
import { createClient } from "@/lib/supabase/client";
import { resizeToJpeg } from "@/lib/image/resize";
import { FaceChooser, PublishPreview } from "@/components/snap/FaceChooser";
import { cleanFaceBoxes, showFacesPayload, toggleShown, type NormBox } from "@/lib/snap/faces";
import { buildOriginalSave, dropOriginalMemory } from "@/lib/snap/original";
import { postStandIn } from "@/lib/snap/place";
import { firstShopName, SHOP_CATEGORIES, shopNameCandidate, type ShopCategory } from "@/lib/snap/prefill";
import { ScenePanel } from "@/components/snap/ScenePanel";
import { BEHIND_KEY, showBehind } from "@/lib/snap/behind";
import { subscribeSnapFile, takeSnapFile } from "@/lib/snap/handoff";
import { bookBuildHref } from "@/lib/book/builder";
import { snapShopHref } from "@/lib/snap/target";
import { analyzeFailure, prependSteps, sceneForPickedShop, type SceneReport } from "@/lib/snap/scene";
import { livePostErrorKey } from "@/lib/snap/publish";

type ShopCard = {
  id: string;
  name: string;
  nameLocal?: string | null;
  distanceM: number;
};

type SignLine = { original: string; translated: string };

type NoMatch = "which_shop" | "add_shop" | "not_a_place" | "public_place" | "retake";

type ProposedPlace = {
  name: string;
  nameLocal: string | null;
  category: ShopCategory;
  confidence: number;
};

type AnalyzeBody = {
  decision?: "confirm" | "pick" | "pick-all";
  noMatch?: NoMatch | null;
  picker?: ShopCard[];
  place?: ProposedPlace | null;
  result?: {
    shopId: string | null;
    confidence: number;
    category?: string;
    placeName?: string | null;
    signText?: SignLine[];
    faces?: unknown;
  };
  candidates?: ShopCard[];
  demo?: boolean;
  error?: string;
  scene?: SceneReport;
};

type Phase = "idle" | "reading" | "confirm" | "pick" | "add" | "offer" | "posted" | "away" | "retake" | "error";

type Point = { lat: number; lng: number };

type Draft = {
  name: string;
  nameLocal: string;
  category: ShopCategory;
  lat: number | null;
  lng: number | null;
  demo: boolean;
};

const DRAFT_KEY = "prox.snap.add";
const POST_KEY = "prox.snap.post";

type PostDraft = {
  shopId: string;
  name: string;
  nameLocal: string | null;
  lat: number | null;
  lng: number | null;
};

type Posted = { id: string; expiresAt: string };

function readStorage(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours + ":" + pad(minutes) + ":" + pad(seconds);
}

const CATEGORY_LABEL: Record<ShopCategory, CopyKey> = {
  street_food: "cat.street_food",
  drinks: "cat.drinks",
  restaurant: "cat.restaurant",
  fruit: "cat.fruit",
  laundry: "cat.laundry",
  home_services: "cat.home_services",
  barber: "cat.barber",
  other: "cat.other",
};

const primary =
  "inline-flex min-h-12 w-full items-center justify-center rounded-md bg-accent px-4 text-base font-semibold text-accent-ink no-underline touch-manipulation disabled:opacity-60";

const secondary =
  "inline-flex min-h-12 w-full items-center justify-center rounded-md bg-surface-2 px-4 text-base font-semibold text-fg no-underline touch-manipulation";

const field =
  "min-h-12 w-full rounded-md bg-surface-2 px-3 text-base text-fg";

function writeDraft(draft: Draft) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Private mode can block storage. The form still works for this visit.
  }
}

function clearDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // Storage can be blocked. Leaving the page still resets the form.
  }
}

function clearPostDraft() {
  try {
    sessionStorage.removeItem(POST_KEY);
  } catch {
    // Storage can be blocked. The offer still works for this visit.
  }
}

export function SnapFlow({
  preselected = null,
  onRetake,
  placed = null,
}: {
  preselected?: { id: string; name: string } | null;
  onRetake?: () => void;
  placed?: { lat: number; lng: number; source: "gps" | "pin" | "demo" } | null;
}) {
  const onFileRef = useRef<(file: File | undefined) => void>(() => undefined);
  const runRef = useRef(0);
  const fileRef = useRef<File | null>(null);
  const blobsRef = useRef<string[]>([]);
  const startedRef = useRef(0);
  const pointRef = useRef<Point | null>(placed ? { lat: placed.lat, lng: placed.lng } : null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [preview, setPreview] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [demo, setDemo] = useState(false);
  const [demoShopName, setDemoShopName] = useState("");
  const [error, setError] = useState("");
  const [candidates, setCandidates] = useState<ShopCard[]>([]);
  const [picker, setPicker] = useState<ShopCard[]>([]);
  const [askWhich, setAskWhich] = useState(false);
  const [proposed, setProposed] = useState<ProposedPlace | null>(null);
  const [awayKind, setAwayKind] = useState<"not" | "public">("not");
  const [alreadyHere, setAlreadyHere] = useState(false);
  const [guessId, setGuessId] = useState<string | null>(null);
  const [chosen, setChosen] = useState<ShopCard | null>(null);
  const [added, setAdded] = useState(false);
  const [point, setPoint] = useState<Point | null>(null);
  const [locStatus, setLocStatus] = useState<LocateResult["status"] | null>(null);
  const [name, setName] = useState("");
  const [nameLocal, setNameLocal] = useState("");
  const [category, setCategory] = useState<ShopCategory>("other");
  const [addError, setAddError] = useState("");
  const [showLogin, setShowLogin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState("");
  const [posted, setPosted] = useState<Posted | null>(null);
  const [clock, setClock] = useState(0);
  const [photoMissing, setPhotoMissing] = useState(false);
  const [faceBoxes, setFaceBoxes] = useState<NormBox[]>([]);
  const [shown, setShown] = useState<number[]>([]);
  const [friendAgrees, setFriendAgrees] = useState(false);
  const [scene, setScene] = useState<SceneReport | null>(null);
  const [behindOn, setBehindOn] = useState(false);
  const [readName, setReadName] = useState("");

  function forgetOriginal() {
    const dropped = dropOriginalMemory(blobsRef.current, (url) => URL.revokeObjectURL(url));
    blobsRef.current = dropped.urls;
    fileRef.current = dropped.file;
  }

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  useEffect(() => {
    return () => {
      fileRef.current = null;
      for (const url of blobsRef.current) URL.revokeObjectURL(url);
      blobsRef.current = [];
    };
  }, []);

  useEffect(() => {
    let stopped = false;
    const stop = subscribeSnapFile((file) => {
      if (!stopped) onFileRef.current(file);
    });
    const id = window.setTimeout(() => {
      if (stopped) return;
      const handed = takeSnapFile();
      if (handed) onFileRef.current(handed);
    }, 0);
    return () => {
      stopped = true;
      window.clearTimeout(id);
      stop();
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const queryOn = params.get("behind") === "1";
    let deviceOn = false;
    try {
      deviceOn = window.localStorage.getItem(BEHIND_KEY) === "1";
    } catch {
      deviceOn = false;
    }
    let cancelled = false;
    setBehindOn(showBehind({ demoSession: false, deviceOn, queryOn }));
    void (async () => {
      let demoSession = false;
      try {
        const supabase = createClient();
        const account = await supabase.from("demo_accounts").select("role").limit(1);
        demoSession = !account.error && (account.data?.length ?? 0) > 0;
      } catch {
        demoSession = false;
      }
      if (!cancelled) setBehindOn(showBehind({ demoSession, deviceOn, queryOn }));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (phase !== "reading") return;
    const id = window.setInterval(() => {
      setElapsed(Math.max(0, Math.round((Date.now() - startedRef.current) / 1000)));
    }, 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase !== "posted") return;
    setClock(Date.now());
    const id = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  useEffect(() => {
    const postRaw = readStorage(POST_KEY);
    if (postRaw) {
      try {
        const draft = JSON.parse(postRaw) as Partial<PostDraft>;
        if (draft && typeof draft.shopId === "string" && typeof draft.name === "string") {
          const here =
            typeof draft.lat === "number" && typeof draft.lng === "number"
              ? { lat: draft.lat, lng: draft.lng }
              : null;
          pointRef.current = here;
          setPoint(here);
          setChosen({
            id: draft.shopId,
            name: draft.name,
            nameLocal: typeof draft.nameLocal === "string" ? draft.nameLocal : null,
            distanceM: 0,
          });
          setPhotoMissing(true);
          setPostError(t("en", "post.needPhoto"));
          if (!startedRef.current) startedRef.current = Date.now();
          setPhase("offer");
          return;
        }
      } catch {
        clearPostDraft();
      }
    }
    const raw = readStorage(DRAFT_KEY);
    if (!raw) return;
    try {
      const draft = JSON.parse(raw) as Partial<Draft>;
      if (!draft || typeof draft.name !== "string") return;
      const here =
        typeof draft.lat === "number" && typeof draft.lng === "number"
          ? { lat: draft.lat, lng: draft.lng }
          : null;
      pointRef.current = here;
      setPoint(here);
      setName(draft.name);
      setNameLocal(typeof draft.nameLocal === "string" ? draft.nameLocal : "");
      setCategory(
        SHOP_CATEGORIES.includes(draft.category as ShopCategory)
          ? (draft.category as ShopCategory)
          : "other",
      );
      setDemo(Boolean(draft.demo) || !here);
      if (!startedRef.current) startedRef.current = Date.now();
      setPhase("add");
    } catch {
      clearDraft();
    }
  }, []);

  function rememberPoint(next: Point | null) {
    pointRef.current = next;
    setPoint(next);
  }

  function draftFrom(next: Partial<Draft> = {}): Draft {
    const here = pointRef.current;
    return {
      name: next.name ?? name,
      nameLocal: next.nameLocal ?? nameLocal,
      category: next.category ?? category,
      lat: next.lat !== undefined ? next.lat : here?.lat ?? null,
      lng: next.lng !== undefined ? next.lng : here?.lng ?? null,
      demo: next.demo !== undefined ? next.demo : !here,
    };
  }

  function writePostDraft(shop: ShopCard) {
    const here = pointRef.current;
    const draft: PostDraft = {
      shopId: shop.id,
      name: shop.name,
      nameLocal: shop.nameLocal ?? null,
      lat: here?.lat ?? null,
      lng: here?.lng ?? null,
    };
    try {
      sessionStorage.setItem(POST_KEY, JSON.stringify(draft));
    } catch {
      // Private mode can block storage. Sign-in then asks for a new photo.
    }
    clearDraft();
  }

  function showAway(kind: "not" | "public" = "not") {
    fileRef.current = null;
    forgetOriginal();
    clearDraft();
    clearPostDraft();
    setChosen(null);
    setCandidates([]);
    setPicker([]);
    setAskWhich(false);
    setProposed(null);
    setAwayKind(kind);
    setAlreadyHere(false);
    setGuessId(null);
    setPreview(null);
    setPhase("away");
  }

  function addThisShop() {
    const label = (proposed?.name || readName).trim();
    if (demo && !pointRef.current) {
      rememberPoint({ lat: DEMO_ZONE_FALLBACK.lat, lng: DEMO_ZONE_FALLBACK.lng });
    }
    openProposed({
      name: label,
      nameLocal: proposed?.nameLocal ?? null,
      category: proposed && SHOP_CATEGORIES.includes(proposed.category) ? proposed.category : "other",
      confidence: proposed?.confidence ?? 0.6,
    });
  }

  function rememberShop(shop: { id: string; name: string }) {
    setScene((current) => (current ? sceneForPickedShop(current, shop) : current));
  }

  function openProposed(place: ProposedPlace) {
    const nextCategory = SHOP_CATEGORIES.includes(place.category) ? place.category : "other";
    const cleaned = firstShopName(place.name, place.nameLocal) || "New shop";
    const localRaw = shopNameCandidate(place.nameLocal);
    const local = localRaw && localRaw !== "New shop" && localRaw !== cleaned ? localRaw : "";
    setName(cleaned);
    setNameLocal(local);
    setCategory(nextCategory);
    setProposed({ ...place, name: cleaned });
    setAddError("");
    setShowLogin(false);
    setAlreadyHere(false);
    setPhase("add");
    writeDraft({
      name: cleaned,
      nameLocal: local,
      category: nextCategory,
      lat: pointRef.current?.lat ?? null,
      lng: pointRef.current?.lng ?? null,
      demo: false,
    });
  }

  function showRetake() {
    fileRef.current = null;
    forgetOriginal();
    clearPostDraft();
    setChosen(null);
    setAskWhich(false);
    setPhase("retake");
  }

  function reset() {
    runRef.current += 1;
    fileRef.current = null;
    rememberPoint(null);
    clearDraft();
    clearPostDraft();
    setPhase("idle");
    setPreview(null);
    setElapsed(0);
    setDemo(false);
    setError("");
    setCandidates([]);
    setPicker([]);
    setAskWhich(false);
    setProposed(null);
    setReadName("");
    setAwayKind("not");
    setAlreadyHere(false);
    setGuessId(null);
    setChosen(null);
    setAdded(false);
    setName("");
    setNameLocal("");
    setCategory("other");
    setAddError("");
    setShowLogin(false);
    setPosting(false);
    setPostError("");
    setPosted(null);
    setPhotoMissing(false);
    setLocStatus(null);
    setFaceBoxes([]);
    setShown([]);
    setFriendAgrees(false);
    setScene(null);
    forgetOriginal();
  }

  async function askLocation() {
    const result = await locate();
    if (result.status === "ok") {
      rememberPoint(result.point);
      setLocStatus("ok");
      setDemo(false);
      writeDraft(draftFrom({ lat: result.point.lat, lng: result.point.lng, demo: false }));
      return;
    }
    rememberPoint(null);
    setLocStatus(result.status);
    setDemo(true);
  }

  async function demoSnapPoint(): Promise<{ lat: number; lng: number; name: string } | null> {
    try {
      const supabase = createClient();
      const account = await supabase.from("demo_accounts").select("role").limit(1);
      if (account.error || (account.data?.length ?? 0) === 0) return null;
      const zoneResult = await supabase.rpc("demo_zone");
      const row = Array.isArray(zoneResult.data) ? zoneResult.data[0] : null;
      const from =
        row && typeof row.lat === "number" && typeof row.lng === "number"
          ? { lat: row.lat, lng: row.lng }
          : { lat: DEMO_ZONE_FALLBACK.lat, lng: DEMO_ZONE_FALLBACK.lng };
      const shops = await supabase.from("shops").select("id, name, lat, lng, is_demo").eq("is_demo", true);
      const points = (shops.data ?? []).map((shop) => ({
        id: String(shop.id),
        name: typeof shop.name === "string" ? shop.name : "",
        lat: Number(shop.lat),
        lng: Number(shop.lng),
        isDemo: true,
      }));
      const nearest = nearestDemoShop(points, from);
      if (!nearest) return { lat: from.lat, lng: from.lng, name: "" };
      return { lat: nearest.lat, lng: nearest.lng, name: nearest.name };
    } catch {
      return null;
    }
  }

  async function analyse(file: File) {
    const run = ++runRef.current;
    setPhase("reading");
    setError("");
    setElapsed(0);
    setAdded(false);
    startedRef.current = Date.now();
    const locateStarted = Date.now();
    try {
      const demoPoint = await demoSnapPoint();
      if (run !== runRef.current) return;
      let here: Point | null = null;
      if (demoPoint) {
        here = { lat: demoPoint.lat, lng: demoPoint.lng };
        rememberPoint(here);
        setLocStatus("ok");
        setDemo(true);
        setDemoShopName(demoPoint.name);
      } else {
        const fixed = pointRef.current ?? (await getFix({ userAction: true }));
        if (run !== runRef.current) return;
        here = fixed ? { lat: fixed.lat, lng: fixed.lng } : null;
        rememberPoint(here);
        setLocStatus(here ? "ok" : "unavailable");
        setDemo(!here);
        setDemoShopName("");
      }
      const locateMs = Date.now() - locateStarted;
      const resizeStarted = Date.now();
      const jpeg = await resizeToJpeg(file);
      const resizeMs = Date.now() - resizeStarted;
      if (run !== runRef.current) return;
      const form = new FormData();
      form.set("image", jpeg, "snap.jpg");
      if (here) {
        form.set("lat", String(here.lat));
        form.set("lng", String(here.lng));
      }
      const response = await fetch("/api/analyze", { method: "POST", body: form });
      const body = (await response.json().catch(() => null)) as AnalyzeBody | null;
      if (run !== runRef.current) return;
      const failure = analyzeFailure(response.status, body?.error);
      if (failure === "offline") {
        setError(t("en", "err.ai"));
        setPhase("error");
        return;
      }
      if (failure === "resting") {
        setError(t("en", "err.resting"));
        setPhase("error");
        return;
      }
      if (failure === "rate") {
        setError(t("en", "snap.rate"));
        setPhase("error");
        return;
      }
      if (failure === "net" || !body?.decision || !body.result) {
        setError(t("en", "err.net"));
        setPhase("error");
        return;
      }
      const shops = body.candidates ?? [];
      setScene(
        body.scene
          ? prependSteps(body.scene, [
              { step: "locate", ms: locateMs },
              { step: "resize", ms: resizeMs },
            ])
          : null,
      );
      setFaceBoxes(cleanFaceBoxes(body.result.faces));
      setShown([]);
      setFriendAgrees(false);
      setCandidates(shops);
      const choices = body.picker ?? [];
      setPicker(choices);
      const place = body.place && body.place.name ? body.place : null;
      setProposed(place);
      const sign = body.result.signText?.[0];
      setReadName(
        firstShopName(
          place?.name,
          typeof body.result.placeName === "string" ? body.result.placeName : null,
          sign?.translated,
          sign?.original,
        ) ?? "",
      );
      setAlreadyHere(false);
      setDemo((current) => current || Boolean(body.demo));
      setTotalSeconds(Math.max(1, Math.round((Date.now() - startedRef.current) / 1000)));
      const guess = shops.find((shop) => shop.id === body.result?.shopId) ?? null;
      if (body.noMatch === "retake") {
        showRetake();
        return;
      }
      if (body.noMatch === "public_place") {
        showAway("public");
        return;
      }
      if (body.noMatch === "not_a_place") {
        showAway("not");
        return;
      }
      if (body.noMatch === "add_shop" && place) {
        openProposed(place);
        return;
      }
      if (body.noMatch === "which_shop") {
        if (choices.length === 0) {
          if (place) openProposed(place);
          else showAway("not");
          return;
        }
        setAskWhich(true);
        setGuessId(null);
        setChosen(null);
        setPhase("pick");
        return;
      }
      if (body.decision === "confirm" && guess) {
        setAskWhich(false);
        setGuessId(guess.id);
        setChosen(guess);
        rememberShop(guess);
        setPhase("confirm");
        return;
      }
      if (place && choices.length === 0) {
        openProposed(place);
        return;
      }
      if (choices.length === 0 && shops.length === 0) {
        showAway("not");
        return;
      }
      setAskWhich(true);
      setGuessId(null);
      setChosen(null);
      if (choices.length === 0) setPicker(shops.slice(0, 5));
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
    clearDraft();
    clearPostDraft();
    fileRef.current = file;
    setFaceBoxes([]);
    setShown([]);
    setFriendAgrees(false);
    setScene(null);
    setPreview(URL.createObjectURL(file));
    if (preselected) {
      const shop = { id: preselected.id, name: preselected.name, nameLocal: null, distanceM: 0 };
      setChosen(shop);
      setAdded(false);
      setPostError("");
      void (async () => {
        const fixed = pointRef.current ?? (await getFix({ userAction: true }));
        if (fixed) rememberPoint({ lat: fixed.lat, lng: fixed.lng });
        writePostDraft(shop);
        setPhase("offer");
      })();
      return;
    }
    void analyse(file);
  }
  onFileRef.current = onFile;

  function choose(shop: ShopCard) {
    setChosen(shop);
    rememberShop(shop);
    setAdded(false);
    setPostError("");
    setShowLogin(false);
    setPhotoMissing(false);
    setTotalSeconds(Math.max(1, Math.round((Date.now() - startedRef.current) / 1000)));
    writePostDraft(shop);
    setPhase("offer");
  }

  async function saveShop() {
    const here =
      pointRef.current ??
      (demo ? { lat: DEMO_ZONE_FALLBACK.lat, lng: DEMO_ZONE_FALLBACK.lng } : null);
    if (!here) return;
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setAddError(t("en", "add.badName"));
      return;
    }
    setSaving(true);
    setAddError("");
    setShowLogin(false);
    writeDraft(draftFrom({ name: trimmed, nameLocal: nameLocal.trim(), category, demo: false }));
    try {
      const photo = fileRef.current;
      const response = photo
        ? await fetch("/api/shops", {
            method: "POST",
            body: await (async () => {
              const jpeg = await resizeToJpeg(photo);
              const form = new FormData();
              form.set("name", trimmed);
              form.set("nameLocal", nameLocal.trim());
              form.set("category", category);
              form.set("lat", String(here.lat));
              form.set("lng", String(here.lng));
              form.set("timezone", Intl.DateTimeFormat().resolvedOptions().timeZone);
              form.set("image", jpeg, "snap.jpg");
              return form;
            })(),
          })
        : await fetch("/api/shops", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: trimmed,
              nameLocal: nameLocal.trim() || null,
              category,
              lat: here.lat,
              lng: here.lng,
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            }),
          });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        shops?: ShopCard[];
        shop?: { id?: string; name?: string; nameLocal?: string | null };
      } | null;
      if (body?.error === "shop_exists" && body.shops && body.shops.length > 0) {
        setPicker(body.shops);
        setAskWhich(true);
        setAlreadyHere(true);
        setChosen(null);
        setPhase("pick");
        return;
      }
      if (body?.error === "not_a_place") {
        showAway("not");
        return;
      }
      if (body?.error === "public_place") {
        showAway("public");
        return;
      }
      if (body?.error === "photo_unusable") {
        showRetake();
        return;
      }
      if (body?.error === "ai_not_configured") {
        setAddError(t("en", "err.ai"));
        return;
      }
      if (body?.error === "ai_resting") {
        setAddError(t("en", "err.resting"));
        return;
      }
      if (response.status === 401) {
        setAddError(t("en", "add.signin"));
        setShowLogin(true);
        return;
      }
      if (response.status === 429 || body?.error === "rate_limited") {
        setAddError(t("en", "add.rate"));
        return;
      }
      if (body?.error === "bad_location") {
        setAddError(t("en", "add.badLoc"));
        return;
      }
      if (body?.error === "bad_name" || body?.error === "bad_input") {
        setAddError(t("en", "add.badName"));
        return;
      }
      if (!response.ok || !body?.shop?.name) {
        setAddError(t("en", "add.failed"));
        return;
      }
      clearDraft();
      setChosen({
        id: String(body.shop.id ?? ""),
        name: String(body.shop.name),
        nameLocal: body.shop.nameLocal ?? null,
        distanceM: 0,
      });
      setAdded(true);
      setPostError("");
      setShowLogin(false);
      setPhotoMissing(false);
      setTotalSeconds(Math.max(1, Math.round((Date.now() - startedRef.current) / 1000)));
      writePostDraft({
        id: String(body.shop.id ?? ""),
        name: String(body.shop.name),
        nameLocal: body.shop.nameLocal ?? null,
        distanceM: 0,
      });
      setPhase("offer");
    } catch {
      setAddError(t("en", "add.failed"));
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    const shop = chosen;
    const here = pointRef.current;
    const file = fileRef.current;
    if (!shop) return;
    if (!file) {
      setPhotoMissing(true);
      setPostError(t("en", "post.needPhoto"));
      return;
    }
    const postHere = postStandIn(here, demo, {
      lat: DEMO_ZONE_FALLBACK.lat,
      lng: DEMO_ZONE_FALLBACK.lng,
    });
    if (!postHere) {
      setPostError(t("en", "post.tooFar"));
      return;
    }
    setPosting(true);
    setPostError("");
    setShowLogin(false);
    try {
      const jpeg = await resizeToJpeg(file);
      const form = new FormData();
      form.set("image", jpeg, "snap.jpg");
      form.set("shopId", shop.id);
      form.set("lat", String(postHere.lat));
      form.set("lng", String(postHere.lng));
      const source = placed?.source ?? (demo && !here ? "demo" : "gps");
      form.set("locationSource", source);
      if (readTour()) form.set("skipWait", "1");
      const chosenFaces = showFacesPayload(faceBoxes, shown);
      if (chosenFaces.length > 0) form.set("showFaces", JSON.stringify(chosenFaces));
      const response = await fetch("/api/posts", { method: "POST", body: form });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        facesBlurred?: number;
        post?: { id?: string; expiresAt?: string | null };
      } | null;
      const code = body?.error ?? "";
      if (response.status === 401 || code === "not_signed_in") {
        writePostDraft(shop);
        setPostError(t("en", "post.signin"));
        setShowLogin(true);
        return;
      }
      if (code === "blur_unavailable") {
        setPostError(t("en", "post.blurFail"));
        return;
      }
      if (code === "photo_unusable") {
        setPostError(t("en", "post.unusable"));
        return;
      }
      if (code === "too_far" || code === "bad_location") {
        setPostError(t("en", "post.tooFar"));
        return;
      }
      if (response.status === 429 || code === "rate_limited") {
        setPostError(t("en", "post.rate"));
        return;
      }
      const liveKey = livePostErrorKey(code);
      if (liveKey) {
        setPostError(t("en", liveKey));
        return;
      }
      if (code === "bad_shop") {
        setPostError(t("en", "post.badShop"));
        return;
      }
      if (!response.ok || !body?.post?.id) {
        setPostError(t("en", "post.failed"));
        return;
      }
      clearPostDraft();
      if (typeof body.facesBlurred === "number") {
        setScene((current) => (current ? { ...current, facesBlurred: body.facesBlurred ?? null } : current));
      }
      setPosted({
        id: body.post.id,
        expiresAt: body.post.expiresAt ?? new Date(Date.now() + 7_200_000).toISOString(),
      });
      setPhase("posted");
    } catch {
      setPostError(t("en", "post.failed"));
    } finally {
      setPosting(false);
    }
  }

  function saveOriginal() {
    const file = fileRef.current;
    if (!file) return;
    const download = (item: File) => {
      const url = URL.createObjectURL(item);
      blobsRef.current.push(url);
      const link = document.createElement("a");
      link.href = url;
      link.download = item.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
    };
    const canShareFiles = typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
    const run = buildOriginalSave({
      canShareFiles,
      file,
      share: async (item) => {
        try {
          await navigator.share({ files: [item] });
        } catch (error) {
          const name = error && typeof error === "object" && "name" in error ? String(error.name) : "";
          if (name === "AbortError") return;
          throw error;
        }
      },
      download,
    });
    run();
  }

  const guess = candidates.find((shop) => shop.id === guessId) ?? chosen;

  return (
    <div className="flex flex-col gap-4">
      {phase === "idle" ? (
        <p className="text-body text-fg">{t("en", "reading.shop")}</p>
      ) : (
        <>
          <h1 className="text-title font-bold text-fg">{t("en", "nav.snap")}</h1>
          {demo ? <DemoBanner /> : null}
          {demo && demoShopName ? (
            <p className="text-label text-fg">{t("en", "demo.location", { name: demoShopName })}</p>
          ) : null}
          {behindOn && scene && phase !== "reading" && phase !== "error" && phase !== "away" && phase !== "retake" ? (
            <ScenePanel scene={scene} />
          ) : null}
        </>
      )}

      {preview && phase !== "idle" && !(phase === "offer" && faceBoxes.length > 0) ? (
        <img src={preview} alt={t("en", "snap.alt")} className="aspect-[4/3] w-full rounded-lg object-cover" />
      ) : null}

      {phase === "reading" ? (
        <div aria-live="polite" className="flex flex-col gap-2">
          <p className="text-body text-fg-muted">{t("en", "loc.why")}</p>
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
          <button
            type="button"
            className={secondary}
            onClick={() => {
              if (picker.length === 0) {
                showAway();
                return;
              }
              setAskWhich(false);
              setGuessId(null);
              setPhase("pick");
            }}
          >
            {t("en", "confirm.no")}
          </button>
        </div>
      ) : null}

      {phase === "pick" ? (
        <div className="flex flex-col gap-3">
          <p className="text-heading font-bold text-fg">{t("en", askWhich ? "snap.which" : "confirm.q")}</p>
          {alreadyHere ? <p className="text-body text-fg">{t("en", "snap.already")}</p> : null}
          {askWhich ? <p className="text-body text-fg">{t("en", "snap.unsure")}</p> : null}
          <ul className="flex flex-col gap-2">
            {picker.map((shop) => (
              <li key={shop.id}>
                <button type="button" className={secondary + " items-start text-left"} onClick={() => choose(shop)}>
                  <span className="flex w-full flex-col">
                    <span>{shop.name}</span>
                    {shop.nameLocal ? <span className="text-caption text-fg-muted">{shop.nameLocal}</span> : null}
                    <span className="text-caption text-fg-muted">
                      {t("en", "snap.meters", { n: String(shop.distanceM) })}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className={secondary} onClick={addThisShop}>
            {t("en", "add.title")}
          </button>
        </div>
      ) : null}

      {phase === "away" ? (
        <div className="flex flex-col gap-3">
          <p role="status" className="text-heading font-bold text-fg">
            {t("en", awayKind === "public" ? "snap.publicSoon" : "snap.noneNear")}
          </p>
          <p className="text-body text-fg">
            {t("en", awayKind === "public" ? "snap.noneNear" : "snap.placesOnly")}
          </p>
          <button type="button" className={secondary} onClick={reset}>
            {t("en", "success.again")}
          </button>
        </div>
      ) : null}

      {phase === "retake" ? (
        <div className="flex flex-col gap-3">
          <p role="status" className="text-body text-fg">
            {t("en", "post.unusable")}
          </p>
          <RadarButton onClick={() => onRetake?.()} size={56} caption={t("en", "snap.take")} />
        </div>
      ) : null}

      {phase === "add" ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void saveShop();
          }}
        >
          <h2 className="text-heading font-bold text-fg">{t("en", "snap.addNew", { name: name.trim() || "…" })}</h2>
          <label className="flex flex-col gap-1 text-label text-fg" htmlFor="shop-name">
            {t("en", "add.name")}
            <input
              id="shop-name"
              className={field}
              value={name}
              maxLength={80}
              onChange={(event) => {
                const value = event.target.value;
                setName(value);
                writeDraft(draftFrom({ name: value }));
              }}
            />
          </label>
          <label className="flex flex-col gap-1 text-label text-fg" htmlFor="shop-local">
            {t("en", "add.nameLocal")}
            <input
              id="shop-local"
              className={field}
              value={nameLocal}
              maxLength={80}
              onChange={(event) => {
                const value = event.target.value;
                setNameLocal(value);
                writeDraft(draftFrom({ nameLocal: value }));
              }}
            />
          </label>
          <label className="flex flex-col gap-1 text-label text-fg" htmlFor="shop-category">
            {t("en", "add.category")}
            <select
              id="shop-category"
              className={field}
              value={category}
              onChange={(event) => {
                const value = event.target.value as ShopCategory;
                setCategory(value);
                writeDraft(draftFrom({ category: value }));
              }}
            >
              {SHOP_CATEGORIES.map((item) => (
                <option key={item} value={item}>
                  {t("en", CATEGORY_LABEL[item])}
                </option>
              ))}
            </select>
          </label>
          {point ? (
            <p className="text-label text-fg-muted">
              {t("en", "add.using")} · {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
            </p>
          ) : (
            <>
              <p className="text-body text-fg-muted">{t("en", "loc.why")}</p>
              <LocationHelp status={locStatus} onTryAgain={() => void askLocation()} force />
            </>
          )}
          {addError ? (
            <p role="alert" className="min-h-6 text-body text-danger">
              {addError}
            </p>
          ) : null}
          <button type="submit" className={primary} disabled={!point || saving || name.trim().length < 2}>
            {t("en", "snap.addHere")}
          </button>
          {showLogin ? (
            <a
              className={secondary}
              href="/login?next=/snap"
              onClick={() => writeDraft(draftFrom())}
            >
              {t("en", "auth.signIn")}
            </a>
          ) : null}
        </form>
      ) : null}

      {phase === "offer" && chosen ? (
        <div className="flex flex-col gap-3">
          <p className="text-heading font-bold text-fg">{chosen.name}</p>
          {chosen.nameLocal ? <p className="text-label text-fg-muted">{chosen.nameLocal}</p> : null}
          {added ? <p className="text-body text-fg">{t("en", "success.added")}</p> : null}
          {preview && faceBoxes.length > 0 ? (
            <>
              <FaceChooser
                src={preview}
                alt={t("en", "snap.alt")}
                boxes={faceBoxes}
                shown={shown}
                label={t("en", "face.thatsMe")}
                onToggle={(index) => setShown((current) => toggleShown(current, index, friendAgrees))}
              />
              <p className="text-body text-fg">{t("en", "face.others")}</p>
              {faceBoxes.length > 1 ? (
                <button
                  type="button"
                  className={secondary}
                  aria-pressed={friendAgrees}
                  onClick={() => {
                    const next = !friendAgrees;
                    setFriendAgrees(next);
                    if (!next) setShown((current) => current.slice(0, 1));
                  }}
                >
                  {t("en", "face.agree")}
                </button>
              ) : null}
              {shown.length > 0 ? (
                <p className="inline-flex min-h-11 items-center rounded-full bg-surface-2 px-3 text-label font-semibold text-fg">
                  {t("en", "face.confirm")}
                </p>
              ) : null}
              <PublishPreview src={preview} boxes={faceBoxes} shown={shown} />
              <p className="text-label text-fg-muted">{t("en", "face.preview")}</p>
              {shown.length > 0 ? <p className="text-body text-fg">{t("en", "face.onlyYou")}</p> : null}
            </>
          ) : null}
          <p className="text-body text-fg">{t("en", "post.blurNote")}</p>
          <p className="text-label text-fg-muted">{t("en", "success.time", { t: String(totalSeconds) })}</p>
          {photoMissing ? (
            <p role="alert" className="min-h-6 text-body text-fg">
              {t("en", "post.needPhoto")}
            </p>
          ) : null}
          {postError && !photoMissing ? (
            <p role="alert" className="min-h-6 text-body text-danger">
              {postError}
            </p>
          ) : null}
          {photoMissing ? (
            <RadarButton onClick={() => onRetake?.()} size={56} caption={t("en", "snap.cta")} />
          ) : (
            <>
              <p className="text-body text-fg">{t("en", "post.honest")}</p>
              <button
                type="button"
                className={primary}
                disabled={posting}
                aria-busy={posting}
                onClick={() => void publish()}
              >
                {t("en", "post.cta")}
              </button>
            </>
          )}
          {postError && !photoMissing ? (
            <button type="button" className={secondary} disabled={posting} onClick={() => void publish()}>
              {t("en", "err.retry")}
            </button>
          ) : null}
          {showLogin ? (
            <a className={secondary} href="/login?next=/snap" onClick={() => writePostDraft(chosen)}>
              {t("en", "auth.signIn")}
            </a>
          ) : null}
          <Link className={secondary} href={bookBuildHref(chosen.id)}>
            {t("en", "book.build")}
          </Link>
          <button type="button" className={secondary} onClick={reset}>
            {t("en", "success.again")}
          </button>
        </div>
      ) : null}

      {phase === "posted" && chosen && posted ? (
        <div className="flex flex-col gap-3">
          <p className="text-heading font-bold text-fg">{t("en", "post.live", { name: chosen.name })}</p>
          <p className="text-heading font-bold tabular-nums text-fg" aria-live="polite">
            {formatClock(Date.parse(posted.expiresAt) - (clock || Date.now()))}
          </p>
          {preview ? (
            <button type="button" className={primary} onClick={saveOriginal}>
              {t("en", "face.save")}
            </button>
          ) : null}
          <Link className={secondary} href={"/map?post=" + encodeURIComponent(posted.id)}>
            {t("en", "post.see")}
          </Link>
          <RadarButton
            href={snapShopHref(chosen.id, chosen.name)}
            caption={t("en", "snap.keepSeeding", { name: chosen.name })}
          />
          <Link className={secondary} href={bookBuildHref(chosen.id)}>
            {t("en", "book.build")}
          </Link>
          <button type="button" className={secondary} onClick={reset}>
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
