"use client";

import { useEffect, useRef, useState } from "react";
import { DemoBanner } from "@/components/ui/DemoBanner";
import { t, type CopyKey } from "@/lib/copy";
import { resizeToJpeg } from "@/lib/image/resize";
import { prefillShop, SHOP_CATEGORIES, type ShopCategory } from "@/lib/snap/prefill";

type ShopCard = {
  id: string;
  name: string;
  nameLocal?: string | null;
  distanceM: number;
};

type SignLine = { original: string; translated: string };

type AnalyzeBody = {
  decision?: "confirm" | "pick" | "pick-all";
  result?: {
    shopId: string | null;
    confidence: number;
    category?: string;
    signText?: SignLine[];
  };
  candidates?: ShopCard[];
  demo?: boolean;
  error?: string;
};

type Phase = "idle" | "reading" | "confirm" | "pick" | "add" | "offer" | "posted" | "error";

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

function locate(): Promise<Point | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (point: Point | null) => {
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

export function SnapFlow() {
  const inputRef = useRef<HTMLInputElement>(null);
  const runRef = useRef(0);
  const fileRef = useRef<File | null>(null);
  const startedRef = useRef(0);
  const pointRef = useRef<Point | null>(null);
  const signRef = useRef<SignLine[]>([]);
  const categoryRef = useRef("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [preview, setPreview] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [demo, setDemo] = useState(false);
  const [error, setError] = useState("");
  const [candidates, setCandidates] = useState<ShopCard[]>([]);
  const [guessId, setGuessId] = useState<string | null>(null);
  const [chosen, setChosen] = useState<ShopCard | null>(null);
  const [added, setAdded] = useState(false);
  const [point, setPoint] = useState<Point | null>(null);
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

  function openAdd(signText: SignLine[], matcherCategory: string) {
    clearPostDraft();
    const filled = prefillShop({ signText, category: matcherCategory });
    const here = pointRef.current;
    setName(filled.name);
    setNameLocal(filled.nameLocal ?? "");
    setCategory(filled.category);
    setAddError("");
    setShowLogin(false);
    setAdded(false);
    setPhase("add");
    writeDraft({
      name: filled.name,
      nameLocal: filled.nameLocal ?? "",
      category: filled.category,
      lat: here?.lat ?? null,
      lng: here?.lng ?? null,
      demo: !here,
    });
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
    if (inputRef.current) inputRef.current.value = "";
  }

  async function analyse(file: File) {
    const run = ++runRef.current;
    setPhase("reading");
    setError("");
    setElapsed(0);
    setAdded(false);
    startedRef.current = Date.now();
    try {
      const located = await locate();
      if (run !== runRef.current) return;
      rememberPoint(located);
      setDemo(!located);
      const jpeg = await resizeToJpeg(file);
      if (run !== runRef.current) return;
      const form = new FormData();
      form.set("image", jpeg, "snap.jpg");
      if (located) {
        form.set("lat", String(located.lat));
        form.set("lng", String(located.lng));
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
      signRef.current = body.result.signText ?? [];
      categoryRef.current = body.result.category ?? "";
      setCandidates(shops);
      setDemo((current) => current || Boolean(body.demo));
      setTotalSeconds(Math.max(1, Math.round((Date.now() - startedRef.current) / 1000)));
      const guess = shops.find((shop) => shop.id === body.result?.shopId) ?? null;
      if (body.decision === "pick-all") {
        openAdd(signRef.current, categoryRef.current);
        return;
      }
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
    clearDraft();
    clearPostDraft();
    fileRef.current = file;
    setPreview(URL.createObjectURL(file));
    void analyse(file);
  }

  function choose(shop: ShopCard) {
    setChosen(shop);
    setAdded(false);
    setPostError("");
    setShowLogin(false);
    setPhotoMissing(false);
    setTotalSeconds(Math.max(1, Math.round((Date.now() - startedRef.current) / 1000)));
    writePostDraft(shop);
    setPhase("offer");
  }

  async function saveShop() {
    const here = pointRef.current;
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
      const response = await fetch("/api/shops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmed,
          nameLocal: nameLocal.trim() || null,
          category,
          lat: here.lat,
          lng: here.lng,
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        shop?: { id?: string; name?: string; nameLocal?: string | null };
      } | null;
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
    if (!here) {
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
      form.set("lat", String(here.lat));
      form.set("lng", String(here.lng));
      const response = await fetch("/api/posts", { method: "POST", body: form });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
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
      if (response.status === 409 || code === "already_live") {
        setPostError(t("en", "post.already"));
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
          <button type="button" className={secondary} onClick={() => openAdd(signRef.current, categoryRef.current)}>
            {t("en", "pick.none")}
          </button>
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
          <h2 className="text-heading font-bold text-fg">{t("en", "add.title")}</h2>
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
            <p className="text-body text-fg">{t("en", "add.needLoc")}</p>
          )}
          {addError ? (
            <p role="alert" className="min-h-6 text-body text-danger">
              {addError}
            </p>
          ) : null}
          <button type="submit" className={primary} disabled={!point || saving || name.trim().length < 2}>
            {t("en", "add.save")}
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
            <button type="button" className={primary + " min-h-16"} onClick={() => inputRef.current?.click()}>
              {t("en", "snap.cta")}
            </button>
          ) : (
            <button
              type="button"
              className={primary}
              disabled={posting}
              aria-busy={posting}
              onClick={() => void publish()}
            >
              {t("en", "post.cta")}
            </button>
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
          <a className={primary} href={"/map?post=" + encodeURIComponent(posted.id)}>
            {t("en", "post.see")}
          </a>
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
