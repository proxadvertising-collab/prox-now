import { hasShopEnv } from "../shops/source";

export type PlaceStats = {
  placesAdded: number;
  countries: number;
  momentsSeeded: number;
  liveNow: number;
};

const ZEROS: PlaceStats = { placesAdded: 0, countries: 0, momentsSeeded: 0, liveNow: 0 };

function count(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.floor(number);
}

export function mapStatsRow(row: Record<string, unknown> | null): PlaceStats {
  if (!row) return ZEROS;
  return {
    placesAdded: count(row.places_added ?? row.placesAdded),
    countries: count(row.countries),
    momentsSeeded: count(row.moments_seeded ?? row.momentsSeeded),
    liveNow: count(row.live_now ?? row.liveNow),
  };
}

async function defaultQuery(): Promise<Record<string, unknown> | null> {
  const { createClient } = await import("../supabase/server");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("place_seed_stats");
  if (error) throw new Error("stats");
  const row = Array.isArray(data) ? data[0] : data;
  return row && typeof row === "object" ? (row as Record<string, unknown>) : null;
}

export async function getPlaceStats(
  query?: () => Promise<Record<string, unknown> | null>,
): Promise<PlaceStats> {
  if (!query && !hasShopEnv()) return ZEROS;
  try {
    const row = await (query ?? defaultQuery)();
    return mapStatsRow(row);
  } catch {
    return ZEROS;
  }
}
