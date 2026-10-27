"use client";

import { useEffect, useState } from "react";
import { t } from "@/lib/copy";

type Stats = { placesAdded: number; countries: number };

export function PlaceStats() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/places/stats")
      .then((response) => (response.ok ? response.json() : null))
      .then((body: Stats | null) => {
        if (cancelled || !body || typeof body.placesAdded !== "number") return;
        setStats({ placesAdded: body.placesAdded, countries: body.countries ?? 0 });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!stats || stats.placesAdded <= 0) return null;
  return (
    <p className="text-label text-fg-muted">
      {t("en", "map.places", { n: String(stats.placesAdded), c: String(stats.countries) })}
    </p>
  );
}
