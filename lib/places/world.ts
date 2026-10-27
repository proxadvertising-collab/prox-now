import tzLookup from "tz-lookup";

/** ISO 3166-1 alpha-2 to ISO 4217. Unknown countries stay null. Never a fallback currency. */
export const COUNTRY_CURRENCY: Record<string, string> = {
  AE: "AED",
  AR: "ARS",
  AT: "EUR",
  AU: "AUD",
  BE: "EUR",
  BR: "BRL",
  CA: "CAD",
  CH: "CHF",
  CL: "CLP",
  CN: "CNY",
  CO: "COP",
  CZ: "CZK",
  DE: "EUR",
  DK: "DKK",
  EG: "EGP",
  ES: "EUR",
  FI: "EUR",
  FR: "EUR",
  GB: "GBP",
  GR: "EUR",
  HK: "HKD",
  HU: "HUF",
  ID: "IDR",
  IE: "EUR",
  IL: "ILS",
  IN: "INR",
  IT: "EUR",
  JP: "JPY",
  KE: "KES",
  KR: "KRW",
  LU: "EUR",
  MX: "MXN",
  MY: "MYR",
  NG: "NGN",
  NL: "EUR",
  NO: "NOK",
  NZ: "NZD",
  PE: "PEN",
  PH: "PHP",
  PL: "PLN",
  PT: "EUR",
  QA: "QAR",
  SA: "SAR",
  SE: "SEK",
  SG: "SGD",
  TH: "THB",
  TR: "TRY",
  TW: "TWD",
  US: "USD",
  VN: "VND",
  ZA: "ZAR",
};

const UNKNOWN_COUNTRY = new Set(["XX", "T1"]);

let zoneNames: Set<string> | null = null;

function zones(): Set<string> {
  if (!zoneNames) zoneNames = new Set(Intl.supportedValuesOf("timeZone"));
  return zoneNames;
}

export function parseCountryHeader(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return null;
  if (UNKNOWN_COUNTRY.has(code)) return null;
  return code;
}

export function parseTimezone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const zone = value.trim();
  if (!zone || zone.length > 64) return null;
  return zones().has(zone) ? zone : null;
}

export function timezoneFromPoint(lat: number, lng: number): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  try {
    return parseTimezone(tzLookup(lat, lng));
  } catch {
    return null;
  }
}

export function currencyForCountry(country: string | null): string | null {
  if (!country) return null;
  return COUNTRY_CURRENCY[country] ?? null;
}
