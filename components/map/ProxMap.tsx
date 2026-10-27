"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AttributionControl, Map, Marker, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./pins.css";
import { LocationHelp } from "@/components/ui/LocationHelp";
import { t, type CopyKey } from "@/lib/copy";
import { pickLanguage } from "@/lib/i18n/viewer";
import { LiveFacts } from "./LiveFacts";
import { makeDemoPosts } from "@/lib/fixtures/demo-posts";
import { FIXTURE_SHOPS, shopBySlug, type FixtureShop } from "@/lib/fixtures/shops";
import { formatRemaining, phaseFor, remainingMs } from "@/lib/freshness";
import { haversineMeters, walkingDirectionsUrl, walkingMinutes, type LatLng } from "@/lib/geo";
import { locate, needsExternalBrowser, type LocateResult } from "@/lib/geo/locate";
import { applyDarkOverrides, MAP_DEFAULTS, STYLE_URL } from "@/lib/map/style";
import type { LivePost } from "@/lib/posts/source";
import { createClient } from "@/lib/supabase/client";
import { getClock, getServerClock, subscribeClock } from "./clock";
import { createLivePinElement, createPinElement } from "./pin-element";
import {
  getServerWalkOrigin,
  getWalkOrigin,
  setWalkOrigin,
  subscribeWalkOrigin,
} from "./walk-origin";

setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString());

const FAR_METERS = 5_000;

const linkClass =
  "inline-flex min-h-12 w-full items-center justify-center rounded-md bg-accent px-4 text-base font-semibold text-accent-ink no-underline";

function supportsWebGL2(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return canvas.getContext("webgl2") instanceof WebGL2RenderingContext;
  } catch {
    return false;
  }
}

const EMPTY_POSTS: LivePost[] = [];

function isLivePost(value: unknown): value is LivePost {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<LivePost>;
  return (
    typeof row.id === "string" &&
    typeof row.shopId === "string" &&
    typeof row.shopName === "string" &&
    typeof row.expiresAt === "string" &&
    typeof row.lat === "number" &&
    typeof row.lng === "number"
  );
}

function asFacts(value: LivePost["facts"] | undefined): LivePost["facts"] {
  if (!value || typeof value !== "object") return null;
  const items = Array.isArray(value.items)
    ? value.items
        .filter((item) => item && typeof item.name === "string" && item.name.trim().length > 0)
        .slice(0, 8)
        .map((item) => ({
          name: item.name,
          price: typeof item.price === "number" && Number.isFinite(item.price) ? item.price : null,
          currency: typeof item.currency === "string" ? item.currency : null,
        }))
    : [];
  const crowd =
    value.crowd === "empty" || value.crowd === "few" || value.crowd === "busy" || value.crowd === "queue"
      ? value.crowd
      : null;
  const openStatus =
    value.openStatus === "open" || value.openStatus === "closed" || value.openStatus === "unknown"
      ? value.openStatus
      : "unknown";
  const known = ["fresh_batch", "promo", "sold_out", "event", "music", "new_item"] as const;
  const signals = Array.isArray(value.signals)
    ? value.signals.filter((signal) => (known as readonly string[]).includes(signal)).slice(0, 5)
    : [];
  const captions = value.captions && typeof value.captions === "object" ? value.captions : { en: null, th: null };
  return {
    caption: typeof value.caption === "string" ? value.caption : null,
    items,
    crowd,
    openStatus,
    signals,
    signLanguage: typeof value.signLanguage === "string" ? value.signLanguage : null,
    captions: {
      en: typeof captions.en === "string" ? captions.en : null,
      th: typeof captions.th === "string" ? captions.th : null,
    },
  };
}

function asLivePost(value: LivePost): LivePost {
  const translated =
    value.textTranslated && typeof value.textTranslated === "object" ? value.textTranslated : {};
  return {
    id: value.id,
    shopId: value.shopId,
    photoUrl: typeof value.photoUrl === "string" ? value.photoUrl : null,
    textOriginal: typeof value.textOriginal === "string" ? value.textOriginal : null,
    textTranslated: translated,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : value.expiresAt,
    expiresAt: value.expiresAt,
    shopName: value.shopName,
    shopNameLocal: typeof value.shopNameLocal === "string" ? value.shopNameLocal : null,
    lat: value.lat,
    lng: value.lng,
    category: typeof value.category === "string" ? value.category : "other",
    facts: asFacts(value.facts),
    mine: value.mine === true,
  };
}

