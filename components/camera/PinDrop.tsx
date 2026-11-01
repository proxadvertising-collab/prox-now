"use client";

import { useEffect, useRef } from "react";
import { Map, Marker, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { DEMO_ZONE_FALLBACK } from "@/lib/demo/zone";
import { STYLE_URL } from "@/lib/map/style";

let workerReady = false;

export function PinDrop({ onPick }: { onPick: (point: { lat: number; lng: number }) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const pick = useRef(onPick);
  pick.current = onPick;

  useEffect(() => {
    const node = host.current;
    if (!node) return;
    if (!workerReady) {
      setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString());
      workerReady = true;
    }
    const map = new Map({
      container: node,
      style: STYLE_URL,
      center: [DEMO_ZONE_FALLBACK.lng, DEMO_ZONE_FALLBACK.lat],
      zoom: DEMO_ZONE_FALLBACK.zoom,
      attributionControl: false,
    });
    let marker: Marker | null = null;
    const onClick = (event: { lngLat: { lat: number; lng: number } }) => {
      const point = { lat: event.lngLat.lat, lng: event.lngLat.lng };
      if (!marker) marker = new Marker({ color: "var(--color-accent)" }).setLngLat([point.lng, point.lat]).addTo(map);
      else marker.setLngLat([point.lng, point.lat]);
      pick.current(point);
    };
    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
      map.remove();
    };
  }, []);

  return <div ref={host} className="h-48 w-full overflow-hidden rounded-md" />;
}
