"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AttributionControl, Map, Marker, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./pins.css";
import { t } from "@/lib/copy";
import { makeDemoPosts } from "@/lib/fixtures/demo-posts";
import { FIXTURE_SHOPS, shopBySlug, type FixtureShop } from "@/lib/fixtures/shops";
import { formatRemaining, phaseFor, remainingMs } from "@/lib/freshness";
import { haversineMeters, walkingDirectionsUrl, walkingMinutes, type LatLng } from "@/lib/geo";
import { applyDarkOverrides, MAP_DEFAULTS, STYLE_URL } from "@/lib/map/style";
import { getClock, getServerClock, subscribeClock } from "./clock";
import { createPinElement } from "./pin-element";
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

function nearestShopMeters(point: LatLng): number {
  let nearest = Number.POSITIVE_INFINITY;
  for (const shop of FIXTURE_SHOPS) {
    const meters = haversineMeters(point, shop);
    if (meters < nearest) nearest = meters;
  }
  return nearest;
}

export function ProxMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const nowMs = useSyncExternalStore(subscribeClock, getClock, getServerClock);
  const origin = useSyncExternalStore(subscribeWalkOrigin, getWalkOrigin, getServerWalkOrigin);
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [userPoint, setUserPoint] = useState<LatLng | null>(null);
  const [locMessage, setLocMessage] = useState(t("en", "loc.why"));
  const [locProblem, setLocProblem] = useState(false);
  const [locBusy, setLocBusy] = useState(false);

  useEffect(() => {
    setWebgl(supportsWebGL2());
  }, []);

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
    if (!map || nowMs === 0) return;
    for (const marker of markersRef.current) marker.remove();
    markersRef.current = [];
    const showLocal = map.getZoom() >= 17.5;
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
    return () => {
      for (const marker of markersRef.current) marker.remove();
      markersRef.current = [];
    };
  }, [nowMs, selectedId, webgl]);

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

  function useMyLocation() {
    if (!navigator.geolocation) {
      setLocProblem(true);
      setLocMessage(t("en", "loc.unavailable"));
      return;
    }
    setLocBusy(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point = { lat: position.coords.latitude, lng: position.coords.longitude };
        setLocBusy(false);
        if (nearestShopMeters(point) > FAR_METERS) {
          setLocProblem(false);
          setLocMessage(t("en", "loc.far"));
          return;
        }
        setUserPoint(point);
        setWalkOrigin(point);
        setLocProblem(false);
        setLocMessage("");
        mapRef.current?.flyTo({ center: [point.lng, point.lat], essential: true });
      },
      (error) => {
        setLocBusy(false);
        setLocProblem(true);
        setLocMessage(error.code === 1 ? t("en", "loc.denied") : t("en", "loc.unavailable"));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
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

  const selectedShop: FixtureShop | undefined = FIXTURE_SHOPS.find((shop) => shop.id === selectedId);
  const selectedPost = selectedShop
    ? makeDemoPosts(nowMs || Date.now()).find((post) => post.shopSlug === selectedShop.slug)
    : undefined;
  const remaining = selectedPost && nowMs > 0 ? remainingMs(selectedPost.expires_at, nowMs) : 0;
  const showCard = Boolean(selectedShop && selectedPost && phaseFor(remaining) !== "expired");
  const minutes = selectedShop ? walkingMinutes(haversineMeters(origin, selectedShop)) : 1;

  return (
    <div className="prox-map relative h-full w-full" data-card={showCard ? "open" : "closed"} role="region" aria-label={t("en", "nav.map")}>
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
      </div>
      {showCard && selectedShop && selectedPost ? (
        <div className="absolute inset-x-3 bottom-16 z-20 rounded-lg bg-surface-1 p-4 shadow-sheet">
          <p className="text-heading font-bold text-fg">{selectedShop.name}</p>
          {selectedShop.nameLocal ? (
            <p className="text-label text-fg-muted">{selectedShop.nameLocal}</p>
          ) : null}
          <p className="mt-2 text-body text-fg">
            {t("en", "timer.left", { t: formatRemaining(remaining) })}
          </p>
          <p className="text-label text-fg-muted">{t("en", "map.walk", { n: String(minutes) })}</p>
          <a
            className={"mt-3 " + linkClass}
            href={walkingDirectionsUrl(selectedShop)}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("en", "post.go")}
          </a>
        </div>
      ) : null}
    </div>
  );
}
