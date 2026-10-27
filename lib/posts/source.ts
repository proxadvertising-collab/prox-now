import { hasShopEnv } from "../shops/source";

export type LivePost = {
  id: string;
  shopId: string;
  photoUrl: string | null;
  textOriginal: string | null;
  textTranslated: Record<string, string>;
  createdAt: string;
  expiresAt: string;
  shopName: string;
  shopNameLocal: string | null;
  lat: number;
  lng: number;
  category: string;
};

export type LivePostRow = {
  id: string;
  shop_id: string;
  photo_path: string | null;
  text_original: string | null;
  text_translated: unknown;
  created_at: string;
  expires_at: string;
  status?: string;
  shops:
    | {
        name?: string;
        name_local?: string | null;
        lat?: number;
        lng?: number;
        category?: string;
      }
    | Array<{
        name?: string;
        name_local?: string | null;
        lat?: number;
        lng?: number;
        category?: string;
      }>
    | null;
};

const TWO_HOURS_MS = 7_200_000;

export function timeLeft(expiresAt: string, now: number): { ms: number; label: string; fraction: number } {
  const end = Date.parse(expiresAt);
  const ms = Number.isFinite(end) ? Math.max(0, end - now) : 0;
  const fraction = Math.min(1, Math.max(0, ms / TWO_HOURS_MS));
  const totalMinutes = Math.ceil(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const label = hours > 0 ? hours + "h " + minutes + "m" : minutes + "m";
  return { ms, label, fraction };
}

export function walkingMinutes(distanceM: number): number {
  if (!Number.isFinite(distanceM) || distanceM <= 0) return 1;
  return Math.max(1, Math.ceil(distanceM / 80));
}

export function photoPublicUrl(supabaseUrl: string, photoPath: string | null): string | null {
  if (!photoPath) return null;
  const base = supabaseUrl.replace(/\/$/, "");
  if (!base) return null;
  return base + "/storage/v1/object/public/post-photos/" + photoPath.replace(/^\/+/, "");
}

export function mapLiveRows(rows: readonly LivePostRow[], supabaseUrl: string, now = Date.now()): LivePost[] {
  const posts: LivePost[] = [];
  for (const row of rows) {
    if (Date.parse(row.expires_at) <= now) continue;
    const shop = Array.isArray(row.shops) ? row.shops[0] : row.shops;
    if (!shop || typeof shop.lat !== "number" || typeof shop.lng !== "number") continue;
    const translated: Record<string, string> = {};
    if (row.text_translated && typeof row.text_translated === "object" && !Array.isArray(row.text_translated)) {
      for (const [key, value] of Object.entries(row.text_translated as Record<string, unknown>)) {
        if (typeof value === "string" && key.length > 0) translated[key] = value;
      }
    }
    posts.push({
      id: String(row.id),
      shopId: String(row.shop_id),
      photoUrl: photoPublicUrl(supabaseUrl, row.photo_path),
      textOriginal: row.text_original,
      textTranslated: translated,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      shopName: shop.name ?? "",
      shopNameLocal: shop.name_local ?? null,
      lat: shop.lat,
      lng: shop.lng,
      category: shop.category ?? "other",
    });
  }
  return posts;
}

async function defaultQuery(): Promise<LivePostRow[] | null> {
  const { createClient } = await import("../supabase/server");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("posts")
    .select(
      "id, shop_id, photo_path, text_original, text_translated, created_at, expires_at, shops(name, name_local, lat, lng, category)",
    )
    .eq("status", "live")
    .gt("expires_at", new Date().toISOString());
  if (error) throw new Error("posts");
  return (data ?? []) as LivePostRow[];
}

export async function getLivePosts(query?: () => Promise<LivePostRow[] | null>): Promise<LivePost[]> {
  const run = query ?? (hasShopEnv() ? defaultQuery : async () => []);
  try {
    const rows = await run();
    if (!rows || rows.length === 0) return [];
    return mapLiveRows(rows, process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  } catch {
    return [];
  }
}
