import { NextResponse } from "next/server";
import { hasDemoSessionCookie } from "../demo/zone";
import type { LatLng } from "../geo";
import { hasJudgeCookie } from "../judge/session";
import { allowSnap, clientIp } from "../rate/window";
import { hasShopEnv } from "../shops/source";
import { createClient } from "../supabase/server";
import { buildContext, type ContextPost, type ContextShop, type PlaceContext } from "./context";
import { loadGoNowRows } from "./load";
import { goNowPrompt } from "./prompt";
import { parsePicks } from "./schema";
import { callGoNowText } from "./spark";

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
  demoSession?: () => Promise<boolean>;
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

function fallbackReason(place: PlaceContext, demoSession: boolean): string | null {
  if (place.open === "open") return "";
  if (!demoSession || !place.demo) return null;
  if (place.open === "closed") return "Closed now";
  if (place.open === "unknown") return "Hours not listed";
  return null;
}

function nearbyCards(places: readonly PlaceContext[], demoSession: boolean): GoNowCard[] {
  return places
    .filter((place) => fallbackReason(place, demoSession) !== null)
    .sort((a, b) => a.distanceM - b.distanceM || a.shopId.localeCompare(b.shopId))
    .slice(0, 5)
    .map((place) => card(place, fallbackReason(place, demoSession) ?? ""));
}

async function sessionIsDemo(request: Request): Promise<boolean> {
  const cookie = request.headers.get("cookie") ?? "";
  if (hasJudgeCookie(cookie) || hasDemoSessionCookie(cookie)) return true;
  if (!hasShopEnv()) return false;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    const id = data.user?.id;
    if (!id) return false;
    const found = await supabase.from("demo_accounts").select("role").eq("user_id", id).limit(1);
    if (found.error || !Array.isArray(found.data)) return false;
    return found.data.length > 0;
  } catch (error) {
    if (typeof error === "object" && error !== null && "digest" in error) throw error;
    return false;
  }
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
  const demoSession = await (deps.demoSession ?? (() => sessionIsDemo(request)))();
  let rows: { shops: ContextShop[]; posts: ContextPost[] };
  try {
    rows = await (deps.load ?? loadGoNowRows)({ lat, lng }, now);
  } catch {
    return json({ mode: "empty", picks: [], nearby: [] });
  }

  const places = buildContext({ origin: { lat, lng }, now, shops: rows.shops, posts: rows.posts, keepDemo: demoSession });
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
    if (picks.length === 0) return json({ mode: "nearby", picks: [], nearby: nearbyCards(places, demoSession) });
    return json({ mode: "picks", picks, nearby: [] });
  } catch {
    return json({ mode: "nearby", picks: [], nearby: nearbyCards(places, demoSession) });
  }
}
