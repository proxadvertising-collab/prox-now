import { haversineMeters, type LatLng } from "../geo";
import { POST_RADIUS_M } from "../snap/place";
import { MAX_IMAGES_PER_CALL, MAX_UPLOAD_IMAGES } from "./limits";

export const BOOK_PICK_CAP = MAX_UPLOAD_IMAGES;

export type BookTile = "menu" | "storefront" | "hours";

export function bookBuildHref(key: string): string {
  return "/book/" + encodeURIComponent(key) + "/build";
}

/** Unknown missing list still offers the builder. A complete book does not. */
export function bookNeedsBuild(missing: readonly string[] | null): boolean {
  if (!missing) return true;
  return missing.length > 0;
}

export function bookTileInput(): { type: "file"; accept: "image/*"; multiple: true; cap: number } {
  return { type: "file", accept: "image/*", multiple: true, cap: BOOK_PICK_CAP };
}

export function pickedBookFiles(list: ArrayLike<File> | null, cap = BOOK_PICK_CAP): File[] {
  if (!list || list.length === 0) return [];
  return Array.from(list).slice(0, cap);
}

export function prepareBookPick(
  kind: BookTile,
  count: number,
): { send: number; capped: boolean } | { error: "empty" | "one" } {
  if (count < 1) return { error: "empty" };
  if (kind !== "menu" && count > 1) return { error: "one" };
  if (count > BOOK_PICK_CAP) return { send: BOOK_PICK_CAP, capped: true };
  return { send: count, capped: false };
}

export type BookUploadState = "ok" | "signin" | "resting" | "saved" | "rejected";

export function bookUploadState(status: number, error: string | undefined): BookUploadState {
  if (status === 401 || error === "not_signed_in") return "signin";
  if (error === "ai_resting") return "resting";
  if (status >= 200 && status < 300 && !error) return "ok";
  if (error === "upstream" || status === 502) return "saved";
  return "rejected";
}

export function bookErrorKey(code: string | undefined): string {
  switch (code) {
    case "not_a_menu":
      return "book.notMenu";
    case "blur_failed":
      return "book.blur";
    case "too_big":
      return "book.tooBig";
    case "bad_image":
      return "book.badImage";
    case "already_there":
      return "book.already";
    case "page_limit":
      return "book.pageLimit";
    case "book_hidden":
      return "book.hidden";
    case "rate_limited":
      return "book.rate";
    case "ai_resting":
      return "book.resting";
    case "one":
      return "book.one";
    default:
      return "book.failed";
  }
}

export type ReadItem = { name: string; price: string | null };