function latestByShop(posts: readonly LivePost[], now: number): globalThis.Map<string, LivePost> {
  const buckets = new globalThis.Map<string, LivePost>();
  for (const post of posts) {
    if (Date.parse(post.expiresAt) <= now) continue;
    const prev = buckets.get(post.shopId);
    if (!prev || post.expiresAt > prev.expiresAt) buckets.set(post.shopId, post);
  }
  return buckets;
}

function nearestShopMeters(point: LatLng, shops: readonly FixtureShop[]): number {
  let nearest = Number.POSITIVE_INFINITY;
  for (const shop of shops) {
    const meters = haversineMeters(point, shop);
    if (meters < nearest) nearest = meters;
  }
  return nearest;
}

export function ProxMap({
  shops = FIXTURE_SHOPS,
  fixtures = true,
  livePosts = EMPTY_POSTS,
}: {
  shops?: FixtureShop[];
  fixtures?: boolean;
  livePosts?: LivePost[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const openedPostRef = useRef(false);
  const nowMs = useSyncExternalStore(subscribeClock, getClock, getServerClock);
  const origin = useSyncExternalStore(subscribeWalkOrigin, getWalkOrigin, getServerWalkOrigin);
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [posts, setPosts] = useState<LivePost[]>(livePosts);
  const [userPoint, setUserPoint] = useState<LatLng | null>(null);
  const [locMessage, setLocMessage] = useState(t("en", "loc.why"));
  const [locProblem, setLocProblem] = useState(false);
  const [locBusy, setLocBusy] = useState(false);
  const [locStatus, setLocStatus] = useState<LocateResult["status"] | null>(null);
  const [claimNote, setClaimNote] = useState("");
  const [sheetLang, setSheetLang] = useState<"en" | "th">("en");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteNote, setDeleteNote] = useState<string | null>(null);

  useEffect(() => {
    setWebgl(supportsWebGL2());
  }, []);

  useEffect(() => {
    const picked = pickLanguage(typeof navigator === "undefined" ? null : navigator.languages);
    setSheetLang(picked === "th" ? "th" : "en");
  }, []);

  useEffect(() => {
    setDeleteNote(null);
  }, [selectedPostId]);

  useEffect(() => {
    setPosts(livePosts);
  }, [livePosts]);

  useEffect(() => {
    if (fixtures) return;
    let stopped = false;
    let supabase: ReturnType<typeof createClient> | null = null;
    let channel: ReturnType<ReturnType<typeof createClient>["channel"]> | null = null;

    async function load() {
      try {
        const response = await fetch("/api/posts");
        if (!response.ok) return;
        const body = (await response.json()) as { posts?: unknown };
        if (stopped || !Array.isArray(body.posts)) return;
        setPosts(body.posts.filter(isLivePost).map(asLivePost));
      } catch {
        // The next poll retries. Realtime is optional.
      }
    }

    const poll = window.setInterval(() => void load(), 60_000);
    const drop = window.setInterval(() => {
      const now = Date.now();
      setPosts((current) => {
        const next = current.filter((post) => Date.parse(post.expiresAt) > now);
        return next.length === current.length ? current : next;
      });
    }, 15_000);

    try {
      supabase = createClient();
      channel = supabase
        .channel("prox-live-posts")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "posts" }, () => {
          void load();
        })
        .subscribe();
    } catch {
      supabase = null;
      channel = null;
    }

    return () => {
      stopped = true;
      window.clearInterval(poll);
      window.clearInterval(drop);
      if (supabase && channel) void supabase.removeChannel(channel);
    };
  }, [fixtures]);

  useEffect(() => {
    if (fixtures || openedPostRef.current) return;
    const id = new URLSearchParams(window.location.search).get("post");
    if (!id) return;
    const post = posts.find((item) => item.id === id && Date.parse(item.expiresAt) > Date.now());
    if (!post) return;
    setSelectedPostId(post.id);
    setSelectedId(post.shopId);
    if (!mapRef.current) return;
    openedPostRef.current = true;
    mapRef.current.flyTo({ center: [post.lng, post.lat], essential: true });
  }, [fixtures, posts, webgl]);

  useEffect(() => {
    if (webgl !== true || !containerRef.current) return;
    const map = new Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: MAP_DEFAULTS.center,
      zoom: MAP_DEFAULTS.zoom,
      minZoom: MAP_DEFAULTS.minZoom,
      maxZoom: MAP_DEFAULTS.maxZoom,
      pitch: MAP_DEFAULTS.pitch,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    });
    map.touchZoomRotate.disableRotation();
    map.touchPitch.disable();
    map.addControl(new AttributionControl({ compact: true }), "bottom-left");
    map.on("load", () => {
      applyDarkOverrides({
        getLayer: (id) => map.getLayer(id),
        setPaintProperty: (layerId, property, value) => {
          (map.setPaintProperty as (id: string, name: string, paint: string) => void)(
            layerId,
            property,
            value,
          );
        },
      });
    });
    const onZoom = () => {
      const show = map.getZoom() >= 17.5;
      for (const marker of markersRef.current) {
        const local = marker.getElement().querySelector(".prox-pin__local");
        if (local instanceof HTMLElement) local.hidden = !show;
      }
    };
    map.on("zoom", onZoom);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current = [];
    };
  }, [webgl]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || (fixtures && nowMs === 0)) return;
    for (const marker of markersRef.current) marker.remove();
    markersRef.current = [];
    const showLocal = map.getZoom() >= 17.5;
    if (!fixtures) {
      const tick = nowMs || Date.now();
      const byShop = latestByShop(posts, tick);
      for (const shop of shops) {
        const post = byShop.get(shop.id);
        const element = post
          ? createLivePinElement(shop.name, post.expiresAt, tick)
          : document.createElement("button");
        if (!post) {
          element.type = "button";
          element.className = "prox-pin";
          element.textContent = shop.name;
        }
        element.dataset.shopId = shop.id;
        element.dataset.selected = post
          ? selectedPostId === post.id
            ? "true"
            : "false"
          : selectedId === shop.id
            ? "true"
            : "false";
        element.addEventListener("click", () => {
          if (post) {
            setSelectedPostId((current) => (current === post.id ? null : post.id));
            setSelectedId(shop.id);
            return;
          }
          setSelectedPostId(null);
          setSelectedId((current) => (current === shop.id ? null : shop.id));
        });
        const marker = new Marker({ element, anchor: "center" })
          .setLngLat([shop.lng, shop.lat])
          .addTo(map);
        markersRef.current.push(marker);
      }
    } else {
      for (const post of makeDemoPosts(nowMs)) {
        const shop = shopBySlug(post.shopSlug);
        if (!shop) continue;
        if (phaseFor(remainingMs(post.expires_at, nowMs)) === "expired") continue;
        const element = createPinElement(post, shop, nowMs);
        element.dataset.selected = element.dataset.shopId === selectedId ? "true" : "false";
        const local = element.querySelector(".prox-pin__local");
        if (local instanceof HTMLElement) local.hidden = !showLocal;
        element.addEventListener("click", () => {
          setSelectedId((current) => (current === shop.id ? null : shop.id));
        });
        const marker = new Marker({ element, anchor: "center" })
          .setLngLat([shop.lng, shop.lat])
          .addTo(map);
        markersRef.current.push(marker);
      }
    }
    return () => {
      for (const marker of markersRef.current) marker.remove();
      markersRef.current = [];
    };
  }, [nowMs, selectedId, selectedPostId, webgl, fixtures, shops, posts]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !userPoint) return;
    const element = document.createElement("div");
    element.className = "prox-you";
    element.setAttribute("role", "img");
    element.setAttribute("aria-label", t("en", "map.you"));
    const marker = new Marker({ element, anchor: "center" })
      .setLngLat([userPoint.lng, userPoint.lat])
      .addTo(map);
    return () => {
      marker.remove();
    };
  }, [userPoint, webgl]);

  function failureKey(status: LocateResult["status"]): CopyKey {
    if (status === "denied") return "loc.denied";
    if (status === "timeout") return "loc.timeout";
    if (status === "insecure") return "loc.insecure";
    if (status === "no_api") return "loc.noApi";
    return "loc.unavailable";
  }

  async function useMyLocation() {
    setLocBusy(true);
    setLocProblem(false);
    setLocMessage(t("en", "loc.finding"));
    try {
      const result = await locate();
      setLocStatus(result.status);
      if (result.status !== "ok") {
        setLocProblem(true);
        setLocMessage(t("en", failureKey(result.status)));
        return;
      }
      if (nearestShopMeters(result.point, shops) > FAR_METERS) {
        setLocProblem(false);
        setLocMessage(t("en", "loc.far"));
        return;
      }
      setUserPoint(result.point);
      setWalkOrigin(result.point);
      setLocProblem(false);
      setLocMessage(t("en", "loc.why"));
      mapRef.current?.flyTo({ center: [result.point.lng, result.point.lat], essential: true });
    } catch {
      setLocStatus("unavailable");
      setLocProblem(true);
      setLocMessage(t("en", "loc.unavailable"));
    } finally {
      setLocBusy(false);
    }
  }

  if (webgl === null) {
    return <div className="h-full w-full bg-surface-2" aria-hidden="true" />;
  }

  if (webgl === false) {
    return (
      <div className="flex h-full items-center bg-bg px-4">
        <p role="status" className="text-body text-fg">
          {t("en", "map.webgl")}
        </p>
      </div>
    );
  }

  const tick = nowMs || Date.now();
  const selectedLive = posts.find(
    (post) => post.id === selectedPostId && Date.parse(post.expiresAt) > tick,
  );
  const selectedShop: FixtureShop | undefined = shops.find((shop) => shop.id === selectedId);
  const selectedPost = selectedShop
    ? makeDemoPosts(nowMs || Date.now()).find((post) => post.shopSlug === selectedShop.slug)
    : undefined;
  const remaining = selectedPost && nowMs > 0 ? remainingMs(selectedPost.expires_at, nowMs) : 0;
  const showCard = Boolean(
    !selectedLive && selectedShop && (selectedPost ? phaseFor(remaining) !== "expired" : !fixtures),
  );
  const minutes = selectedShop ? walkingMinutes(haversineMeters(origin, selectedShop)) : 1;
  const liveRemaining = selectedLive ? Math.max(0, remainingMs(selectedLive.expiresAt, tick)) : 0;
  const liveMeters = selectedLive && userPoint ? Math.round(haversineMeters(userPoint, selectedLive)) : null;
  const liveLine =
    selectedLive?.textTranslated.en || selectedLive?.textOriginal || "";
  const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const showLocationHelp = needsExternalBrowser(userAgent, locStatus) || locStatus === "denied";

  return (
    <div className="prox-map relative h-full w-full" data-card={showCard || selectedLive ? "open" : "closed"} role="region" aria-label={t("en", "nav.map")}>
      <div ref={containerRef} className="h-full w-full bg-bg" />
      <div className="absolute left-3 top-3 z-10 flex max-w-[min(100%-1.5rem,18rem)] flex-col items-start gap-2">
        <button
          type="button"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md bg-surface-1 px-3 text-label font-semibold text-fg no-underline shadow-card disabled:opacity-60"
          disabled={locBusy}
          onClick={useMyLocation}
        >
          {t("en", "loc.ask")}
        </button>
        <p
          role={locProblem ? "alert" : "status"}
          className="min-h-6 rounded-md bg-surface-1 px-2 py-1 text-caption text-fg"
        >
          {locMessage}
        </p>
        {showLocationHelp ? (
          <LocationHelp status={locStatus} onTryAgain={() => void useMyLocation()} />
        ) : null}
      </div>
      {selectedLive ? (
        <div className="absolute inset-x-3 bottom-16 z-20 max-h-[70%] overflow-y-auto rounded-lg bg-surface-1 p-4 shadow-sheet">
          {selectedLive.photoUrl ? (
            <img
              src={selectedLive.photoUrl}
              alt={selectedLive.shopName}
              className="mb-3 aspect-[4/3] w-full rounded-md object-cover"
            />
          ) : null}
          <p className="text-heading font-bold text-fg">{selectedLive.shopName}</p>
          {selectedLive.shopNameLocal ? (
            <p className="text-label text-fg-muted">{selectedLive.shopNameLocal}</p>
          ) : null}
          {selectedLive.facts ? (
            <LiveFacts post={selectedLive} lang={sheetLang} />
          ) : liveLine ? (
            <p className="mt-2 text-body text-fg">{liveLine}</p>
          ) : null}
          <p className="mt-2 text-body text-fg">{t("en", "timer.left", { t: formatRemaining(liveRemaining) })}</p>
          {liveMeters !== null ? (
            <p className="text-label text-fg-muted">
              {t("en", "snap.meters", { n: String(liveMeters) })}
              {" · "}
              {t("en", "map.walk", { n: String(walkingMinutes(liveMeters)) })}
            </p>
          ) : null}
          <a
            className={"mt-3 " + linkClass}
            href={walkingDirectionsUrl(selectedLive)}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("en", "post.go")}
          </a>
          {selectedLive.mine ? (
            <button
              type="button"
              className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-md bg-surface-2 px-4 text-base font-semibold text-fg disabled:opacity-60"
              disabled={deleteBusy}
              onClick={() => {
                const id = selectedLive.id;
                setDeleteBusy(true);
                setDeleteNote(null);
                void fetch("/api/posts", {
                  method: "DELETE",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ id }),
                })
                  .then(async (response) => {
                    if (!response.ok) {
                      setDeleteNote(t(sheetLang, "facts.deleteFail"));
                      return;
                    }
                    setPosts((current) => current.filter((post) => post.id !== id));
                    setSelectedPostId(null);
                  })
                  .catch(() => {
                    setDeleteNote(t(sheetLang, "facts.deleteFail"));
                  })
                  .finally(() => {
                    setDeleteBusy(false);
                  });
              }}
            >
              {t(sheetLang, "facts.delete")}
            </button>
          ) : null}
          {deleteNote ? (
            <p role="alert" className="mt-2 text-label text-fg">
              {deleteNote}
            </p>
          ) : null}
        </div>
      ) : null}
      {showCard && selectedShop ? (
        <div className="absolute inset-x-3 bottom-16 z-20 rounded-lg bg-surface-1 p-4 shadow-sheet">
          <p className="text-heading font-bold text-fg">{selectedShop.name}</p>
          {selectedShop.nameLocal ? (
            <p className="text-label text-fg-muted">{selectedShop.nameLocal}</p>
          ) : null}
          {selectedPost ? (
            <p className="mt-2 text-body text-fg">
              {t("en", "timer.left", { t: formatRemaining(remaining) })}
            </p>
          ) : null}
          <p className="text-label text-fg-muted">{t("en", "map.walk", { n: String(minutes) })}</p>
          <a
            className={"mt-3 " + linkClass}
            href={walkingDirectionsUrl(selectedShop)}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("en", "post.go")}
          </a>
          {!fixtures ? (
            <button
              type="button"
              className="mt-2 inline-flex min-h-11 items-center text-label font-semibold text-fg"
              onClick={() => {
                setClaimNote("");
                void fetch("/api/owner/claim", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ shopId: selectedShop.id }),
                })
                  .then(async (response) => {
                    const body = (await response.json().catch(() => null)) as { status?: string } | null;
                    if (response.ok && body?.status === "pending") setClaimNote(t("en", "loop.waiting"));
                    else if (response.ok && body?.status === "verified") setClaimNote(t("en", "loop.owner"));
                  })
                  .catch(() => undefined);
              }}
            >
              {t("en", "loop.claim")}
            </button>
          ) : null}
          {claimNote ? <p className="text-label text-fg">{claimNote}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
