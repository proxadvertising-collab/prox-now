import { locate as requestFix, type LocateResult } from "./locate";

const KEY = "prox-fix";
const FRESH_MS = 120_000;

export type StoredFix = { lat: number; lng: number; accuracy: number | null; at: number };

type FixStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

type FixNav = {
  permissions?: {
    query: (descriptor: { name: string }) => Promise<{ state: string }>;
  };
};

export type FixPoint = { lat: number; lng: number; accuracy: number | null };

function browserStorage(): FixStorage | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    return sessionStorage;
  } catch {
    return null;
  }
}

function browserNav(): FixNav | null {
  if (typeof navigator === "undefined") return null;
  const query = navigator.permissions?.query?.bind(navigator.permissions);
  if (!query) return {};
  return {
    permissions: {
      query: (descriptor) => query({ name: descriptor.name as PermissionName }),
    },
  };
}

export function readFix(now: number, storage: FixStorage | null | undefined): StoredFix | null {
  if (!storage) return null;
  const raw = storage.getItem(KEY);
  if (!raw) return null;
  let parsed: Partial<StoredFix>;
  try {
    parsed = JSON.parse(raw) as Partial<StoredFix>;
  } catch {
    return null;
  }
  if (typeof parsed.lat !== "number" || typeof parsed.lng !== "number" || typeof parsed.at !== "number") return null;
  if (now - parsed.at >= FRESH_MS) return null;
  return {
    lat: parsed.lat,
    lng: parsed.lng,
    accuracy: typeof parsed.accuracy === "number" ? parsed.accuracy : null,
    at: parsed.at,
  };
}

export function writeFix(fix: FixPoint, storage: FixStorage, now = Date.now()): void {
  const row: StoredFix = { lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy, at: now };
  storage.setItem(KEY, JSON.stringify(row));
}

export async function getFix(input: {
  userAction: boolean;
  now?: number;
  storage?: FixStorage | null;
  nav?: FixNav | null;
  locate?: () => Promise<LocateResult>;
}): Promise<FixPoint | null> {
  const now = input.now ?? Date.now();
  const storage = input.storage === undefined ? browserStorage() : input.storage;
  const hit = readFix(now, storage);
  if (hit) return { lat: hit.lat, lng: hit.lng, accuracy: hit.accuracy };
  const nav = input.nav === undefined ? browserNav() : input.nav;
  let state: string | null = null;
  try {
    const status = await nav?.permissions?.query({ name: "geolocation" });
    state = status?.state ?? null;
  } catch {
    state = null;
  }
  if (state === "denied") return null;
  if ((state === "prompt" || state === null) && !input.userAction) return null;
  const locate = input.locate ?? (() => requestFix());
  const result = await locate();
  if (result.status !== "ok") return null;
  const point = { lat: result.point.lat, lng: result.point.lng, accuracy: null };
  if (storage) writeFix(point, storage, now);
  return point;
}