export type UploadSummary = {
  items: ReadItem[];
  hours: string | null;
  swatches: string[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function summarizeBookUpload(body: unknown): UploadSummary {
  const root = asRecord(body);
  const items: ReadItem[] = [];
  if (Array.isArray(root?.pages)) {
    for (const page of root.pages) {
      const extracted = asRecord(asRecord(page)?.extracted);
      if (!Array.isArray(extracted?.items)) continue;
      for (const item of extracted.items) {
        const row = asRecord(item);
        const name = typeof row?.name === "string" ? row.name.trim() : "";
        if (!name) continue;
        const price = row?.price == null ? null : String(row.price);
        items.push({ name, price });
        if (items.length >= 12) break;
      }
    }
  }
  const hours = asRecord(root?.hours);
  const hoursLabel = typeof hours?.raw === "string" && hours.raw.trim() ? hours.raw.trim() : null;
  const theme = asRecord(root?.theme);
  const swatches = Array.isArray(theme?.swatches)
    ? theme.swatches.filter((color): color is string => typeof color === "string" && color.startsWith("#")).slice(0, 5)
    : [];
  return { items, hours: hoursLabel, swatches };
}

/** Storefront, then menu, then hours. The capture screen opens on the first step. */
export const BOOK_CAPTURE_STEPS = ["storefront", "menu", "hours"] as const;

export type BookShot = {
  id: string;
  kind: BookTile;
  file: File;
};

export const BOOK_UPLOAD_PATH = "/api/book/pages";

/**
 * Same gate as a live post: the person is at the shop when the rounded
 * distance is within POST_RADIUS_M. Checked once when the book flow opens.
 */
export function atThisShop(
  here: LatLng | null,
  shop: LatLng | null,
  demo = false,
): "ok" | "need_location" | "too_far" | "unknown_shop" {
  if (!shop || !Number.isFinite(shop.lat) || !Number.isFinite(shop.lng)) return "unknown_shop";
  if (demo) return "ok";
  if (!here || !Number.isFinite(here.lat) || !Number.isFinite(here.lng)) return "need_location";
  const distanceM = Math.round(haversineMeters(here, shop));
  if (distanceM > POST_RADIUS_M) return "too_far";
  return "ok";
}

/** Fixture demo mode has no shop env. A demo account row is the judge shopper or owner. */
export async function viewerUsesDemoLocation(input: {
  hasEnv: boolean;
  lookup: () => Promise<{ error: unknown; count: number }>;
}): Promise<boolean> {
  if (!input.hasEnv) return true;
  try {
    const account = await input.lookup();
    if (account.error) return false;
    return account.count > 0;
  } catch {
    return false;
  }
}

export function addBookShots(
  current: readonly BookShot[],
  kind: BookTile,
  files: readonly File[],
  cap = BOOK_PICK_CAP,
): { shots: BookShot[]; capped: boolean } {
  const incoming = files.filter((file) => file instanceof File);
  if (kind === "menu") {
    const menus = current.filter((shot) => shot.kind === "menu").length;
    const room = Math.max(0, cap - menus);
    const take = incoming.slice(0, room);
    const added = take.map((file) => ({ id: crypto.randomUUID(), kind: "menu" as const, file }));
    return { shots: [...current, ...added], capped: incoming.length > room };
  }
  const primary = incoming[0];
  const without = current.filter((shot) => shot.kind !== kind);
  const withPrimary = primary
    ? [...without, { id: crypto.randomUUID(), kind, file: primary }]
    : without;
  const extras = incoming.slice(1);
  if (extras.length === 0) return { shots: withPrimary, capped: false };
  return addBookShots(withPrimary, "menu", extras, cap);
}

export function removeBookShot(shots: readonly BookShot[], id: string): BookShot[] {
  return shots.filter((shot) => shot.id !== id);
}

/** One request for this shop. Muse still reads at most 8 images per call. */
export function bookSessionForm(shopId: string, shots: readonly BookShot[]): FormData {
  const form = new FormData();
  form.set("shop", shopId);
  form.set("session", "1");
  for (const shot of shots) form.append(shot.kind, shot.file, shot.file.name || "page.jpg");
  return form;
}

export function museCallSizes(imageCount: number, limit = MAX_IMAGES_PER_CALL): number[] {
  if (imageCount <= 0) return [];
  const sizes: number[] = [];
  let left = imageCount;
  const cap = Math.max(1, limit);
  while (left > 0) {
    const size = Math.min(cap, left);
    sizes.push(size);
    left -= size;
  }
  return sizes;
}

type BookFetch = (url: string, init: { method: "POST"; body: FormData }) => Promise<Response>;

export type BookUploadResult = {
  url: string;
  status: number;
  error?: string;
  body: unknown;
};

export async function uploadBookSession(
  shopId: string,
  shots: readonly BookShot[],
  fetchImpl: BookFetch = fetch,
): Promise<BookUploadResult> {
  const response = await fetchImpl(BOOK_UPLOAD_PATH, { method: "POST", body: bookSessionForm(shopId, shots) });
  const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
  const error = typeof body?.error === "string" ? body.error : undefined;
  return { url: BOOK_UPLOAD_PATH, status: response.status, error, body };
}

export function nextShopNearby<T extends { id: string; slug?: string }>(
  shops: readonly T[],
  current: { id?: string | null; slug?: string | null },
): T | null {
  return (
    shops.find((shop) => {
      if (current.id && shop.id === current.id) return false;
      if (current.slug && shop.slug === current.slug) return false;
      return true;
    }) ?? null
  );
}
