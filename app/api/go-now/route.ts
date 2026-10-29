import { NextResponse } from "next/server";
import { buildContext, type ContextPost, type ContextShop, type PlaceContext } from "../../../lib/gonow/context";
import { loadGoNowRows } from "../../../lib/gonow/load";
import { goNowPrompt } from "../../../lib/gonow/prompt";
import { parsePicks } from "../../../lib/gonow/schema";
import { callGoNowText } from "../../../lib/gonow/spark";
import type { LatLng } from "../../../lib/geo";
import { allowSnap, clientIp } from "../../../lib/rate/window";
import { hasShopEnv } from "../../../lib/shops/source";
import { createClient } from "../../../lib/supabase/server";

export const maxDuration = 60;

export type GoNowCard = {
  shopId: string;
  name: string;
  slug: string;
  reason: string;
  walkMinutes: number;
  lat: number;
  lng: number;
};

export type GoNowDeps = {
  allow?: typeof allowSnap;
  load?: (origin: LatLng, now: Date) => Promise<{ shops: ContextShop[]; posts: ContextPost[] }>;
  call?: (prompt: string) => Promise<unknown>;
  now?: () => Date;
  userId?: () => Promise<string | null>;
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

function coord(value: unknown, limit: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > limit) return null;
  return value;
}

function card(place: PlaceContext, reason: string): GoNowCard {
  return {
    shopId: place.shopId,
    name: place.name,
    slug: place.slug,
    reason,
    walkMinutes: place.walkMinutes,
    lat: place.lat,
    lng: place.lng,
  };
}

function nearbyCards(places: readonly PlaceContext[]): GoNowCard[] {
  return places
    .filter((place) => place.open === "open")
    .sort((a, b) => a.distanceM - b.distanceM || a.shopId.localeCompare(b.shopId))
    .slice(0, 5)
    .map((place) => card(place, ""));
}

async function signedInUserId(): Promise<string | null> {
  if (!hasShopEnv()) return null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

export async function handleGoNow(request: Request, deps: GoNowDeps = {}): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }
  const record = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  const lat = coord(record?.lat, 90);
  const lng = coord(record?.lng, 180);
  if (lat === null || lng === null) return json({ error: "bad_place" }, 400);
  const question = typeof record?.q === "string" && record.q.trim() ? record.q.trim().slice(0, 200) : "What's good right now?";

  const allow = deps.allow ?? allowSnap;
  const allowed = await allow(clientIp(request), await (deps.userId ?? signedInUserId)());
  if (!allowed) return json({ error: "rate_limited" }, 429);

  const now = (deps.now ?? (() => new Date()))();
  let rows: { shops: ContextShop[]; posts: ContextPost[] };
  try {
    rows = await (deps.load ?? loadGoNowRows)({ lat, lng }, now);
  } catch {
    return json({ mode: "empty", picks: [], nearby: [] });
  }

  const places = buildContext({ origin: { lat, lng }, now, shops: rows.shops, posts: rows.posts });
  if (places.length === 0) return json({ mode: "empty", picks: [], nearby: [] });

  const byId = new Map(places.map((place) => [place.shopId, place]));
  try {
    const raw = await (deps.call ?? callGoNowText)(goNowPrompt(question, places));
    const picks = parsePicks(raw, new Set(byId.keys()))
      .map((pick) => {
        const place = byId.get(pick.shopId);
        return place ? card(place, pick.reason) : null;
      })
      .filter((pick): pick is GoNowCard => pick !== null);
    if (picks.length === 0) return json({ mode: "nearby", picks: [], nearby: nearbyCards(places) });
    return json({ mode: "picks", picks, nearby: [] });
  } catch {
    return json({ mode: "nearby", picks: [], nearby: nearbyCards(places) });
  }
}

export async function POST(request: Request) {
  return handleGoNow(request);
}
