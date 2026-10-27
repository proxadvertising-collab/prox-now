export const EXPORT_LIMIT = 5000;

export const EXPORT_COLUMNS =
  "id, name, name_local, category, lat, lng, country_code, address_hint, phone_public, created_at, timezone, currency, claimed";

export type ShopPlaceRow = {
  id: string;
  name: string;
  name_local?: string | null;
  category?: string | null;
  lat: number;
  lng: number;
  country_code?: string | null;
  address_hint?: string | null;
  phone_public?: string | null;
  created_at?: string | null;
  timezone?: string | null;
  currency?: string | null;
  claimed?: boolean | null;
  created_by?: string | null;
  email?: string | null;
};

export type OvertureFeature = {
  type: "Feature";
  id: string;
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: Record<string, unknown>;
};

export type OvertureCollection = {
  type: "FeatureCollection";
  features: OvertureFeature[];
};

export function parseExportQuery(
  search: URLSearchParams,
): { country: string | null; since: string | null } | { error: "bad_country" | "bad_since" } {
  const rawCountry = search.get("country");
  let country: string | null = null;
  if (rawCountry) {
    const code = rawCountry.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(code) || code === "XX" || code === "T1") return { error: "bad_country" };
    country = code;
  }
  const rawSince = search.get("since");
  let since: string | null = null;
  if (rawSince) {
    const ms = Date.parse(rawSince);
    if (!Number.isFinite(ms)) return { error: "bad_since" };
    since = new Date(ms).toISOString();
  }
  return { country, since };
}

function textOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** User-reported place. Confidence is fixed because a person added the shop, not a survey. */
export function toOverturePlace(row: ShopPlaceRow): OvertureFeature {
  const names: { primary: string; common?: Record<string, string> } = { primary: row.name };
  const local = textOrNull(row.name_local);
  if (local) names.common = { und: local };

  const properties: Record<string, unknown> = {
    id: row.id,
    names,
    categories: { primary: row.category ?? "other" },
    sources: [
      {
        property: "",
        dataset: "prox-now",
        record_id: row.id,
        update_time: textOrNull(row.created_at) ?? new Date(0).toISOString(),
      },
    ],
    // User reported. Not a surveyed confidence.
    confidence: 0.6,
    prox_now: {
      timezone: textOrNull(row.timezone),
      currency: textOrNull(row.currency),
      claimed: row.claimed === true,
    },
  };

  const country = textOrNull(row.country_code);
  const freeform = textOrNull(row.address_hint);
  if (country || freeform) {
    const address: { country?: string; freeform?: string } = {};
    if (country) address.country = country;
    if (freeform) address.freeform = freeform;
    properties.addresses = [address];
  }

  const phone = textOrNull(row.phone_public);
  if (phone) properties.phones = [phone];

  return {
    type: "Feature",
    id: row.id,
    geometry: { type: "Point", coordinates: [row.lng, row.lat] },
    properties,
  };
}

export function toFeatureCollection(rows: readonly ShopPlaceRow[]): OvertureCollection {
  return {
    type: "FeatureCollection",
    features: rows.slice(0, EXPORT_LIMIT).map((row) => toOverturePlace(row)),
  };
}
